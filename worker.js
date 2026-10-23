/**
 * linkbot-api — Cloudflare Worker
 *
 * Telegram-бот для управления ссылками сайта https://burgerzan.github.io/
 * Бот читает и обновляет ТОЛЬКО файл links.json в репозитории
 * burgerzan/burgerzan.github.io (ветка main) через GitHub REST API.
 *
 * Секреты (Cloudflare → Worker → Settings → Variables and Secrets):
 *   TELEGRAM_BOT_TOKEN       — токен бота от @BotFather
 *   TELEGRAM_WEBHOOK_SECRET  — случайная строка; та же, что в setWebhook (secret_token)
 *   ALLOWED_USER_IDS         — числовые Telegram ID через запятую (например: 111111111,222222222)
 *   GITHUB_TOKEN             — fine-grained PAT, только этот репозиторий, Contents: Read and write
 *
 * Состояние между сообщениями не хранится (KV не нужен): для шагов «ответьте на сообщение»
 * бот кладёт служебную строку «Код: ...» в собственный вопрос и читает её из ответа.
 */

/* ---------- Жёстко заданная цель (пользователи не могут её менять) ---------- */

const OWNER = 'burgerzan';
const REPO = 'burgerzan.github.io';
const FILE_PATH = 'links.json';
const BRANCH = 'main';

const MAX_LINKS = 50;
const MAX_TITLE = 60;
const MAX_DESC = 120;
const MAX_URL = 2048;
const SITE_NOTE = 'Сайт обновится примерно через 1–2 минуты.';

/* ---------- Ошибки ---------- */

class UserError extends Error {
  constructor(message, retry = false) {
    super(message);
    this.name = 'UserError';
    this.retry = retry; // true — можно просто ответить на тот же вопрос ещё раз
  }
}

class GitHubError extends Error {
  constructor(status) {
    super('GitHub ' + status);
    this.name = 'GitHubError';
    this.status = status;
  }
}

/* ---------- Общие утилиты ---------- */

const encoder = new TextEncoder();
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function safeEqual(a, b) {
  const x = encoder.encode(String(a));
  const y = encoder.encode(String(b));
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

function allowedIds(env) {
  return new Set(String(env.ALLOWED_USER_IDS || '').split(/[\s,;]+/).filter((s) => /^\d+$/.test(s)));
}

// Права проверяются только по числовому ID, никогда по username.
function isAllowed(env, userId) {
  return typeof userId === 'number' && allowedIds(env).has(String(userId));
}

function hashLink(link) {
  // FNV-1a: короткая «отпечаток»-метка, чтобы кнопки не попали на другую ссылку после изменений списка.
  const s = String(link.title) + '\n' + String(link.url);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/* ---------- Проверка ввода ---------- */

function cleanText(input, max, what, { required = true } = {}) {
  const s = String(input ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202f\u2060-\u2069\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (required && !s) throw new UserError(`${what} не может быть пустым.`, true);
  if (s.length > max) throw new UserError(`${what} слишком длинное: максимум ${max} символов.`, true);
  return s;
}

function normalizeUrl(input) {
  let s = String(input ?? '').trim();
  if (!s) throw new UserError('URL не может быть пустым.', true);
  if (/\s/.test(s)) throw new UserError('В URL не должно быть пробелов.', true);
  if (s.length > MAX_URL) throw new UserError('URL слишком длинный.', true);
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;

  let u;
  try {
    u = new URL(s);
  } catch (e) {
    throw new UserError('Не похоже на корректный URL. Пример: https://example.com/page', true);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new UserError('Разрешены только ссылки http:// и https://.', true);
  }
  if (u.username || u.password) throw new UserError('URL не должен содержать логин и пароль.', true);
  const labels = u.hostname.split('.');
  if (labels.length < 2 || !/^[a-z][a-z0-9-]+$/i.test(labels[labels.length - 1])) {
    throw new UserError('Некорректный адрес сайта. Пример: https://example.com', true);
  }
  return u.href;
}

function detectIcon(url) {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch (e) { return 'website'; }
  const is = (d) => host === d || host.endsWith('.' + d);
  if (is('youtube.com') || is('youtu.be')) return 'youtube';
  if (is('tiktok.com')) return 'tiktok';
  if (is('instagram.com')) return 'instagram';
  if (is('discord.com') || is('discord.gg')) return 'discord';
  if (is('t.me') || is('telegram.me') || is('telegram.org')) return 'telegram';
  if (is('github.com')) return 'github';
  if (is('spotify.com')) return 'spotify';
  return 'website';
}

function hostOf(url) {
  try { return new URL(String(url)).hostname; } catch (e) { return ''; }
}

/* ---------- Telegram API ---------- */

async function tg(env, method, payload) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({ ok: false }));
    if (!json.ok) console.error('telegram', method, res.status, json.description || '');
    return json;
  } catch (e) {
    console.error('telegram fetch failed', method); // URL с токеном не логируем
    return { ok: false };
  }
}

const btn = (text, data) => ({ text, callback_data: data });

function sendView(env, chatId, view) {
  return tg(env, 'sendMessage', {
    chat_id: chatId,
    text: view.text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: view.kb || [] },
  });
}

async function showView(env, chatId, messageId, view) {
  const r = await tg(env, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: view.text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: view.kb || [] },
  });
  if (r.ok || /not modified/i.test(r.description || '')) return;
  await sendView(env, chatId, view);
}

function sendPrompt(env, chatId, text, placeholder) {
  return tg(env, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: { force_reply: true, input_field_placeholder: placeholder },
  });
}

/* ---------- GitHub API (только один файл в одном репозитории) ---------- */

function ghRequest(env, method, body) {
  const base = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
  const url = method === 'GET' ? `${base}?ref=${BRANCH}` : base;
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'linkbot-api',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function fromBase64(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function toBase64(text) {
  const bytes = encoder.encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

async function readFile(env) {
  let res;
  try {
    res = await ghRequest(env, 'GET');
  } catch (e) {
    throw new GitHubError(0);
  }
  if (!res.ok) throw new GitHubError(res.status);

  const json = await res.json();
  if (json.type !== 'file' || typeof json.content !== 'string' || typeof json.sha !== 'string') {
    throw new GitHubError(0);
  }

  let data;
  try {
    data = JSON.parse(fromBase64(json.content));
  } catch (e) {
    throw new UserError('Файл links.json в репозитории не читается как JSON. Исправьте его на GitHub, бот его не трогал.');
  }
  if (!isObj(data) || !Array.isArray(data.links)) {
    throw new UserError('В links.json нет массива "links". Бот не будет менять файл с неожиданной структурой.');
  }
  return { data, sha: json.sha };
}

/**
 * Читает свежий файл, применяет fn(data), записывает с актуальным SHA.
 * Возвращает результат только после подтверждения записи от GitHub.
 * При конфликте версий (409/422) повторяет с новой копией файла.
 * fn(data) должна вернуть { message, result } или бросить UserError.
 */
async function mutate(env, fn) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, sha } = await readFile(env);
    const out = fn(data);

    if (!Array.isArray(data.links) || data.links.length > 200) throw new UserError('Недопустимое состояние списка ссылок.');
    const text = JSON.stringify(data, null, 2) + '\n';
    if (text.length > 200000) throw new UserError('links.json стал слишком большим.');

    let res;
    try {
      res = await ghRequest(env, 'PUT', {
        message: cut(String(out.message).replace(/\s+/g, ' '), 100),
        content: toBase64(text),
        sha,
        branch: BRANCH,
      });
    } catch (e) {
      throw new GitHubError(0);
    }

    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (!json || !json.commit || !json.commit.sha) throw new GitHubError(0);
      return out.result; // подтверждено GitHub
    }
    if (res.status === 409 || res.status === 422) continue; // файл изменился — читаем заново
    throw new GitHubError(res.status);
  }
  throw new UserError('Файл менялся одновременно с вашим действием. Попробуйте ещё раз.');
}

/* ---------- Работа со списком ---------- */

function orderOf(item) {
  const o = item.link.order;
  return typeof o === 'number' && Number.isFinite(o) ? o : item.index;
}

// Тот же порядок, что и на сайте: по order, затем по позиции в файле.
function sortedItems(links) {
  return links
    .map((link, index) => ({ link, index }))
    .filter((x) => isObj(x.link))
    .sort((a, b) => orderOf(a) - orderOf(b) || a.index - b.index);
}

function findTarget(data, idxRaw, hash) {
  const index = Number.parseInt(idxRaw, 10);
  const link = Number.isInteger(index) ? data.links[index] : undefined;
  if (!isObj(link) || hashLink(link) !== hash) {
    throw new UserError('Список изменился. Откройте список заново.');
  }
  return { link, index };
}

function addLink(env, title, url) {
  return mutate(env, (data) => {
    if (data.links.length >= MAX_LINKS) throw new UserError(`Достигнут лимит: ${MAX_LINKS} ссылок.`);
    const orders = data.links.map((l) => (isObj(l) && typeof l.order === 'number' && Number.isFinite(l.order) ? l.order : 0));
    const item = {
      title,
      url,
      icon: detectIcon(url),
      description: '',
      order: Math.max(0, ...orders) + 1,
      enabled: true,
    };
    data.links.push(item);
    return { message: `linkbot: add "${cut(title, 40)}"`, result: { link: item, index: data.links.length - 1 } };
  });
}

function changeLink(env, idx, hash, label, apply) {
  return mutate(env, (data) => {
    const t = findTarget(data, idx, hash);
    apply(t.link);
    return { message: `linkbot: ${label} "${cut(String(t.link.title), 40)}"`, result: { link: t.link, index: t.index } };
  });
}

function removeLink(env, idx, hash) {
  return mutate(env, (data) => {
    const t = findTarget(data, idx, hash);
    const title = String(t.link.title);
    data.links.splice(t.index, 1);
    return { message: `linkbot: delete "${cut(title, 40)}"`, result: { title } };
  });
}

/* ---------- Экраны ---------- */

// note — уже безопасный HTML (экранируйте пользовательские данные через esc()).
function menuView(note) {
  return {
    text: `${note ? note + '\n\n' : ''}<b>Управление ссылками</b>\nВыберите действие.`,
    kb: [[btn('📋 Список ссылок', 'ls'), btn('➕ Добавить', 'ad')]],
  };
}

function listView(data, note) {
  const items = sortedItems(data.links).slice(0, MAX_LINKS);
  const head = note ? note + '\n\n' : '';
  if (!items.length) {
    return { text: `${head}Список пуст.`, kb: [[btn('➕ Добавить', 'ad')], [btn('⬅️ Меню', 'mn')]] };
  }
  const lines = items.map(({ link }, i) => {
    const on = link.enabled !== false ? '✅' : '🚫';
    return `${i + 1}. ${on} ${esc(cut(String(link.title), 40))} — ${esc(hostOf(link.url))}`;
  });
  const kb = items.map(({ link, index }, i) => [
    btn(`${i + 1}. ${cut(String(link.title), 32)}`, `v:${index}:${hashLink(link)}`),
  ]);
  kb.push([btn('➕ Добавить', 'ad'), btn('⬅️ Меню', 'mn')]);
  return { text: `${head}<b>Ссылки</b> (✅ показывается, 🚫 скрыта)\n\n${lines.join('\n')}`, kb };
}

function cardView(link, index, note) {
  const h = hashLink(link);
  const on = link.enabled !== false;
  const desc = typeof link.description === 'string' && link.description ? `${esc(link.description)}\n` : '';
  const text =
    `${note ? note + '\n\n' : ''}<b>${esc(String(link.title))}</b>\n${esc(String(link.url))}\n${desc}` +
    `Статус: ${on ? '✅ показывается' : '🚫 скрыта'}`;
  return {
    text,
    kb: [
      [btn('✏️ Название', `et:${index}:${h}`), btn('🔗 URL', `eu:${index}:${h}`)],
      [btn('📝 Описание', `ed:${index}:${h}`), btn(on ? '🙈 Скрыть' : '👁 Показать', `tg:${index}:${h}`)],
      [btn('🗑 Удалить', `dl:${index}:${h}`)],
      [btn('⬅️ К списку', 'ls')],
    ],
  };
}

const SAVED = '✅ Сохранено в GitHub.';
const ADD_PROMPT =
  '➕ <b>Новая ссылка</b>\nОтправьте название ответом на это сообщение (до ' + MAX_TITLE + ' символов).\n\nКод: add';

/* ---------- Отчёт об ошибках (без секретов и внутренних деталей) ---------- */

function errorText(e) {
  if (e instanceof UserError) {
    return '⚠️ ' + esc(e.message) + (e.retry ? '\nОтветьте на то же сообщение ещё раз.' : '');
  }
  if (e instanceof GitHubError) {
    switch (e.status) {
      case 401:
        return '⚠️ GitHub отклонил токен (401). Проверьте секрет GITHUB_TOKEN: возможно, он истёк или отозван.';
      case 403:
        return '⚠️ GitHub отказал в доступе (403). Проверьте права токена (Contents: Read and write) и доступ к репозиторию. Возможен и лимит запросов — повторите позже.';
      case 404:
        return '⚠️ Файл links.json не найден (404). Он должен лежать в корне ветки main. Также 404 бывает, если у токена нет доступа к репозиторию.';
      default:
        if (e.status >= 500) return '⚠️ GitHub временно недоступен. Повторите позже. Изменение не сохранено.';
        return '⚠️ Не удалось связаться с GitHub' + (e.status ? ` (код ${e.status})` : '') + '. Изменение не сохранено.';
    }
  }
  return '⚠️ Внутренняя ошибка Worker. Подробности: Cloudflare → Workers → linkbot-api → Logs.';
}

async function reportError(env, chatId, e) {
  if (!(e instanceof UserError) && !(e instanceof GitHubError)) {
    console.error('unexpected error', e && e.name); // сообщение не логируем целиком — вдруг в нём чувствительные данные
  }
  await sendView(env, chatId, { text: errorText(e), kb: [[btn('⬅️ Меню', 'mn')]] });
}

/* ---------- Нажатия кнопок ---------- */

async function onCallback(env, cq) {
  if (!cq.from || !isAllowed(env, cq.from.id)) return;
  const msg = cq.message;
  if (!msg || !msg.chat || msg.chat.type !== 'private') return;

  await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id });

  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const [action, idx, hash] = String(cq.data || '').split(':');

  try {
    switch (action) {
      case 'mn':
        return await showView(env, chatId, messageId, menuView());

      case 'ls': {
        const { data } = await readFile(env);
        return await showView(env, chatId, messageId, listView(data));
      }

      case 'ad':
        return await sendPrompt(env, chatId, ADD_PROMPT, 'Название ссылки');

      case 'v': {
        const { data } = await readFile(env);
        const t = findTarget(data, idx, hash);
        return await showView(env, chatId, messageId, cardView(t.link, t.index));
      }

      case 'tg': {
        let nowOn = true;
        const r = await changeLink(env, idx, hash, 'toggle', (link) => {
          nowOn = link.enabled === false; // было скрыто → станет показываться
          link.enabled = nowOn;
        });
        const note = `${SAVED} Ссылка ${nowOn ? 'включена' : 'отключена'}. ${SITE_NOTE}`;
        return await showView(env, chatId, messageId, cardView(r.link, r.index, note));
      }

      case 'et':
      case 'eu':
      case 'ed': {
        const { data } = await readFile(env);
        const t = findTarget(data, idx, hash);
        const what = { et: 'название', eu: 'URL', ed: 'описание' }[action];
        const current = action === 'et' ? t.link.title : action === 'eu' ? t.link.url : t.link.description || '—';
        const extra = action === 'ed' ? '\nОтправьте «-», чтобы очистить описание.' : '';
        return await sendPrompt(
          env,
          chatId,
          `✏️ Новое ${what} для «${esc(cut(String(t.link.title), 40))}»\nСейчас: ${esc(String(current))}${extra}\n` +
            `Отправьте новое значение ответом на это сообщение.\n\nКод: ${action}/${t.index}/${hash}`,
          'Новое значение'
        );
      }

      case 'dl': {
        const { data } = await readFile(env);
        const t = findTarget(data, idx, hash);
        return await showView(env, chatId, messageId, {
          text:
            `Удалить ссылку «${esc(cut(String(t.link.title), 40))}»?\n` +
            'В боте отменить удаление нельзя (восстановить можно через историю коммитов на GitHub).',
          kb: [[btn('🗑 Да, удалить', `dy:${t.index}:${hash}`), btn('Отмена', `v:${t.index}:${hash}`)]],
        });
      }

      case 'dy': {
        const r = await removeLink(env, idx, hash);
        const { data } = await readFile(env);
        return await showView(env, chatId, messageId, listView(data, `${SAVED} Удалено: «${esc(cut(r.title, 40))}». ${SITE_NOTE}`));
      }

      default:
        return await showView(env, chatId, messageId, menuView());
    }
  } catch (e) {
    await reportError(env, chatId, e);
  }
}

/* ---------- Сообщения ---------- */

// Обрабатывает ответ на вопрос бота. Возвращает true, если сообщение обработано.
async function onReply(env, chatId, replied, text) {
  const botId = String(env.TELEGRAM_BOT_TOKEN).split(':')[0];
  if (!replied || !replied.from || String(replied.from.id) !== botId || typeof replied.text !== 'string') return false;

  const m = replied.text.match(/Код: ([a-z]+)(?:\/(\d{1,3})\/([0-9a-f]{8}))?/);
  if (!m) return false;
  const [, code, idx, hash] = m;

  switch (code) {
    case 'add': {
      const title = cleanText(text, MAX_TITLE, 'Название');
      await sendPrompt(
        env,
        chatId,
        `➕ <b>Новая ссылка</b>\nНазвание: ${esc(title)}\nТеперь отправьте URL ответом на это сообщение.\n\nКод: addu`,
        'https://example.com'
      );
      return true;
    }

    case 'addu': {
      const tm = replied.text.match(/^Название: (.+)$/m);
      if (!tm) throw new UserError('Не нашёл название. Начните добавление заново.');
      const title = cleanText(tm[1], MAX_TITLE, 'Название');
      const url = normalizeUrl(text);
      const r = await addLink(env, title, url);
      await sendView(env, chatId, cardView(r.link, r.index, `${SAVED} Ссылка добавлена. ${SITE_NOTE}`));
      return true;
    }

    case 'et': {
      const title = cleanText(text, MAX_TITLE, 'Название');
      const r = await changeLink(env, idx, hash, 'edit title', (link) => { link.title = title; });
      await sendView(env, chatId, cardView(r.link, r.index, `${SAVED} Название изменено. ${SITE_NOTE}`));
      return true;
    }

    case 'eu': {
      const url = normalizeUrl(text);
      const r = await changeLink(env, idx, hash, 'edit url', (link) => {
        // Иконку обновляем только если она была выбрана автоматически по старому URL
        const auto = link.icon === detectIcon(String(link.url));
        link.url = url;
        if (auto || link.icon === undefined) link.icon = detectIcon(url);
      });
      await sendView(env, chatId, cardView(r.link, r.index, `${SAVED} URL изменён. ${SITE_NOTE}`));
      return true;
    }

    case 'ed': {
      const clear = text.trim() === '-';
      const desc = clear ? '' : cleanText(text, MAX_DESC, 'Описание');
      const r = await changeLink(env, idx, hash, 'edit description', (link) => { link.description = desc; });
      await sendView(env, chatId, cardView(r.link, r.index, `${SAVED} Описание ${clear ? 'очищено' : 'изменено'}. ${SITE_NOTE}`));
      return true;
    }

    default:
      return false;
  }
}

async function onMessage(env, m) {
  if (!m.from || m.from.is_bot || !isAllowed(env, m.from.id)) return; // чужих игнорируем молча
  if (!m.chat || m.chat.type !== 'private') return;

  const chatId = m.chat.id;
  const text = typeof m.text === 'string' ? m.text.trim() : '';

  try {
    if (text.startsWith('/')) {
      const cmd = text.split(/\s+/)[0].split('@')[0].toLowerCase();
      if (cmd === '/list') {
        const { data } = await readFile(env);
        return void (await sendView(env, chatId, listView(data)));
      }
      if (cmd === '/add') {
        return void (await sendPrompt(env, chatId, ADD_PROMPT, 'Название ссылки'));
      }
      // /start, /menu и любые другие команды
      const greet = cmd === '/start' ? 'Привет! Здесь можно управлять ссылками сайта.' : '';
      return void (await sendView(env, chatId, menuView(greet)));
    }

    if (text && m.reply_to_message && (await onReply(env, chatId, m.reply_to_message, text))) return;

    await sendView(env, chatId, menuView('Используйте кнопки ниже.'));
  } catch (e) {
    await reportError(env, chatId, e);
  }
}

async function handleUpdate(env, update) {
  if (update.callback_query) return onCallback(env, update.callback_query);
  if (update.message) return onMessage(env, update.message);
}

/* ---------- Точка входа Worker ---------- */

export default {
  async fetch(request, env, ctx) {
    // Любые запросы не-POST (например, открытие адреса в браузере) — просто «ok», без деталей.
    if (request.method !== 'POST') return new Response('ok');

    const required = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'ALLOWED_USER_IDS', 'GITHUB_TOKEN'];
    const missing = required.filter((k) => !env[k]);
    if (missing.length) {
      console.error('Missing secrets:', missing.join(', ')); // только имена, не значения
      return new Response('server misconfigured', { status: 500 });
    }

    // Проверка подлинности webhook
    const given = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
    if (!safeEqual(given, env.TELEGRAM_WEBHOOK_SECRET)) {
      return new Response('forbidden', { status: 403 });
    }

    let update;
    try {
      update = await request.json();
    } catch (e) {
      return new Response('bad request', { status: 400 });
    }

    // Сразу отвечаем Telegram 200, обработка идёт в фоне — так Telegram не будет слать повторы.
    ctx.waitUntil(
      handleUpdate(env, update).catch((e) => console.error('update failed', e && e.name))
    );
    return new Response('ok');
  },
};

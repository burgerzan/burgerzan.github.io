/* ==========================================================================
   Link-in-bio — загрузка links.json и построение страницы.

   Структура файла:
     1. Настройки и тексты
     2. Иконки
     3. Проверка данных (URL, цвета, текст)
     4. Отрисовка
     5. Обработка нажатий (место для будущей аналитики)
     6. Запуск

   Секретов, трекеров и cookies здесь нет. Данные посетителей не собираются.
   ========================================================================== */

(() => {
  'use strict';

  /* ---------- 1. Настройки и тексты ---------- */

  // Относительный путь: работает и в корне домена, и в репозитории GitHub Pages.
  const CONFIG_URL = 'links.json';

  const STR = {
    noLinks: 'Здесь пока нет ссылок.',
    loadError: 'Не удалось загрузить links.json.',
    invalidError: 'В файле links.json есть ошибка.',
    fileHint: 'Страница открыта как локальный файл. Запустите локальный сервер (см. README) или откройте опубликованный сайт.',
    retry: 'Повторить',
    newTab: '(откроется в новой вкладке)'
  };

  /* ---------- 2. Локальные SVG-значки сервисов ---------- */

  const ICONS = {
    link:
      '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/>' +
      '<path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    website:
      '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/>' +
      '<path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
    mail:
      '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 8 8 5.5L20 8"/>',
    youtube:
      '<rect x="3" y="6" width="18" height="12" rx="4"/><path d="M10.5 9.5v5l4.5-2.5z"/>',
    tiktok:
      '<path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 4c.4 2.4 2 4 4.5 4.2"/>',
    instagram:
      '<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.8"/>' +
      '<circle cx="17" cy="7" r=".6"/>',
    discord:
      '<path d="M4 6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-6l-4 4v-4H7a3 3 0 0 1-3-3z"/>' +
      '<circle cx="9" cy="10" r="1"/><circle cx="15" cy="10" r="1"/>',
    telegram:
      '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    github:
      '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/>' +
      '<path d="M6 8.5v7"/><path d="M18 10.5c0 3-4 4-12 5"/>',
    spotify:
      '<circle cx="12" cy="12" r="9"/><path d="M7.5 9.6c3.2-.9 6.5-.6 9 .9"/>' +
      '<path d="M8 12.8c2.6-.7 5.2-.4 7.3.8"/><path d="M8.6 15.8c2-.5 3.9-.3 5.5.6"/>',
    twitch:
      '<path d="M4 3h17v12l-5 5h-5l-4 3v-3H3V7z"/><path d="M10 7v6m6-6v6"/>',
    vk:
      '<path d="M3 6h4c0 5 2 8 4 9V6h4v5c2-2 3-3 4-5h3c-1 4-3 6-5 7 3 2 4 4 5 6h-4l-3-4v4h-3C6 19 3 13 3 6z"/>',
    x:
      '<path d="M4 3h5l11 18h-5zM20 3l-7 8M4 21l7-8"/>',
    steam:
      '<circle cx="16" cy="8" r="5"/><circle cx="16" cy="8" r="2.5"/><circle cx="6" cy="17" r="3"/><path d="m3 15-2-1m7 1 4-4m-3 7 6-5"/>',
    pinterest:
      '<circle cx="12" cy="12" r="9"/><path d="m9 21 3-13m-1 5c1 3 6 2 6-3 0-6-10-6-10 0 0 1 .3 2 1 3"/>',
    reddit:
      '<ellipse cx="12" cy="14" rx="9" ry="6"/><path d="m12 8 2-5 5 1m-12 12c3 2 7 2 10 0"/><circle cx="20" cy="4" r="2"/><circle cx="8" cy="13" r=".8"/><circle cx="16" cy="13" r=".8"/>',
    arrow:
      '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>'
  };

  // Допустимые псевдонимы названий иконок в links.json
  const ICON_ALIASES = { web: 'website', site: 'website', email: 'mail', tg: 'telegram', yt: 'youtube' };

  function iconName(value) {
    const key = str(value, 30).toLowerCase();
    const name = ICON_ALIASES[key] || key;
    return Object.prototype.hasOwnProperty.call(ICONS, name) ? name : 'link';
  }

  // Разметка иконок — это константы выше, а не данные из JSON, поэтому innerHTML здесь безопасен.
  function createIcon(name) {
    const span = document.createElement('span');
    span.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      ICONS[name] + '</svg>';
    const filled = {
      youtube: '<path fill="currentColor" stroke="none" d="M23 7s-.2-2-1-2.8C21 3.2 20 3.2 19.5 3.1 16.2 2.9 12 3 12 3s-4.2-.1-7.5.1C4 3.2 3 3.2 2 4.2 1.2 5 1 7 1 7S.8 9.2.8 11.5v1C.8 14.8 1 17 1 17s.2 2 1 2.8c1 1 2.3 1 2.9 1.1 2.1.2 7.1.2 7.1.2s4.2 0 7.5-.3c.5 0 1.5-.1 2.5-1.1.8-.8 1-2.8 1-2.8s.2-2.2.2-4.5v-1C23.2 9.2 23 7 23 7Z"/><path fill="white" stroke="none" d="m10 8 6 4-6 4z"/>',
      telegram: '<circle fill="currentColor" stroke="none" cx="12" cy="12" r="11"/><path fill="white" stroke="none" d="m5 11 13-5-3 13-4-4-2 2v-4l7-5-8 4z"/>'
    };
    if (filled[name]) span.firstChild.innerHTML = filled[name];
    return span.firstChild;
  }

  /* ---------- 3. Проверка данных ---------- */

  const $ = (id) => document.getElementById(id);
  const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const isHex = (v) => typeof v === 'string' && /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v.trim());

  /**
   * Возвращает безопасный абсолютный URL или null.
   * Разрешены только https:, http: (и mailto: для обычных ссылок).
   * javascript:, data: и прочие схемы отбрасываются.
   */
  function safeUrl(value, { relative = false, mail = false } = {}) {
    const v = str(value, 2048);
    if (!v) return null;
    try {
      const url = relative ? new URL(v, document.baseURI) : new URL(v);
      const allowed = ['https:', 'http:'];
      if (mail) allowed.push('mailto:');
      return allowed.includes(url.protocol) ? url.href : null;
    } catch (e) {
      return null;
    }
  }

  function normalizeLink(item, index, label) {
    if (!isObject(item)) {
      console.warn(`[links.json] ${label} #${index + 1}: ожидался объект, пропущено.`);
      return null;
    }
    if (item.enabled === false) return null;

    const title = str(item.title, 60);
    const url = safeUrl(item.url, { mail: true });
    if (!title || !url) {
      console.warn(`[links.json] ${label} #${index + 1}: нет названия или некорректный URL, пропущено.`);
      return null;
    }
    return {
      index,
      title,
      url,
      icon: iconName(item.icon),
      description: str(item.description, 120),
      order: typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : index
    };
  }

  function normalizeList(list, label) {
    return (Array.isArray(list) ? list : [])
      .map((item, i) => normalizeLink(item, i, label))
      .filter(Boolean)
      .sort((a, b) => a.order - b.order || a.index - b.index);
  }

  /** Приводит сырой JSON к безопасной структуре с значениями по умолчанию. */
  function normalize(raw) {
    if (!isObject(raw)) throw new Error('Корень links.json должен быть объектом { ... }.');

    const profile = isObject(raw.profile) ? raw.profile : {};
    const theme = isObject(raw.theme) ? raw.theme : {};
    const vis = isObject(raw.visibility) ? raw.visibility : {};
    const footer = isObject(raw.footer) ? raw.footer : {};
    const site = isObject(raw.site) ? raw.site : {};

    const lang = str(site.lang, 12);

    return {
      site: {
        lang: /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(lang) ? lang : 'ru',
        demo: site.demo === true,
        title: str(site.title, 80),
        description: str(site.description, 200)
      },
      profile: {
        name: str(profile.name, 60),
        description: str(profile.description, 200),
        avatar: safeUrl(profile.avatar, { relative: true }),
        avatarAlt: str(profile.avatarAlt, 100)
      },
      theme: {
        accent: isHex(theme.accent) ? theme.accent.trim() : null,
        accent2: isHex(theme.accent2) ? theme.accent2.trim() : null
      },
      visibility: {
        avatar: vis.avatar !== false,
        description: vis.description !== false,
        social: vis.social !== false,
        linkDescriptions: vis.linkDescriptions !== false,
        footer: vis.footer !== false
      },
      social: raw.socialSource === 'links'
        ? normalizeList(raw.links, 'links').filter(link => !['link', 'website', 'mail'].includes(link.icon))
        : normalizeList(raw.social, 'social'),
      links: normalizeList(raw.links, 'links'),
      footer: {
        text: str(footer.text, 120),
        author: str(footer.author, 60),
        showPrivacy: footer.showPrivacy !== false,
        privacyLabel: str(footer.privacyLabel, 40) || 'Datenschutzerklärung',
        privacyUrl: safeUrl(footer.privacyUrl, { relative: true }) || safeUrl('privacy.html', { relative: true }),
        links: normalizeList(footer.links, 'footer.links')
      }
    };
  }

  /* ---------- 4. Отрисовка ---------- */

  function setMeta(selector, value) {
    const el = document.querySelector(selector);
    if (el && value) el.setAttribute('content', value);
  }

  function applyTheme(theme) {
    const root = document.documentElement.style;
    if (theme.accent) root.setProperty('--accent', theme.accent);
    if (theme.accent2) root.setProperty('--accent-2', theme.accent2);
  }

  function renderProfile(cfg) {
    const { profile, visibility } = cfg;
    if (!profile.name && !profile.description && !cfg.social.length) return;

    $('name').textContent = profile.name;
    $('name').hidden = !profile.name;

    const desc = $('description');
    desc.textContent = profile.description;
    desc.hidden = !visibility.description || !profile.description;

    const wrap = $('avatar-wrap');
    const img = $('avatar');
    const showAvatar = visibility.avatar && (profile.avatar || profile.name);
    wrap.hidden = !showAvatar;
    if (showAvatar) {
      wrap.dataset.initial = (profile.name || '?').charAt(0).toUpperCase();
      img.alt = profile.avatarAlt || profile.name || '';
      img.addEventListener('error', () => wrap.classList.add('no-img'), { once: true });
      if (profile.avatar) img.src = profile.avatar;
      else wrap.classList.add('no-img');
    }

    $('profile').hidden = false;
  }

  function createAnchor(link, { external = true } = {}) {
    const a = document.createElement('a');
    a.href = link.url;
    if (external && /^https?:/i.test(link.url)) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    a.addEventListener('click', () => handleLinkClick(link));
    return a;
  }

  function renderSocial(cfg) {
    const list = $('social');
    list.textContent = '';
    if (!cfg.visibility.social || !cfg.social.length) {
      list.hidden = true;
      return;
    }
    cfg.social.forEach((link) => {
      const li = document.createElement('li');
      const a = createAnchor(link);
      a.setAttribute('aria-label', link.title);
      a.title = link.title;
      a.appendChild(createIcon(link.icon));
      li.appendChild(a);
      list.appendChild(li);
    });
    list.hidden = false;
  }

  function renderLinks(cfg) {
    const list = $('links');
    list.textContent = '';

    cfg.links.forEach((link, i) => {
      const li = document.createElement('li');
      li.style.setProperty('--i', String(i));

      const a = createAnchor(link);
      a.className = 'card';
      a.dataset.icon = link.icon;

      const icon = document.createElement('span');
      icon.className = 'card-icon';
      icon.appendChild(createIcon(link.icon));

      const text = document.createElement('span');
      text.className = 'card-text';
      const title = document.createElement('span');
      title.className = 'card-title';
      title.textContent = link.title;
      text.appendChild(title);

      if (cfg.visibility.linkDescriptions && link.description) {
        const d = document.createElement('span');
        d.className = 'card-desc';
        d.textContent = link.description;
        text.appendChild(d);
      }

      const arrow = document.createElement('span');
      arrow.className = 'card-arrow';
      arrow.appendChild(createIcon('arrow'));

      a.append(icon, text, arrow);

      if (a.target === '_blank') {
        const hint = document.createElement('span');
        hint.className = 'visually-hidden';
        hint.textContent = ' ' + STR.newTab;
        title.appendChild(hint);
      }

      li.appendChild(a);
      list.appendChild(li);
    });

    if (!cfg.links.length) showStatus(STR.noLinks);
  }

  function renderFooter(cfg) {
    const footer = $('footer');
    footer.hidden = !cfg.visibility.footer;

    const author = cfg.footer.author || cfg.profile.name;
    $('footer-text').textContent =
      cfg.footer.text || (author ? `© ${new Date().getFullYear()} ${author}` : '');
    $('footer-text').hidden = !$('footer-text').textContent;

    const list = $('footer-links');
    const privacyItem = $('privacy-item');

    cfg.footer.links.forEach((link) => {
      const li = document.createElement('li');
      const a = createAnchor(link);
      a.textContent = link.title;
      li.appendChild(a);
      list.insertBefore(li, privacyItem);
    });

    if (cfg.footer.showPrivacy) {
      const a = $('privacy-link');
      a.textContent = cfg.footer.privacyLabel;
      a.href = cfg.footer.privacyUrl;
    } else {
      privacyItem.remove();
    }
  }

  function render(cfg) {
    document.documentElement.lang = cfg.site.lang;
    $('demo-note').hidden = !cfg.site.demo;

    const title = cfg.site.title || cfg.profile.name;
    if (title) document.title = title;
    const description = cfg.site.description || cfg.profile.description;
    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);

    applyTheme(cfg.theme);
    renderProfile(cfg);
    renderSocial(cfg);
    renderLinks(cfg);
    renderFooter(cfg);

    if (cfg.links.length) hideStatus();
    $('app').classList.add('ready');
  }

  /* ---------- Статус и ошибки ---------- */

  function showStatus(message, { error = false, retry = false } = {}) {
    const el = $('status');
    el.textContent = message;
    el.classList.toggle('error', error);
    el.hidden = false;

    if (retry) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = STR.retry;
      btn.addEventListener('click', () => window.location.reload());
      el.appendChild(document.createElement('br'));
      el.appendChild(btn);
    }
  }

  function hideStatus() {
    $('status').hidden = true;
  }

  /* ---------- 5. Обработка нажатий ---------- */

  /**
   * Вызывается при нажатии на любую ссылку (карточки, соцсети, ссылки в подвале).
   *
   * Сейчас функция намеренно ничего не делает: аналитика не подключена,
   * ничего не отправляется и не сохраняется.
   *
   * Сюда позже можно добавить, например, вызов собственного API подсчёта кликов.
   * Не вызывайте preventDefault(), чтобы переход по ссылке не ломался.
   * Если подключите аналитику — обновите privacy.html.
   *
   * @param {{title: string, url: string, icon: string}} link
   */
  function handleLinkClick(link) { // eslint-disable-line no-unused-vars
    // Пока пусто.
  }

  /* ---------- 6. Запуск ---------- */

  async function fetchConfig() {
    let response;
    try {
      response = await fetch(CONFIG_URL, { cache: 'no-cache' });
    } catch (e) {
      const err = new Error(STR.loadError);
      err.hint = window.location.protocol === 'file:' ? STR.fileHint : '';
      throw err;
    }
    if (!response.ok) {
      throw new Error(`${STR.loadError} (HTTP ${response.status})`);
    }
    try {
      return await response.json();
    } catch (e) {
      throw new Error(`${STR.invalidError} Проверьте запятые и кавычки.`);
    }
  }

  async function init() {
    try {
      const raw = await fetchConfig();
      render(normalize(raw));
    } catch (err) {
      console.error(err);
      const message = [err.message, err.hint].filter(Boolean).join(' ');
      showStatus(message, { error: true, retry: true });
    }
  }

  init();
})();

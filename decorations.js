/* Общая проверка макета: растровые data URL, без SVG/HTML и внешних запросов. */
(() => {
  'use strict';
  const number = (v, min, max, fallback) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  function validate(raw) {
    if (!raw || raw.version !== 1 || !Array.isArray(raw.items) || raw.items.length > 30) throw new Error('Ожидается макет версии 1, не более 30 картинок.');
    let size = 0;
    const bg = raw.background || {};
    const color = (v, fallback) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
    const background = {
      type: ['original', 'solid', 'gradient', 'animated'].includes(bg.type) ? bg.type : 'original',
      top: color(bg.top, '#d97575'), bottom: color(bg.bottom, '#ffffff'),
      angle: number(bg.angle, 0, 360, 180), speed: number(bg.speed, 3, 60, 15)
    };
    return { version: 1, background, items: raw.items.map((item, i) => {
      if (!item || typeof item.src !== 'string' || !/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/.test(item.src)) throw new Error('Разрешены только PNG, JPEG, GIF и WebP.');
      size += item.src.length;
      if (size > 16000000) throw new Error('Макет слишком большой: максимум примерно 12 МБ изображений.');
      const pos = (v = {}) => ({ x: number(v.x, 0, 100, 10), y: number(v.y, 0, 95, 10), width: number(v.width, 4, 70, 20), angle: number(v.angle, -180, 180, 0), opacity: number(v.opacity, 0, 1, 1), layer: v.layer === 'back' ? 'back' : 'front' });
      return { id: String(i), name: String(item.name || 'Картинка').slice(0, 80), src: item.src, ...(item.anchor === 'copyright' ? { anchor: 'copyright' } : {}), desktop: pos(item.desktop), mobile: pos(item.mobile) };
    }) };
  }
  function render(layer, model, mode) {
    const body = layer.ownerDocument.body, bg = model.background || { type: 'original' };
    body.dataset.background = bg.type;
    body.style.setProperty('--scene-top', bg.top || '#d97575');
    body.style.setProperty('--scene-bottom', bg.bottom || '#ffffff');
    body.style.setProperty('--scene-angle', (bg.angle ?? 180) + 'deg');
    body.style.setProperty('--scene-speed', (bg.speed ?? 15) + 's');
    layer.replaceChildren();
    model.items.forEach(item => {
      const img = document.createElement('img');
      const p = item[mode];
      img.src = item.src; img.alt = ''; img.draggable = false; img.className = 'decoration'; img.dataset.id = item.id;
      Object.assign(img.style, { left: p.x + '%', top: p.y + '%', width: p.width + '%', transform: `rotate(${p.angle}deg)`, opacity: p.opacity ?? 1, zIndex: p.layer === 'back' ? 0 : 2 });
      layer.append(img);
      if (item.anchor === 'copyright') img.dataset.anchor = 'copyright';
    });
    alignCopyright(layer);
  }
  // Follow the actual footer, including changes after fonts, links or counter load.
  function alignCopyright(layer) {
    const footer = layer.ownerDocument.getElementById('footer-text');
    if (!footer) return;
    const board = layer.getBoundingClientRect(), target = footer.getBoundingClientRect();
    layer.querySelectorAll('[data-anchor="copyright"]').forEach(img => {
      img.style.top = (target.top + target.height / 2 - board.top - img.getBoundingClientRect().height / 2) + 'px';
    });
  }
  // Live-page interaction only: the editor keeps its ordinary draggable images.
  function enablePetting(layer, model) {
    const targets = model.items.filter(item => /^(v2-v2-ultrakill|minos-prime-plush)/i.test(item.name));
    targets.forEach(item => {
      const img = Array.from(layer.querySelectorAll('.decoration')).find(el => el.dataset.id === item.id);
      if (!img) return;
      const name = item.name.startsWith('v2-') ? 'V2' : 'Minos Prime';
      img.classList.add('pet-target');
      img.setAttribute('role', 'button');
      img.setAttribute('tabindex', '0');
      img.setAttribute('aria-label', 'Погладить ' + name);
      let timer, hand;
      const stop = () => {
        clearTimeout(timer);
        hand?.remove();
        img.classList.remove('is-petted');
      };
      const pet = () => {
        stop();
        hand = document.createElement('img');
        hand.className = 'pet-hand';
        hand.src = 'petpet-transparent.gif';
        hand.alt = ''; hand.draggable = false;
        hand.setAttribute('aria-hidden', 'true');
        // Coordinates use the same stable board as the original GIF.
        Object.assign(hand.style, {
          left: (img.offsetLeft - img.offsetWidth * 0.05) + 'px',
          top: (img.offsetTop - img.offsetWidth * 0.40) + 'px',
          width: (img.offsetWidth * 1.1) + 'px'
        });
        hand.addEventListener('error', stop, { once: true });
        layer.append(hand);
        img.classList.add('is-petted');
        timer = setTimeout(stop, 800);
      };
      img.addEventListener('click', pet);
      img.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (!event.repeat) pet();
        }
      });
    });
  }
  window.Decorations = { validate, render };
  // The workshop uses this API for its iframe, not for decorating its own controls.
  if (!document.getElementById('app')) return;
  const layer = document.createElement('div'); layer.className = 'decoration-layer'; document.body.append(layer);
  window.decorationLayer = layer;
  if (new URLSearchParams(location.search).has('layout-preview') && window.parent !== window) return;
  fetch('decorations.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('Не загружен макет'); return r.json(); }).then(raw => {
    const model = validate(raw);
    const draw = () => {
      render(layer, model, innerWidth <= 600 ? 'mobile' : 'desktop');
      enablePetting(layer, model);
    };
    draw(); window.addEventListener('resize', draw);
    layer.addEventListener('load', () => alignCopyright(layer), true);
    const observer = new ResizeObserver(() => alignCopyright(layer));
    document.querySelectorAll('.page, .visitor-counter, .footer').forEach(el => observer.observe(el));
    document.fonts.ready.then(() => alignCopyright(layer));
  }).catch(e => console.warn('Декор:', e.message));
})();

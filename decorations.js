/* Общая проверка макета: растровые data URL, без SVG/HTML и внешних запросов. */
(() => {
  'use strict';
  const number = (v, min, max, fallback) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  function validate(raw) {
    if (!raw || raw.version !== 1 || !Array.isArray(raw.items) || raw.items.length > 30) throw new Error('Ожидается макет версии 1, не более 30 картинок.');
    let size = 0;
    return { version: 1, items: raw.items.map((item, i) => {
      if (!item || typeof item.src !== 'string' || !/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/.test(item.src)) throw new Error('Разрешены только PNG, JPEG, GIF и WebP.');
      size += item.src.length;
      if (size > 16000000) throw new Error('Макет слишком большой: максимум примерно 12 МБ изображений.');
      const pos = (v = {}) => ({ x: number(v.x, 0, 100, 10), y: number(v.y, 0, 95, 10), width: number(v.width, 4, 70, 20), angle: number(v.angle, -180, 180, 0) });
      return { id: String(i), name: String(item.name || 'Картинка').slice(0, 80), src: item.src, desktop: pos(item.desktop), mobile: pos(item.mobile) };
    }) };
  }
  function render(layer, model, mode) {
    layer.replaceChildren();
    model.items.forEach(item => {
      const img = document.createElement('img');
      const p = item[mode];
      img.src = item.src; img.alt = ''; img.draggable = false; img.className = 'decoration'; img.dataset.id = item.id;
      Object.assign(img.style, { left: p.x + '%', top: p.y + '%', width: p.width + '%', transform: `rotate(${p.angle}deg)` });
      layer.append(img);
    });
  }
  window.Decorations = { validate, render };
  const layer = document.createElement('div'); layer.className = 'decoration-layer'; layer.setAttribute('aria-hidden', 'true'); document.body.append(layer);
  window.decorationLayer = layer;
  if (new URLSearchParams(location.search).has('layout-preview') && window.parent !== window) return;
  fetch('decorations.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('Не загружен макет'); return r.json(); }).then(raw => {
    const model = validate(raw);
    const draw = () => render(layer, model, innerWidth <= 600 ? 'mobile' : 'desktop');
    draw(); window.addEventListener('resize', draw);
  }).catch(e => console.warn('Декор:', e.message));
})();

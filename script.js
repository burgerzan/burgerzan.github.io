/* Красный → молочный, центральная визитка. Не зависит от акцентов старого JSON. */
@font-face {
  font-family: 'Bubblegum Sans';
  src: url('Bubblegum_Sans/BubblegumSans-Regular.ttf') format('truetype');
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}
/* Системный шрифт подхватывает отсутствующие глифы, в том числе кириллицу. */
body { --font: 'Bubblegum Sans', 'Trebuchet MS', system-ui, sans-serif; font-synthesis: none; }
:root { color-scheme: light; --text: #392323; --muted: #705958; --border: #9c555526; --card: #ffffffe0; --card-hover: #fff; --border-hover: #b85959; }
body { background: linear-gradient(180deg, #d97575 0, #edb2a6 340px, #f9ddd0 680px, #fff 1150px); background-repeat: no-repeat; background-color: #fff; color: var(--text); position: relative; isolation: isolate; }
.bg { display: none; }
.page { flex: 0 0 auto; max-width: 640px; padding: calc(28px + env(safe-area-inset-top)) 24px 24px; }
.page-top { border: 0; justify-content: center; }
.wordmark { font-size: 14px; letter-spacing: .12em; text-transform: uppercase; }
.wordmark > span:first-child { background: #ffffff80; color: #733838; }
.wordmark-dot { color: #733838; }
.edition { display: none; }
.layout { display: flex; flex-direction: column; gap: 32px; padding-top: 32px; }
.profile { position: static; text-align: center; width: 100%; }
.profile > .eyebrow { display: none; }
.avatar { width: 120px; height: 120px; border-radius: 50%; margin: 0 auto 22px; padding: 4px; background: #fff9; border: 1px solid #fffb; transform: none; box-shadow: 0 10px 40px #7d30301c; }
.avatar img { border-radius: 50%; background: #fff; position: relative; z-index: 1; }
/* Только кольцо, без вращения аватара; ::after остаётся для запасного инициала. */
.avatar { position: relative; overflow: visible; isolation: isolate; }
.avatar::before { content: ''; position: absolute; inset: -3px; border-radius: 50%; border: 3px solid transparent; background: conic-gradient(from 0deg, #b72f48, #fff0 35%, #ffe0b5 60%, #b72f48) border-box; mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0); mask-composite: exclude; pointer-events: none; animation: avatar-ring 5s linear infinite; }
@keyframes avatar-ring { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .avatar::before { animation: none; } }
.avatar.no-img::after { color: #a34343; }
.profile h1 { font-size: clamp(38px, 8vw, 52px); font-weight: 400; line-height: 1.15; letter-spacing: 0; }
.wordmark { font-weight: 400; letter-spacing: .04em; }
.bio { font-size: 18px; line-height: 1.55; }
.section-heading h2 { font-weight: 400; }
.card .card-title { font-size: 22px; font-weight: 400; line-height: 1.25; }
.card .card-desc { font-size: 14px; line-height: 1.5; }
.demo-note, .links-note { font-size: 13px; }
.bio { margin: 12px auto 0; max-width: 36ch; color: #623f3f; }
.social { justify-content: center; margin-top: 20px; }
.social a { background: #fff8; border-color: #fff9; color: #492d2d; border-radius: 50%; }
.link-section { width: 100%; }
.section-heading { justify-content: center; margin-bottom: 16px; }
.section-heading .eyebrow, .section-symbol, .heading-dot { display: none; }
.section-heading h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .18em; color: #70504c; }
.demo-note { color: #70504c; border-color: #99645c55; text-align: center; }
.link-section { max-width: 480px; margin-inline: auto; }
.links { gap: 10px; }
.card { grid-template-columns: 36px minmax(0, 1fr) 20px; gap: 12px; min-height: 64px; padding: 10px 14px; border-radius: 15px; border-color: #fff; background: #ffffffe0; box-shadow: 0 5px 20px #7d303008; }
.card .card-title { font-size: 20px; }
.card .card-desc { font-size: 13px; }
.card-icon, .card[data-icon] .card-icon { width: 36px; height: 36px; background: transparent; color: #453939; border-radius: 0; }
.card-icon svg { width: 24px; height: 24px; }
.card-arrow { color: #8f7370; }
.card[data-icon="youtube"] .card-icon, .social a[aria-label="YouTube"] { color: #ce1312; }
.card[data-icon="telegram"] .card-icon, .social a[aria-label="Telegram"] { color: #229ed9; }
.card[data-icon="spotify"] .card-icon { color: #16843e; }
.card[data-icon="instagram"] .card-icon { color: #b73574; }
.card-title { font-size: 16px; }
.card-desc { color: #705958; }
.links-note { color: #705958; }
.footer { max-width: 592px; width: calc(100% - 48px); color: #705958; border-color: #9c555526; font-size: 11px; }
.visitor-counter { flex: 0 0 auto; width: calc(100% - 32px); max-width: 480px; min-width: 0; margin: 0 auto 24px; text-align: center; }
.visitor-counter img { display: block; max-width: 100%; height: auto; margin: 0 auto; image-rendering: pixelated; }
.visitor-counter figcaption { margin-top: 8px; color: #705958; font-size: 15px; }
.status.error { color: #942e2e; border-color: #942e2e55; }
.todo, mark.todo-inline { color: #795000; background: #fff3cd; }
:focus-visible { outline-color: #922f38; }
@media (hover: hover) { .card:hover { transform: translateY(-2px); border-color: #d9a59e; } .social a:hover { background: #fff; } }
@media (max-width: 380px) { .page { padding-inline: 16px; } }
.page, .visitor-counter, .footer { position: relative; z-index: 1; }
/* No stacking context on the wrapper: each image can sit below or above content. */
.decoration-layer { position: absolute; inset: 0; overflow: clip; pointer-events: none; }
body.layout-edit .decoration { z-index: 3 !important; }
body[data-background="solid"] { background: var(--scene-top); }
body[data-background="gradient"], body[data-background="animated"] { background: linear-gradient(var(--scene-angle), var(--scene-top), var(--scene-bottom)); }
body[data-background="animated"] { background-size: 200% 200%; animation: scene-drift var(--scene-speed) ease-in-out infinite alternate; }
@keyframes scene-drift { from { background-position: 0% 0%; } to { background-position: 100% 100%; } }
@media (prefers-reduced-motion: reduce) { body[data-background="animated"] { animation: none; } }
.decoration { position: absolute; display: block; height: auto; max-width: none; user-select: none; }
body.layout-edit .decoration { pointer-events: auto; cursor: grab; touch-action: none; outline: 1px dashed #99343c; }
body.layout-edit .decoration.selected { outline: 3px solid #99343c; }
@media (prefers-reduced-motion: reduce) { .decoration-layer { display: none; } body.layout-edit .decoration-layer { display: block; } }

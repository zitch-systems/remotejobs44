/* RemoteJobs44 — screen-specific styles. */

/* skeletons */
.skel{ height:80px; border-radius:18px; margin-bottom:11px; background:
  linear-gradient(100deg, var(--card) 30%, var(--line) 50%, var(--card) 70%); background-size:200% 100%;
  animation:sk 1.2s infinite; border:1.5px solid var(--line); }
@keyframes sk{ to{ background-position:-200% 0; } }

/* ---------- AUTH ---------- */
.auth{ min-height:100%; display:flex; flex-direction:column; background:
  radial-gradient(120% 60% at 90% 0%, rgba(249,115,22,.20), transparent 55%),
  linear-gradient(160deg, rgba(8,22,46,.84) 0%, rgba(9,22,44,.66) 50%, rgba(8,20,42,.54) 100%),
  url(assets/auth-bg.png) 62% 20%/cover no-repeat;
  background-color:#07142a; color:#fff; }
.auth-top{ padding:clamp(22px,5vh,52px) 26px clamp(14px,2vh,24px); }
.auth-logo{ display:inline-flex; }
.auth-logo svg{ width:clamp(40px,6.5vh,54px); height:clamp(40px,6.5vh,54px); }
.auth-top h1{ font-family:var(--font-display); font-weight:800; font-size:clamp(24px,5vh,30px); line-height:1.12; letter-spacing:-.03em; margin:clamp(10px,1.8vh,20px) 0 8px; }
.auth-top h1 em{ font-style:normal; color:#fbbf46; }
.auth-top p{ color:#9fb2cf; font-size:14px; margin:0; max-width:30ch; }
.auth-card{ margin-top:auto; background:var(--bg-elev); color:var(--fg-1); border-radius:28px 28px 0 0; padding:clamp(14px,2.2vh,24px) 22px calc(18px + env(safe-area-inset-bottom)); }
.auth-card .field{ margin-bottom:clamp(8px,1.5vh,13px); }
.seg{ display:flex; background:var(--bg); border:1px solid var(--line-2); border-radius:13px; padding:4px; margin-bottom:clamp(11px,1.8vh,18px); }
.seg button{ flex:1; border:none; background:none; padding:10px; border-radius:10px; font-family:var(--font-display); font-weight:700; font-size:14px; color:var(--fg-3); }
.seg button.on{ background:var(--brand-600); color:#fff; }
.or{ display:flex; align-items:center; gap:12px; margin:clamp(10px,1.7vh,18px) 0; color:var(--fg-4); font-size:12px; font-weight:600; }
.or::before,.or::after{ content:''; flex:1; height:1px; background:var(--line); }
.socials{ display:flex; gap:10px; } .socials .btn{ flex:1; }
.auth-fine{ text-align:center; color:var(--fg-4); font-size:11.5px; margin:clamp(9px,1.4vh,16px) 0 0; }

/* ---------- FEED HERO ---------- */
.feed-hero{ padding:max(16px,env(safe-area-inset-top)) 18px 20px; border-radius:0 0 26px 26px; color:#fff; position:relative; overflow:hidden;
  background:radial-gradient(120% 90% at 92% -8%, rgba(249,115,22,.2), transparent 56%), linear-gradient(165deg,#0c2249,#0a1a36 52%,#07142a); }
.feed-hero .fh-row{ display:flex; align-items:center; justify-content:space-between; }
.feed-hero .hi{ font-size:12px; color:#9fb2cf; } .feed-hero .nm{ font-family:var(--font-display); font-weight:800; font-size:20px; margin-top:2px; }
.feed-hero .nm em{ font-style:normal; color:#fbbf46; }
.feed-hero .iconbtn .dot{ border-color:#0a1a36; }
.hero-search{ width:100%; display:flex; align-items:center; gap:10px; margin-top:16px; padding:13px 15px; border:none; border-radius:14px;
  background:#fff; color:var(--fg-4); font-size:15px; font-family:var(--font-body); box-shadow:0 16px 30px -16px rgba(0,0,0,.5); }
.hero-search svg{ width:19px; height:19px; color:var(--brand-600); }
.fh-stats{ display:flex; gap:9px; margin-top:16px; }
.fh-stat{ flex:1; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.13); border-radius:14px; padding:11px 12px; }
.fh-stat .v{ font-family:var(--font-display); font-weight:800; font-size:19px; line-height:1; } .fh-stat .v em{ font-style:normal; color:#9fb2cf; font-size:12px; }
.fh-stat .l{ font-size:10px; color:#9fb2cf; font-weight:600; margin-top:5px; }
.fh-stat.accent{ background:rgba(249,115,22,.16); border-color:rgba(249,115,22,.32); } .fh-stat.accent .v{ color:#fdba74; }

/* ---------- SEARCH ---------- */
.search-input{ margin-bottom:12px; }
.filters{ display:none; } .filters.open{ display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:14px; }
.fdrop--wide{ grid-column:1 / -1; }
.fdrop{ flex:1; min-width:0; -webkit-appearance:none; appearance:none; font-family:var(--font-body); font-size:12.5px; font-weight:600; color:var(--fg-1); background-color:var(--card); border:1.5px solid var(--line-2); border-radius:11px; padding:9px 28px 9px 12px; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 9px center; background-size:14px; }
.fdrop:focus{ outline:none; border-color:var(--brand-500); }
.fbadge{ position:absolute; top:-4px; right:-4px; min-width:16px; height:16px; padding:0 4px; border-radius:9px; background:var(--accent); color:#fff; font-size:9.5px; font-weight:800; display:grid; place-items:center; border:2px solid var(--bg-elev); }

/* ---------- APPLICATIONS ---------- */
.track{ display:flex; gap:9px; margin-bottom:16px; }
.track .trk{ flex:1; background:var(--card); border:1.5px solid var(--line); border-radius:14px; padding:12px; text-align:center; }
.track .trk b{ display:block; font-family:var(--font-display); font-weight:800; font-size:20px; color:var(--brand-600); }
[data-theme="dark"] .track .trk b{ color:var(--brand-400); }
.track .trk span{ font-size:11px; color:var(--fg-3); }
.appcard{ display:flex; align-items:center; gap:13px; background:var(--card); border:1.5px solid var(--line); border-radius:16px; padding:13px; margin-bottom:10px; }
.appcard svg{ width:18px; height:18px; color:var(--fg-4); flex-shrink:0; }
.status{ display:inline-block; margin-top:6px; font-size:11px; font-weight:700; padding:3px 9px; border-radius:7px; }
.s-applied{ color:var(--brand-700); background:var(--brand-50); } .s-interview{ color:#b45309; background:#fef3c7; } .s-offer{ color:#15803d; background:#dcfce7; }
[data-theme="dark"] .s-applied{ background:rgba(59,130,246,.14); color:var(--brand-400); }

/* ---------- NOTIFICATIONS ---------- */
.notif{ display:flex; gap:12px; padding:13px 0; border-bottom:1px solid var(--line); }
.notif.un{ position:relative; } .notif.un::after{ content:''; position:absolute; left:-6px; top:18px; width:7px; height:7px; border-radius:50%; background:var(--accent); }
.ni{ width:38px; height:38px; border-radius:11px; flex-shrink:0; display:grid; place-items:center; background:var(--brand-50); color:var(--brand-600); }
.ni svg{ width:18px; height:18px; } [data-theme="dark"] .ni{ background:rgba(59,130,246,.12); color:var(--brand-400); }
.notif p{ margin:0 0 3px; font-size:13.5px; line-height:1.4; color:var(--fg-1); } .notif .at{ font-size:11.5px; color:var(--fg-4); }

/* ---------- PROFILE ---------- */
.prof-head{ display:flex; align-items:center; gap:14px; margin:6px 0 18px; }
.avatar{ width:62px; height:62px; border-radius:18px; background:linear-gradient(150deg,#2563eb,#1e3a8a); color:#fff; display:grid; place-items:center; font-family:var(--font-display); font-weight:800; font-size:24px; }
.prof-head .pn{ font-family:var(--font-display); font-weight:800; font-size:18px; } .prof-head .pr{ font-size:13px; color:var(--fg-3); margin-top:1px; }
.prof-head .pl{ display:flex; align-items:center; gap:5px; font-size:12.5px; color:var(--fg-4); margin-top:4px; } .prof-head .pl svg{ width:13px; height:13px; }
.prof-stats{ display:flex; gap:9px; margin-bottom:18px; }
.prof-stats > div{ flex:1; background:var(--card); border:1.5px solid var(--line); border-radius:14px; padding:13px; text-align:center; }
.prof-stats b{ display:block; font-family:var(--font-display); font-weight:800; font-size:19px; } .prof-stats span{ font-size:11px; color:var(--fg-3); }
.card-block{ background:var(--card); border:1.5px solid var(--line); border-radius:16px; overflow:hidden; }
.cb-row,.set-row{ display:flex; align-items:center; gap:12px; padding:14px 15px; }
.set-row + .set-row, .cb-row + .cb-row{ border-top:1px solid var(--line); }
.cb-ic,.set-row svg:first-child{ color:var(--fg-3); } .cb-ic svg,.set-row > span svg{ width:19px; height:19px; }
.cb-row b,.set-row b{ font-size:14px; } .cb-row span:not(.cb-ic),.cb-row div span{ font-size:12px; color:var(--fg-4); display:block; }
.set-row{ justify-content:space-between; } .set-row > span{ display:flex; align-items:center; gap:11px; font-size:14.5px; font-weight:500; }
.set-row > span:first-child{ flex:1; min-width:0; }
.set-meta{ flex:none !important; margin-left:auto; color:var(--fg-4); font-size:12.5px; font-weight:600; }
.set-row.danger > span:first-child, .set-row.danger svg{ color:#e11d48; }
/* Subscription card */
.sub-card{ display:flex; align-items:center; justify-content:space-between; gap:12px; background:var(--card); border:1.5px solid var(--line); border-radius:16px; padding:13px 14px; margin-bottom:14px; }
.sub-card .sub-l{ display:flex; align-items:center; gap:11px; min-width:0; }
.sub-ic{ width:42px; height:42px; border-radius:12px; background:var(--brand-50); color:var(--brand-600); display:grid; place-items:center; flex-shrink:0; }
.sub-ic svg{ width:20px; height:20px; }
[data-theme="dark"] .sub-ic{ background:rgba(59,130,246,.16); }
.sub-card b{ font-family:var(--font-display); font-weight:800; font-size:14.5px; color:var(--fg-1); display:block; }
.sub-card .sub-l > div span{ font-size:12px; color:var(--fg-3); display:block; margin-top:1px; }
.sub-card.pro{ background:linear-gradient(135deg,#0c2249,#0a1a36); border-color:transparent; }
.sub-card.pro .sub-ic{ background:rgba(255,255,255,.12); color:#fbbf46; }
.sub-card.pro b{ color:#fff; }
.sub-card.pro .sub-l > div span{ color:#aebfd6; }
.btn-sm{ padding:9px 16px; font-size:13.5px; border-radius:11px; flex-shrink:0; }
.mini.light{ background:rgba(255,255,255,.14); color:#fff; border:none; }
.pro-pill{ display:inline-flex; align-items:center; gap:3px; vertical-align:middle; background:#fde68a; color:#7c4a03; font-size:9.5px; font-weight:800; padding:2px 6px; border-radius:6px; }
.pro-pill svg{ width:10px; height:10px; }
.set-row > svg{ width:18px; height:18px; color:var(--fg-4); }
.mini{ margin-left:auto; border:1.5px solid var(--line-2); background:var(--bg); color:var(--fg-2); font-size:12px; font-weight:700; padding:6px 12px; border-radius:9px; }
.skills{ display:flex; flex-wrap:wrap; gap:8px; } .skill{ background:var(--brand-50); color:var(--brand-700); border:1px solid var(--brand-100); font-size:13px; font-weight:600; padding:7px 13px; border-radius:999px; }
[data-theme="dark"] .skill{ background:rgba(59,130,246,.12); color:var(--brand-400); border-color:rgba(59,130,246,.25); }
.switch{ width:46px; height:27px; border-radius:99px; background:var(--line-2); position:relative; transition:.2s; flex-shrink:0; }
.switch i{ position:absolute; top:3px; left:3px; width:21px; height:21px; border-radius:50%; background:#fff; transition:.2s; box-shadow:0 1px 3px rgba(0,0,0,.3); }
.switch.on{ background:var(--brand-600); } .switch.on i{ left:22px; }
.ver{ text-align:center; color:var(--fg-4); font-size:11.5px; margin:20px 0 0; }

/* ---------- DETAIL ---------- */
.dt-hero{ padding:max(14px,env(safe-area-inset-top)) 18px 22px; color:#fff; border-radius:0 0 24px 24px;
  background:radial-gradient(120% 92% at 90% -10%, rgba(249,115,22,.18), transparent 56%), linear-gradient(165deg,#0c2249,#0a1a36 55%,#07142a); }
.dt-bar{ display:flex; align-items:center; gap:8px; }
.dt-save.on{ color:var(--accent); }
.dt-head{ margin-top:14px; } .dt-logo{ width:54px; height:54px; border-radius:15px; margin-bottom:12px; }
.dt-head h1{ font-family:var(--font-display); font-weight:800; font-size:25px; line-height:1.12; letter-spacing:-.02em; margin:0; }
.dt-co{ display:flex; align-items:center; gap:9px; color:#aebfd6; font-size:14px; margin-top:6px; }
.vchip{ display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:700; color:#5fd99a; background:rgba(34,197,94,.14); padding:3px 8px; border-radius:7px; } .vchip svg{ width:12px; height:12px; }
.dt-chips{ display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
.dt-chips span{ display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:600; color:#dbe6f7; background:rgba(255,255,255,.09); border:1px solid rgba(255,255,255,.14); padding:6px 11px; border-radius:9px; } .dt-chips svg{ width:13px; height:13px; }
.dt-keyrow{ display:flex; gap:9px; margin-bottom:14px; }
.dt-keyrow > div{ flex:1; background:var(--card); border:1.5px solid var(--line); border-radius:14px; padding:12px; }
.dt-keyrow b{ font-family:var(--font-display); font-weight:800; font-size:15px; } .dt-keyrow b.mt{ color:var(--success); } .dt-keyrow span{ display:block; font-size:11px; color:var(--fg-4); margin-top:2px; }
.match-bar{ height:8px; border-radius:99px; background:var(--line); overflow:hidden; margin-bottom:6px; } .match-bar i{ display:block; height:100%; border-radius:99px; background:linear-gradient(90deg,var(--brand-500),var(--success)); }
.dt-h{ font-family:var(--font-display); font-weight:800; font-size:17px; margin:22px 0 9px; } .dt-p{ color:var(--fg-2); line-height:1.6; font-size:14.5px; margin:0; }
.dt-list{ list-style:none; padding:0; margin:0; } .dt-list li{ display:flex; gap:10px; align-items:flex-start; font-size:14.5px; color:var(--fg-2); line-height:1.5; margin-bottom:10px; }
.dt-list svg{ width:18px; height:18px; color:var(--success); flex-shrink:0; margin-top:2px; }
.comp-card{ display:flex; align-items:center; gap:12px; background:var(--card); border:1.5px solid var(--line); border-radius:16px; padding:13px; margin-top:18px; }
.comp-card .jlogo{ width:42px; height:42px; } .comp-card b{ font-size:14.5px; } .comp-card span{ font-size:12.5px; color:var(--fg-4); display:block; }
.applybar{ position:absolute; left:0; right:0; bottom:0; display:flex; gap:11px; padding:13px 18px calc(13px + env(safe-area-inset-bottom)); background:var(--bg-elev); border-top:1px solid var(--line); }
.applybar .apply-btn{ flex:1; } .applybar .iconbtn.big{ width:52px; height:52px; } .apply-btn.done{ background:var(--success); }

/* ---------- APPLY SHEET ---------- */
.sheet-ov{ position:fixed; inset:0; background:rgba(8,16,33,.5); z-index:80; display:flex; align-items:flex-end; opacity:0; transition:.24s; }
.sheet-ov.show{ opacity:1; } .sheet-ov .sheet{ transform:translateY(100%); transition:.28s cubic-bezier(.22,1,.36,1); }
.sheet-ov.show .sheet{ transform:none; }
.sheet{ width:100%; max-width:520px; margin:0 auto; background:var(--bg-elev); border-radius:26px 26px 0 0; padding:10px 22px calc(24px + env(safe-area-inset-bottom)); }
.sheet-grab{ width:40px; height:5px; border-radius:99px; background:var(--line-2); margin:4px auto 14px; }
.sheet h3{ font-family:var(--font-display); font-weight:800; font-size:20px; margin:0 0 3px; }
.apply-rows{ margin:18px 0; } .ar{ display:flex; align-items:center; gap:12px; padding:12px 0; border-bottom:1px solid var(--line); }
.ar:last-child{ border-bottom:none; } .ar-ic{ width:38px; height:38px; border-radius:11px; background:var(--brand-50); color:var(--brand-600); display:grid; place-items:center; } .ar-ic svg{ width:18px; height:18px; }
[data-theme="dark"] .ar-ic{ background:rgba(59,130,246,.12); color:var(--brand-400); }
.ar b{ font-size:14px; } .ar span{ font-size:12px; color:var(--fg-4); display:block; } .ar > svg{ width:19px; height:19px; color:var(--success); margin-left:auto; }
.apply-done{ text-align:center; padding:14px 0 0; } .apply-done h3{ margin:16px 0 6px; }
.burst{ width:74px; height:74px; border-radius:50%; background:var(--success); color:#fff; display:grid; place-items:center; margin:0 auto; animation:pop .4s cubic-bezier(.22,1.4,.5,1) both; }
.burst svg{ width:38px; height:38px; stroke-width:3; } @keyframes pop{ from{ transform:scale(.3); opacity:0; } } .apply-done .btn{ margin-top:10px; }

/* ============================================================
   Reduced type scale — smaller, tighter app typography.
   Loaded last, equal specificity → overrides the base sizes.
   ============================================================ */
/* shell + shared */
.topbar .tb-title{ font-size:16.5px; }
.topbar .tb-sub{ font-size:11px; }
.brand-mark b{ font-size:15.5px; }
.tab{ font-size:10px; }
.tab .badge{ font-size:9px; }
.btn{ font-size:14px; }
.btn-lg{ font-size:15px; }
.field label{ font-size:12px; }
.input input{ font-size:14px; }
.chip{ font-size:12px; }
.jrole{ font-size:14.5px; }
.jmeta{ font-size:12.5px; }
.tag{ font-size:10.5px; }
.jmatch .pct{ font-size:14px; }
.shead h2{ font-size:16.5px; }
.shead a{ font-size:12.5px; }
.muted{ font-size:12.5px; }
.empty h3{ font-size:15.5px; }
.toast{ font-size:12.5px; }
/* auth */
.auth-top h1{ font-size:26px; }
.auth-top p{ font-size:13px; }
.seg button{ font-size:13px; }
.auth-fine{ font-size:11px; }
/* feed hero */
.feed-hero .nm{ font-size:18px; }
.feed-hero .hi{ font-size:11.5px; }
.hero-search{ font-size:14px; }
.fh-stat .v{ font-size:17px; }
.fh-stat .v em{ font-size:11px; }
.fh-stat .l{ font-size:9.5px; }
/* applications */
.track .trk b{ font-size:18px; }
.track .trk span{ font-size:10.5px; }
.status{ font-size:10.5px; }
.notif p{ font-size:12.5px; }
/* profile */
.avatar{ font-size:21px; }
.prof-head .pn{ font-size:16.5px; }
.prof-head .pr{ font-size:12.5px; }
.prof-stats b{ font-size:17px; }
.prof-stats span{ font-size:10.5px; }
.cb-row b,.set-row b{ font-size:13px; }
.set-row > span{ font-size:13.5px; }
.skill{ font-size:12px; }
/* detail */
.dt-head h1{ font-size:22px; }
.dt-co{ font-size:13px; }
.dt-keyrow b{ font-size:14px; }
.dt-h{ font-size:15.5px; }
.dt-p{ font-size:13.5px; }
.dt-list li{ font-size:13.5px; }
.comp-card b{ font-size:13.5px; }
/* apply sheet */
.sheet h3{ font-size:18px; }
.ar b{ font-size:13px; }

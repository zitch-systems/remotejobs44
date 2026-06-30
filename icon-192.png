/* RemoteJobs44 — app shell + router. Boots the whole thing. */
(function(){
  const { Store, Screens } = window.RJ;

  /* ---- helpers the screens use ---- */
  window.RJ.logoMarkSVG = () =>
    '<svg viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="9" fill="rgba(255,255,255,0.16)"/>'
    + '<path d="M7 21 Q12 9 16 15.5 Q20 22 24 11" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
    + '<circle cx="24" cy="11" r="2.6" fill="#f97316"/></svg>';
  window.RJ.brandIcon = (name) => {
    const src = name==='google' ? 'https://cdn.simpleicons.org/google' : 'https://cdn.simpleicons.org/linkedin/0A66C2';
    return '<img style="width:18px;height:18px" alt="" src="'+src+'" onerror="this.remove()">';
  };
  window.RJ.skeletons = (n) => Array.from({length:n}).map(()=>'<div class="skel"></div>').join('');
  window.RJ.emptyHTML = (icon,title,sub) =>
    '<div class="empty"><div class="ico">'+window.RJ.svg(icon)+'</div><h3>'+window.RJ.esc(title)+'</h3><p>'+window.RJ.esc(sub)+'</p></div>';
  window.RJ.countUp = (root) => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.querySelectorAll('[data-count]').forEach(el=>{
      const target = +el.dataset.count||0;
      if(reduce){ el.textContent = target; return; }
      const t0 = performance.now(), dur = 760;
      (function tick(t){ const p=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-p,3); el.textContent=Math.round(target*e); if(p<1) requestAnimationFrame(tick); })(performance.now());
    });
  };

  /* ---- tab bar ---- */
  const TABS = [
    { id:'feed', label:'Home', icon:'home' },
    { id:'search', label:'Search', icon:'search' },
    { id:'applications', label:'Applied', icon:'brief' },
    { id:'saved', label:'Saved', icon:'bookmark' },
    { id:'profile', label:'Profile', icon:'user' }
  ];
  function renderTabs(active){
    return TABS.map(t=>{
      const badge = t.id==='applications' && Object.keys(Store.state.applied).length
        ? '<span class="badge">'+Object.keys(Store.state.applied).length+'</span>' : '';
      return '<button class="tab'+(t.id===active?' on':'')+'" data-tab="'+t.id+'">'+window.RJ.svg(t.icon)+badge+'<span>'+t.label+'</span></button>';
    }).join('');
  }

  /* ---- router ---- */
  let stack = [];
  const screenEl = () => document.getElementById('screen');
  const tabbarEl = () => document.getElementById('tabbar');

  async function render(){
    const cur = stack[stack.length-1];
    let def = Screens[cur.name](cur.params || {});
    if (def.build) def = await def.build();
    const el = screenEl();
    el.classList.remove('screen-enter'); void el.offsetWidth; el.classList.add('screen-enter');
    el.innerHTML = def.html;
    el.scrollTop = 0;
    el.classList.toggle('hero', !!def.hero);
    if (def.mount) def.mount(el);
    const tb = tabbarEl();
    if (def.full) { tb.hidden = true; }
    else { tb.hidden = false; tb.innerHTML = renderTabs(def.tab || cur.name); }
  }

  function go(name, params){
    const isTab = TABS.some(t=>t.id===name);
    if (isTab) stack = [{ name, params }];        // tabs reset the stack
    else stack.push({ name, params });
    render();
  }
  function back(){ if(stack.length>1){ stack.pop(); render(); } else go('feed'); }
  window.RJ.go = go; window.RJ.back = back;

  /* ---- global event delegation ---- */
  function onClick(e){
    const tab = e.target.closest('[data-tab]'); if(tab){ go(tab.dataset.tab); return; }
    const save = e.target.closest('[data-save]');
    if(save){ e.preventDefault(); e.stopPropagation(); const id=save.dataset.save; Store.toggleSave(id);
      const on = Store.isSaved(id);
      document.querySelectorAll('[data-save="'+id+'"]').forEach(b=>b.classList.toggle('on', on));
      window.RJ.toast(on?'Saved':'Removed');
      const cur = stack[stack.length-1]; if(cur.name==='saved') render();
      return; }
    const cat = e.target.closest('[data-cat]'); if(cat){ go('search',{ cat: cat.dataset.cat }); return; }
    const job = e.target.closest('[data-job]'); if(job){ go('detail',{ id: job.dataset.job }); return; }
    const goEl = e.target.closest('[data-go]'); if(goEl){ go(goEl.dataset.go); return; }
    const back_ = e.target.closest('[data-back]'); if(back_){ back(); return; }
    const tt = e.target.closest('[data-theme-toggle]'); if(tt){ Store.toggleTheme(); tt.classList.toggle('on', Store.state.theme==='dark'); return; }
    const so = e.target.closest('[data-signout]'); if(so){ Store.signOut(); stack=[]; go('auth'); return; }
  }

  /* ---- boot ---- */
  function boot(){
    document.getElementById('app-root').innerHTML =
      '<div class="app"><div class="screen" id="screen"></div><nav class="tabbar" id="tabbar" hidden></nav></div>';
    document.getElementById('app-root').addEventListener('click', onClick);
    stack = [{ name: Store.state.user ? 'feed' : 'auth' }];
    render();
  }
  if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();

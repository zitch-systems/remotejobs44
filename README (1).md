/* RemoteJobs44 — screens (tab + auth). Each returns HTML; wiring is delegated in app.js.
 * A screen = { hero?:bool, tab?:string, html:string, mount?(el) } */

const Screens = {};

/* ---------------- AUTH ---------------- */
Screens.auth = () => ({
  full:true,
  html:
    '<div class="auth">'
    + '<div class="auth-top">'
      + '<span class="auth-logo">'+window.RJ.logoMarkSVG()+'</span>'
      + '<h1>The world\'s remote jobs,<br><em>in your pocket.</em></h1>'
      + '<p>70,000+ verified-remote roles · 150+ countries hiring.</p>'
    + '</div>'
    + '<div class="auth-card">'
      + '<div class="seg"><button class="on" data-auth="signin">Sign in</button><button data-auth="signup">Create account</button></div>'
      + '<div class="auth-name field" hidden><label>Full name</label><div class="input"><input id="au-name" placeholder="Ada Obi"></div></div>'
      + '<div class="field"><label>Email</label><div class="input">'+window.RJ.svg('user')+'<input id="au-email" type="email" placeholder="you@email.com"></div></div>'
      + '<div class="field"><label>Password</label><div class="input"><input id="au-pass" type="password" placeholder="••••••••"></div></div>'
      + '<button class="btn btn-primary btn-block btn-lg" data-do-auth>Sign in</button>'
      + '<div class="or"><span>or continue with</span></div>'
      + '<div class="socials"><button class="btn btn-ghost" data-do-auth>'+window.RJ.brandIcon('google')+'Google</button>'
        + '<button class="btn btn-ghost" data-do-auth>'+window.RJ.brandIcon('linkedin')+'LinkedIn</button></div>'
      + '<p class="auth-fine">Simulated sign-in — any details log you in.</p>'
    + '</div>'
    + '</div>',
  mount(el){
    let mode = 'signin';
    el.querySelectorAll('[data-auth]').forEach(b => b.addEventListener('click', () => {
      mode = b.dataset.auth;
      el.querySelectorAll('[data-auth]').forEach(x => x.classList.toggle('on', x===b));
      el.querySelector('.auth-name').hidden = mode === 'signin';
      el.querySelector('[data-do-auth]').textContent = mode === 'signin' ? 'Sign in' : 'Create account';
    }));
    el.querySelectorAll('[data-do-auth]').forEach(b => b.addEventListener('click', async () => {
      const email = el.querySelector('#au-email').value || 'ada.obi@email.com';
      const name = el.querySelector('#au-name').value;
      const user = await window.RJ.API.signIn({ email });
      if (name) user.name = name;
      window.RJ.Store.signIn(user);
      window.RJ.Store.updateProfile({ name: user.name });
      window.RJ.go('feed');
    }));
  }
});

/* ---------------- HOME / FEED ---------------- */
Screens.feed = () => {
  const { Store } = window.RJ;
  const p = Store.state.profile;
  return {
    hero:true, tab:'feed',
    html:
      '<header class="feed-hero">'
      + '<div class="fh-row"><div><div class="hi">Good morning 👋</div><div class="nm">Hi, <em>'+window.RJ.esc(p.name.split(' ')[0])+'</em></div></div>'
        + '<button class="iconbtn" data-go="notifications">'+window.RJ.svg('bell')+(Store.unreadCount()?'<span class="dot"></span>':'')+'</button></div>'
      + '<button class="hero-search" data-go="search">'+window.RJ.svg('search')+'<span>Search 70,000+ remote jobs…</span></button>'
      + '<div class="fh-stats">'
        + '<div class="fh-stat"><div class="v" data-count="'+Object.keys(Store.state.applied).length+'">0</div><div class="l">Applications</div></div>'
        + '<div class="fh-stat"><div class="v" data-count="'+Store.state.saved.length+'">0</div><div class="l">Saved</div></div>'
        + '<div class="fh-stat accent"><div class="v" data-count="84">0</div><div class="l">Profile <em>%</em></div></div>'
      + '</div></header>'
      + '<div class="pad">'
        + '<div class="chips" id="catchips"></div>'
        + '<div class="shead"><h2>Top matches for you</h2><a data-go="search">See all</a></div>'
        + '<div id="feedlist" class="loadlist">'+window.RJ.skeletons(4)+'</div>'
      + '</div>',
    async mount(el){
      window.RJ.countUp(el);
      const cats = await window.RJ.API.categories();
      el.querySelector('#catchips').innerHTML = cats.slice(0,6).map(c =>
        '<button class="chip" data-cat="'+c.key+'">'+window.RJ.esc(c.label)+'</button>').join('');
      const jobs = await window.RJ.API.listJobs({});
      el.querySelector('#feedlist').innerHTML = jobs.slice(0,6).map(window.RJ.jobCardHTML).join('');
    }
  };
};

/* ---------------- SEARCH + FILTERS ---------------- */
Screens.search = (params={}) => ({
  tab:'search',
  html:
    '<div class="topbar"><div class="tb-title">Search</div><div class="spacer"></div>'
      + '<button class="iconbtn" id="filterBtn" data-toggle-filters>'+window.RJ.svg('sliders')+'</button></div>'
    + '<div class="pad">'
      + '<div class="input search-input">'+window.RJ.svg('search')+'<input id="q" placeholder="Job title, skill or company…" value="'+window.RJ.esc(params.q||'')+'"></div>'
      + '<div class="filters" id="filters"></div>'
      + '<div class="shead"><h2 id="rcount">Results</h2></div>'
      + '<div id="results" class="loadlist">'+window.RJ.skeletons(5)+'</div>'
    + '</div>',
  async mount(el){
    const { API, jobCardHTML, esc, skeletons, emptyHTML } = window.RJ;
    const state = { q: params.q||'', cat: params.cat||null, type:null, region:null, level:null, posted:null, sort:'match', verified:null };
    const cats = await API.categories();
    const TYPES = ['Full-time','Part-time','Contract'];
    const LEVELS = ['Entry','Mid','Senior'];
    const REGIONS = ['Worldwide','EMEA','Americas'];
    const POSTED = [['1','Past 24 hours'],['3','Past 3 days'],['7','Past week']];
    const SORTS = [['match','Best match'],['new','Newest'],['pay','Highest pay']];
    const opt = (v,l,on)=>'<option value="'+v+'"'+(on?' selected':'')+'>'+esc(l)+'</option>';
    const drop = (f,label,cls,blank,items,cur)=> '<select class="fdrop'+(cls?' '+cls:'')+'" data-f="'+f+'" aria-label="'+label+'">'
        + (blank!=null?opt('',blank,!cur):'')
        + items.map(it=>Array.isArray(it)?opt(it[0],it[1],cur===it[0]):opt(it.key,it.label,cur===it.key)).join('')+'</select>';
    function renderFilters(){
      el.querySelector('#filters').innerHTML =
          drop('cat','Category','fdrop--wide','All categories',cats,state.cat)
        + drop('type','Job type',null,'Any type',TYPES,state.type)
        + drop('level','Experience',null,'Any level',LEVELS,state.level)
        + drop('region','Region',null,'Any region',REGIONS,state.region)
        + drop('posted','Date posted',null,'Any time',POSTED,state.posted)
        + drop('verified','Verified',null,'Any',[['1','Verified only']],state.verified)
        + drop('sort','Sort by','fdrop--wide',null,SORTS,state.sort);
      updateBadge();
    }
    function updateBadge(){
      const n = [state.cat,state.type,state.region,state.level,state.posted,state.verified].filter(Boolean).length + (state.sort && state.sort!=='match' ? 1 : 0);
      const btn = el.querySelector('#filterBtn'); if(!btn) return;
      let b = btn.querySelector('.fbadge');
      if(n){ if(!b){ b=document.createElement('span'); b.className='fbadge'; btn.appendChild(b); } b.textContent=n; }
      else if(b){ b.remove(); }
    }
    const postedDays = p => { const m=String(p).match(/([\d.]+)\s*([hdw])/i); if(!m) return 99; const n=parseFloat(m[1]); return m[2]==='h'?n/24:m[2]==='w'?n*7:n; };
    const payNum = p => { const m=String(p).match(/([\d.]+)\s*(k?)/i); return m?parseFloat(m[1])*(m[2]?1000:1):0; };
    async function run(){
      el.querySelector('#results').innerHTML = skeletons(4);
      let jobs = await API.listJobs({ q: state.q, cat: state.cat, type: state.type, region: state.region });
      if(state.level) jobs = jobs.filter(j=>j.level===state.level);
      if(state.verified) jobs = jobs.filter(j=>j.verified);
      if(state.posted) jobs = jobs.filter(j=>postedDays(j.posted) <= +state.posted);
      if(state.sort==='new') jobs = jobs.slice().sort((a,b)=>postedDays(a.posted)-postedDays(b.posted));
      else if(state.sort==='pay') jobs = jobs.slice().sort((a,b)=>payNum(b.pay)-payNum(a.pay));
      else jobs = jobs.slice().sort((a,b)=>b.match-a.match);
      el.querySelector('#rcount').textContent = jobs.length + ' result' + (jobs.length===1?'':'s');
      el.querySelector('#results').innerHTML = jobs.length
        ? jobs.map(jobCardHTML).join('')
        : emptyHTML('search','No matches','Try clearing a filter or searching something broader.');
    }
    renderFilters(); run();
    el.querySelector('#filters').addEventListener('change', e => {
      const sel = e.target.closest('[data-f]'); if(!sel) return;
      state[sel.dataset.f] = sel.value || (sel.dataset.f==='sort' ? 'match' : null); updateBadge(); run();
    });
    let t; el.querySelector('#q').addEventListener('input', e => { state.q = e.target.value; clearTimeout(t); t = setTimeout(run, 180); });
    el.querySelector('[data-toggle-filters]').addEventListener('click', () => el.querySelector('#filters').classList.toggle('open'));
    el.querySelector('#filters').classList.add('open');
  }
});

/* ---------------- SAVED ---------------- */
Screens.saved = () => {
  const { Store } = window.RJ;
  const jobs = Store.state.saved.map(id => window.RJ.JOBS.find(j=>j.id===id)).filter(Boolean);
  return { tab:'saved',
    html:'<div class="topbar"><div class="tb-title">Saved jobs</div></div><div class="pad">'
      + (jobs.length ? '<p class="muted">'+jobs.length+' saved</p>'+jobs.map(window.RJ.jobCardHTML).join('')
          : window.RJ.emptyHTML('bookmark','Nothing saved yet','Tap the bookmark on any job to keep it here.'))
      + '</div>' };
};

/* ---------------- APPLICATIONS ---------------- */
Screens.applications = () => {
  const { Store } = window.RJ;
  const apps = Object.entries(Store.state.applied)
    .map(([id,a]) => ({ j: window.RJ.JOBS.find(x=>x.id===id), ...a })).filter(x=>x.j)
    .sort((a,b)=>b.at-a.at);
  const STAGES = ['Applied','Interview','Offer'];
  return { tab:'applications',
    html:'<div class="topbar"><div class="tb-title">Applications</div></div><div class="pad">'
      + (apps.length ? (
          '<div class="track">'+STAGES.map(s=>'<div class="trk"><b>'+apps.filter(a=>a.status===s).length+'</b><span>'+s+'</span></div>').join('')+'</div>'
          + apps.map(a => '<div class="appcard" data-job="'+a.j.id+'">'+window.RJ.logoHTML(a.j.co,a.j.cat)
            + '<div class="jbody"><div class="jrole">'+window.RJ.esc(a.j.role)+'</div><div class="jmeta">'+window.RJ.esc(a.j.co)+'</div>'
            + '<span class="status s-'+a.status.toLowerCase()+'">'+a.status+'</span></div>'+window.RJ.svg('chevron')+'</div>').join('')
        ) : window.RJ.emptyHTML('brief','No applications yet','When you apply, track every step here.'))
      + '</div>' };
};

/* ---------------- NOTIFICATIONS ---------------- */
Screens.notifications = () => {
  const { Store } = window.RJ;
  const list = Store.state.notifs;
  setTimeout(()=>Store.markNotifsRead(), 800);
  return { full:true,
    html:'<div class="topbar"><button class="iconbtn" data-back>'+window.RJ.svg('back')+'</button><div class="tb-title">Notifications</div></div><div class="pad">'
      + (list.length ? list.map(n => '<div class="notif'+(n.unread?' un':'')+'"><span class="ni '+n.kind+'">'+window.RJ.svg(n.kind==='status'?'brief':n.kind==='tip'?'bolt':'star')+'</span>'
          + '<div><p>'+window.RJ.esc(n.text)+'</p><span class="at">'+n.at+' ago</span></div></div>').join('')
          : window.RJ.emptyHTML('bell','All caught up','New matches and updates land here.'))
      + '</div>' };
};

/* ---------------- PROFILE / SETTINGS ---------------- */
Screens.profile = () => {
  const { Store, svg, esc } = window.RJ; const p = Store.state.profile;
  const dark = Store.state.theme === 'dark'; const pro = Store.state.pro; const prefs = Store.state.prefs || { push:true, alerts:true };
  const sw = (on, attr) => '<span class="switch'+(on?' on':'')+'" '+attr+'><i></i></span>';
  return { tab:'profile',
    html:'<div class="topbar"><div class="tb-title">Profile</div></div><div class="pad">'
      + '<div class="prof-head"><div class="avatar">'+esc(p.name.slice(0,1))+'</div>'
        + '<div><div class="pn">'+esc(p.name)+(pro?' <span class="pro-pill">'+svg('crown')+'PRO</span>':'')+'</div><div class="pr">'+esc(p.title)+'</div>'
        + '<div class="pl">'+svg('pin')+esc(p.location)+'</div></div></div>'
      + '<div class="prof-stats"><div><b>'+Object.keys(Store.state.applied).length+'</b><span>Applied</span></div>'
        + '<div><b>'+Store.state.saved.length+'</b><span>Saved</span></div><div><b>84%</b><span>Strength</span></div></div>'
      + (pro
        ? '<div class="sub-card pro"><div class="sub-l"><span class="sub-ic">'+svg('crown')+'</span><div><b>RemoteJobs44 Pro</b><span>Active · renews monthly</span></div></div><button class="mini light" data-manage-sub>Manage</button></div>'
        : '<div class="sub-card"><div class="sub-l"><span class="sub-ic">'+svg('crown')+'</span><div><b>Free plan</b><span>Upgrade for unlimited applies & AI tools</span></div></div><button class="btn btn-primary btn-sm" data-upgrade>Upgrade</button></div>')
      + '<div class="card-block"><div class="cb-row"><span class="cb-ic">'+svg('doc')+'</span><div><b>CV / Résumé</b><span>'+esc(p.cv)+'</span></div><button class="mini" data-edit-cv>Replace</button></div></div>'
      + '<div class="shead"><h2>Skills</h2><a data-edit-skills>Edit</a></div>'
      + '<div class="skills">'+p.skills.map(s=>'<span class="skill">'+esc(s)+'</span>').join('')+'</div>'
      + '<div class="shead"><h2>Account</h2></div>'
      + '<div class="card-block">'
        + '<div class="set-row" data-go-sub><span>'+svg('crown')+'Subscription</span><span class="set-meta">'+(pro?'Pro':'Free')+'</span>'+svg('chevron')+'</div>'
        + '<div class="set-row" data-go="applications"><span>'+svg('brief')+'My applications</span>'+svg('chevron')+'</div>'
        + '<div class="set-row" data-edit-cv2><span>'+svg('user')+'Edit profile</span>'+svg('chevron')+'</div>'
      + '</div>'
      + '<div class="shead"><h2>Preferences</h2></div>'
      + '<div class="card-block">'
        + '<label class="set-row"><span>'+svg('moon')+'Dark theme</span>'+sw(dark,'data-theme-toggle')+'</label>'
        + '<label class="set-row"><span>'+svg('bell')+'Push notifications</span>'+sw(prefs.push,'data-pref="push"')+'</label>'
        + '<label class="set-row"><span>'+svg('mail')+'Job alert emails</span>'+sw(prefs.alerts,'data-pref="alerts"')+'</label>'
        + '<div class="set-row" data-lang><span>'+svg('globe')+'Language</span><span class="set-meta">English</span>'+svg('chevron')+'</div>'
      + '</div>'
      + '<div class="shead"><h2>Support</h2></div>'
      + '<div class="card-block">'
        + '<div class="set-row" data-info="privacy"><span>'+svg('shield')+'Privacy & security</span>'+svg('chevron')+'</div>'
        + '<div class="set-row" data-info="help"><span>'+svg('help')+'Help & support</span>'+svg('chevron')+'</div>'
        + '<div class="set-row" data-info="about"><span>'+svg('doc')+'About & legal</span>'+svg('chevron')+'</div>'
      + '</div>'
      + '<div class="card-block" style="margin-top:12px"><div class="set-row danger" data-signout><span>'+svg('logout')+'Sign out</span>'+svg('chevron')+'</div></div>'
      + '<p class="ver">RemoteJobs44 · v1.0.0 · Deep Ocean</p>'
      + '</div>',
    mount(el){
      const reRender = ()=>window.RJ.go('profile');
      const editSkills = ()=>{ const v = prompt('Skills (comma separated)', p.skills.join(', ')); if(v!=null){ Store.updateProfile({ skills: v.split(',').map(s=>s.trim()).filter(Boolean) }); reRender(); } };
      el.querySelector('[data-edit-cv]')?.addEventListener('click', ()=>window.RJ.toast('CV upload — demo'));
      el.querySelector('[data-edit-cv2]')?.addEventListener('click', editSkills);
      el.querySelector('[data-edit-skills]')?.addEventListener('click', editSkills);
      const doUpgrade = ()=>{ Store.upgrade(); window.RJ.toast('Welcome to Pro \ud83c\udf89'); reRender(); };
      const manage = ()=>{ if(confirm('Cancel your RemoteJobs44 Pro subscription?')){ Store.cancelPro(); window.RJ.toast('Subscription cancelled'); reRender(); } };
      el.querySelector('[data-upgrade]')?.addEventListener('click', doUpgrade);
      el.querySelector('[data-manage-sub]')?.addEventListener('click', manage);
      el.querySelector('[data-go-sub]')?.addEventListener('click', ()=> Store.state.pro ? manage() : doUpgrade());
      el.querySelectorAll('[data-pref]').forEach(s=>s.addEventListener('click', ()=>{ const k=s.dataset.pref; const v=!Store.state.prefs[k]; Store.setPref(k,v); s.classList.toggle('on', v); window.RJ.toast(v?'On':'Off'); }));
      el.querySelector('[data-lang]')?.addEventListener('click', ()=>window.RJ.toast('English is the only option in this demo'));
      el.querySelectorAll('[data-info]').forEach(r=>r.addEventListener('click', ()=>window.RJ.toast(({privacy:'Privacy & security',help:'Help & support',about:'About & legal'})[r.dataset.info]+' — demo')));
    }
  };
};

window.RJ = Object.assign(window.RJ || {}, { Screens });

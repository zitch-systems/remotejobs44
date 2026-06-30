/* RemoteJobs44 — on-device store (localStorage).
 * Survives refresh. Emits 'change' so screens can re-render. */

const KEY = 'rj44_app_v1';

const DEFAULT = {
  user: null,                 // {id,name,email} once signed in
  theme: 'light',             // 'light' | 'dark'
  pro: false,                 // Pro subscription active?
  prefs: { push: true, alerts: true },
  saved: [],                  // [jobId]
  applied: {},                // jobId -> { status, at }
  profile: {
    name: 'Ada Obi', title: 'Virtual Assistant · Remote', location: 'Lagos, NG',
    cv: 'ada-obi-cv.pdf', skills: ['Calendar', 'Inbox', 'Notion', 'Research'],
    avatar: ''
  },
  notifs: [
    { id:'n1', kind:'match',   text:'12 new roles match your saved search “Virtual Assistant”', at:'2h',  unread:true },
    { id:'n2', kind:'status',  text:'Your application to Intercom moved to Interview',          at:'1d',  unread:true },
    { id:'n3', kind:'tip',     text:'Add 2 skills to lift your match score above 90%',          at:'3d',  unread:false }
  ],
  onboarded: false
};

function load() {
  try { return Object.assign({}, DEFAULT, JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch { return Object.assign({}, DEFAULT); }
}

const Store = {
  state: load(),
  _subs: new Set(),

  subscribe(fn){ this._subs.add(fn); return () => this._subs.delete(fn); },
  _emit(){ this._subs.forEach(fn => { try { fn(this.state); } catch(e){ console.error(e); } }); },
  _save(){ try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch(e){} this._emit(); },

  // session
  signIn(user){ this.state.user = user; this.state.onboarded = true; this._save(); },
  signOut(){ this.state.user = null; this._save(); },

  // theme
  setTheme(t){ this.state.theme = t; document.documentElement.setAttribute('data-theme', t); this._save(); },
  toggleTheme(){ this.setTheme(this.state.theme === 'dark' ? 'light' : 'dark'); },

  // subscription / preferences
  upgrade(){ this.state.pro = true; this._save(); },
  cancelPro(){ this.state.pro = false; this._save(); },
  setPref(k, v){ this.state.prefs = Object.assign({}, this.state.prefs, { [k]: v }); this._save(); },

  // saved
  isSaved(id){ return this.state.saved.includes(id); },
  toggleSave(id){
    const i = this.state.saved.indexOf(id);
    if (i >= 0) this.state.saved.splice(i,1); else this.state.saved.unshift(id);
    this._save();
  },

  // applications
  appStatus(id){ return this.state.applied[id]?.status || null; },
  hasApplied(id){ return !!this.state.applied[id]; },
  apply(id){ if(!this.state.applied[id]) this.state.applied[id] = { status:'Applied', at: Date.now() }; this._save(); },
  setAppStatus(id, status){ if(this.state.applied[id]) { this.state.applied[id].status = status; this._save(); } },

  // profile
  updateProfile(patch){ Object.assign(this.state.profile, patch); this._save(); },

  // notifications
  unreadCount(){ return this.state.notifs.filter(n => n.unread).length; },
  markNotifsRead(){ this.state.notifs.forEach(n => n.unread = false); this._save(); }
};

// apply persisted theme immediately (before paint where possible)
document.documentElement.setAttribute('data-theme', Store.state.theme);

window.RJ = Object.assign(window.RJ || {}, { Store });

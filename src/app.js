'use strict';
const $ = s => document.querySelector(s);
const L = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? d : v; } catch { return d; } };
const S = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { toast('Storage is full. Try a smaller background image.'); return false; } };
// Escapes text for HTML. No inline event handlers are used anywhere, so values can never become code.
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const isMac = api.platform === 'darwin';
document.body.classList.add(api.platform);
const BG = ['linear-gradient(135deg,#2a2150,#ff6a5c)', 'linear-gradient(135deg,#0f2027,#2c5364,#5ee0c8)', 'linear-gradient(135deg,#232526,#414345)',
  'linear-gradient(135deg,#1e3c72,#a044ff)', 'linear-gradient(135deg,#f6d365,#fda085)', 'linear-gradient(135deg,#134e5e,#71b280)', 'linear-gradient(135deg,#3a1c71,#d76d77,#ffaf7b)', 'linear-gradient(135deg,#000,#1a1a2e)'];
let st = Object.assign({ bg: 0, img: null, accent: '#ff6a5c', ram: 4000, cpu: 300, idle: 15, heap: 0, lock: 0, restore: true }, L('set', {}));
let bm = L('bm', []), hist = L('hist', []), vault = { pw: [], apiKey: '' }, name = '', tabs = [], cur = null, uid = 0, panel = null, M = null;
let aiMsgs = [], impMsg = '', closed = [], dls = [], exists = false, pending = null, sgItems = [], sgI = -1, sgT = 0, tt = 0;
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return String(u); } };
const siteMatch = (a, b) => { a = String(a).replace(/^www\./, '').toLowerCase(); b = String(b).toLowerCase(); return !!a && !!b && (a === b || b.endsWith('.' + a) || a.endsWith('.' + b)); };
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 2800); }

// ---------- Login ----------
(async () => {
  const s = await api.inv('auth:state'); exists = s.exists;
  $('#lt').textContent = exists ? `Welcome back, ${s.name}` : 'Create your profile';
  $('#lb').textContent = exists ? 'Unlock' : 'Create profile'; $('#ln').hidden = exists;
})();
$('#lf').addEventListener('submit', async ev => {
  ev.preventDefault();
  const r = exists ? await api.inv('auth:login', $('#lp').value) : await api.inv('auth:create', $('#ln').value.trim(), $('#lp').value);
  if (r.error) { $('#le').textContent = r.error; return; }
  name = r.name; exists = true; vault = await api.inv('vault:get'); unlock();
});
function unlock() {
  $('#lp').value = ''; $('#le').textContent = ''; $('#lock').hidden = true; $('#app').hidden = false; theme(); renderAI();
  if (!tabs.length) {
    aiTab(); const urls = st.restore ? L('session', []) : [];
    if (urls.length) urls.forEach(u => newTab(u)); else newTab();
  } else select(cur);
}
function lock() {
  api.inv('auth:lock'); vault = { pw: [], apiKey: '' }; aiMsgs = []; pending = null; hideSg();
  $('#app').hidden = true; $('#lock').hidden = false; $('#ln').hidden = true;
  $('#lt').textContent = `Welcome back, ${name}`; $('#lb').textContent = 'Unlock'; $('#lp').focus();
}

// ---------- Theme ----------
function theme() {
  document.documentElement.style.setProperty('--accent', st.accent);
  $('#stage').style.background = st.img ? `center/cover url("${st.img}")` : BG[st.bg];
}

// ---------- Tabs ----------
const resolve = q => { q = q.trim(); if (/^[a-z][a-z0-9+.-]*:\/\//i.test(q)) return q;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(q) || /^localhost(:\d+)?(\/.*)?$/.test(q)) return 'https://' + q;
  return 'https://www.google.com/search?q=' + encodeURIComponent(q); };
const errPage = (u, d) => 'data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><meta charset="utf-8"><title>Can’t reach this page</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#14121f;color:#ece9f7;font:16px system-ui;text-align:center"><div><div style="font-size:64px">☁️</div><h1 style="font-weight:600">Can’t reach this page</h1><p style="color:#9a95b8">${esc(host(u))}: ${esc(d)}</p><p style="color:#9a95b8">Check your connection, then press ↻ to try again.</p></div>`);
// Runs inside each page: reports a login form being submitted so Nimbus can offer to save it
const CAPTURE = `(()=>{if(window.__nb)return;window.__nb=1;
const grab=root=>{const ins=[...(root||document).querySelectorAll('input')],p=ins.find(i=>i.type==='password'&&i.value);if(!p)return;
const u=ins.slice(0,ins.indexOf(p)).reverse().find(i=>/^(text|email|tel)$/.test(i.type)&&i.value);
console.log('__nimbus_pw__'+JSON.stringify({user:u?u.value:'',pass:p.value}))};
document.addEventListener('submit',e=>grab(e.target),true);
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('button,input[type=submit]');if(b&&(b.type==='submit'||b.form))grab(b.form||document)},true);
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName==='INPUT'&&e.target.type==='password')grab(e.target.form||document)},true)})()`;

function aiTab() { const t = { id: ++uid, kind: 'ai', title: '✦ AI', last: Date.now() }; tabs.push(t); }
function newTab(url, priv) {
  const t = { id: ++uid, kind: 'web', url: '', title: priv ? 'Private tab' : 'New tab', last: Date.now(), priv: !!priv, zoom: 0 }, wv = document.createElement('webview');
  wv.setAttribute('partition', priv ? 'private-' + t.id : 'persist:main'); wv.setAttribute('allowpopups', ''); t.wv = wv; $('#views').append(wv);
  wv.addEventListener('page-title-updated', e => { t.title = e.title; const h = hist.find(x => x.u === t.url); if (h && !t.priv) { h.t = e.title; S('hist', hist); } draw(); });
  wv.addEventListener('page-favicon-updated', e => { t.icon = e.favicons[0]; draw(); });
  wv.addEventListener('did-navigate', e => nav(t, e.url)); wv.addEventListener('did-navigate-in-page', e => { if (e.isMainFrame !== false) nav(t, e.url); });
  wv.addEventListener('did-start-loading', () => { t.loading = true; sync(); }); wv.addEventListener('did-stop-loading', () => { t.loading = false; sync(); });
  wv.addEventListener('did-fail-load', e => { if (!e.isMainFrame || e.errorCode === -3) return; t.failed = true; t.url = e.validatedURL || t.url; wv.loadURL(errPage(t.url, e.errorDescription || 'error')); });
  wv.addEventListener('dom-ready', () => { t.wcid = wv.getWebContentsId(); if (t.zoom) wv.setZoomLevel(t.zoom); if (!t.priv) wv.executeJavaScript(CAPTURE).catch(() => {}); });
  wv.addEventListener('console-message', e => { if (String(e.message).startsWith('__nimbus_pw__')) { try { offerSave(t, JSON.parse(e.message.slice(13))); } catch {} } });
  wv.addEventListener('found-in-page', e => { if (t === cur) $('#fc').textContent = e.result.matches ? `${e.result.activeMatchOrdinal}/${e.result.matches}` : '0'; });
  wv.addEventListener('enter-html-full-screen', () => document.body.classList.add('fs')); wv.addEventListener('leave-html-full-screen', () => document.body.classList.remove('fs'));
  tabs.push(t); if (url) go(t, url); select(t); return t;
}
function go(t, q) { t.url = resolve(q); t.sleeping = false; t.failed = false; t.wv.src = t.url; select(t); }
function openFromOmni(v) { if (!v.trim()) return; cur.kind === 'web' ? go(cur, v) : newTab(v); }
function nav(t, u) {
  if (/^data:/.test(u)) return;                                       // our error page
  t.url = u; t.failed = false;
  if (/^https?:/.test(u) && !t.priv) { hist = [{ u, t: t.title, d: Date.now() }, ...hist.filter(h => h.u !== u)].slice(0, 300); S('hist', hist); }
  if (t === cur) $('#omni').value = u; syncStar(); syncKb(); saveSession();
}
function saveSession() { S('session', tabs.filter(t => t.kind === 'web' && !t.priv && /^https?:/.test(t.url)).map(t => t.url)); }
function select(t) {
  if (!t) return; cur = t; t.last = Date.now(); closeFind(); hideSg();
  if (t.sleeping) { t.sleeping = false; t.wv.src = t.url; }
  tabs.forEach(x => x.wv && x.wv.classList.toggle('on', x === t && !!x.url));
  $('#start').hidden = !(t.kind === 'web' && !t.url); $('#ai').hidden = t.kind !== 'ai';
  if (!$('#start').hidden) renderStart();
  $('#omni').value = t.kind === 'web' ? t.url : ''; syncStar(); syncKb(); sync(); draw();
}
function closeTab(t) {
  const i = tabs.indexOf(t); if (i < 0) return; if (t.url && !t.priv) closed.push(t.url);
  t.wv && t.wv.remove(); tabs.splice(i, 1); saveSession();
  if (!tabs.some(x => x.kind === 'web')) newTab(); else if (t === cur) select(tabs[Math.max(1, i - 1)]); else draw();
}
function sleep(t) { if (!t || t.sleeping || !t.url) return; t.sleeping = true; t.wcid = null; t.wv.src = 'about:blank'; draw(); }
function sync() { $('#bar').classList.toggle('ld', !!(cur && cur.loading)); }
function draw() {
  $('#tabs').innerHTML = tabs.map(t => `<div class="tab ${t === cur ? 'on' : ''} ${t.sleeping ? 'zz' : ''} ${t.priv ? 'priv' : ''}" data-id="${t.id}">${t.icon ? `<img src="${esc(t.icon)}" alt="">` : ''}<span>${esc((t.priv ? '🕶 ' : '') + (t.sleeping ? '💤 ' : '') + t.title)}</span>${t.kind === 'ai' ? '' : '<b data-x>×</b>'}</div>`).join('');
}
$('#tabs').addEventListener('click', e => { const el = e.target.closest('.tab'); if (!el) return; const t = tabs.find(x => x.id == el.dataset.id); if (!t) return; e.target.dataset.x !== undefined ? closeTab(t) : select(t); });
$('#nt').onclick = () => { newTab(); $('#omni').focus(); };
$('#pt').onclick = () => { newTab(undefined, true); $('#omni').focus(); };
$('#bk').onclick = () => cur.wv && cur.wv.canGoBack() && cur.wv.goBack();
$('#fw').onclick = () => cur.wv && cur.wv.canGoForward() && cur.wv.goForward();
$('#rl').onclick = () => { if (!cur.wv || !cur.url) return; cur.failed ? go(cur, cur.url) : cur.wv.reload(); };
$('#star').onclick = () => { if (!cur.url) return; const i = bm.findIndex(b => b.u === cur.url); i < 0 ? bm.push({ u: cur.url, t: cur.title }) : bm.splice(i, 1); S('bm', bm); syncStar(); if (panel === 'bm') render(); };
function syncStar() { $('#star').textContent = cur && bm.some(b => b.u === cur.url) ? '★' : '☆'; }
function zoom(t, d) { if (!t || !t.wv) return; t.zoom = d === 0 ? 0 : Math.max(-3, Math.min(5, (t.zoom || 0) + d)); try { t.wv.setZoomLevel(t.zoom); } catch {} toast('Zoom ' + Math.round(100 * Math.pow(1.2, t.zoom)) + '%'); }
api.on('open-tab', (u, priv) => newTab(u, priv));

// ---------- Address bar suggestions ----------
const hideSg = () => { sgItems = []; sgI = -1; $('#sg').hidden = true; };
function drawSg() {
  $('#sg').hidden = !sgItems.length;
  $('#sg').innerHTML = sgItems.map((x, i) => `<div class="${i === sgI ? 'on' : ''}" data-i="${i}"><span>${x.icon}</span><span class="t">${esc(x.label)}</span>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</div>`).join('');
}
async function suggest() {
  const q = $('#omni').value.trim(); if (!q || document.activeElement !== $('#omni')) return hideSg();
  const lq = q.toLowerCase();
  const local = [...bm.map(b => ({ k: '★', t: b.t, u: b.u })), ...hist.map(h => ({ k: '◷', t: h.t, u: h.u }))]
    .filter(x => String(x.t || '').toLowerCase().includes(lq) || x.u.toLowerCase().includes(lq)).slice(0, 4);
  sgItems = local.map(x => ({ icon: x.k, label: x.t || x.u, sub: host(x.u), u: x.u })); sgI = -1; drawSg();
  let g = []; try { g = await api.inv('suggest', q); } catch {}
  if ($('#omni').value.trim() !== q || document.activeElement !== $('#omni')) return;
  sgItems = sgItems.concat(g.map(s => ({ icon: '🔍', label: s, q: s }))); drawSg();
}
$('#omni').addEventListener('input', () => { clearTimeout(sgT); sgT = setTimeout(suggest, 120); });
$('#omni').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!sgItems.length) return; e.preventDefault(); const n = sgItems.length;
    sgI = e.key === 'ArrowDown' ? (sgI + 1 >= n ? -1 : sgI + 1) : (sgI - 1 < -1 ? n - 1 : sgI - 1); drawSg();
  } else if (e.key === 'Enter') {
    const it = sgI >= 0 ? sgItems[sgI] : null, v = it ? (it.u || it.q) : e.target.value; hideSg(); openFromOmni(v); e.target.blur();
  } else if (e.key === 'Escape') { hideSg(); e.target.blur(); }
});
$('#omni').addEventListener('focus', e => e.target.select());
$('#omni').addEventListener('blur', () => setTimeout(hideSg, 120));
$('#sg').addEventListener('mousedown', e => { e.preventDefault(); const el = e.target.closest('[data-i]'); if (!el) return; const it = sgItems[+el.dataset.i]; hideSg(); openFromOmni(it.u || it.q); });

// ---------- Find in page ----------
function openFind() { if (!cur || !cur.wv || !cur.url) return; $('#find').hidden = false; $('#fq').focus(); $('#fq').select(); }
function closeFind() { if (!$('#find').hidden) { $('#find').hidden = true; $('#fc').textContent = ''; try { cur.wv && cur.wv.stopFindInPage('clearSelection'); } catch {} } }
function findNext(fwd) { const q = $('#fq').value; if (q && cur.wv) cur.wv.findInPage(q, { findNext: true, forward: fwd }); }
$('#fq').addEventListener('input', e => { const q = e.target.value; if (!q) { $('#fc').textContent = ''; try { cur.wv.stopFindInPage('clearSelection'); } catch {} } else cur.wv.findInPage(q); });
$('#fq').addEventListener('keydown', e => { if (e.key === 'Enter') findNext(!e.shiftKey); if (e.key === 'Escape') closeFind(); });
$('#fn').onclick = () => findNext(true); $('#fp').onclick = () => findNext(false); $('#fx').onclick = closeFind;

// ---------- Keyboard shortcuts (also forwarded from inside web pages by the main process) ----------
function keyName(e) {
  const mod = isMac ? e.metaKey : e.ctrlKey, k = String(e.key).toLowerCase();
  if (e.ctrlKey && k === 'tab') return e.shiftKey ? 'prevtab' : 'nexttab';
  if (k === 'f12' || (mod && e.altKey && k === 'i')) return 'devtools';
  if (k === 'f5') return 'reload';
  if (!isMac && e.altKey && !mod) return k === 'arrowleft' ? 'back' : k === 'arrowright' ? 'fwd' : null;
  if (!mod || e.altKey) return null;
  if (k === '=' || k === '+') return 'zoomin';
  if (e.shiftKey) return k === 't' ? 'reopen' : k === 'n' ? 'private' : null;
  if (/^[1-9]$/.test(k)) return 'tab:' + k;
  return { t: 'newtab', w: 'close', l: 'omni', r: 'reload', f: 'find', d: 'bookmark', '-': 'zoomout', '0': 'zoom0', '[': 'back', ']': 'fwd' }[k] || null;
}
function doShortcut(a) {
  if ($('#app').hidden || !cur) return;
  const i = tabs.indexOf(cur);
  if (a === 'newtab') { newTab(); $('#omni').focus(); } else if (a === 'private') { newTab(undefined, true); $('#omni').focus(); }
  else if (a === 'reopen') { const u = closed.pop(); if (u) newTab(u); }
  else if (a === 'close') { if (cur.kind === 'web') closeTab(cur); }
  else if (a === 'omni') $('#omni').focus();
  else if (a === 'reload') $('#rl').click(); else if (a === 'find') openFind(); else if (a === 'bookmark') $('#star').click();
  else if (a === 'back') $('#bk').click(); else if (a === 'fwd') $('#fw').click();
  else if (a === 'zoomin') zoom(cur, 0.5); else if (a === 'zoomout') zoom(cur, -0.5); else if (a === 'zoom0') zoom(cur, 0);
  else if (a === 'devtools') { if (cur.wv && cur.url) cur.wv.openDevTools(); }
  else if (a === 'nexttab') select(tabs[(i + 1) % tabs.length]); else if (a === 'prevtab') select(tabs[(i - 1 + tabs.length) % tabs.length]);
  else if (a.startsWith('tab:')) { const n = +a.slice(4); select(n === 9 ? tabs[tabs.length - 1] : tabs[n - 1]); }
}
document.addEventListener('keydown', e => { const a = keyName(e); if (a) { e.preventDefault(); doShortcut(a); } });
api.on('shortcut', doShortcut);

// ---------- Start page ----------
function renderStart() {
  const h = new Date().getHours(), g = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const dial = [...bm.slice(0, 8), ...[['YouTube', 'https://youtube.com'], ['Wikipedia', 'https://wikipedia.org'], ['GitHub', 'https://github.com'], ['Reddit', 'https://reddit.com']].map(([t, u]) => ({ t, u }))].slice(0, 8);
  $('#start').innerHTML = `<h1 id="clk"></h1><p>${g}, ${esc(name)}</p><input id="sq" placeholder="Search Google" autocomplete="off">
  <div class="dial">${dial.map(d => `<a data-u="${esc(d.u)}"><i>${esc(String(d.t || '?')[0].toUpperCase())}</i>${esc(String(d.t || d.u).slice(0, 14))}</a>`).join('')}</div>`;
  tick(); $('#sq').addEventListener('keydown', e => { if (e.key === 'Enter') openFromOmni(e.target.value); });
}
const tick = () => { const c = $('#clk'); if (c) c.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
setInterval(tick, 10000);
$('#start').addEventListener('click', e => { const a = e.target.closest('[data-u]'); if (a) openFromOmni(a.dataset.u); });

// ---------- AI tab ----------
function renderAI() {
  $('#ai').innerHTML = `<div class="msgs" id="am"><div class="m a">Hi ${esc(name)}! Ask me anything, or tick “Use current page” and I’ll read the tab you were just on.</div></div>
  <div class="comp"><div id="keyrow" ${vault.apiKey ? 'hidden' : ''}><input id="ak" type="password" placeholder="Paste your Anthropic API key (stored encrypted)"><button class="primary" id="aks">Save</button></div>
  <label><input type="checkbox" id="ctx" class="cb"> Use current page as context</label>
  <div><input id="aq" placeholder="Ask Nimbus AI…" autocomplete="off"><button class="primary" id="ask">Send</button></div>
  <div class="links"><a id="akt">API key</a><a id="acl">Clear chat</a></div></div>`;
  $('#aks').onclick = async () => { vault.apiKey = $('#ak').value.trim(); await api.inv('vault:set', vault); $('#ak').value = ''; $('#keyrow').hidden = true; toast(vault.apiKey ? 'API key saved' : 'API key removed'); };
  $('#akt').onclick = () => { $('#keyrow').hidden = !$('#keyrow').hidden; };
  $('#acl').onclick = () => { aiMsgs = []; renderAI(); };
  $('#ask').onclick = ask; $('#aq').addEventListener('keydown', e => { if (e.key === 'Enter') ask(); });
}
async function ask() {
  const q = $('#aq').value.trim(); if (!q) return; $('#aq').value = '';
  const box = $('#am'); box.insertAdjacentHTML('beforeend', `<div class="m u">${esc(q)}</div>`); aiMsgs.push({ role: 'user', content: q });
  let sys = 'You are Nimbus AI, a concise, helpful assistant built into a web browser.';
  const lw = tabs.filter(t => t.kind === 'web' && t.url && !t.sleeping && t.wcid && !t.priv).sort((a, b) => b.last - a.last)[0];
  if ($('#ctx').checked && lw) { try { sys += `\nThe user's current page is ${lw.url}. Its text:\n` + await lw.wv.executeJavaScript('document.body.innerText.slice(0,9000)'); } catch {} }
  box.insertAdjacentHTML('beforeend', '<div class="m a" id="pend">Thinking…</div>'); box.scrollTop = 1e9;
  const r = await api.inv('ai:ask', aiMsgs, sys), p = $('#pend'); if (!p) return; p.id = '';
  if (r.error) { p.textContent = r.error; aiMsgs.pop(); } else { p.textContent = r.text; aiMsgs.push({ role: 'assistant', content: r.text }); }
  box.scrollTop = 1e9;
}

// ---------- Side panels ----------
$('#rail').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; panel = panel === b.dataset.p ? null : b.dataset.p;
  $('#panel').hidden = !panel; $('#rail').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.p === panel)); if (panel) render(); });
function render() { if (panel) $('#panel').innerHTML = P[panel](); }
const fmtB = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
const P = {
  bm: () => `<h3>Bookmarks</h3>${bm.map((b, i) => `<div class="row link" data-a="go" data-u="${esc(b.u)}"><div>${esc(b.t || b.u)}<small>${esc(host(b.u))}</small></div><button data-a="bm-del" data-i="${i}" title="Remove">✕</button></div>`).join('') || '<small>Tap ☆ in the address bar to save a page.</small>'}`,
  hist: () => `<h3>History</h3><button data-a="hist-clear">Clear history</button>${hist.slice(0, 80).map(h => `<div class="row link" data-a="go" data-u="${esc(h.u)}"><div>${esc(h.t || h.u)}<small>${esc(host(h.u))}</small></div></div>`).join('')}`,
  dl: () => `<h3>Downloads</h3>${dls.map(d => `<div class="row"><div>${esc(d.name)}<small>${d.state === 'completed' ? 'Done · ' + fmtB(d.total) : d.state === 'progressing' ? Math.round(d.received / Math.max(1, d.total) * 100) + '%' : esc(d.state)}</small>${d.state === 'progressing' ? `<div class="bar"><i style="width:${Math.min(100, d.received / Math.max(1, d.total) * 100)}%"></i></div>` : ''}</div>${d.state === 'completed' ? `<button data-a="dl-show" data-id="${d.id}">Show</button>` : ''}</div>`).join('') || '<small>Files you download appear here and are saved to your Downloads folder.</small>'}`,
  pw: () => `<h3>Passwords</h3>${vault.pw.map((p, i) => `<div class="row"><div>${esc(p.site)}<small>${esc(p.user)}</small></div><button data-a="pw-fill" data-i="${i}">Fill</button><button data-a="pw-copy" data-i="${i}">Copy</button><button data-a="pw-del" data-i="${i}" title="Delete">✕</button></div>`).join('') || '<small>No saved logins yet. Nimbus offers to save a password when you sign in to a site.</small>'}
  <h4>Add a login</h4><div class="f"><input id="ps" placeholder="Site (example.com)" value="${cur && cur.url ? esc(host(cur.url)) : ''}"><input id="pu" placeholder="Username or email"><input id="pp" type="text" placeholder="Password" autocomplete="off">
  <button data-a="pw-gen">Generate strong password</button><button class="primary" data-a="pw-add">Save login</button><button data-a="pw-grab">Save from this page’s form</button></div>`,
  perf: () => { const t = M ? M.total : { cpu: 0, mem: 0 }; return `<h3>Performance</h3>
  RAM ${t.mem} MB of ${st.ram} MB limit<div class="bar"><i style="width:${Math.min(100, t.mem / st.ram * 100)}%"></i></div>
  CPU ${t.cpu.toFixed(0)}% of ${st.cpu}% limit<div class="bar"><i style="width:${Math.min(100, t.cpu / st.cpu * 100)}%"></i></div>
  <small>Over a limit, Nimbus lowers background tab priority and puts the least-recently-used tabs to sleep.</small><h4>Tabs</h4>
  ${tabs.filter(x => x.kind === 'web' && x.url).map(x => { const m = M && M.tabs[x.wcid]; return `<div class="row"><div>${esc(x.title)}<small>${x.sleeping ? 'Sleeping' : m ? m.mem + ' MB · ' + m.cpu.toFixed(0) + '% CPU' : '…'}</small></div><button data-a="sleep" data-id="${x.id}">Sleep</button></div>`; }).join('')}`; },
  set: () => `<h3>Settings</h3><h4>Background</h4><div class="sw">${BG.map((b, i) => `<button style="background:${b}" class="${!st.img && st.bg === i ? 'on' : ''}" data-a="bg" data-i="${i}"></button>`).join('')}</div>
  <div class="f" style="margin-top:10px"><input type="file" accept="image/*" data-c="img">${st.img ? '<button data-a="img-rm">Remove custom image</button>' : ''}
  <label>Accent colour <input type="color" value="${esc(st.accent)}" style="height:36px;padding:2px" data-k="accent"></label></div>
  <h4>Resource limits</h4><div class="f"><label>Total RAM limit: <b>${st.ram} MB</b><input type="range" min="500" max="16000" step="250" value="${st.ram}" data-k="ram"></label>
  <label>Total CPU limit: <b>${st.cpu}%</b><input type="range" min="50" max="800" step="25" value="${st.cpu}" data-k="cpu"></label>
  <label>Sleep idle tabs after (min, 0 = never)<input type="number" min="0" value="${st.idle}" data-c="idle"></label>
  <label>Per-tab JS heap cap (MB, 0 = default)<input type="number" min="0" step="128" value="${st.heap}" data-c="heap"></label>
  <small>Heap cap applies after a restart.</small><button data-a="restart">Restart Nimbus</button></div>
  <h4>Startup and security</h4><div class="f"><label class="inl"><input type="checkbox" class="cb" data-c="restore" ${st.restore ? 'checked' : ''}> Reopen my tabs on startup</label>
  <label>Auto-lock when idle (min, 0 = never)<input type="number" min="0" value="${st.lock}" data-c="lock"></label></div>
  <h4>Import from another browser</h4><div class="f"><button data-a="import-det">Find Chrome, Edge, Brave, Opera bookmarks</button>
  <small>Or choose an exported file: bookmarks (.html) from Firefox, Safari or any browser, or passwords (.csv).</small><input type="file" accept=".html,.htm,.csv" data-c="import">
  <small>${esc(impMsg)}</small></div><h4>Privacy</h4><div class="f"><button data-a="clear-data">Clear bookmarks &amp; history</button><button class="primary" data-a="lock">Lock browser</button></div>`
};
$('#panel').addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) act(b.dataset.a, b.dataset); });
$('#panel').addEventListener('input', e => {
  const k = e.target.dataset.k; if (!k) return;
  st[k] = k === 'accent' ? e.target.value : +e.target.value; S('set', st);
  if (k === 'accent') theme(); else e.target.parentNode.querySelector('b').textContent = st[k] + (k === 'ram' ? ' MB' : '%');
});
$('#panel').addEventListener('change', e => {
  const c = e.target.dataset.c; if (!c) return; const f = e.target.files && e.target.files[0];
  if (c === 'img') pickImg(f); else if (c === 'import') importFile(f);
  else if (c === 'restore') { st.restore = e.target.checked; S('set', st); }
  else { st[c] = Math.max(0, +e.target.value || 0); S('set', st); if (c === 'heap') api.inv('cfg:heap', st.heap); }
});
async function act(a, d) {
  const i = +d.i;
  if (a === 'go') openFromOmni(d.u);
  else if (a === 'bm-del') { bm.splice(i, 1); S('bm', bm); syncStar(); render(); }
  else if (a === 'hist-clear') { hist = []; S('hist', hist); render(); }
  else if (a === 'dl-show') api.inv('dl:show', +d.id);
  else if (a === 'pw-fill') fillPw(i);
  else if (a === 'pw-copy') { api.inv('clip:copy', vault.pw[i].pass); toast('Copied. The clipboard clears in 30 seconds.'); }
  else if (a === 'pw-del') { if (confirm(`Delete the saved login for ${vault.pw[i].site}?`)) { vault.pw.splice(i, 1); await api.inv('vault:set', vault); syncKb(); render(); } }
  else if (a === 'pw-gen') $('#pp').value = gen();
  else if (a === 'pw-add') addPw(); else if (a === 'pw-grab') grabPw();
  else if (a === 'sleep') sleep(tabs.find(t => t.id == d.id));
  else if (a === 'bg') { st.bg = i; st.img = null; saveSt(); }
  else if (a === 'img-rm') { st.img = null; saveSt(); }
  else if (a === 'restart') api.inv('app:relaunch');
  else if (a === 'import-det') importDetected();
  else if (a === 'clear-data') { if (confirm('Clear bookmarks and history?')) { bm = []; hist = []; S('bm', bm); S('hist', hist); syncStar(); render(); } }
  else if (a === 'lock') lock();
}
function saveSt() { S('set', st); theme(); render(); }
function pickImg(f) {
  if (!f) return; const url = URL.createObjectURL(f), im = new Image();
  im.onload = () => { const s = Math.min(1, 2400 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url); st.img = c.toDataURL('image/jpeg', 0.86); saveSt(); };
  im.onerror = () => { URL.revokeObjectURL(url); say('That file could not be read as an image.'); }; im.src = url;
}
api.on('dl', d => {
  const i = dls.findIndex(x => x.id === d.id); if (i < 0) { dls.unshift(d); toast('Downloading ' + d.name); } else dls[i] = d;
  if (d.state === 'completed') toast('Downloaded ' + d.name); if (panel === 'dl') render();
});

// ---------- Password vault ----------
const gen = () => { const c = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*', a = crypto.getRandomValues(new Uint32Array(20)); return [...a].map(n => c[n % c.length]).join(''); };
function syncKb() { const n = cur && cur.kind === 'web' && cur.url && !cur.priv ? vault.pw.filter(p => siteMatch(p.site, host(cur.url))).length : 0; $('#kb').hidden = !n; $('#kb').title = n > 1 ? `${n} saved logins for this site` : 'Fill saved password'; }
$('#kb').onclick = () => {
  const m = vault.pw.map((p, i) => ({ p, i })).filter(x => siteMatch(x.p.site, host(cur.url)));
  if (m.length === 1) fillPw(m[0].i); else { panel = 'pw'; $('#panel').hidden = false; $('#rail').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.p === panel)); render(); }
};
async function addPw() {
  const site = $('#ps').value.trim(), user = $('#pu').value.trim(), pass = $('#pp').value; if (!site || !pass) return;
  vault.pw.push({ site: host(site) || site, user, pass }); await api.inv('vault:set', vault); syncKb(); render();
}
async function grabPw() {
  if (!cur.wv || !cur.url) return;
  const r = await cur.wv.executeJavaScript(`(()=>{const ins=[...document.querySelectorAll('input')],p=ins.find(i=>i.type==='password'&&i.value);if(!p)return null;const u=ins.slice(0,ins.indexOf(p)).reverse().find(i=>/text|email|tel/.test(i.type)&&i.value);return{user:u?u.value:'',pass:p.value}})()`);
  if (!r) return toast('Type your login into the page first, then try again.');
  vault.pw.push({ site: host(cur.url), ...r }); await api.inv('vault:set', vault); syncKb(); render();
}
async function fillPw(i) {
  if (!cur.wv || !cur.url) return; const p = vault.pw[i]; if (!p) return;
  const ok = await cur.wv.executeJavaScript(`(()=>{const ins=[...document.querySelectorAll('input')],p=ins.find(i=>i.type==='password');if(!p)return 0;const u=ins.slice(0,ins.indexOf(p)).reverse().find(i=>/^(text|email|tel|)$/.test(i.type));
  const set=(i,v)=>{if(!i)return;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,v);i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}))};set(u,${JSON.stringify(p.user)});set(p,${JSON.stringify(p.pass)});return 1})()`);
  toast(ok ? 'Filled' : 'No password field found on this page.');
}
// "Save this password?" banner
function offerSave(t, r) {
  if (t.priv || !r.pass || !/^https?:/.test(t.url)) return;
  const site = host(t.url), old = vault.pw.find(p => p.site === site && p.user === r.user);
  if (old && old.pass === r.pass) return;
  if (pending && pending.site === site && pending.user === r.user && pending.pass === r.pass) return;
  pending = { site, user: r.user, pass: r.pass, update: !!old };
  $('#pwbar').innerHTML = `<span>${pending.update ? 'Update' : 'Save'} password for <b>${esc(site)}</b>${r.user ? ` (${esc(r.user)})` : ''}?</span><button class="primary" data-pw="save">${pending.update ? 'Update' : 'Save'}</button><button data-pw="no">Not now</button>`;
  $('#pwbar').hidden = false;
}
$('#pwbar').addEventListener('click', async e => {
  const b = e.target.closest('[data-pw]'); if (!b) return;
  if (b.dataset.pw === 'save' && pending) {
    const old = vault.pw.find(p => p.site === pending.site && p.user === pending.user);
    if (old) old.pass = pending.pass; else vault.pw.push({ site: pending.site, user: pending.user, pass: pending.pass });
    await api.inv('vault:set', vault); toast('Password saved'); syncKb(); if (panel === 'pw') render();
  }
  pending = null; $('#pwbar').hidden = true;
});

// ---------- Resource limiter + auto-lock ----------
setInterval(async () => {
  if ($('#app').hidden) return;
  const act = tabs.filter(t => t.kind === 'web' && t.url && !t.sleeping && t.wcid); if (!act.length) return;
  M = await api.inv('sys:metrics', act.map(t => t.wcid));
  const bg = act.filter(t => t !== cur).sort((a, b) => a.last - b.last);
  api.inv('sys:prio', bg.map(t => t.wcid), M.total.cpu > st.cpu);
  if (M.total.mem > st.ram && bg.length) sleep(bg[0]);
  if (st.idle) bg.forEach(t => { if (Date.now() - t.last > st.idle * 60000) sleep(t); });
  if (panel === 'perf') render();
}, 3000);
setInterval(async () => { if (st.lock && !$('#app').hidden && (await api.inv('sys:idle')) >= st.lock * 60) lock(); }, 30000);

// ---------- Import ----------
function addBm(items) { const have = new Set(bm.map(b => b.u)); let n = 0; for (const i of items) if (!have.has(i.u)) { bm.push({ u: i.u, t: i.t || i.u }); have.add(i.u); n++; } S('bm', bm); syncStar(); return n; }
const say = m => { impMsg = m; if (panel === 'set') render(); };
async function importDetected() {
  const found = await api.inv('import:detect');
  if (!found.length) return say('No supported browser found. Export a bookmarks file from your browser and choose it below.');
  say('Imported ' + found.map(f => `${addBm(f.items)} new from ${f.browser}`).join(', ') + '.');
}
function parseCSV(t) { const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { r.push(f); f = ''; }
    else if (c === '\n') { r.push(f); rows.push(r); r = []; f = ''; } else if (c !== '\r') f += c; }
  if (f || r.length) { r.push(f); rows.push(r); } return rows; }
async function importFile(file) {
  if (!file) return; const text = await file.text();
  if (/\.csv$/i.test(file.name)) {
    const [hd, ...rows] = parseCSV(text), hh = hd.map(x => x.trim().toLowerCase()), ix = (...k) => hh.findIndex(x => k.includes(x));
    const iu = ix('url', 'website', 'login_uri', 'origin'), iu2 = ix('username', 'login_username', 'user'), ip = ix('password', 'login_password'), inm = ix('name', 'title');
    if (iu < 0 || ip < 0) return say('This CSV doesn’t look like a password export (needs url and password columns).');
    let n = 0; for (const r of rows) { const pass = r[ip], site = host(r[iu] || r[inm] || ''), user = iu2 >= 0 ? r[iu2] || '' : '';
      if (!pass || !site || vault.pw.some(p => p.site === site && p.user === user)) continue; vault.pw.push({ site, user, pass }); n++; }
    await api.inv('vault:set', vault); syncKb(); say(`Imported ${n} logins. Delete the CSV now: it contains your passwords in plain text.`);
  } else {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    say(`Imported ${addBm([...doc.querySelectorAll('a[href]')].filter(a => /^https?:/.test(a.href)).map(a => ({ t: a.textContent.trim(), u: a.getAttribute('href') })))} new bookmarks.`);
  }
}

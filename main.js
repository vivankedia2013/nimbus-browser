const { app, BrowserWindow, ipcMain, webContents, Menu, dialog, clipboard, shell, powerMonitor } = require('electron');
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), https = require('https');
const mac = process.platform === 'darwin';
const AI_MODEL = 'claude-sonnet-5-5';

// ---------- storage (atomic writes + one backup) ----------
const FILE = () => path.join(app.getPath('userData'), 'nimbus.json');
const readJSON = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const load = () => { try { return readJSON(FILE()); } catch { try { return readJSON(FILE() + '.bak'); } catch { return {}; } } };
const save = d => {
  const f = FILE(), t = f + '.tmp';
  try { if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak'); } catch {}
  fs.writeFileSync(t, JSON.stringify(d)); fs.renameSync(t, f);
};

// RAM cap per tab's JS heap (applies after restart)
const heap = load().heapMB;
if (heap) app.commandLine.appendSwitch('js-flags', `--max-old-space-size=${heap}`);
// Present as a normal Chromium browser (no "Electron" / app token in the user agent)
app.userAgentFallback = app.userAgentFallback.replace(/ (Electron|Nimbus|nimbus-browser)\/\S+/gi, '');
if (process.platform === 'win32') app.setAppUserModelId('com.nimbus.browser');

let win = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Only our own window may talk to the main process (never web pages)
const h = (ch, fn) => ipcMain.handle(ch, (e, ...a) => { if (!win || e.sender !== win.webContents) throw new Error('blocked'); return fn(e, ...a); });

// ---------- Vault crypto: AES-256-GCM, key derived from the master password (never stored) ----------
let key = null, fails = 0;
const kdf = (pw, salt, v) => crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 32, v >= 2 ? { N: 65536, r: 8, p: 1, maxmem: 256 * 1024 * 1024 } : undefined);
const enc = o => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const b = Buffer.concat([c.update(JSON.stringify(o)), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), b]).toString('base64'); };
const dec = s => { const b = Buffer.from(s, 'base64'), d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28)); return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')); };
const verifier = k => crypto.createHash('sha256').update(k).digest('hex');
const EMPTY = () => ({ pw: [], apiKey: '' });

h('auth:state', () => { const u = load().user; return { exists: !!u, name: u && u.name }; });
h('auth:create', (e, name, pw) => {
  if (load().user) return { error: 'A profile already exists.' };
  if (!name || String(pw).length < 8) return { error: 'Use a name and a password of at least 8 characters.' };
  const salt = crypto.randomBytes(16).toString('hex'); key = kdf(pw, salt, 2);
  const d = load(); d.user = { name: String(name).slice(0, 40), salt, v: verifier(key), kdf: 2 }; d.vault = enc(EMPTY()); save(d);
  return { ok: true, name: d.user.name };
});
h('auth:login', async (e, pw) => {
  const u = load().user; if (!u) return { error: 'No profile found.' };
  if (fails) await sleep(Math.min(3000, fails * 500));            // slow down guessing
  const k = kdf(String(pw), u.salt, u.kdf || 1);
  if (verifier(k) !== u.v) { fails++; return { error: 'Wrong password. Try again.' }; }
  fails = 0; key = k; return { ok: true, name: u.name };
});
h('auth:lock', () => { key = null; });
h('vault:get', () => { try { return dec(load().vault); } catch { return EMPTY(); } });
h('vault:set', (e, v) => { if (!key) return false; const d = load(); d.vault = enc(v); save(d); return true; });
h('clip:copy', (e, text) => {                                       // copied passwords clear themselves after 30 s
  text = String(text); clipboard.writeText(text);
  setTimeout(() => { try { if (clipboard.readText() === text) clipboard.clear(); } catch {} }, 30000);
});
h('cfg:heap', (e, mb) => { const d = load(); d.heapMB = Math.max(0, Math.floor(+mb || 0)); save(d); });
h('app:relaunch', () => { app.relaunch(); app.exit(0); });
h('sys:idle', () => powerMonitor.getSystemIdleTime());

// ---------- Performance monitor / limiter helpers ----------
h('sys:metrics', (e, ids) => {
  const m = app.getAppMetrics(), tabs = {};
  for (const id of ids) { try {
    const pid = webContents.fromId(id).getOSProcessId(), p = m.find(x => x.pid === pid);
    if (p) tabs[id] = { cpu: p.cpu.percentCPUUsage, mem: Math.round(p.memory.workingSetSize / 1024) };
  } catch {} }
  return { tabs, total: { cpu: m.reduce((a, x) => a + x.cpu.percentCPUUsage, 0),
    mem: Math.round(m.reduce((a, x) => a + x.memory.workingSetSize, 0) / 1024) }, sysMem: Math.round(os.totalmem() / 1048576) };
});
h('sys:prio', (e, ids, low) => {
  for (const id of ids) { try { os.setPriority(webContents.fromId(id).getOSProcessId(), low ? 10 : 0); } catch {} }
});

// ---------- Built-in AI tab (Anthropic API, key stored encrypted in the vault) ----------
h('ai:ask', async (e, msgs, sys) => {
  try {
    const k = dec(load().vault).apiKey; if (!k) return { error: 'Add your Anthropic API key first.' };
    const j = await new Promise((res, rej) => {
      const rq = https.request('https://api.anthropic.com/v1/messages', { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': k, 'anthropic-version': '2023-06-01' } },
        r => { let d = ''; r.setEncoding('utf8'); r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (x) { rej(x); } }); });
      rq.on('error', rej); rq.setTimeout(60000, () => rq.destroy(new Error('The request timed out.')));
      rq.end(JSON.stringify({ model: AI_MODEL, max_tokens: 1500, system: sys, messages: msgs }));
    });
    return j.error ? { error: j.error.message } : { text: j.content.map(c => c.text || '').join('') };
  } catch (x) { return { error: String(x.message || x) }; }
});

// ---------- Google search suggestions (fetched here so the page needs no network access) ----------
h('suggest', (e, q) => new Promise(res => {
  q = String(q || '').slice(0, 100); if (!q.trim()) return res([]);
  const rq = https.get('https://suggestqueries.google.com/complete/search?client=firefox&q=' + encodeURIComponent(q), r => {
    let d = ''; r.setEncoding('utf8'); r.on('data', c => d += c);
    r.on('end', () => { try { res(JSON.parse(d)[1].slice(0, 6)); } catch { res([]); } });
  });
  rq.on('error', () => res([])); rq.setTimeout(2500, () => { rq.destroy(); res([]); });
}));

// ---------- Import: read bookmarks straight from installed Chromium-based browsers ----------
h('import:detect', () => {
  const home = os.homedir(), w = process.platform === 'win32';
  const A = process.env.APPDATA || '', LA = process.env.LOCALAPPDATA || '', S = path.join(home, 'Library', 'Application Support');
  const c = (b, p) => ({ b, p });
  const list = w ? [c('Chrome', path.join(LA, 'Google/Chrome/User Data/Default/Bookmarks')), c('Edge', path.join(LA, 'Microsoft/Edge/User Data/Default/Bookmarks')),
    c('Brave', path.join(LA, 'BraveSoftware/Brave-Browser/User Data/Default/Bookmarks')), c('Opera', path.join(A, 'Opera Software/Opera Stable/Bookmarks')), c('Opera GX', path.join(A, 'Opera Software/Opera GX Stable/Bookmarks'))]
    : mac ? [c('Chrome', path.join(S, 'Google/Chrome/Default/Bookmarks')), c('Edge', path.join(S, 'Microsoft Edge/Default/Bookmarks')),
    c('Brave', path.join(S, 'BraveSoftware/Brave-Browser/Default/Bookmarks')), c('Opera', path.join(S, 'com.operasoftware.Opera/Bookmarks')), c('Opera GX', path.join(S, 'com.operasoftware.OperaGX/Bookmarks'))] : [];
  const walk = (n, out) => { if (n.type === 'url' && /^https?:/.test(n.url)) out.push({ t: n.name, u: n.url }); (n.children || []).forEach(x => walk(x, out)); return out; };
  const found = [];
  for (const { b, p } of list) { try { const j = readJSON(p); found.push({ browser: b, items: Object.values(j.roots).filter(r => r && r.children).flatMap(r => walk(r, [])) }); } catch {} }
  return found;
});

// ---------- Site permissions: ask before a page may use camera, location, notifications... ----------
const PERM = { media: 'use your camera and microphone', geolocation: 'know your location', notifications: 'show notifications',
  midi: 'use your MIDI devices', midiSysex: 'use your MIDI devices', 'clipboard-read': 'read your clipboard', 'display-capture': 'record your screen' };
const AUTO = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'keyboardLock']);
const hostOf = u => { try { return new URL(u).hostname || u; } catch { return u; } };
const secured = new WeakSet();
let dlId = 0; const dlPaths = {};

function secure(ses, priv) {
  if (secured.has(ses)) return; secured.add(ses);
  const mem = {}, store = () => priv ? mem : (load().perm || {}), k = (o, p) => o + '|' + p;
  ses.setPermissionRequestHandler(async (wc, perm, cb, details) => {
    if (AUTO.has(perm)) return cb(true);
    if (!PERM[perm]) return cb(false);
    const origin = (() => { try { return new URL((details && details.requestingUrl) || wc.getURL()).origin; } catch { return ''; } })();
    const saved = store()[k(origin, perm)];
    if (saved !== undefined) return cb(saved);
    const r = await dialog.showMessageBox(win, { type: 'question', buttons: ['Allow', 'Block'], defaultId: 1, cancelId: 1,
      message: `${hostOf(origin)} wants to ${PERM[perm]}.`, checkboxLabel: 'Remember my choice for this site' });
    const ok = r.response === 0;
    if (r.checkboxChecked) { if (priv) mem[k(origin, perm)] = ok; else { const d = load(); d.perm = d.perm || {}; d.perm[k(origin, perm)] = ok; save(d); } }
    cb(ok);
  });
  ses.setPermissionCheckHandler((wc, perm, origin) => AUTO.has(perm) || store()[k(origin, perm)] === true);
  // Downloads go to the Downloads folder (never overwriting) and report progress to the UI
  ses.on('will-download', (e, item) => {
    const id = ++dlId, dir = app.getPath('downloads');
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    const name = item.getFilename().replace(/[\\/:*?"<>|]/g, '_') || 'download';
    let p = path.join(dir, name);
    for (let n = 1; fs.existsSync(p); n++) { const x = path.parse(name); p = path.join(dir, `${x.name} (${n})${x.ext}`); }
    item.setSavePath(p); dlPaths[id] = p;
    const send = state => { if (win && !win.isDestroyed()) win.webContents.send('dl', { id, name: path.basename(p), received: item.getReceivedBytes(), total: item.getTotalBytes(), state }); };
    send('progressing'); item.on('updated', (_e, s) => send(s)); item.once('done', (_e, s) => send(s));
  });
}
h('dl:show', (e, id) => { if (dlPaths[id]) shell.showItemInFolder(dlPaths[id]); });

// ---------- Keyboard shortcuts that must work while a web page has focus ----------
function shortcut(i) {
  if (i.type !== 'keyDown') return null;
  const mod = mac ? i.meta : i.control, k = (i.key || '').toLowerCase();
  if (i.control && k === 'tab') return i.shift ? 'prevtab' : 'nexttab';
  if (k === 'f12' || (mod && i.alt && k === 'i')) return 'devtools';
  if (k === 'f5') return 'reload';
  if (!mac && i.alt && !mod) return k === 'arrowleft' ? 'back' : k === 'arrowright' ? 'fwd' : null;
  if (!mod || i.alt) return null;
  if (k === '=' || k === '+') return 'zoomin';
  if (i.shift) return k === 't' ? 'reopen' : k === 'n' ? 'private' : null;
  if (/^[1-9]$/.test(k)) return 'tab:' + k;
  return { t: 'newtab', w: 'close', l: 'omni', r: 'reload', f: 'find', d: 'bookmark', '-': 'zoomout', '0': 'zoom0', '[': 'back', ']': 'fwd' }[k] || null;
}

function pageMenu(wc, p, priv) {
  const open = u => win.webContents.send('open-tab', u, priv), t = [];
  if (p.linkURL) t.push({ label: 'Open link in new tab', click: () => open(p.linkURL) }, { label: 'Copy link address', click: () => clipboard.writeText(p.linkURL) }, { type: 'separator' });
  if (p.mediaType === 'image' && p.srcURL) t.push({ label: 'Open image in new tab', click: () => open(p.srcURL) }, { label: 'Save image as…', click: () => wc.downloadURL(p.srcURL) }, { label: 'Copy image address', click: () => clipboard.writeText(p.srcURL) }, { type: 'separator' });
  if (p.isEditable) t.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, { type: 'separator' });
  else if (p.selectionText) {
    const s = p.selectionText.trim().slice(0, 60);
    t.push({ role: 'copy' }, { label: `Search Google for “${s.length > 28 ? s.slice(0, 28) + '…' : s}”`, click: () => open('https://www.google.com/search?q=' + encodeURIComponent(s)) }, { type: 'separator' });
  }
  t.push({ label: 'Back', enabled: wc.canGoBack(), click: () => wc.goBack() }, { label: 'Forward', enabled: wc.canGoForward(), click: () => wc.goForward() }, { label: 'Reload', click: () => wc.reload() },
    { type: 'separator' }, { label: 'Inspect element', click: () => wc.inspectElement(p.x, p.y) });
  Menu.buildFromTemplate(t).popup({ window: win });
}

app.on('web-contents-created', (e, wc) => {
  if (wc.getType() !== 'webview') return;
  const priv = !wc.session.storagePath;                    // in-memory partition = private tab
  secure(wc.session, priv);
  wc.setWindowOpenHandler(({ url }) => { if (/^(https?:|about:blank)/i.test(url)) win.webContents.send('open-tab', url, priv); return { action: 'deny' }; });
  wc.on('will-navigate', (ev, url) => {
    if (/^(https?|file|about|blob|data|view-source|devtools):/i.test(url)) return;
    ev.preventDefault(); if (/^(mailto|tel):/i.test(url)) shell.openExternal(url);
  });
  wc.on('before-input-event', (ev, input) => { const a = shortcut(input); if (a) { ev.preventDefault(); win.webContents.send('shortcut', a); } });
  wc.on('context-menu', (ev, p) => pageMenu(wc, p, priv));
});

// ---------- Window ----------
function createWindow() {
  win = new BrowserWindow({ width: 1360, height: 860, minWidth: 900, minHeight: 600, backgroundColor: '#14121f',
    titleBarStyle: 'hidden',
    ...(mac ? { trafficLightPosition: { x: 16, y: 14 } } : { titleBarOverlay: { color: '#14121f', symbolColor: '#ece9f7', height: 42 } }),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), webviewTag: true, contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.webContents.on('will-attach-webview', (ev, prefs, params) => {
    // web pages never get Node, a preload script, or any partition other than ours
    delete prefs.preload;
    prefs.nodeIntegration = false; prefs.contextIsolation = true; prefs.webSecurity = true; prefs.sandbox = true;
    if (!/^(persist:main|private-\d+)$/.test(params.partition || '')) ev.preventDefault();
  });
  win.webContents.on('will-navigate', ev => ev.preventDefault());       // the browser UI itself never navigates
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.on('closed', () => { win = null; });
}

function buildMenu() {
  // Windows/Linux: no menu bar (shortcuts are handled in the app). macOS: keep standard Edit/Window menus so copy/paste work.
  if (!mac) return Menu.setApplicationMenu(null);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' }, { role: 'editMenu' },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }] },
  ]));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { buildMenu(); createWindow(); });
  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
}

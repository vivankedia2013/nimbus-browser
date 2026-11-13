const { contextBridge, ipcRenderer: r } = require('electron');
// Only these channels are reachable from the browser UI
const INV = ['auth:state', 'auth:create', 'auth:login', 'auth:lock', 'vault:get', 'vault:set', 'cfg:heap', 'app:relaunch',
  'sys:metrics', 'sys:prio', 'sys:idle', 'ai:ask', 'import:detect', 'clip:copy', 'dl:show', 'suggest'];
const ON = ['open-tab', 'shortcut', 'dl'];
contextBridge.exposeInMainWorld('api', {
  inv: (c, ...a) => INV.includes(c) ? r.invoke(c, ...a) : Promise.reject(new Error('blocked')),
  on: (c, f) => { if (ON.includes(c)) r.on(c, (_, ...a) => f(...a)); },
  platform: process.platform
});

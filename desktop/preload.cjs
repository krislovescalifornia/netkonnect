const { contextBridge, ipcRenderer } = require('electron');
// Deliberately narrow bridge. No generic IPC, file, shell, or network access.
contextBridge.exposeInMainWorld('netKonnect', Object.freeze({
  snapshot: () => ipcRenderer.invoke('nk:snapshot'),
  analytics: options => ipcRenderer.invoke('nk:analytics', options),
  restart: () => ipcRenderer.invoke('nk:restart'),
  settings: () => ipcRenderer.invoke('nk:settings'),
  setup: () => ipcRenderer.invoke('nk:setup'),
  setupStatus: () => ipcRenderer.invoke('nk:setup-status'),
  onSetupProgress: callback => {
    if (typeof callback !== 'function') throw new TypeError('A progress callback is required.');
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('nk:setup-progress', listener);
    return () => ipcRenderer.removeListener('nk:setup-progress', listener);
  },
  setStartup: enabled => ipcRenderer.invoke('nk:startup', enabled),
  setCapture: enabled => ipcRenderer.invoke('nk:capture', enabled)
}));

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('whaleAPI', {
  getSnapshot: () => ipcRenderer.invoke('whale:get-snapshot'),
  getConfig: () => ipcRenderer.invoke('whale:get-config'),
  saveConfig: (patch) => ipcRenderer.invoke('whale:save-config', patch),
  refreshBalance: () => ipcRenderer.invoke('whale:refresh-balance'),
  ask: (question) => ipcRenderer.invoke('whale:ask', question),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('whale:set-always-on-top', value),
  setClickThrough: (value) => ipcRenderer.invoke('whale:set-click-through', value),
  openDataDirectory: () => ipcRenderer.invoke('whale:open-data-directory'),
  beginDrag: () => ipcRenderer.invoke('whale:begin-drag'),
  endDrag: () => ipcRenderer.invoke('whale:end-drag'),
  setPanelOpen: (value) => ipcRenderer.invoke('whale:set-panel-open', value),
  setBubbleExpanded: (value) => ipcRenderer.invoke('whale:set-bubble-expanded', value),
  minimize: () => ipcRenderer.invoke('whale:minimize'),
  quit: () => ipcRenderer.invoke('whale:quit'),
  onSnapshot: (callback) => {
    const listener = (_event, value) => callback(value)
    ipcRenderer.on('whale:snapshot', listener)
    return () => ipcRenderer.removeListener('whale:snapshot', listener)
  },
  onPetState: (callback) => {
    const listener = (_event, value) => callback(value)
    ipcRenderer.on('whale:pet-state', listener)
    return () => ipcRenderer.removeListener('whale:pet-state', listener)
  },
})

// 크롬 UI(app://browser/ui/index.html)에만 붙는 다리. 웹페이지 탭에는 붙지 않습니다.
const { contextBridge, ipcRenderer } = require("electron");

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
const on = (channel) => (fn) => {
  const listener = (_e, data) => fn(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.off(channel, listener);
};

contextBridge.exposeInMainWorld("browserAPI", {
  newTab: call("tab:new"),
  closeTab: call("tab:close"),
  activateTab: call("tab:activate"),
  go: call("nav:go"),
  back: call("nav:back"),
  forward: call("nav:forward"),
  reload: call("nav:reload"),
  stopLoading: call("nav:stop"),
  setOverlay: call("ui:overlay"),
  setPanel: call("ui:panel"),
  getSettings: call("settings:get"),
  setSettings: call("settings:set"),
  runAgent: call("agent:run"),
  stopAgent: call("agent:stop"),
  resetAgent: call("agent:reset"),
  respond: call("agent:respond"),
  openExternal: call("open-external"),
  onTabs: on("tabs"),
  onAgent: on("agent"),
  onCommand: on("command"),
});

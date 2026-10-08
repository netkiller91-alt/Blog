/* Electron 메인 프로세스

   창 하나에 브라우저 크롬(탭·주소창·에이전트 패널, app://browser/ui/index.html)을 그리고,
   웹페이지 탭은 각각 WebContentsView 로 그 위에 겹쳐 놓습니다.
   API 키와 에이전트는 이 프로세스에만 있고, 웹페이지나 크롬 화면으로 넘어가지 않습니다. */

import { app, BaseWindow, WebContentsView, ipcMain, protocol, net, shell, safeStorage, Menu } from "electron";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, normalize, sep } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Agent, MODELS } from "./agent/agent.js";
import { parseInput } from "./lib/omnibox.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const NEW_TAB = "app://browser/ui/newtab.html";
const CHROME_HEIGHT = 88; // 탭 줄 + 도구 막대 (ui.css 의 --chrome-h 와 같아야 함)

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

/* ---------- 설정 저장 ---------- */

const DEFAULT_SETTINGS = { model: MODELS[0].id, effort: "medium", confirmRisky: true, panelOpen: true };
let settings = { ...DEFAULT_SETTINGS };
let apiKey = "";

function settingsPath() { return join(app.getPath("userData"), "settings.json"); }

function loadSettings() {
  try {
    const raw = JSON.parse(readFileSync(settingsPath(), "utf8"));
    settings = { ...DEFAULT_SETTINGS, ...raw.settings };
    if (raw.apiKey) {
      apiKey = raw.apiKey.encrypted && safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(raw.apiKey.value, "base64"))
        : raw.apiKey.encrypted ? "" : raw.apiKey.value;
    }
  } catch { /* 처음 실행 */ }
  if (process.env.ANTHROPIC_API_KEY && !apiKey) apiKey = process.env.ANTHROPIC_API_KEY;
}

function saveSettings() {
  // 운영체제 키체인으로 암호화할 수 있으면 암호화해서 저장합니다.
  const encrypted = safeStorage.isEncryptionAvailable();
  const value = !apiKey ? "" : encrypted ? safeStorage.encryptString(apiKey).toString("base64") : apiKey;
  writeFileSync(settingsPath(), JSON.stringify({ settings, apiKey: apiKey ? { encrypted, value } : null }, null, 2));
}

/* ---------- 창과 탭 ---------- */

let win;
let chrome; // 크롬 UI (WebContentsView)
let tabs = []; // { id, view }
let activeId = null;
let seq = 0;
let overlay = false; // 크롬 쪽 대화상자가 열려 있으면 페이지를 숨깁니다.

const activeTab = () => tabs.find((t) => t.id === activeId);

function panelWidth() {
  const [w] = win.getContentSize();
  if (!settings.panelOpen) return 0;
  return w < 900 ? Math.round(w * 0.5) : 400;
}

function layout() {
  if (!win) return;
  const [w, h] = win.getContentSize();
  chrome.setBounds({ x: 0, y: 0, width: w, height: h });
  for (const t of tabs) {
    const visible = t.id === activeId && !overlay;
    t.view.setVisible(visible);
    if (visible) t.view.setBounds({ x: 0, y: CHROME_HEIGHT, width: w - panelWidth(), height: h - CHROME_HEIGHT });
  }
}

function tabInfo(t) {
  const wc = t.view.webContents;
  const url = wc.getURL();
  return {
    id: t.id,
    title: url === NEW_TAB ? "새 탭" : wc.getTitle() || url,
    url: url === NEW_TAB ? "" : url,
    favicon: t.favicon || "",
    loading: wc.isLoading(),
    canGoBack: wc.navigationHistory.canGoBack(),
    canGoForward: wc.navigationHistory.canGoForward(),
    active: t.id === activeId,
  };
}

function sendTabs() {
  chrome?.webContents.send("tabs", { tabs: tabs.map(tabInfo), activeId, panelOpen: settings.panelOpen });
}

function createTab(url = NEW_TAB, { activate = true } = {}) {
  const view = new WebContentsView({
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  const tab = { id: ++seq, view, favicon: "" };
  const wc = view.webContents;
  wc.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) createTab(target);
    return { action: "deny" };
  });
  for (const ev of ["did-start-loading", "did-stop-loading", "page-title-updated", "did-navigate", "did-navigate-in-page"]) {
    wc.on(ev, sendTabs);
  }
  wc.on("page-favicon-updated", (_e, icons) => { tab.favicon = icons[0] || ""; sendTabs(); });
  wc.on("did-fail-load", (_e, code, desc, failedUrl, isMain) => {
    if (isMain && code !== -3) {
      wc.loadURL(`${NEW_TAB}?error=${encodeURIComponent(desc)}&url=${encodeURIComponent(failedUrl)}`);
    }
  });
  win.contentView.addChildView(view);
  tabs.push(tab);
  wc.loadURL(url);
  if (activate) activate_(tab.id);
  sendTabs();
  return tab;
}

function activate_(id) {
  if (!tabs.some((t) => t.id === id)) return false;
  activeId = id;
  layout();
  sendTabs();
  return true;
}

function closeTab(id) {
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  const [tab] = tabs.splice(i, 1);
  win.contentView.removeChildView(tab.view);
  tab.view.webContents.close();
  if (!tabs.length) createTab();
  else if (activeId === id) activate_((tabs[i] || tabs[i - 1]).id);
  sendTabs();
}

/* ---------- 에이전트가 쓰는 브라우저 조작 ---------- */

function waitForLoad(wc, timeout = 15000) {
  return new Promise((resolve) => {
    const finish = () => { clearTimeout(timer); wc.off("did-stop-loading", finish); setTimeout(resolve, 400); };
    const timer = setTimeout(finish, timeout);
    if (!wc.isLoading()) setTimeout(() => (wc.isLoading() ? wc.once("did-stop-loading", finish) : finish()), 300);
    else wc.once("did-stop-loading", finish);
  });
}

const KEYCODES = { Enter: "Return", Escape: "Escape", Tab: "Tab", ArrowDown: "Down", ArrowUp: "Up", ArrowLeft: "Left", ArrowRight: "Right", Backspace: "Backspace", PageDown: "PageDown", PageUp: "PageUp" };

const browser = {
  active: () => activeTab().view.webContents,
  list: () => tabs.map((t) => ({ id: t.id, title: t.view.webContents.getTitle(), url: t.view.webContents.getURL(), active: t.id === activeId })),
  async navigate(url) {
    const wc = browser.active();
    wc.loadURL(url).catch(() => {});
    await waitForLoad(wc);
  },
  async openTab(url) {
    const tab = createTab(url);
    await waitForLoad(tab.view.webContents);
    return tab;
  },
  switchTo: (id) => activate_(id),
  async goBack() {
    const wc = browser.active();
    wc.navigationHistory.goBack();
    await waitForLoad(wc);
  },
  async click(x, y) {
    const wc = browser.active();
    wc.focus();
    wc.sendInputEvent({ type: "mouseMove", x, y });
    wc.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
    wc.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: 1 });
    await waitForLoad(wc, 8000);
  },
  async insertText(text) {
    const wc = browser.active();
    wc.focus();
    await wc.insertText(text);
  },
  async pressKey(key) {
    const wc = browser.active();
    const keyCode = KEYCODES[key] || key;
    wc.focus();
    wc.sendInputEvent({ type: "keyDown", keyCode });
    if (key === "Enter") wc.sendInputEvent({ type: "char", keyCode: "\r" });
    wc.sendInputEvent({ type: "keyUp", keyCode });
    await waitForLoad(wc, 8000);
  },
  async screenshot() {
    const image = await browser.active().capturePage();
    const size = image.getSize();
    const scaled = size.width > 1280 ? image.resize({ width: 1280 }) : image;
    return scaled.toJPEG(70).toString("base64");
  },
};

/* ---------- 에이전트 ↔ 크롬 UI ---------- */

const pending = new Map(); // 사용자의 답을 기다리는 질문·허락 요청
let reqSeq = 0;

const ui = {
  emit: (event) => chrome?.webContents.send("agent", event),
  ask(question) {
    return new Promise((resolve) => {
      const id = ++reqSeq;
      pending.set(id, resolve);
      ui.emit({ type: "question", id, question });
    });
  },
  confirm(message) {
    return new Promise((resolve) => {
      const id = ++reqSeq;
      pending.set(id, (v) => resolve(v === true));
      ui.emit({ type: "confirm", id, message });
    });
  },
  cancelPending() {
    for (const [id, resolve] of pending) { resolve(null); ui.emit({ type: "request-closed", id }); }
    pending.clear();
  },
};

const agent = new Agent({ browser, ui, getSettings: () => settings, getApiKey: () => apiKey });

/* ---------- IPC ---------- */

function registerIpc() {
  // 크롬 UI 외의 화면(웹페이지)에서 온 요청은 무시합니다.
  const handle = (channel, fn) => ipcMain.handle(channel, (event, ...args) => {
    if (event.sender !== chrome.webContents) throw new Error("허용되지 않은 요청");
    return fn(...args);
  });

  handle("tab:new", (url) => { createTab(url || NEW_TAB); });
  handle("tab:close", (id) => closeTab(id ?? activeId));
  handle("tab:activate", (id) => activate_(id));
  handle("nav:go", (text) => {
    const parsed = parseInput(text);
    if (!parsed) return null;
    if (parsed.type === "url") { browser.active().loadURL(parsed.url); return { type: "url" }; }
    return { type: "task", task: parsed.query };
  });
  handle("nav:back", () => browser.active().navigationHistory.goBack());
  handle("nav:forward", () => browser.active().navigationHistory.goForward());
  handle("nav:reload", () => browser.active().reload());
  handle("nav:stop", () => browser.active().stop());
  handle("ui:overlay", (on) => { overlay = Boolean(on); layout(); });
  handle("ui:panel", (open) => { settings.panelOpen = Boolean(open); saveSettings(); layout(); sendTabs(); });
  handle("settings:get", () => ({ settings, hasKey: Boolean(apiKey), models: MODELS, encrypted: safeStorage.isEncryptionAvailable() }));
  handle("settings:set", (next) => {
    const { apiKey: key, ...rest } = next || {};
    settings = { ...settings, ...rest };
    if (typeof key === "string" && key.trim()) apiKey = key.trim();
    if (key === null) apiKey = "";
    saveSettings();
    layout();
    return { hasKey: Boolean(apiKey) };
  });
  handle("agent:run", (task) => { agent.run(String(task)); });
  handle("agent:stop", () => agent.stop());
  handle("agent:reset", () => agent.reset());
  handle("agent:respond", (id, value) => {
    const resolve = pending.get(id);
    if (resolve) { pending.delete(id); resolve(value); }
  });
  handle("open-external", (url) => { if (/^https?:/.test(url)) shell.openExternal(url); });
}

/* ---------- 시작 ---------- */

function serveAppProtocol() {
  // app://browser/ui/… → app/ui/…, app://browser/lib/… → app/lib/… (그 밖의 경로는 거부)
  protocol.handle("app", (req) => {
    const { host, pathname } = new URL(req.url);
    const file = normalize(join(HERE, decodeURIComponent(pathname)));
    const allowed = [join(HERE, "ui") + sep, join(HERE, "lib") + sep].some((dir) => file.startsWith(dir));
    if (host !== "browser" || !allowed || !existsSync(file)) return new Response("not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function createWindow() {
  win = new BaseWindow({ width: 1360, height: 880, minWidth: 640, minHeight: 480, title: "AI 브라우저", backgroundColor: "#16171a" });
  chrome = new WebContentsView({
    webPreferences: { preload: join(HERE, "preload.cjs"), sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  win.contentView.addChildView(chrome);
  chrome.webContents.loadURL("app://browser/ui/index.html");
  chrome.webContents.once("did-finish-load", () => {
    const start = process.argv.find((a) => /^https?:\/\//.test(a));
    createTab(start || NEW_TAB);
  });
  win.on("resize", layout);
  win.on("closed", () => { win = null; app.quit(); });
  layout();
}

// 키보드 단축키는 메뉴 가속기로 등록해야 웹페이지에 초점이 있어도 동작합니다.
function buildMenu() {
  const send = (cmd) => () => chrome?.webContents.send("command", cmd);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
    { label: "파일", submenu: [
      { label: "새 탭", accelerator: "CmdOrCtrl+T", click: () => createTab() },
      { label: "탭 닫기", accelerator: "CmdOrCtrl+W", click: () => closeTab(activeId) },
      { label: "주소창", accelerator: "CmdOrCtrl+L", click: send("focus-omnibox") },
      { type: "separator" },
      { role: "quit", label: "종료" },
    ] },
    { role: "editMenu", label: "편집" },
    { label: "보기", submenu: [
      { label: "새로 고침", accelerator: "CmdOrCtrl+R", click: () => browser.active().reload() },
      { label: "뒤로", accelerator: "Alt+Left", click: () => browser.active().navigationHistory.goBack() },
      { label: "앞으로", accelerator: "Alt+Right", click: () => browser.active().navigationHistory.goForward() },
      { label: "에이전트 패널", accelerator: "CmdOrCtrl+J", click: send("toggle-panel") },
      { label: "에이전트에게 맡기기", accelerator: "CmdOrCtrl+K", click: send("focus-agent") },
      { type: "separator" },
      { label: "개발자 도구 (페이지)", accelerator: "F12", click: () => browser.active().toggleDevTools() },
    ] },
  ]));
}

app.whenReady().then(() => {
  loadSettings();
  serveAppProtocol();
  registerIpc();
  buildMenu();
  createWindow();
});

app.on("window-all-closed", () => app.quit());

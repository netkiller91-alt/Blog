/* 브라우저 저장소

   설정·탭·방문 기록을 localStorage 에 둡니다. 사생활 보호 모드처럼
   저장소가 막힌 환경에서도 앱이 돌아가도록 모든 접근을 감쌉니다. */

import { DEFAULT_MODEL } from "./ai.js";
import { DEFAULT_READER } from "./reader.js";

const KEY = { settings: "aib.settings", tabs: "aib.tabs", history: "aib.history", apiKey: "aib.key" };

function read(storage, key, fallback) {
  try {
    const v = storage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
function write(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); } catch { /* 저장 불가 */ }
}
function remove(storage, key) {
  try { storage.removeItem(key); } catch { /* 저장 불가 */ }
}

const local = () => globalThis.localStorage;
const session = () => globalThis.sessionStorage;

export const DEFAULT_SETTINGS = {
  model: DEFAULT_MODEL,
  effort: "medium",
  reader: DEFAULT_READER,
  readerKey: "",
  // 좁은 화면에서는 패널이 본문을 가리므로 처음엔 닫아 둡니다.
  panelOpen: !globalThis.matchMedia?.("(max-width: 900px)").matches,
};

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...read(local(), KEY.settings, {}) };
}
export function saveSettings(s) { write(local(), KEY.settings, s); }

// 키는 "이 브라우저에 저장"을 고르면 localStorage, 아니면 탭을 닫을 때 사라지는 sessionStorage.
export function loadApiKey() {
  return read(local(), KEY.apiKey, null) || read(session(), KEY.apiKey, "") || "";
}
export function apiKeyRemembered() { return Boolean(read(local(), KEY.apiKey, null)); }
export function saveApiKey(key, remember) {
  remove(local(), KEY.apiKey);
  remove(session(), KEY.apiKey);
  if (key) write(remember ? local() : session(), KEY.apiKey, key);
}

export function loadTabs() { return read(local(), KEY.tabs, null); }
export function saveTabs(state) { write(local(), KEY.tabs, state); }

export function loadHistory() { return read(local(), KEY.history, []); }
export function addHistory(item) {
  const list = loadHistory().filter((h) => !(h.kind === item.kind && h.key === item.key));
  list.unshift({ ...item, at: Date.now() });
  write(local(), KEY.history, list.slice(0, 50));
}

export function clearAll() {
  for (const k of Object.values(KEY)) { remove(local(), k); remove(session(), k); }
}

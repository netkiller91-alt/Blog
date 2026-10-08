/* AI 브라우저 — 화면과 동작

   탭마다 방문 기록(history)이 있고, 기록의 각 항목은 세 종류입니다.
     home  새 탭 화면
     page  읽기 모드로 연 웹페이지 (옆 패널에서 Claude와 대화)
     ask   주소창에 넣은 질문 (본문 영역 전체가 Claude와의 대화) */

import { renderMarkdown, escapeHtml } from "./markdown.js";
import { parseInput, hostOf } from "./omnibox.js";
import { readPage } from "./reader.js";
import {
  MODELS, EFFORTS, createClient, runTurn, pageContextBlock, describeError,
} from "./ai.js";
import * as store from "./store.js";

const $ = (sel, root = document) => root.querySelector(sel);
const h = (html) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

let settings = store.loadSettings();
let apiKey = store.loadApiKey();
let client = null;

const pageCache = new Map(); // url → { title, url, markdown }
let tabs = [];
let activeId = null;
let seq = 0;
let pending = null; // 키가 없어 보내지 못한 질문 — 키를 넣으면 이어서 보냅니다.

const el = {
  tabstrip: $("#tabstrip"),
  newTab: $("#new-tab"),
  back: $("#back"),
  forward: $("#forward"),
  reload: $("#reload"),
  omnibox: $("#omnibox"),
  omniInput: $("#omnibox-input"),
  omniIcon: $("#omnibox-icon"),
  aiToggle: $("#ai-toggle"),
  settingsBtn: $("#settings-btn"),
  view: $("#view"),
  panel: $("#panel"),
  panelBody: $("#panel-body"),
  panelClose: $("#panel-close"),
  settings: $("#settings"),
  settingsDialog: $("#settings-dialog"),
};

/* ---------- 탭 ---------- */

function newEntry(kind, data = {}) {
  return { kind, ...data, chat: null };
}

function makeTab(entry = newEntry("home")) {
  return { id: `t${++seq}`, history: [entry], index: 0 };
}

const activeTab = () => tabs.find((t) => t.id === activeId);
const current = (tab = activeTab()) => tab.history[tab.index];

function entryTitle(e) {
  if (e.kind === "home") return "새 탭";
  if (e.kind === "ask") return e.query;
  return e.title || hostOf(e.url) || e.url;
}

function persist() {
  const strip = (e) => {
    const { chat, ...rest } = e;
    // 질문 탭은 첫 답만 남겨 두어, 새로 고쳐도 토큰을 다시 쓰지 않게 합니다.
    if (e.kind === "ask" && chat?.items?.[1]?.md) {
      rest.saved = { md: chat.items[1].md, sources: chat.items[1].sources || [] };
    }
    return rest;
  };
  store.saveTabs({
    active: tabs.findIndex((t) => t.id === activeId),
    tabs: tabs.map((t) => ({ history: t.history.map(strip), index: t.index })),
  });
}

function restoreTabs() {
  const saved = store.loadTabs();
  if (saved?.tabs?.length) {
    tabs = saved.tabs.map((t) => ({ id: `t${++seq}`, history: t.history.map((e) => ({ ...e, chat: null })), index: t.index }));
    activeId = (tabs[saved.active] || tabs[0]).id;
  } else {
    tabs = [makeTab()];
    activeId = tabs[0].id;
  }
}

function openTab(entry, { background = false } = {}) {
  const tab = makeTab(entry);
  const i = tabs.findIndex((t) => t.id === activeId);
  tabs.splice(i + 1, 0, tab);
  if (!background) activeId = tab.id;
  render();
  return tab;
}

function closeTab(id) {
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  current(tabs[i]).chat?.abort?.abort();
  tabs.splice(i, 1);
  if (!tabs.length) tabs.push(makeTab());
  if (activeId === id) activeId = (tabs[i] || tabs[i - 1]).id;
  render();
}

function navigate(entry, tab = activeTab()) {
  tab.history = tab.history.slice(0, tab.index + 1);
  tab.history.push(entry);
  tab.index = tab.history.length - 1;
  if (entry.kind === "page") store.addHistory({ kind: "page", key: entry.url, title: entry.url });
  if (entry.kind === "ask") store.addHistory({ kind: "ask", key: entry.query, title: entry.query });
  render();
}

function go(text, { newTab = false } = {}) {
  const parsed = parseInput(text);
  if (!parsed) return;
  const entry = parsed.type === "url"
    ? newEntry("page", { url: parsed.url })
    : newEntry("ask", { query: parsed.query });
  if (newTab) {
    const tab = openTab(entry);
    if (entry.kind === "page") store.addHistory({ kind: "page", key: entry.url, title: entry.url });
    else store.addHistory({ kind: "ask", key: entry.query, title: entry.query });
    return tab;
  }
  navigate(entry);
}

/* ---------- 그리기 ---------- */

function render() {
  renderTabstrip();
  renderToolbar();
  renderView();
  renderPanel();
  persist();
}

function renderTabstrip() {
  el.tabstrip.replaceChildren(...tabs.map((t) => {
    const e = current(t);
    const icon = e.kind === "ask" ? "✦" : e.kind === "page" ? faviconHtml(e.url) : "＋";
    const node = h(`
      <div class="tab${t.id === activeId ? " active" : ""}" role="tab" aria-selected="${t.id === activeId}" title="${escapeHtml(entryTitle(e))}">
        <span class="tab-icon">${icon}</span>
        <span class="tab-title">${escapeHtml(entryTitle(e))}</span>
        <button class="tab-close" aria-label="탭 닫기">×</button>
      </div>`);
    node.addEventListener("click", () => { activeId = t.id; render(); });
    node.addEventListener("auxclick", (ev) => { if (ev.button === 1) closeTab(t.id); });
    $(".tab-close", node).addEventListener("click", (ev) => { ev.stopPropagation(); closeTab(t.id); });
    return node;
  }));
}

function faviconHtml(url) {
  const host = hostOf(url);
  if (!host) return "◌";
  return `<img src="https://icons.duckduckgo.com/ip3/${escapeHtml(host)}.ico" alt="" width="14" height="14" referrerpolicy="no-referrer" onerror="this.replaceWith('◌')" />`;
}

function renderToolbar() {
  const tab = activeTab();
  const e = current(tab);
  el.back.disabled = tab.index === 0;
  el.forward.disabled = tab.index >= tab.history.length - 1;
  el.reload.disabled = e.kind === "home";
  if (document.activeElement !== el.omniInput) {
    el.omniInput.value = e.kind === "page" ? e.url : e.kind === "ask" ? e.query : "";
  }
  updateOmniIcon();
  el.aiToggle.setAttribute("aria-pressed", String(settings.panelOpen));
  document.title = e.kind === "home" ? "AI 브라우저" : `${entryTitle(e)} · AI 브라우저`;
}

function updateOmniIcon() {
  const parsed = parseInput(el.omniInput.value);
  el.omniIcon.textContent = parsed?.type === "ask" ? "✦" : "⌕";
  el.omniIcon.title = parsed?.type === "ask" ? "Enter: Claude에게 묻기" : "Enter: 페이지 열기";
}

function renderView() {
  const e = current();
  el.view.scrollTop = 0;
  if (e.kind === "home") return renderHome();
  if (e.kind === "ask") return renderAsk(e);
  return renderPage(e);
}

function renderHome() {
  const history = store.loadHistory().slice(0, 8);
  const suggestions = [
    "오늘 AI 업계 주요 뉴스 정리해줘",
    "news.ycombinator.com",
    "https://ko.wikipedia.org/wiki/웹_브라우저",
    "RAG와 파인튜닝은 언제 각각 쓰는 게 좋아?",
  ];
  const node = h(`
    <section class="home">
      <div class="home-brand"><span class="logo">✦</span> AI 브라우저</div>
      <p class="home-sub">주소를 넣으면 페이지를 깔끔하게 읽어 주고, 질문을 넣으면 Claude가 웹을 찾아 답합니다.</p>
      <form class="home-search">
        <input type="text" name="q" placeholder="주소를 입력하거나 무엇이든 물어보세요" autocomplete="off" aria-label="주소 또는 질문" />
        <button type="submit">이동</button>
      </form>
      <div class="chips">${suggestions.map((s) => `<button class="chip" data-go="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join("")}</div>
      ${history.length ? `
        <h2 class="home-h">최근 방문</h2>
        <ul class="recent">${history.map((it) => `
          <li><button data-go="${escapeHtml(it.key)}">
            <span class="recent-icon">${it.kind === "ask" ? "✦" : faviconHtml(it.key)}</span>
            <span class="recent-title">${escapeHtml(it.title)}</span>
          </button></li>`).join("")}
        </ul>` : ""}
      ${apiKey ? "" : `
        <div class="notice">
          <strong>시작하려면 Anthropic API 키가 필요합니다.</strong>
          페이지 읽기는 키 없이도 되지만, 요약·질문·검색은 Claude를 부르기 때문입니다.
          <button class="link" data-open-settings>API 키 넣기</button>
        </div>`}
    </section>`);
  $(".home-search", node).addEventListener("submit", (ev) => {
    ev.preventDefault();
    go(new FormData(ev.target).get("q"));
  });
  node.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-go]");
    if (t) go(t.dataset.go, { newTab: ev.ctrlKey || ev.metaKey });
    if (ev.target.closest("[data-open-settings]")) openSettings();
  });
  el.view.replaceChildren(node);
  setTimeout(() => $(".home-search input", node)?.focus(), 0);
}

async function renderPage(e) {
  const mode = e.mode || "reader";
  const node = h(`
    <article class="page">
      <header class="page-head">
        <div class="page-meta">
          <span class="page-host">${faviconHtml(e.url)} ${escapeHtml(hostOf(e.url))}</span>
          <div class="seg" role="group" aria-label="보기 방식">
            <button data-mode="reader" aria-pressed="${mode === "reader"}">읽기 모드</button>
            <button data-mode="original" aria-pressed="${mode === "original"}">원본</button>
          </div>
          <a class="page-out" href="${escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer">새 창 ↗</a>
        </div>
        <h1 class="page-title">${escapeHtml(e.title || e.url)}</h1>
      </header>
      <div class="page-body"></div>
    </article>`);
  node.addEventListener("click", (ev) => {
    const m = ev.target.closest("[data-mode]");
    if (m) { e.mode = m.dataset.mode; renderView(); }
  });
  el.view.replaceChildren(node);
  const body = $(".page-body", node);

  if (mode === "original") {
    body.replaceChildren(h(`
      <div class="original">
        <p class="hint">일부 사이트는 다른 사이트 안에 표시되는 것을 막아 빈 화면이 보일 수 있습니다. 그럴 땐 읽기 모드나 "새 창"을 쓰세요.</p>
        <iframe src="${escapeHtml(e.url)}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerpolicy="no-referrer" title="원본 페이지"></iframe>
      </div>`));
    return;
  }

  body.replaceChildren(h(`<div class="skeleton" aria-busy="true"><span></span><span></span><span></span><span></span><span></span></div>`));
  try {
    const page = await loadPage(e);
    if (current() !== e || (e.mode || "reader") !== "reader") return;
    $(".page-title", node).textContent = page.title || e.url;
    // 본문이 제목과 같은 h1 으로 시작하면 위 제목과 겹치므로 뺍니다.
    const md = page.markdown.replace(/^#\s+(.+)\n+/, (m, t) => (t.trim() === page.title ? "" : m));
    body.innerHTML = `<div class="prose">${renderMarkdown(md, page.url)}</div>`;
    renderTabstrip();
    renderToolbar();
  } catch (err) {
    if (current() !== e) return;
    body.replaceChildren(h(`
      <div class="error">
        <p>${escapeHtml(err.message)}</p>
        <div class="row">
          <button data-retry>다시 시도</button>
          <button data-original>원본 보기</button>
          <button class="primary" data-ai-read>Claude가 대신 읽기</button>
        </div>
      </div>`));
    $("[data-retry]", body).addEventListener("click", () => { pageCache.delete(e.url); renderView(); });
    $("[data-original]", body).addEventListener("click", () => { e.mode = "original"; renderView(); });
    $("[data-ai-read]", body).addEventListener("click", () => {
      navigate(newEntry("ask", { query: `이 페이지를 읽고 핵심을 정리해 줘: ${e.url}` }));
    });
  }
}

async function loadPage(e) {
  if (!pageCache.has(e.url)) {
    const p = readPage(e.url, { reader: settings.reader, readerKey: settings.readerKey });
    pageCache.set(e.url, p);
    p.catch(() => pageCache.delete(e.url));
  }
  const page = await pageCache.get(e.url);
  if (page.title && e.title !== page.title) { e.title = page.title; persist(); }
  return page;
}

function renderAsk(e) {
  if (!e.chat) {
    e.chat = newChat();
    if (e.saved) {
      e.chat.items.push({ role: "user", md: e.query }, { role: "assistant", md: e.saved.md, sources: e.saved.sources });
      e.chat.restored = true;
    }
  }
  const node = h(`<section class="ask"></section>`);
  el.view.replaceChildren(node);
  mountChat(node, e, { large: true });
  if (!e.chat.items.length) send(e, e.query);
}

function renderPanel() {
  const e = current();
  const open = settings.panelOpen;
  document.body.classList.toggle("panel-open", open && e.kind === "page");
  if (e.kind !== "page") { el.panelBody.replaceChildren(); return; }
  if (!e.chat) e.chat = newChat();
  mountChat(el.panelBody, e, { large: false });
}

/* ---------- 대화 ---------- */

function newChat() {
  return { messages: [], items: [], busy: false, abort: null, ui: null };
}

const QUICK_ACTIONS = [
  ["요약", "이 페이지를 핵심 위주로 요약해 줘."],
  ["3줄 요약", "이 페이지를 딱 세 줄로 요약해 줘."],
  ["쉽게 설명", "이 페이지 내용을 배경지식 없는 사람도 이해하게 쉽게 설명해 줘."],
  ["한국어 번역", "이 페이지 본문을 자연스러운 한국어로 번역해 줘. 길면 주요 부분 위주로."],
  ["비판적으로 보기", "이 페이지 주장의 약점, 빠진 관점, 확인이 필요한 부분을 짚어 줘."],
];

function mountChat(container, entry, { large }) {
  const chat = entry.chat;
  const node = h(`
    <div class="chat${large ? " chat-large" : ""}">
      <div class="chat-log" aria-live="polite"></div>
      ${!large ? `<div class="chips quick">${QUICK_ACTIONS.map(([label, p]) => `<button class="chip" data-prompt="${escapeHtml(p)}">${label}</button>`).join("")}</div>` : ""}
      <form class="chat-form">
        <textarea rows="1" placeholder="${large ? "이어서 질문하기" : "이 페이지에 대해 물어보세요"}" aria-label="질문"></textarea>
        <button type="submit" class="send" aria-label="보내기">↑</button>
        <button type="button" class="stop" aria-label="중단" hidden>■</button>
      </form>
      <div class="chat-foot">${escapeHtml(modelLabel())}</div>
    </div>`);
  const log = $(".chat-log", node);
  const form = $(".chat-form", node);
  const input = $("textarea", form);
  chat.ui = { node, log, form, input, sendBtn: $(".send", form), stopBtn: $(".stop", form) };

  for (const item of chat.items) log.append(itemNode(item));
  if (!large && !chat.items.length) {
    log.append(h(`<p class="chat-empty">이 페이지를 요약하거나 궁금한 점을 물어보세요. 페이지 본문이 Claude에게 함께 전달됩니다.</p>`));
  }
  if (chat.restored) {
    log.append(h(`<p class="chat-note">저장된 답변입니다. 이어서 질문하면 새로 대화를 시작합니다.</p>`));
  }
  syncBusy(chat);

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const text = input.value.trim();
    if (!text || chat.busy) return;
    input.value = "";
    autosize(input);
    send(entry, text);
  });
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); form.requestSubmit(); }
  });
  input.addEventListener("input", () => autosize(input));
  $(".stop", form).addEventListener("click", () => chat.abort?.abort());
  node.addEventListener("click", (ev) => {
    const q = ev.target.closest("[data-prompt]");
    if (q && !chat.busy) send(entry, q.dataset.prompt);
  });

  container.replaceChildren(node);
  log.scrollTop = log.scrollHeight;
}

function autosize(t) {
  t.style.height = "auto";
  t.style.height = `${Math.min(t.scrollHeight, 180)}px`;
}

function modelLabel() {
  const m = MODELS.find((x) => x.id === settings.model);
  const ef = EFFORTS.find((x) => x.id === settings.effort);
  return `${m ? m.label.split(" · ")[0] : settings.model} · ${ef?.label ?? settings.effort}`;
}

function itemNode(item) {
  if (item.role === "user") return h(`<div class="msg user"><div class="bubble">${escapeHtml(item.md)}</div></div>`);
  const node = h(`<div class="msg assistant"><div class="prose"></div><div class="status"></div><div class="sources"></div></div>`);
  fillAssistant(node, item);
  return node;
}

function fillAssistant(node, item) {
  $(".prose", node).innerHTML = renderMarkdown(item.md || "");
  const status = $(".status", node);
  status.textContent = item.status || "";
  status.className = `status${item.error ? " error-text" : ""}${item.status && !item.error ? " working" : ""}`;
  const src = item.sources || [];
  $(".sources", node).innerHTML = src.length
    ? `<details${item.md ? "" : " open"}><summary>출처 ${src.length}</summary><ol>${src.slice(0, 12).map((s) =>
      `<li><a href="${escapeHtml(s.url)}" data-nav>${escapeHtml(s.title)}</a> <span class="src-host">${escapeHtml(hostOf(s.url))}</span></li>`).join("")}</ol></details>`
    : "";
}

function syncBusy(chat) {
  if (!chat.ui) return;
  chat.ui.sendBtn.hidden = chat.busy;
  chat.ui.stopBtn.hidden = !chat.busy;
}

async function send(entry, text) {
  const chat = entry.chat;
  if (!apiKey) {
    pending = { entry, text };
    openSettings("Claude와 대화하려면 Anthropic API 키가 필요합니다.");
    return;
  }
  client ||= createClient(apiKey);

  // 저장본에서 복원된 대화는 API 기록이 없으므로 새로 시작합니다.
  if (chat.restored) {
    chat.restored = false;
    chat.items = [];
    chat.messages = [];
    if (chat.ui) chat.ui.log.replaceChildren();
  }

  let content = text;
  if (entry.kind === "page" && !chat.messages.length) {
    try {
      const page = await loadPage(entry);
      content = [pageContextBlock(page), { type: "text", text }];
    } catch {
      content = `지금 보고 있는 페이지(${entry.url})의 본문을 불러오지 못했습니다. 필요하면 웹에서 직접 읽어 주세요.\n\n${text}`;
    }
  }

  const userItem = { role: "user", md: text };
  const item = { role: "assistant", md: "", status: "생각하는 중…", sources: [] };
  chat.items.push(userItem, item);
  const ui = () => chat.ui;
  $(".chat-empty", ui()?.log)?.remove();
  ui()?.log.append(itemNode(userItem));
  let node = itemNode(item);
  ui()?.log.append(node);

  // 화면이 다시 그려지면(탭 전환 등) 새 노드를 찾아 계속 갱신합니다.
  const target = () => {
    const log = ui()?.log;
    if (!log) return null;
    if (!log.contains(node)) node = log.lastElementChild;
    return node;
  };
  let raf = 0;
  const paint = () => {
    raf = 0;
    const n = target();
    if (!n) return;
    const log = ui().log;
    const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    fillAssistant(n, item);
    if (stick) log.scrollTop = log.scrollHeight;
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };

  chat.messages.push({ role: "user", content });
  chat.busy = true;
  chat.abort = new AbortController();
  syncBusy(chat);
  const before = chat.messages.length;

  try {
    const result = await runTurn({
      client,
      model: settings.model,
      effort: settings.effort,
      messages: chat.messages,
      signal: chat.abort.signal,
      onText: (t) => { item.md += t; item.status = ""; schedule(); },
      onTool: (name) => {
        item.status = name === "web_fetch" ? "웹페이지 읽는 중…" : "웹 검색 중…";
        schedule();
      },
    });
    item.sources = result.sources;
    item.status = result.stop === "refusal"
      ? "Claude가 이 요청에는 답하지 않았습니다. 질문을 바꿔 다시 시도해 주세요."
      : result.stop === "max_tokens" ? "답변이 길어 중간에 끊겼습니다. \"계속\"이라고 보내면 이어서 씁니다." : "";
    item.error = result.stop === "refusal";
    if (result.stop === "refusal") dropTurn(chat, before);
  } catch (err) {
    item.status = describeError(err);
    item.error = true;
    // 실패한 질문은 대화 기록에서 빼서, 다음 질문이 깨진 기록 위에 쌓이지 않게 합니다.
    dropTurn(chat, before);
    if (err?.status === 401) client = null;
  } finally {
    chat.busy = false;
    chat.abort = null;
    syncBusy(chat);
    paint();
    if (entry.kind === "ask") persist();
  }
}

// 이번 턴(사용자 질문 + 그 뒤 응답)을 기록에서 걷어냅니다.
function dropTurn(chat, lengthAfterUser) {
  chat.messages.length = lengthAfterUser - 1;
}

/* ---------- 설정 ---------- */

function openSettings(message = "") {
  const f = el.settings;
  $("[data-message]", f).textContent = message;
  $("[data-message]", f).hidden = !message;
  f.elements.apiKey.value = apiKey;
  f.elements.remember.checked = store.apiKeyRemembered() || !apiKey;
  f.elements.model.innerHTML = MODELS.map((m) => `<option value="${m.id}">${escapeHtml(m.label)}</option>`).join("");
  f.elements.model.value = settings.model;
  f.elements.effort.innerHTML = EFFORTS.map((x) => `<option value="${x.id}">${escapeHtml(x.label)}</option>`).join("");
  f.elements.effort.value = settings.effort;
  f.elements.reader.value = settings.reader;
  f.elements.readerKey.value = settings.readerKey;
  el.settingsDialog.showModal();
  (apiKey ? f.elements.model : f.elements.apiKey).focus();
}

function bindSettings() {
  const f = el.settings;
  f.addEventListener("submit", (ev) => {
    if (ev.submitter?.value === "cancel") { pending = null; return; }
    const key = f.elements.apiKey.value.trim();
    if (key !== apiKey || f.elements.remember.checked !== store.apiKeyRemembered()) {
      store.saveApiKey(key, f.elements.remember.checked);
      apiKey = key;
      client = null;
    }
    const readerChanged = f.elements.reader.value.trim() !== settings.reader;
    settings = {
      ...settings,
      model: f.elements.model.value,
      effort: f.elements.effort.value,
      reader: f.elements.reader.value.trim() || store.DEFAULT_SETTINGS.reader,
      readerKey: f.elements.readerKey.value.trim(),
    };
    store.saveSettings(settings);
    if (readerChanged) pageCache.clear();
    render(); // 질문 탭은 다시 그려지면서 질문을 보냅니다.
    const p = pending;
    pending = null;
    if (apiKey && p && p.entry.kind === "page" && p.entry === current() && !p.entry.chat.busy) send(p.entry, p.text);
  });
  $("[data-clear]", f).addEventListener("click", () => {
    if (!confirm("API 키, 설정, 탭, 방문 기록을 이 브라우저에서 모두 지울까요?")) return;
    store.clearAll();
    location.reload();
  });
}

/* ---------- 이벤트 ---------- */

function bind() {
  el.omnibox.addEventListener("submit", (ev) => {
    ev.preventDefault();
    go(el.omniInput.value);
    el.omniInput.blur();
  });
  el.omniInput.addEventListener("input", updateOmniIcon);
  el.omniInput.addEventListener("focus", () => el.omniInput.select());
  el.omniInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && (ev.altKey || ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault();
      go(el.omniInput.value, { newTab: true });
    }
    if (ev.key === "Escape") { renderToolbar(); el.omniInput.blur(); }
  });
  el.omniInput.addEventListener("blur", () => setTimeout(renderToolbar, 0));

  el.newTab.addEventListener("click", () => { openTab(newEntry("home")); });
  el.back.addEventListener("click", () => step(-1));
  el.forward.addEventListener("click", () => step(1));
  el.reload.addEventListener("click", () => {
    const e = current();
    if (e.kind === "page") pageCache.delete(e.url);
    if (e.kind === "ask") { e.chat = null; e.saved = null; }
    render();
  });
  el.aiToggle.addEventListener("click", togglePanel);
  el.panelClose.addEventListener("click", togglePanel);
  el.settingsBtn.addEventListener("click", () => openSettings());

  // 읽기 모드와 답변 안의 링크는 이 브라우저 안에서 엽니다.
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest("a[data-nav]");
    if (!a || ev.button !== 0) return;
    const href = a.getAttribute("href");
    if (!/^https?:/i.test(href)) return;
    ev.preventDefault();
    if (ev.ctrlKey || ev.metaKey || ev.shiftKey) openTab(newEntry("page", { url: href }), { background: !ev.shiftKey });
    else navigate(newEntry("page", { url: href }));
  });
  document.addEventListener("auxclick", (ev) => {
    const a = ev.target.closest("a[data-nav]");
    if (!a || ev.button !== 1 || !/^https?:/i.test(a.getAttribute("href"))) return;
    ev.preventDefault();
    openTab(newEntry("page", { url: a.getAttribute("href") }), { background: true });
  });

  document.addEventListener("keydown", (ev) => {
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && (ev.key === "l" || ev.key === "k")) { ev.preventDefault(); el.omniInput.focus(); }
    else if (mod && ev.key === "j") { ev.preventDefault(); togglePanel(); }
    else if (ev.altKey && ev.key === "ArrowLeft") { ev.preventDefault(); step(-1); }
    else if (ev.altKey && ev.key === "ArrowRight") { ev.preventDefault(); step(1); }
    else if (ev.altKey && (ev.key === "t" || ev.key === "T")) { ev.preventDefault(); openTab(newEntry("home")); }
    else if (ev.altKey && (ev.key === "w" || ev.key === "W")) { ev.preventDefault(); closeTab(activeId); }
  });

  bindSettings();
}

function step(delta) {
  const tab = activeTab();
  const next = tab.index + delta;
  if (next < 0 || next >= tab.history.length) return;
  tab.index = next;
  render();
}

function togglePanel() {
  settings.panelOpen = !settings.panelOpen;
  store.saveSettings(settings);
  renderToolbar();
  renderPanel();
  if (settings.panelOpen) setTimeout(() => $(".chat textarea", el.panel)?.focus(), 0);
}

/* ---------- 시작 ---------- */

restoreTabs();
bind();

// ?q=… 로 들어오면 새 탭에서 바로 엽니다 (북마크·검색엔진 등록용).
const q = new URLSearchParams(location.search).get("q");
if (q) {
  history.replaceState(null, "", location.pathname);
  go(q, { newTab: true });
} else {
  render();
}

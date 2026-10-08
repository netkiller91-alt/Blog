/* 브라우저 크롬 화면: 탭 줄, 도구 막대, 에이전트 패널, 설정
   메인 프로세스와는 preload 가 열어 둔 window.browserAPI 로만 이야기합니다. */

import { renderMarkdown, escapeHtml } from "./markdown.js";
import { parseInput } from "../lib/omnibox.js";

const api = window.browserAPI;
const $ = (sel, root = document) => root.querySelector(sel);
const h = (html) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

const el = {
  tabstrip: $("#tabstrip"),
  newTab: $("#new-tab"),
  back: $("#back"),
  forward: $("#forward"),
  reload: $("#reload"),
  omnibox: $("#omnibox"),
  omniInput: $("#omnibox-input"),
  omniIcon: $("#omnibox-icon"),
  agentToggle: $("#agent-toggle"),
  settingsBtn: $("#settings-btn"),
  log: $("#log"),
  taskForm: $("#task-form"),
  taskInput: $("#task-input"),
  runBtn: $("#run-btn"),
  stopBtn: $("#stop-btn"),
  reset: $("#agent-reset"),
  modelLabel: $("#model-label"),
  dialog: $("#settings-dialog"),
  settings: $("#settings"),
};

let state = { tabs: [], activeId: null, panelOpen: true };
let running = false;
let current = null; // 지금 진행 중인 작업의 화면 요소들

/* ---------- 탭과 도구 막대 ---------- */

api.onTabs((next) => {
  state = next;
  document.body.classList.toggle("panel-open", next.panelOpen);
  renderTabs();
  renderToolbar();
});

function renderTabs() {
  el.tabstrip.replaceChildren(...state.tabs.map((t) => {
    const icon = t.loading ? `<span class="spinner"></span>` : t.favicon ? `<img src="${escapeHtml(t.favicon)}" alt="" />` : "◌";
    const node = h(`
      <div class="tab${t.active ? " active" : ""}" role="tab" aria-selected="${t.active}" title="${escapeHtml(t.title)}">
        <span class="tab-icon">${icon}</span>
        <span class="tab-title">${escapeHtml(t.title || "새 탭")}</span>
        <button class="tab-close" aria-label="탭 닫기">×</button>
      </div>`);
    const img = $("img", node);
    img?.addEventListener("error", () => img.replaceWith("◌"));
    node.addEventListener("click", () => api.activateTab(t.id));
    node.addEventListener("auxclick", (e) => { if (e.button === 1) api.closeTab(t.id); });
    $(".tab-close", node).addEventListener("click", (e) => { e.stopPropagation(); api.closeTab(t.id); });
    return node;
  }));
}

function renderToolbar() {
  const t = state.tabs.find((x) => x.active);
  if (!t) return;
  el.back.disabled = !t.canGoBack;
  el.forward.disabled = !t.canGoForward;
  el.reload.textContent = t.loading ? "×" : "↻";
  el.reload.title = t.loading ? "멈추기" : "새로 고침 (Ctrl+R)";
  if (document.activeElement !== el.omniInput) el.omniInput.value = t.url;
  updateOmniIcon();
  el.agentToggle.setAttribute("aria-pressed", String(state.panelOpen));
  document.title = t.title ? `${t.title} · AI 브라우저` : "AI 브라우저";
}

function updateOmniIcon() {
  const p = parseInput(el.omniInput.value);
  el.omniIcon.textContent = p?.type === "ask" ? "✦" : "⌕";
  el.omniIcon.title = p?.type === "ask" ? "Enter: 에이전트에게 맡기기" : "Enter: 이동";
}

el.omnibox.addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await api.go(el.omniInput.value);
  if (r?.type === "task") startTask(r.task);
  el.omniInput.blur();
});
el.omniInput.addEventListener("input", updateOmniIcon);
el.omniInput.addEventListener("focus", () => el.omniInput.select());
el.omniInput.addEventListener("keydown", (e) => { if (e.key === "Escape") { el.omniInput.blur(); renderToolbar(); } });
el.omniInput.addEventListener("blur", () => setTimeout(renderToolbar, 0));
el.newTab.addEventListener("click", () => api.newTab());
el.back.addEventListener("click", () => api.back());
el.forward.addEventListener("click", () => api.forward());
el.reload.addEventListener("click", () => (state.tabs.find((x) => x.active)?.loading ? api.stopLoading() : api.reload()));
el.agentToggle.addEventListener("click", togglePanel);
el.settingsBtn.addEventListener("click", () => openSettings());

function togglePanel() {
  api.setPanel(!state.panelOpen);
  if (!state.panelOpen) setTimeout(() => el.taskInput.focus(), 50);
}

api.onCommand((cmd) => {
  if (cmd === "focus-omnibox") el.omniInput.focus();
  if (cmd === "toggle-panel") togglePanel();
  if (cmd === "focus-agent") {
    if (!state.panelOpen) api.setPanel(true);
    el.taskInput.focus();
  }
});

/* ---------- 에이전트 패널 ---------- */

function startTask(task) {
  const text = String(task || "").trim();
  if (!text || running) return;
  if (!state.panelOpen) api.setPanel(true);
  el.taskInput.value = "";
  api.runAgent(text);
}

el.taskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  startTask(el.taskInput.value);
});
el.taskInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); el.taskForm.requestSubmit(); }
});
el.stopBtn.addEventListener("click", () => api.stopAgent());
el.reset.addEventListener("click", async () => {
  await api.resetAgent();
  el.log.replaceChildren();
  showEmpty();
});

function setRunning(on) {
  running = on;
  el.runBtn.hidden = on;
  el.stopBtn.hidden = !on;
  el.taskInput.placeholder = on ? "작업 중입니다…" : "이어서 시킬 일을 쓰세요";
  document.body.classList.toggle("agent-running", on);
}

function scrollLog() {
  const near = el.log.scrollHeight - el.log.scrollTop - el.log.clientHeight < 120;
  if (near) el.log.scrollTop = el.log.scrollHeight;
}

function showEmpty() {
  el.log.append(h(`
    <div class="empty">
      <p><strong>할 일을 맡기면 에이전트가 이 브라우저를 직접 조작해 끝까지 해냅니다.</strong></p>
      <ul>
        <li>페이지를 읽고, 링크를 누르고, 검색창에 입력하고, 양식을 채웁니다.</li>
        <li>결제·전송·삭제처럼 되돌리기 어려운 일은 하기 전에 꼭 묻습니다.</li>
        <li>로그인과 비밀번호는 직접 입력해 주세요. 그동안 에이전트는 기다립니다.</li>
        <li>언제든 <b>멈추기</b>를 누르거나 직접 페이지를 조작해도 됩니다.</li>
      </ul>
      <div class="examples">
        ${["이 페이지 내용을 세 줄로 요약해줘", "네이버 날씨에서 내일 서울 날씨 알려줘", "위키백과에서 '대형 언어 모델' 찾아서 역사 부분 정리해줘"]
          .map((x) => `<button class="chip" data-example="${escapeHtml(x)}">${escapeHtml(x)}</button>`).join("")}
      </div>
    </div>`));
}

el.log.addEventListener("click", (e) => {
  const ex = e.target.closest("[data-example]");
  if (ex) startTask(ex.dataset.example);
  const a = e.target.closest("a[href]");
  if (a && /^https?:/.test(a.getAttribute("href"))) {
    e.preventDefault();
    api.newTab(a.getAttribute("href"));
  }
});

const requests = new Map(); // id → 카드

api.onAgent((ev) => {
  switch (ev.type) {
    case "start": {
      $(".empty", el.log)?.remove();
      const run = h(`<section class="run"><div class="msg user">${escapeHtml(ev.task)}</div><ol class="steps"></ol></section>`);
      el.log.append(run);
      current = { run, steps: $(".steps", run), text: null, textMd: "", lastAction: null };
      setRunning(true);
      break;
    }
    case "note":
      if (!current) break;
      current.steps.append(h(`<li class="note">${escapeHtml(ev.text)}</li>`));
      current.text = null;
      break;
    case "text-start":
      if (!current) break;
      current.textMd = "";
      current.text = h(`<li class="answer prose"></li>`);
      current.steps.append(current.text);
      break;
    case "text":
      if (!current) break;
      if (!current.text) { current.textMd = ""; current.text = h(`<li class="answer prose"></li>`); current.steps.append(current.text); }
      current.textMd += ev.delta;
      current.text.innerHTML = renderMarkdown(current.textMd);
      break;
    case "action":
      if (!current) break;
      current.text = null;
      current.lastAction = h(`<li class="action pending"><span class="dot"></span><span class="label">${escapeHtml(ev.label)}</span></li>`);
      current.steps.append(current.lastAction);
      break;
    case "action-result":
      if (!current?.lastAction) break;
      current.lastAction.classList.remove("pending");
      current.lastAction.classList.add(ev.ok ? "ok" : "fail");
      if (!ev.ok && ev.message) current.lastAction.append(h(`<div class="why">${escapeHtml(ev.message)}</div>`));
      break;
    case "confirm": {
      const card = h(`
        <li class="card confirm">
          <div class="card-title">허락이 필요합니다</div>
          <p>${escapeHtml(ev.message)}</p>
          <div class="card-actions">
            <button class="deny">거절</button>
            <button class="allow primary">허락</button>
          </div>
        </li>`);
      const answer = (ok) => {
        api.respond(ev.id, ok);
        closeCard(card, ok ? "허락했습니다" : "거절했습니다");
      };
      $(".allow", card).addEventListener("click", () => answer(true));
      $(".deny", card).addEventListener("click", () => answer(false));
      requests.set(ev.id, card);
      (current?.steps || el.log).append(card);
      $(".allow", card).focus();
      notifyAttention();
      break;
    }
    case "question": {
      const card = h(`
        <li class="card question">
          <div class="card-title">에이전트의 질문</div>
          <p>${escapeHtml(ev.question)}</p>
          <form class="card-form">
            <input type="text" placeholder="답을 입력하세요 (직접 처리했다면 '완료')" aria-label="답" />
            <button class="primary">답하기</button>
          </form>
        </li>`);
      $("form", card).addEventListener("submit", (e) => {
        e.preventDefault();
        const value = $("input", card).value.trim();
        if (!value) return;
        api.respond(ev.id, value);
        closeCard(card, `답: ${value}`);
      });
      requests.set(ev.id, card);
      (current?.steps || el.log).append(card);
      $("input", card).focus();
      notifyAttention();
      break;
    }
    case "request-closed": {
      const card = requests.get(ev.id);
      if (card) closeCard(card, "작업이 멈춰 닫혔습니다");
      break;
    }
    case "done":
      finish(ev.status === "refusal"
        ? "에이전트가 이 일은 하지 않기로 했습니다. 요청을 바꿔 다시 시도해 주세요."
        : ev.status === "max_steps" ? "단계가 너무 많아 여기서 멈췄습니다. 이어서 시키면 계속합니다." : "", ev.status === "refusal");
      break;
    case "stopped":
      finish("멈췄습니다. 이어서 시키면 지금 화면에서 계속합니다.", false);
      break;
    case "error":
      finish(ev.message, true);
      break;
    case "need-key":
      openSettings("에이전트를 쓰려면 Anthropic API 키가 필요합니다.");
      break;
  }
  scrollLog();
});

function closeCard(card, result) {
  for (const b of card.querySelectorAll("button, input")) b.disabled = true;
  card.classList.add("closed");
  $(".card-actions, .card-form", card)?.replaceWith(h(`<div class="card-result">${escapeHtml(result)}</div>`));
  for (const [id, c] of requests) if (c === card) requests.delete(id);
}

function finish(message, isError) {
  if (current && message) current.steps.append(h(`<li class="status${isError ? " error" : ""}">${escapeHtml(message)}</li>`));
  current = null;
  setRunning(false);
}

function notifyAttention() {
  if (!state.panelOpen) api.setPanel(true);
  if (document.hidden && "Notification" in window && Notification.permission === "granted") {
    new Notification("AI 브라우저", { body: "에이전트가 확인을 기다립니다." });
  }
}

/* ---------- 설정 ---------- */

async function openSettings(message = "") {
  const info = await api.getSettings();
  const f = el.settings;
  $("[data-message]", f).textContent = message;
  $("[data-message]", f).hidden = !message;
  f.elements.apiKey.value = "";
  f.elements.apiKey.placeholder = info.hasKey ? "저장된 키가 있습니다 (바꾸려면 새로 입력)" : "sk-ant-…";
  $("[data-key-hint]", f).textContent = info.encrypted
    ? "키는 이 컴퓨터에 운영체제 키체인으로 암호화해 저장되고, 웹페이지에는 절대 노출되지 않습니다."
    : "키는 이 컴퓨터의 앱 설정 폴더에 저장되고, 웹페이지에는 절대 노출되지 않습니다.";
  f.elements.model.innerHTML = info.models.map((m) => `<option value="${m.id}">${escapeHtml(m.label)}</option>`).join("");
  f.elements.model.value = info.settings.model;
  f.elements.effort.value = info.settings.effort;
  f.elements.confirmRisky.checked = info.settings.confirmRisky;
  await api.setOverlay(true); // 페이지가 대화상자를 가리지 않도록
  el.dialog.showModal();
  (info.hasKey ? f.elements.model : f.elements.apiKey).focus();
}

el.dialog.addEventListener("close", () => api.setOverlay(false));
el.settings.addEventListener("submit", async (e) => {
  if (e.submitter?.value === "cancel") return;
  const f = el.settings;
  await api.setSettings({
    apiKey: f.elements.apiKey.value,
    model: f.elements.model.value,
    effort: f.elements.effort.value,
    confirmRisky: f.elements.confirmRisky.checked,
  });
  updateModelLabel();
});
$("[data-forget]", el.settings).addEventListener("click", async () => {
  if (!confirm("저장된 API 키를 지울까요?")) return;
  await api.setSettings({ apiKey: null });
  el.dialog.close();
});

async function updateModelLabel() {
  const info = await api.getSettings();
  const m = info.models.find((x) => x.id === info.settings.model);
  el.modelLabel.textContent = `${m ? m.label.split(" · ")[0] : info.settings.model}${info.hasKey ? "" : " · 키 없음"}`;
}

/* ---------- 시작 ---------- */

showEmpty();
setRunning(false);
el.taskInput.placeholder = "무엇을 대신 해 드릴까요? 예) 다음 주 토요일 서울→부산 KTX 오전 시간표 찾아줘";
updateModelLabel();
if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();

/* ============================================================
   관리 화면 — content/ 의 마크다운만 커밋합니다.

   HTML은 손대지 않습니다. 저장하면 GitHub Actions의 빌드가
   content/ 를 읽어 사이트 전체를 다시 생성합니다.
   그래서 글 수정·삭제가 생성이랑 똑같이 파일 하나 쓰기로 끝납니다.
   ============================================================ */
import { renderMarkdown, escapeHtml, parseFrontMatter, buildFrontMatter }
  from "../assets/js/markdown.mjs";

const CFG = window.ADMIN_CONFIG || {};
const API = "https://api.github.com";
const TOKEN_KEY = "aien-gh-token";
const THEME_KEY = "aien-theme";
const $ = (id) => document.getElementById(id);

/* ---- 테마 ----------------------------------------------- */
const storedTheme = () => { try { return localStorage.getItem(THEME_KEY); } catch { return null; } };
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t === "light" || t === "dark" ? t : "auto");
  const icon = document.querySelector(".theme-icon");
  if (icon) icon.textContent = t === "dark" ? "☾" : t === "light" ? "☀" : "◐";
}
applyTheme(storedTheme() || "auto");
document.querySelector(".theme-toggle")?.addEventListener("click", () => {
  const order = ["auto", "light", "dark"];
  const next = order[(order.indexOf(storedTheme() || "auto") + 1) % order.length];
  try { localStorage.setItem(THEME_KEY, next); } catch { /* 무시 */ }
  applyTheme(next);
});
document.querySelectorAll("[data-year]").forEach((el) => {
  el.textContent = String(new Date().getFullYear());
});

/* ---- base64 (UTF-8 안전) --------------------------------- */
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function bytesToB64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/* ---- GitHub API ----------------------------------------- */
const token = () => $("token").value.trim();

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `${res.status} ${res.statusText}`);
  return data;
}

const contents = (p) => `/repos/${CFG.owner}/${CFG.repo}/contents/${p}`;

async function getFile(path) {
  const d = await api(`${contents(path)}?ref=${encodeURIComponent(CFG.branch)}`);
  return { text: b64decode(d.content), sha: d.sha };
}
async function listDir(path) {
  try {
    const d = await api(`${contents(path)}?ref=${encodeURIComponent(CFG.branch)}`);
    return Array.isArray(d) ? d : [];
  } catch (e) {
    if (/not found/i.test(e.message)) return [];   // 아직 글이 하나도 없는 경우
    throw e;
  }
}
async function putFile(path, content, message, sha, isBase64 = false) {
  const body = { message, content: isBase64 ? content : b64encode(content), branch: CFG.branch };
  if (sha) body.sha = sha;
  return api(contents(path), { method: "PUT", body });
}
async function deleteFile(path, message, sha) {
  return api(contents(path), { method: "DELETE", body: { message, sha, branch: CFG.branch } });
}

/* ---- 로그 ----------------------------------------------- */
function logger(id) {
  const el = $(id);
  return {
    clear: () => { el.innerHTML = ""; },
    say(msg, state) {
      const li = document.createElement("li");
      li.textContent = msg;
      if (state) li.className = `is-${state}`;
      el.appendChild(li);
      return li;
    }
  };
}

/* ---- 슬러그 --------------------------------------------- */
const slugify = (t) => String(t).trim().toLowerCase()
  .replace(/[^\w가-힣\s-]/g, "").replace(/\s+/g, "-")
  .replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/* ============================================================
   글
   ============================================================ */
const postLog = logger("post-log");
let editing = null;   // { file, sha } — 새 글이면 null

function postFileName(slug) { return `content/posts/${slug}.md`; }

function readPostForm() {
  const date = $("date").value || new Date().toISOString().slice(0, 10);
  const title = $("title").value.trim();
  return {
    title,
    date,
    slug: $("slug").value.trim() || `${date}-${slugify(title)}`,
    summary: $("summary").value.trim(),
    tags: $("tags").value.trim(),
    cover: $("cover").value.trim(),
    draft: $("draft").checked ? "true" : "",
    body: $("body").value
  };
}

function fillPostForm(meta = {}, body = "") {
  $("title").value = meta.title || "";
  $("date").value = meta.date || new Date().toISOString().slice(0, 10);
  $("slug").value = meta.slug || "";
  $("summary").value = meta.summary || "";
  $("tags").value = meta.tags || "";
  $("cover").value = meta.cover || "";
  $("draft").checked = String(meta.draft).toLowerCase() === "true";
  $("body").value = body;
  refreshPostPreview();
}

function refreshPostPreview() {
  $("post-preview").innerHTML = $("body").value.trim()
    ? renderMarkdown($("body").value)
    : '<p class="hint">본문을 입력하면 여기에 표시됩니다.</p>';
}

function openEditor(mode, file, sha) {
  editing = file ? { file, sha } : null;
  $("post-editor").hidden = false;
  $("post-editor-head").textContent = mode === "new" ? "새 글" : `수정 — ${file.split("/").pop()}`;
  $("post-delete").hidden = mode === "new";
  postLog.clear();
  $("post-editor").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadPostList() {
  const list = $("post-list");
  if (!token()) { list.innerHTML = '<li class="hint">토큰을 입력하면 목록을 불러옵니다.</li>'; return; }
  list.innerHTML = '<li class="hint">불러오는 중…</li>';

  try {
    const files = (await listDir("content/posts"))
      .filter((f) => f.type === "file" && f.name.endsWith(".md"))
      .sort((a, b) => (a.name < b.name ? 1 : -1));

    if (!files.length) {
      list.innerHTML = '<li class="hint">아직 글이 없습니다. “+ 새 글”을 눌러 시작하세요.</li>';
      return;
    }

    list.innerHTML = "";
    for (const f of files) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "linkbtn";
      btn.textContent = f.name.replace(/\.md$/, "");
      btn.addEventListener("click", async () => {
        postLog.clear();
        try {
          const got = await getFile(f.path);
          const { meta, body } = parseFrontMatter(got.text);
          if (!meta.slug) meta.slug = f.name.replace(/\.md$/, "");
          fillPostForm(meta, body);
          openEditor("edit", f.path, got.sha);
        } catch (err) {
          postLog.say(`불러오지 못했습니다: ${err.message}`, "error");
        }
      });
      li.appendChild(btn);
      list.appendChild(li);
    }
  } catch (err) {
    list.innerHTML = `<li class="is-error">목록을 불러오지 못했습니다: ${escapeHtml(err.message)}</li>`;
  }
}

async function savePost() {
  const p = readPostForm();
  postLog.clear();

  if (!token()) { postLog.say("토큰을 먼저 입력하세요.", "error"); $("auth-panel").open = true; return; }
  if (!p.title) { postLog.say("제목이 비어 있습니다.", "error"); return; }
  if (!p.body.trim()) { postLog.say("본문이 비어 있습니다.", "error"); return; }
  if (!p.slug) { postLog.say("주소(slug)를 만들 수 없습니다. 직접 입력해 주세요.", "error"); return; }

  const btn = $("post-save");
  btn.disabled = true;

  const target = postFileName(p.slug);
  const text = buildFrontMatter({
    title: p.title, date: p.date, slug: p.slug,
    summary: p.summary, tags: p.tags, cover: p.cover, draft: p.draft
  }, p.body);

  try {
    // 슬러그를 바꾼 경우: 새 파일을 쓰고 옛 파일을 지웁니다.
    const renaming = editing && editing.file !== target;
    let sha = editing && !renaming ? editing.sha : null;
    if (!sha) {
      try { sha = (await getFile(target)).sha; } catch { sha = null; }
    }

    postLog.say(`저장하는 중… (${target})`);
    await putFile(target, text, `${editing ? "Update" : "Add"} post: ${p.title}`, sha);

    if (renaming) {
      postLog.say(`이전 파일을 정리하는 중… (${editing.file})`);
      await deleteFile(editing.file, `Remove renamed post file: ${editing.file}`, editing.sha);
    }

    postLog.say("저장했습니다. 빌드·배포까지 1분쯤 걸립니다.", "ok");
    if (p.draft) postLog.say("초안이라 사이트에는 보이지 않습니다.", "ok");
    editing = { file: target, sha: (await getFile(target)).sha };
    $("post-delete").hidden = false;
    $("post-editor-head").textContent = `수정 — ${target.split("/").pop()}`;
    await loadPostList();
  } catch (err) {
    postLog.say(`실패: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
  }
}

async function deletePost() {
  if (!editing) return;
  if (!confirm(`정말 삭제할까요?\n${editing.file}\n\n되돌리려면 저장소 커밋 히스토리에서 복구해야 합니다.`)) return;
  postLog.clear();
  const btn = $("post-delete");
  btn.disabled = true;
  try {
    await deleteFile(editing.file, `Delete post: ${editing.file}`, editing.sha);
    postLog.say("삭제했습니다.", "ok");
    editing = null;
    $("post-editor").hidden = true;
    await loadPostList();
  } catch (err) {
    postLog.say(`실패: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
  }
}

/* ---- 이미지 업로드 --------------------------------------- */
function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
  const pos = start + text.length;
  textarea.selectionStart = textarea.selectionEnd = pos;
  textarea.focus();
  refreshPostPreview();
}

async function uploadImages(files) {
  if (!token()) { postLog.say("토큰을 먼저 입력하세요.", "error"); $("auth-panel").open = true; return; }

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      postLog.say(`이미지가 아니라 건너뜁니다: ${file.name}`, "error");
      continue;
    }
    if (file.size > 5 * 1024 * 1024) {
      postLog.say(`5MB를 넘어 건너뜁니다: ${file.name}`, "error");
      continue;
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const clean = file.name.toLowerCase().replace(/[^\w.가-힣-]/g, "-").replace(/-+/g, "-");
    const name = `${stamp}-${clean}`;
    const path = `content/media/${name}`;

    const line = postLog.say(`올리는 중… ${file.name}`);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let sha = null;
      try { sha = (await getFile(path)).sha; } catch { sha = null; }
      await putFile(path, bytesToB64(buf), `Add image: ${name}`, sha, true);
      line.textContent = `올렸습니다: ${name}`;
      line.className = "is-ok";
      insertAtCursor($("body"), `\n![${file.name.replace(/\.[^.]+$/, "")}](/content/media/${name})\n`);
    } catch (err) {
      line.textContent = `실패: ${file.name} — ${err.message}`;
      line.className = "is-error";
    }
  }
}

/* ---- 글 탭 이벤트 ---------------------------------------- */
$("post-new").addEventListener("click", () => {
  fillPostForm({}, "");
  openEditor("new");
});
$("post-save").addEventListener("click", savePost);
$("post-delete").addEventListener("click", deletePost);
$("body").addEventListener("input", refreshPostPreview);
$("title").addEventListener("input", () => {
  if (!$("slug").dataset.touched && !editing) {
    const date = $("date").value || new Date().toISOString().slice(0, 10);
    $("slug").value = $("title").value.trim() ? `${date}-${slugify($("title").value)}` : "";
  }
});
$("slug").addEventListener("input", () => { $("slug").dataset.touched = "1"; });

$("post-preview-toggle").addEventListener("click", () => {
  const panel = $("post-preview-panel");
  panel.hidden = !panel.hidden;
  if (!panel.hidden) { refreshPostPreview(); panel.scrollIntoView({ behavior: "smooth" }); }
});

$("image").addEventListener("change", (e) => {
  uploadImages([...e.target.files]);
  e.target.value = "";
});

const dz = $("dropzone");
["dragenter", "dragover"].forEach((ev) =>
  dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-over"); }));
["dragleave", "drop"].forEach((ev) =>
  dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-over"); }));
dz.addEventListener("drop", (e) => {
  const files = [...(e.dataTransfer?.files || [])];
  if (files.length) uploadImages(files);
});

/* ============================================================
   단일 파일 섹션 (인사말 / 요즘 / 읽을거리)
   ============================================================ */
function fileSection({ id, path, label, render }) {
  const ta = $(`${id}-body`);
  const log = logger(`${id}-log`);
  const preview = $(`${id}-preview`);
  const saveBtn = $(`${id}-save`);
  const stateEl = $(`${id}-state`);
  let sha = null;
  let loaded = false;

  // 현재 내용을 불러오기 전에는 입력과 저장을 잠급니다.
  // 빈 칸에 쓴 내용으로 기존 파일을 통째로 덮어쓰는 사고를 막기 위해서입니다.
  function setLocked(message) {
    loaded = false;
    ta.disabled = true;
    saveBtn.disabled = true;
    if (stateEl) stateEl.textContent = message;
  }
  function setReady() {
    loaded = true;
    ta.disabled = false;
    saveBtn.disabled = false;
    if (stateEl) stateEl.textContent = "";
  }

  function refresh() {
    if (!preview) return;
    preview.innerHTML = ta.value.trim()
      ? render(ta.value)
      : '<p class="hint">입력하면 여기에 표시됩니다.</p>';
  }
  ta.addEventListener("input", refresh);

  async function load() {
    log.clear();
    if (!token()) {
      setLocked("토큰을 입력하면 현재 내용을 불러옵니다.");
      log.say("토큰을 먼저 입력하세요.", "error");
      $("auth-panel").open = true;
      return;
    }
    if (stateEl) stateEl.textContent = "불러오는 중…";
    try {
      const f = await getFile(path);
      ta.value = f.text;
      sha = f.sha;
      setReady();
      refresh();
      log.say("불러왔습니다.", "ok");
    } catch (err) {
      setLocked("불러오지 못해 편집이 잠겨 있습니다. 다시 불러오기를 눌러 주세요.");
      log.say(`불러오지 못했습니다: ${err.message}`, "error");
    }
  }

  async function save() {
    log.clear();
    if (!token()) { log.say("토큰을 먼저 입력하세요.", "error"); $("auth-panel").open = true; return; }
    if (!loaded) { log.say("현재 내용을 불러온 뒤에 저장할 수 있습니다.", "error"); return; }
    if (!ta.value.trim()) { log.say("내용이 비어 있습니다.", "error"); return; }
    const btn = saveBtn;
    btn.disabled = true;
    try {
      if (!sha) { try { sha = (await getFile(path)).sha; } catch { sha = null; } }
      log.say(`저장하는 중… (${path})`);
      await putFile(path, ta.value, `Update ${label}`, sha);
      sha = (await getFile(path)).sha;
      log.say("저장했습니다. 빌드·배포까지 1분쯤 걸립니다.", "ok");
    } catch (err) {
      log.say(`실패: ${err.message}`, "error");
    } finally {
      btn.disabled = false;
    }
  }

  $(`${id}-load`).addEventListener("click", load);
  $(`${id}-save`).addEventListener("click", save);
  return { load, isLoaded: () => loaded };
}

/* 요즘 — build/build.mjs 의 renderNow 와 같은 규칙 */
function renderNow(src) {
  const [listPart, notePart = ""] = String(src).replace(/\r\n?/g, "\n").split(/^\s*---\s*$/m);
  const items = listPart.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const idx = line.indexOf(":");
    const label = idx === -1 ? "" : line.slice(0, idx).trim();
    const text = idx === -1 ? line : line.slice(idx + 1).trim();
    return `<li><span>${escapeHtml(label)}</span> ${escapeHtml(text)}</li>`;
  });
  let html = `<ul class="now-list">${items.join("")}</ul>`;
  if (notePart.trim()) html += `<p class="now-note">${escapeHtml(notePart.trim())}</p>`;
  return html;
}

const sections = {
  intro: fileSection({ id: "intro", path: "content/intro.md", label: "intro", render: renderMarkdown }),
  now: fileSection({ id: "now", path: "content/now.md", label: "now", render: renderNow }),
  links: fileSection({ id: "links", path: "content/links.md", label: "links", render: null })
};

/* ============================================================
   탭 · 토큰
   ============================================================ */
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const name = btn.dataset.tab;
    document.querySelectorAll(".tab").forEach((b) => {
      const on = b === btn;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    ["posts", "intro", "now", "links"].forEach((n) => { $(`pane-${n}`).hidden = n !== name; });
    if (sections[name] && !sections[name].isLoaded() && token()) sections[name].load();
  });
});

function rememberToken() {
  try {
    if ($("remember").checked && token()) {
      localStorage.setItem(TOKEN_KEY, token());
      sessionStorage.removeItem(TOKEN_KEY);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      // 체크를 풀면 탭을 닫을 때까지만 유지합니다.
      if (token()) sessionStorage.setItem(TOKEN_KEY, token());
    }
  } catch { $("auth-state").textContent = "브라우저 저장소를 쓸 수 없습니다."; }
}
$("remember").addEventListener("change", rememberToken);
function activeTab() {
  return document.querySelector(".tab.is-active")?.dataset.tab || "posts";
}

// 자격 증명이 생긴 직후에 공통으로 하는 일.
function afterAuth() {
  loadPostList();
  // 토큰을 넣기 전에 열어둔 탭이 빈 채로 남지 않도록 함께 불러옵니다.
  const tab = activeTab();
  if (sections[tab] && !sections[tab].isLoaded()) sections[tab].load();
}

$("token").addEventListener("change", () => {
  rememberToken();
  afterAuth();
});
$("forget").addEventListener("click", () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* 무시 */ }
  $("token").value = "";
  $("remember").checked = false;
  setLoggedIn(false);
  $("auth-state").textContent = "저장된 자격 증명을 지웠습니다.";
});

/* ============================================================
   GitHub 로그인 (OAuth)

   정적 사이트라 client secret 을 둘 수 없어서, code → token 교환만
   oauth/worker.js 가 대신합니다. 토큰은 postMessage 로만 건네받습니다.
   ============================================================ */
const OAUTH_BASE = (CFG.oauth || "").replace(/\/$/, "");

function setLoggedIn(on) {
  if (!OAUTH_BASE) return;
  $("oauth-login").hidden = on;
  $("oauth-logout").hidden = !on;
  $("manual-box").hidden = on;
  $("oauth-hint").textContent = on
    ? "GitHub 계정으로 로그인되어 있습니다."
    : "팝업이 열립니다. 차단되면 주소창 옆의 팝업 허용을 눌러 주세요.";
  // 로그인 후에는 패널이 접히므로, 접힌 상태에서도 상태와 로그아웃 위치를 알 수 있게 합니다.
  const summary = $("auth-summary");
  if (summary) summary.textContent = on ? "로그인됨 — 누르면 로그아웃" : "로그인";
}

function startOAuth() {
  const popup = window.open(
    `${OAUTH_BASE}/auth`, "github-oauth",
    "width=720,height=760,menubar=no,toolbar=no"
  );
  if (!popup) {
    $("auth-state").textContent = "팝업이 차단되었습니다. 허용한 뒤 다시 눌러 주세요.";
    return;
  }
  $("auth-state").textContent = "GitHub 인증 창을 기다리는 중…";

  function onMessage(event) {
    // 우리 Worker 가 보낸 메시지만 받습니다.
    if (event.origin !== OAUTH_BASE) return;
    if (!event.data || event.data.source !== "github-oauth") return;
    window.removeEventListener("message", onMessage);

    if (event.data.error) {
      $("auth-state").textContent = `로그인 실패: ${event.data.error}`;
      return;
    }
    $("token").value = event.data.token;
    rememberToken();
    setLoggedIn(true);
    $("auth-state").textContent = event.data.expiresIn
      ? `로그인되었습니다. ${Math.round(event.data.expiresIn / 3600)}시간 뒤 만료됩니다.`
      : "로그인되었습니다.";
    $("auth-panel").open = false;
    afterAuth();
  }
  window.addEventListener("message", onMessage);
}

if (OAUTH_BASE) {
  $("oauth-box").hidden = false;
  $("oauth-login").addEventListener("click", startOAuth);
  $("oauth-logout").addEventListener("click", () => $("forget").click());
} else {
  // 로그인 버튼이 없으면 토큰 입력이 유일한 방법이므로 접어 두지 않습니다.
  $("manual-box").open = true;
  $("manual-box").querySelector("summary").hidden = true;
}

/* ---- 초기 상태 ------------------------------------------- */
$("date").value = new Date().toISOString().slice(0, 10);
try {
  const stored = localStorage.getItem(TOKEN_KEY);
  const session = sessionStorage.getItem(TOKEN_KEY);
  if (stored || session) {
    $("token").value = stored || session;
    $("remember").checked = !!stored;
    $("auth-panel").open = false;
    setLoggedIn(true);
  } else {
    setLoggedIn(false);
  }
} catch { /* 접근 불가 시 무시 */ }

// 자격 증명이 이미 있을 때만 불러옵니다. 없으면 로그인 시점에 한 번만 돕니다.
if (token()) afterAuth();

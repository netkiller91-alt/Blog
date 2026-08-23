/* ============================================================
   마크다운(부분 지원) → HTML

   빌드 스크립트와 브라우저 관리 화면이 같은 모듈을 씁니다.
   미리보기와 실제 출력이 갈라지지 않게 하려는 목적이라,
   렌더링 규칙은 반드시 이 파일 한 곳에서만 고치세요.

   지원: ## 제목 / **굵게** / *강조* / `코드` / ```블록```
        - 목록 / 1. 목록 / > 인용 / [링크](주소) / ![대체](이미지) / ---
   입력은 항상 이스케이프되므로 원시 HTML은 통과하지 않습니다.
   ============================================================ */

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeUrl(href) {
  return /^(https?:|mailto:|\/|\.|#)/.test(href) ? href : "#";
}

export function inline(text) {
  return text
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    // 이미지가 링크보다 먼저 처리돼야 ![]() 가 링크로 먹히지 않습니다.
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) =>
      `<img src="${safeUrl(src)}" alt="${alt}" loading="lazy" />`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      const url = safeUrl(href);
      const ext = /^https?:/.test(url) ? ' target="_blank" rel="noopener noreferrer"' : "";
      return `<a href="${url}"${ext}>${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

export function renderMarkdown(src) {
  const lines = escapeHtml(src).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;

  const isBlockStart = (l) =>
    /^```/.test(l) || /^(#{2,4})\s/.test(l) || /^\s*[-*]\s+/.test(l) ||
    /^\s*\d+\.\s+/.test(l) || /^\s*&gt;\s?/.test(l) || /^\s*(---|\*\*\*)\s*$/.test(l);

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const lang = line.slice(3).trim().replace(/[^\w-]/g, "");
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code${lang ? ` class="lang-${lang}"` : ""}>${buf.join("\n")}</code></pre>`);
      continue;
    }

    if (/^\s*(---|\*\*\*)\s*$/.test(line)) { out.push("<hr />"); i++; continue; }

    const h = line.match(/^(#{2,4})\s+(.*)$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      }
      out.push("<ul>" + items.map((t) => `<li>${inline(t)}</li>`).join("") + "</ul>");
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i++].replace(/^\s*\d+\.\s+/, ""));
      }
      out.push("<ol>" + items.map((t) => `<li>${inline(t)}</li>`).join("") + "</ol>");
      continue;
    }

    if (/^\s*&gt;\s?/.test(line)) {
      const q = [];
      while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) {
        q.push(lines[i++].replace(/^\s*&gt;\s?/, ""));
      }
      out.push(`<blockquote>${inline(q.join(" "))}</blockquote>`);
      continue;
    }

    if (/^\s*$/.test(line)) { i++; continue; }

    const para = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlockStart(lines[i])) {
      para.push(lines[i++]);
    }
    // 이미지 한 줄짜리 문단은 <p>로 감싸지 않고 그림으로 세웁니다.
    const joined = para.join(" ");
    if (para.length === 1 && /^!\[[^\]]*\]\([^)\s]+\)$/.test(para[0].trim())) {
      out.push(`<figure>${inline(para[0].trim())}</figure>`);
    } else {
      out.push(`<p>${inline(joined)}</p>`);
    }
  }
  return out.join("\n");
}

/* ---- front matter --------------------------------------- */
/* --- 로 감싼 `키: 값` 블록을 읽습니다. 값은 모두 문자열입니다. */
export function parseFrontMatter(text) {
  const src = String(text).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: src.trim() };

  const meta = {};
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (key) meta[key] = line.slice(idx + 1).trim();
  }
  return { meta, body: src.slice(m[0].length).trim() };
}

export function buildFrontMatter(meta, body) {
  const keys = Object.keys(meta).filter((k) => meta[k] !== undefined && meta[k] !== "");
  const head = keys.map((k) => `${k}: ${String(meta[k]).replace(/\n/g, " ")}`).join("\n");
  return `---\n${head}\n---\n\n${String(body).trim()}\n`;
}

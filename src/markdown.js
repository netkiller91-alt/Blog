/* 마크다운 → HTML (읽기 모드와 AI 답변이 같이 씁니다)

   입력은 외부 웹페이지와 모델 출력이라 믿을 수 없습니다.
   그래서 먼저 전부 이스케이프하고, 허용한 문법만 태그로 바꿉니다.
   원시 HTML은 절대 통과하지 않습니다. */

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// 이스케이프된 상태의 주소를 받아 안전한 절대 주소로 바꿉니다.
// http(s)·mailto 외의 스킴(javascript: 등)은 버립니다.
export function resolveUrl(raw, base) {
  const href = raw.replace(/&amp;/g, "&");
  try {
    const u = base ? new URL(href, base) : new URL(href);
    if (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "mailto:") {
      return escapeHtml(u.href);
    }
  } catch { /* 해석할 수 없는 주소 */ }
  return null;
}

function inline(text, base) {
  const codes = [];
  // 코드 안의 문자는 다른 규칙이 건드리지 않도록 잠시 빼 둡니다.
  let s = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(`<code>${c}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (m, alt, src) => {
      const url = resolveUrl(src, base);
      return url && !url.startsWith("mailto:")
        ? `<img src="${url}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer" />`
        : alt;
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (m, label, href) => {
      const url = resolveUrl(href, base);
      return url ? `<a href="${url}" data-nav>${label}</a>` : label;
    })
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?'"])/g, (m, pre, href) => {
      const url = resolveUrl(href);
      return url ? `${pre}<a href="${url}" data-nav>${href}</a>` : m;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
}

function splitRow(line) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

export function renderMarkdown(src, base) {
  const lines = escapeHtml(src).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let para = [];
  let list = null; // { tag, items }

  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "), base)}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) {
      out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i, base)}</li>`).join("")}</${list.tag}>`);
    }
    list = null;
  };
  const flush = () => { flushPara(); flushList(); };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = line.match(/^\s*(```|~~~)\s*([\w+-]*)/);
    if (fence) {
      flush();
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      const lang = fence[2] ? ` data-lang="${fence[2]}"` : "";
      out.push(`<pre${lang}><code>${body.join("\n")}</code></pre>`);
      continue;
    }

    if (!line.trim()) { flush(); continue; }

    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      flush();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2], base)}</h${level}>`);
      continue;
    }

    // 표: 다음 줄이 |---|---| 형태일 때만 표로 봅니다.
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      flush();
      const head = splitRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(splitRow(lines[i++]));
      i--;
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c, base)}</th>`).join("")}</tr></thead>` +
        `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, base)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`,
      );
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push("<hr />"); continue; }

    if (line.startsWith("&gt;")) {
      flush();
      const quote = [];
      while (i < lines.length && lines[i].startsWith("&gt;")) quote.push(lines[i++].replace(/^&gt;\s?/, ""));
      i--;
      out.push(`<blockquote>${renderMarkdownEscaped(quote, base)}</blockquote>`);
      continue;
    }

    const ul = line.match(/^\s*[-*+]\s+(.*)/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (ul || ol) {
      flushPara();
      const tag = ul ? "ul" : "ol";
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push((ul || ol)[1]);
      continue;
    }

    // 목록 항목이 다음 줄로 이어지는 경우
    if (list && /^\s{2,}/.test(line)) {
      list.items[list.items.length - 1] += " " + line.trim();
      continue;
    }

    flushList();
    para.push(line.trim());
  }
  flush();
  return out.join("\n");
}

// 인용문 안쪽은 이미 이스케이프된 줄이라 다시 이스케이프하지 않도록 따로 처리합니다.
function renderMarkdownEscaped(lines, base) {
  const raw = lines.join("\n")
    .replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  return renderMarkdown(raw, base);
}

#!/usr/bin/env node
/* ============================================================
   정적 사이트 생성기 — content/ 를 읽어 _site/ 를 만듭니다.

   의존성 없이 Node 내장 모듈만 씁니다.
   원본은 언제나 content/ 이고 _site/ 는 버려도 되는 산출물입니다.
   그래서 관리 화면은 마크다운만 커밋하면 되고, HTML을 짜깁기하지 않습니다.

     node build/build.mjs
   ============================================================ */

import { readFile, writeFile, mkdir, readdir, rm, cp, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderMarkdown, escapeHtml, parseFrontMatter } from "../assets/js/markdown.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = path.join(ROOT, "content");
const OUT = path.join(ROOT, "_site");

const readIf = async (p, fallback = "") =>
  existsSync(p) ? await readFile(p, "utf8") : fallback;

/* ---- 사이트 설정 ---------------------------------------- */
const site = JSON.parse(await readFile(path.join(CONTENT, "site.json"), "utf8"));

/* ---- 공통 조각 ------------------------------------------ */
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%E2%9C%8E%3C/text%3E%3C/svg%3E";

function adConfig(depth) {
  const a = site.adsense || {};
  const slots = a.slots || {};
  return `<script>
  window.SITE_CONFIG = {
    adsenseClient: ${JSON.stringify(a.client || "")},
    adSlots: {
      top: ${JSON.stringify(slots.top || "")},
      inFeed: ${JSON.stringify(slots.inFeed || "")},
      footer: ${JSON.stringify(slots.footer || "")}
    }
  };
</script>
<script defer src="${depth}assets/js/main.js"></script>`;
}

function head({ title, description, url, depth, type = "website", extraJsonLd, noindex }) {
  return `<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
${noindex ? '<meta name="robots" content="noindex, nofollow" />\n' : ""}<link rel="canonical" href="${url}" />

<meta property="og:type" content="${type}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${url}" />
<meta property="og:locale" content="ko_KR" />
<meta name="twitter:card" content="summary" />

<link rel="alternate" type="application/rss+xml" title="${escapeHtml(site.title)}" href="${depth}feed.xml" />
<link rel="icon" href="${FAVICON}" />
<link rel="stylesheet" href="${depth}assets/css/style.css" />

${adConfig(depth)}
${extraJsonLd ? `<script type="application/ld+json">\n${JSON.stringify(extraJsonLd, null, 2)}\n</script>` : ""}`;
}

function masthead(depth) {
  return `  <header class="masthead">
    <a class="site-title" href="${depth}index.html">${escapeHtml(site.title)}</a>
    <nav aria-label="주요 메뉴">
      <a href="${depth}index.html#writing">글</a>
      <a href="${depth}index.html#links">읽을거리</a>
      <a href="${depth}index.html#about">요즘</a>
      <a href="${depth}feed.xml">RSS</a>
      <button class="theme-toggle" type="button" aria-label="테마 전환" title="테마 전환">
        <span class="theme-icon" aria-hidden="true">◐</span>
      </button>
    </nav>
  </header>`;
}

function colophon(depth) {
  return `  <footer class="colophon">
    <p>© <span data-year>${new Date().getFullYear()}</span> ${escapeHtml(site.title)}</p>
    <p>
      <a href="${depth}feed.xml">RSS</a> ·
      <a href="mailto:${site.email}">메일</a> ·
      <a href="${depth}privacy.html">개인정보처리방침</a> ·
      <a href="${depth}admin/">글쓰기</a>
    </p>
  </footer>`;
}

function page({ title, description, url, depth, body, type, extraJsonLd, noindex }) {
  return `<!DOCTYPE html>
<html lang="${site.lang}" data-theme="auto">
<head>
${head({ title, description, url, depth, type, extraJsonLd, noindex })}
</head>
<body>
<a class="skip-link" href="#main">본문으로 건너뛰기</a>

<div class="shell">

${masthead(depth)}

  <main id="main">
${body}
  </main>

${colophon(depth)}

</div>
</body>
</html>
`;
}

/* ---- 글 읽기 -------------------------------------------- */
async function loadPosts() {
  const dir = path.join(CONTENT, "posts");
  if (!existsSync(dir)) return [];
  // README.md 는 사람이 읽는 안내문이라 글로 취급하지 않습니다.
  const files = (await readdir(dir))
    .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md");

  const posts = [];
  for (const file of files) {
    const raw = await readFile(path.join(dir, file), "utf8");
    const { meta, body } = parseFrontMatter(raw);
    if (String(meta.draft).toLowerCase() === "true") continue;

    const slug = meta.slug || file.replace(/\.md$/, "");
    posts.push({
      slug,
      title: meta.title || slug,
      date: meta.date || file.slice(0, 10),
      summary: meta.summary || "",
      cover: meta.cover || "",
      tags: (meta.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
      body,
      html: renderMarkdown(body),
      url: `${site.url}/posts/${encodeURIComponent(slug)}.html`
    });
  }
  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return posts;
}

/* ---- 읽을거리 ------------------------------------------- */
function parseLinks(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const parts = l.split("|").map((s) => s.trim());
      const [date, source, title, url] = parts;
      return { date, source, title, url, note: parts.slice(4).join(" | ") };
    })
    .filter((x) => x.date && x.title)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* ---- 홈 ------------------------------------------------- */
function postListItem(p) {
  const md = p.date.slice(5).replace("-", ".");
  return `        <li>
          <time datetime="${p.date}">${md}</time>
          <div>
            <a href="./posts/${encodeURIComponent(p.slug)}.html">${escapeHtml(p.title)}</a>
${p.summary ? `            <p>${escapeHtml(p.summary)}</p>\n` : ""}          </div>
        </li>`;
}

function linkItem(l) {
  const md = l.date.slice(5).replace("-", ".");
  return `        <li>
          <time datetime="${l.date}">${md}</time>
          <div>
            <a href="${l.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.title)}</a>
            <p>${l.source ? `<span class="source">${escapeHtml(l.source)}</span> ` : ""}${escapeHtml(l.note)}</p>
          </div>
        </li>`;
}

function renderHome({ intro, now, posts, links }) {
  const introLinks = (site.links || [])
    .map((l) => `        <a href="${l.href}"${l.me ? ' rel="me"' : ""}>${escapeHtml(l.label)}</a> ·`)
    .join("\n");

  // 인피드 광고는 글이 넉넉할 때만 중간에 끼웁니다.
  const postItems = posts.map(postListItem);
  if (postItems.length >= 4) {
    postItems.splice(3, 0,
      '        <li class="ad-row"><div class="ad-slot" data-ad-position="inFeed"></div></li>');
  }

  const body = `    <section class="intro">
${renderMarkdown(intro).split("\n").map((l) => "      " + l).join("\n")}
      <p class="intro-links">
${introLinks}
        <a href="mailto:${site.email}">메일</a> ·
        <a href="./feed.xml">RSS</a>
      </p>
    </section>

    <div class="ad-slot" data-ad-position="top"></div>

    <section id="writing">
      <h2 class="section-label">글</h2>
${posts.length
    ? `      <ul class="post-list">\n${postItems.join("\n")}\n      </ul>`
    : `      <p class="empty-note">아직 발행한 글이 없습니다. <a href="./admin/">첫 글을 써보세요</a>.</p>`}
    </section>

    <section id="links">
      <h2 class="section-label">읽을거리</h2>
      <p class="section-note">밖에서 읽은 것들. 제목을 누르면 원문으로 갑니다.</p>
      <ul class="post-list">
${links.map(linkItem).join("\n")}
      </ul>
    </section>

    <section id="about" class="now">
      <h2 class="section-label">요즘</h2>
${renderNow(now).split("\n").map((l) => "  " + l).join("\n")}
    </section>

    <div class="ad-slot" data-ad-position="footer"></div>`;

  return page({
    title: site.title,
    description: site.description,
    url: site.url + "/",
    depth: "./",
    body,
    extraJsonLd: {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: site.title,
      description: site.shortDescription || site.description,
      inLanguage: `${site.lang}-KR`,
      url: site.url + "/"
    }
  });
}

/* ---- 요즘 ----------------------------------------------- */
export function renderNow(src) {
  const [listPart, notePart = ""] = String(src).replace(/\r\n?/g, "\n").split(/^\s*---\s*$/m);
  const rows = listPart.split("\n").map((l) => l.trim()).filter(Boolean);
  const note = notePart.trim();

  const items = rows.map((line) => {
    const idx = line.indexOf(":");
    const label = idx === -1 ? "" : line.slice(0, idx).trim();
    const text = idx === -1 ? line : line.slice(idx + 1).trim();
    return `    <li><span>${escapeHtml(label)}</span> ${escapeHtml(text)}</li>`;
  });

  let html = `  <ul class="now-list">\n${items.join("\n")}\n  </ul>`;
  if (note) html += `\n  <p class="now-note">${escapeHtml(note)}</p>`;
  return html;
}

/* ---- 글 페이지 ------------------------------------------ */
function renderPost(p, prev, next) {
  const d = p.date.split("-");
  const nav = [];
  if (next) nav.push(`<a href="./${encodeURIComponent(next.slug)}.html">← ${escapeHtml(next.title)}</a>`);
  if (prev) nav.push(`<a href="./${encodeURIComponent(prev.slug)}.html">${escapeHtml(prev.title)} →</a>`);

  const body = `    <article class="prose post-body">
      <p class="post-date"><time datetime="${p.date}">${d[0]}년 ${Number(d[1])}월 ${Number(d[2])}일</time>${
    p.tags.length ? ` · ${p.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(" ")}` : ""
  }</p>
      <h1>${escapeHtml(p.title)}</h1>
${p.summary ? `      <p class="post-lede">${escapeHtml(p.summary)}</p>\n` : ""}${
    p.cover ? `      <figure><img src="${p.cover}" alt="" loading="lazy" /></figure>\n` : ""
  }
      <div class="ad-slot" data-ad-position="top"></div>

${p.html}

      <div class="ad-slot" data-ad-position="footer"></div>
${nav.length ? `      <nav class="post-nav">${nav.join("")}</nav>\n` : ""}      <p class="back"><a href="../index.html#writing">← 글 목록으로</a></p>
    </article>`;

  return page({
    title: `${p.title} — ${site.title}`,
    description: p.summary || site.shortDescription,
    url: p.url,
    depth: "../",
    type: "article",
    body,
    extraJsonLd: {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: p.title,
      description: p.summary,
      datePublished: p.date,
      inLanguage: `${site.lang}-KR`,
      url: p.url
    }
  });
}

/* ---- 고정 페이지 ---------------------------------------- */
function renderPage(meta, body) {
  const slug = meta.slug || "page";
  const html = `    <article class="prose">
      <h1>${escapeHtml(meta.title)}</h1>
${meta.updated ? `      <p class="updated">최종 수정일: ${escapeHtml(meta.updated)}</p>\n` : ""}
${renderMarkdown(body)}

      <p class="back"><a href="./index.html">← 홈으로</a></p>
    </article>`;

  return {
    slug,
    html: page({
      title: `${meta.title} — ${site.title}`,
      description: meta.title,
      url: `${site.url}/${slug}.html`,
      depth: "./",
      body: html
    })
  };
}

/* ---- 피드 · 사이트맵 ------------------------------------ */
function renderFeed(posts) {
  const items = posts.slice(0, 20).map((p) => {
    const pub = new Date(`${p.date}T09:00:00+09:00`).toUTCString().replace("GMT", "+0000");
    return `    <item>
      <title>${escapeHtml(p.title)}</title>
      <link>${p.url}</link>
      <guid isPermaLink="true">${p.url}</guid>
      <pubDate>${pub}</pubDate>
      <description>${escapeHtml(p.summary)}</description>
    </item>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(site.title)}</title>
    <link>${site.url}/</link>
    <description>${escapeHtml(site.shortDescription || site.description)}</description>
    <language>${site.lang}</language>
    <atom:link href="${site.url}/feed.xml" rel="self" type="application/rss+xml" />
${items.join("\n")}
  </channel>
</rss>
`;
}

function renderSitemap(posts, pages) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${site.url}/`, lastmod: posts[0]?.date || today, freq: "weekly", pri: "1.0" },
    ...posts.map((p) => ({ loc: p.url, lastmod: p.date, freq: "monthly", pri: "0.8" })),
    ...pages.map((p) => ({ loc: `${site.url}/${p.slug}.html`, lastmod: today, freq: "yearly", pri: "0.3" }))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.pri}</priority>
  </url>`).join("\n")}
</urlset>
`;
}

/* ---- 빌드 ----------------------------------------------- */
async function build() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(path.join(OUT, "posts"), { recursive: true });

  const intro = await readIf(path.join(CONTENT, "intro.md"));
  const now = await readIf(path.join(CONTENT, "now.md"));
  const links = parseLinks(await readIf(path.join(CONTENT, "links.md")));
  const posts = await loadPosts();

  await writeFile(path.join(OUT, "index.html"), renderHome({ intro, now, posts, links }));

  for (let i = 0; i < posts.length; i++) {
    await writeFile(
      path.join(OUT, "posts", `${posts[i].slug}.html`),
      renderPost(posts[i], posts[i - 1], posts[i + 1])
    );
  }

  const pagesDir = path.join(CONTENT, "pages");
  const pages = [];
  if (existsSync(pagesDir)) {
    for (const file of (await readdir(pagesDir)).filter((f) => f.endsWith(".md"))) {
      const { meta, body } = parseFrontMatter(await readFile(path.join(pagesDir, file), "utf8"));
      const rendered = renderPage(meta, body);
      pages.push(rendered);
      await writeFile(path.join(OUT, `${rendered.slug}.html`), rendered.html);
    }
  }

  await writeFile(path.join(OUT, "feed.xml"), renderFeed(posts));
  await writeFile(path.join(OUT, "sitemap.xml"), renderSitemap(posts, pages));

  // 그대로 복사되는 것들
  await cp(path.join(ROOT, "assets"), path.join(OUT, "assets"), { recursive: true });
  await cp(path.join(ROOT, "admin"), path.join(OUT, "admin"), { recursive: true });

  // 관리 화면 설정은 site.json 한 곳에서만 관리합니다.
  const adminIndex = path.join(OUT, "admin", "index.html");
  const adminHtml = (await readFile(adminIndex, "utf8")).replace(
    /window\.ADMIN_CONFIG = \{[\s\S]*?\};/,
    `window.ADMIN_CONFIG = ${JSON.stringify({
      owner: site.repo?.owner || "netkiller91-alt",
      repo: site.repo?.name || "Blog",
      branch: site.repo?.branch || "main",
      oauth: site.admin?.oauth || ""
    }, null, 2)};`
  );
  await writeFile(adminIndex, adminHtml);
  if (existsSync(path.join(CONTENT, "media"))) {
    await cp(path.join(CONTENT, "media"), path.join(OUT, "content", "media"), { recursive: true });
  }
  for (const f of ["robots.txt", "ads.txt", "CNAME", ".nojekyll"]) {
    if (existsSync(path.join(ROOT, f))) await cp(path.join(ROOT, f), path.join(OUT, f));
  }

  console.log(`빌드 완료 → _site`);
  console.log(`  글 ${posts.length}편 · 고정 페이지 ${pages.length}개 · 읽을거리 ${links.length}건`);
  if (!posts.length) console.log("  (아직 글이 없습니다. admin/ 에서 첫 글을 쓰세요.)");
}

await build();

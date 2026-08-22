/* ============================================================
   AI Engineering Notes — 브라우저 글쓰기 도구

   GitHub Contents API로 저장소에 직접 커밋합니다.
     1) posts/<slug>.html 생성
     2) index.html 의 POSTS 마커 뒤에 목록 항목 삽입
     3) feed.xml 의 FEED 마커 뒤에 <item> 삽입

   토큰은 이 파일 밖으로 나가지 않으며 api.github.com 으로만 전송됩니다.
   이 페이지에는 광고·분석 스크립트를 싣지 않습니다.
   ============================================================ */
(function () {
  "use strict";

  var CFG = window.EDITOR_CONFIG || {};
  var API = "https://api.github.com";
  var TOKEN_KEY = "aien-gh-token";
  var THEME_KEY = "aien-theme";

  var $ = function (id) { return document.getElementById(id); };

  /* ---- 테마 (홈과 동일 동작) ---------------------------- */
  function storedTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t === "light" || t === "dark" ? t : "auto");
    var icon = document.querySelector(".theme-icon");
    if (icon) icon.textContent = t === "dark" ? "☾" : t === "light" ? "☀" : "◐";
  }
  applyTheme(storedTheme() || "auto");
  var themeToggle = document.querySelector(".theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var order = ["auto", "light", "dark"];
      var next = order[(order.indexOf(storedTheme() || "auto") + 1) % order.length];
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* 무시 */ }
      applyTheme(next);
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-year]"), function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  /* ---- UTF-8 안전 base64 -------------------------------- */
  function b64encode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64decode(b64) {
    var bin = atob(String(b64).replace(/\s/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ---- 마크다운(부분 지원) → HTML ------------------------ */
  function inline(text) {
    return text
      .replace(/`([^`]+)`/g, function (_, c) { return "<code>" + c + "</code>"; })
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, label, href) {
        var safe = /^(https?:|mailto:|\.|\/|#)/.test(href) ? href : "#";
        var ext = /^https?:/.test(safe) ? ' target="_blank" rel="noopener noreferrer"' : "";
        return '<a href="' + safe + '"' + ext + ">" + label + "</a>";
      })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  }

  function renderMarkdown(src) {
    var lines = escapeHtml(src).replace(/\r\n?/g, "\n").split("\n");
    var out = [];
    var i = 0;

    function flushList(tag, items) {
      out.push("<" + tag + ">");
      items.forEach(function (it) { out.push("<li>" + inline(it) + "</li>"); });
      out.push("</" + tag + ">");
    }

    while (i < lines.length) {
      var line = lines[i];

      // 코드 블록 — 내부는 인라인 처리하지 않습니다.
      if (/^```/.test(line)) {
        var lang = line.slice(3).trim();
        var buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push('<pre><code' + (lang ? ' class="lang-' + lang.replace(/[^\w-]/g, "") + '"' : "") +
          ">" + buf.join("\n") + "</code></pre>");
        continue;
      }

      if (/^\s*(---|\*\*\*)\s*$/.test(line)) { out.push("<hr />"); i++; continue; }

      var h = line.match(/^(#{2,4})\s+(.*)$/);
      if (h) {
        var lvl = h[1].length;
        out.push("<h" + lvl + ">" + inline(h[2]) + "</h" + lvl + ">");
        i++; continue;
      }

      if (/^\s*[-*]\s+/.test(line)) {
        var ul = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          ul.push(lines[i].replace(/^\s*[-*]\s+/, "")); i++;
        }
        flushList("ul", ul); continue;
      }

      if (/^\s*\d+\.\s+/.test(line)) {
        var ol = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          ol.push(lines[i].replace(/^\s*\d+\.\s+/, "")); i++;
        }
        flushList("ol", ol); continue;
      }

      if (/^\s*&gt;\s?/.test(line)) {
        var qs = [];
        while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) {
          qs.push(lines[i].replace(/^\s*&gt;\s?/, "")); i++;
        }
        out.push("<blockquote>" + inline(qs.join(" ")) + "</blockquote>");
        continue;
      }

      if (/^\s*$/.test(line)) { i++; continue; }

      // 문단 — 빈 줄이 나올 때까지 이어 붙입니다.
      var para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) &&
             !/^```/.test(lines[i]) && !/^(#{2,4})\s/.test(lines[i]) &&
             !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) &&
             !/^\s*&gt;\s?/.test(lines[i]) && !/^\s*(---|\*\*\*)\s*$/.test(lines[i])) {
        para.push(lines[i]); i++;
      }
      out.push("<p>" + inline(para.join(" ")) + "</p>");
    }
    return out.join("\n");
  }

  /* ---- 입력값 ------------------------------------------- */
  function slugify(text) {
    return String(text).trim().toLowerCase()
      .replace(/[^\w가-힣\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
  }

  function readForm() {
    var date = $("date").value || new Date().toISOString().slice(0, 10);
    var title = $("title").value.trim();
    var slug = $("slug").value.trim() || (date + "-" + slugify(title));
    return {
      title: title,
      date: date,
      slug: slug,
      summary: $("summary").value.trim(),
      body: $("body").value
    };
  }

  /* ---- 글 페이지 템플릿 ---------------------------------- */
  function postPage(p, html) {
    var url = CFG.siteUrl + "/posts/" + encodeURIComponent(p.slug) + ".html";
    var d = p.date.split("-");
    return '<!DOCTYPE html>\n' +
'<html lang="ko" data-theme="auto">\n' +
'<head>\n' +
'<meta charset="utf-8" />\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
'<title>' + escapeHtml(p.title) + ' — AI Engineering Notes</title>\n' +
'<meta name="description" content="' + escapeHtml(p.summary) + '" />\n' +
'<link rel="canonical" href="' + url + '" />\n' +
'<meta property="og:type" content="article" />\n' +
'<meta property="og:title" content="' + escapeHtml(p.title) + '" />\n' +
'<meta property="og:description" content="' + escapeHtml(p.summary) + '" />\n' +
'<meta property="og:url" content="' + url + '" />\n' +
'<meta property="og:locale" content="ko_KR" />\n' +
'<meta name="twitter:card" content="summary" />\n' +
'<link rel="alternate" type="application/rss+xml" title="AI Engineering Notes" href="../feed.xml" />\n' +
"<link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%E2%9C%8E%3C/text%3E%3C/svg%3E\" />\n" +
'<link rel="stylesheet" href="../assets/css/style.css" />\n' +
'<script>\n' +
'  window.SITE_CONFIG = {\n' +
'    adsenseClient: "",\n' +
'    adSlots: { top: "", inFeed: "", footer: "" }\n' +
'  };\n' +
'<\/script>\n' +
'<script defer src="../assets/js/main.js"><\/script>\n' +
'<script type="application/ld+json">\n' +
JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  headline: p.title,
  description: p.summary,
  datePublished: p.date,
  inLanguage: "ko-KR",
  url: url
}, null, 2) + '\n' +
'<\/script>\n' +
'</head>\n' +
'<body>\n' +
'<a class="skip-link" href="#main">본문으로 건너뛰기</a>\n' +
'\n' +
'<div class="shell">\n' +
'\n' +
'  <header class="masthead">\n' +
'    <a class="site-title" href="../index.html">AI Engineering Notes</a>\n' +
'    <nav aria-label="주요 메뉴">\n' +
'      <a href="../index.html#writing">글</a>\n' +
'      <a href="../index.html#about">요즘</a>\n' +
'      <a href="../feed.xml">RSS</a>\n' +
'      <button class="theme-toggle" type="button" aria-label="테마 전환" title="테마 전환">\n' +
'        <span class="theme-icon" aria-hidden="true">◐</span>\n' +
'      </button>\n' +
'    </nav>\n' +
'  </header>\n' +
'\n' +
'  <main id="main">\n' +
'    <article class="prose post-body">\n' +
'      <p class="post-date"><time datetime="' + p.date + '">' +
        d[0] + '년 ' + Number(d[1]) + '월 ' + Number(d[2]) + '일</time></p>\n' +
'      <h1>' + escapeHtml(p.title) + '</h1>\n' +
(p.summary ? '      <p class="post-lede">' + escapeHtml(p.summary) + '</p>\n' : '') +
'\n' +
'      <div class="ad-slot" data-ad-position="top"></div>\n' +
'\n' +
html + '\n' +
'\n' +
'      <div class="ad-slot" data-ad-position="footer"></div>\n' +
'      <p class="back"><a href="../index.html#writing">← 글 목록으로</a></p>\n' +
'    </article>\n' +
'  </main>\n' +
'\n' +
'  <footer class="colophon">\n' +
'    <p>© <span data-year>2026</span> AI Engineering Notes</p>\n' +
'    <p>\n' +
'      <a href="../feed.xml">RSS</a> ·\n' +
'      <a href="mailto:netkiller91@gmail.com">메일</a> ·\n' +
'      <a href="../privacy.html">개인정보처리방침</a>\n' +
'    </p>\n' +
'  </footer>\n' +
'\n' +
'</div>\n' +
'</body>\n' +
'</html>\n';
  }

  function listItem(p) {
    var md = p.date.slice(5).replace("-", ".");
    return '        <li>\n' +
'          <time datetime="' + p.date + '">' + md + '</time>\n' +
'          <div>\n' +
'            <a href="./posts/' + encodeURIComponent(p.slug) + '.html">' + escapeHtml(p.title) + '</a>\n' +
(p.summary ? '            <p>' + escapeHtml(p.summary) + '</p>\n' : '') +
'          </div>\n' +
'        </li>';
  }

  function feedItem(p) {
    var url = CFG.siteUrl + "/posts/" + encodeURIComponent(p.slug) + ".html";
    var pub = new Date(p.date + "T09:00:00+09:00").toUTCString().replace("GMT", "+0000");
    return '    <item>\n' +
'      <title>' + escapeHtml(p.title) + '</title>\n' +
'      <link>' + url + '</link>\n' +
'      <guid isPermaLink="true">' + url + '</guid>\n' +
'      <pubDate>' + pub + '</pubDate>\n' +
'      <description>' + escapeHtml(p.summary) + '</description>\n' +
'    </item>';
  }

  /* ---- GitHub API --------------------------------------- */
  function token() { return $("token").value.trim(); }

  function api(path, options) {
    options = options || {};
    return fetch(API + path, {
      method: options.method || "GET",
      headers: {
        "Authorization": "Bearer " + token(),
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var msg = data && data.message ? data.message : res.status + " " + res.statusText;
          throw new Error(msg);
        }
        return data;
      });
    });
  }

  function contentsPath(p) {
    return "/repos/" + CFG.owner + "/" + CFG.repo + "/contents/" + p;
  }

  function getFile(path) {
    return api(contentsPath(path) + "?ref=" + encodeURIComponent(CFG.branch))
      .then(function (d) { return { text: b64decode(d.content), sha: d.sha }; });
  }

  function putFile(path, text, message, sha) {
    var body = { message: message, content: b64encode(text), branch: CFG.branch };
    if (sha) body.sha = sha;
    return api(contentsPath(path), { method: "PUT", body: body });
  }

  /* ---- 로그 --------------------------------------------- */
  var logEl = $("log");
  function log(msg, state) {
    var li = document.createElement("li");
    li.textContent = msg;
    if (state) li.className = "is-" + state;
    logEl.appendChild(li);
    li.scrollIntoView({ block: "nearest" });
    return li;
  }

  /* ---- 발행 --------------------------------------------- */
  function publish() {
    var p = readForm();
    logEl.innerHTML = "";

    if (!token()) { log("토큰을 먼저 입력하세요.", "error"); $("auth-panel").open = true; return; }
    if (!p.title) { log("제목이 비어 있습니다.", "error"); return; }
    if (!p.body.trim()) { log("본문이 비어 있습니다.", "error"); return; }
    if (!p.slug) { log("주소(slug)를 만들 수 없습니다. 직접 입력해 주세요.", "error"); return; }

    var btn = $("publish");
    btn.disabled = true;

    var postPath = "posts/" + p.slug + ".html";
    var html = renderMarkdown(p.body);

    log("① 글 파일을 만드는 중… (" + postPath + ")");

    // 같은 slug가 이미 있으면 덮어쓰기 위해 sha가 필요합니다.
    getFile(postPath).then(
      function (f) { return f.sha; },
      function () { return null; }
    ).then(function (sha) {
      return putFile(postPath, postPage(p, html),
        (sha ? "Update post: " : "Add post: ") + p.title, sha);
    }).then(function () {
      log("① 완료", "ok");
      log("② 홈 목록을 갱신하는 중…");
      return getFile("index.html");
    }).then(function (f) {
      var marker = "<!-- POSTS:START -->";
      if (f.text.indexOf(marker) === -1) throw new Error("index.html에서 POSTS:START 마커를 찾지 못했습니다.");
      if (f.text.indexOf('./posts/' + encodeURIComponent(p.slug) + '.html') !== -1) {
        log("② 이미 목록에 있어 건너뜁니다.", "ok");
        return null;
      }
      var next = f.text.replace(marker, marker + "\n" + listItem(p));
      return putFile("index.html", next, "Link post from home: " + p.title, f.sha);
    }).then(function (r) {
      if (r) log("② 완료", "ok");
      log("③ RSS를 갱신하는 중…");
      return getFile("feed.xml");
    }).then(function (f) {
      var marker = "<!-- FEED:START -->";
      if (f.text.indexOf(marker) === -1) throw new Error("feed.xml에서 FEED:START 마커를 찾지 못했습니다.");
      var url = CFG.siteUrl + "/posts/" + encodeURIComponent(p.slug) + ".html";
      if (f.text.indexOf("<link>" + url + "</link>") !== -1) {
        log("③ 이미 피드에 있어 건너뜁니다.", "ok");
        return null;
      }
      var next = f.text.replace(marker, marker + "\n" + feedItem(p));
      return putFile("feed.xml", next, "Add post to feed: " + p.title, f.sha);
    }).then(function (r) {
      if (r) log("③ 완료", "ok");
      log("발행했습니다. 배포까지 1분쯤 걸립니다.", "ok");
      var li = log("");
      var a = document.createElement("a");
      a.href = CFG.siteUrl + "/posts/" + encodeURIComponent(p.slug) + ".html";
      a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = "글 열어보기 →";
      li.appendChild(a);
    }).catch(function (err) {
      log("실패: " + err.message, "error");
      log("아무것도 커밋되지 않았거나 일부만 반영됐을 수 있습니다. 저장소 커밋 목록을 확인하세요.");
    }).then(function () {
      btn.disabled = false;
    });
  }

  /* ---- 섹션 편집 (인사말 / 요즘) ------------------------- */

  // "라벨: 내용" 줄들 + (--- 뒤) 설명 한 줄 → 요즘 섹션 HTML
  function renderNow(src) {
    var parts = String(src).replace(/\r\n?/g, "\n").split(/^\s*---\s*$/m);
    var rows = parts[0].split("\n").filter(function (l) { return l.trim(); });
    var note = (parts[1] || "").trim();

    var items = rows.map(function (line) {
      var idx = line.indexOf(":");
      if (idx === -1) {
        return "        <li><span></span> " + inline(escapeHtml(line.trim())) + "</li>";
      }
      return "        <li><span>" + escapeHtml(line.slice(0, idx).trim()) + "</span> " +
        inline(escapeHtml(line.slice(idx + 1).trim())) + "</li>";
    });

    var html = '      <ul class="now-list">\n' + items.join("\n") + "\n      </ul>";
    if (note) html += '\n      <p class="now-note">' + inline(escapeHtml(note)) + "</p>";
    return html;
  }

  // 마커 사이 구간만 통째로 교체합니다.
  function replaceBetween(text, name, replacement) {
    var start = "<!-- " + name + ":START -->";
    var end = "<!-- " + name + ":END -->";
    var a = text.indexOf(start);
    var b = text.indexOf(end);
    if (a === -1 || b === -1 || b < a) {
      throw new Error("index.html에서 " + name + " 마커를 찾지 못했습니다.");
    }
    return text.slice(0, a + start.length) + "\n" + replacement + "\n" + text.slice(b);
  }

  // 섹션 편집기 하나를 구성합니다.
  function section(opts) {
    var ta = $(opts.id + "-body");
    var previewEl = $(opts.id + "-preview");
    var logEl2 = $(opts.id + "-log");

    function say(msg, state) {
      var li = document.createElement("li");
      li.textContent = msg;
      if (state) li.className = "is-" + state;
      logEl2.appendChild(li);
      return li;
    }

    function refresh() {
      previewEl.innerHTML = ta.value.trim()
        ? opts.render(ta.value)
        : '<p class="hint">불러오거나 입력하면 여기에 표시됩니다.</p>';
    }
    ta.addEventListener("input", refresh);

    function load() {
      logEl2.innerHTML = "";
      if (!token()) { say("토큰을 먼저 입력하세요.", "error"); $("auth-panel").open = true; return; }
      say("불러오는 중…");
      getFile(opts.path).then(function (f) {
        ta.value = f.text;
        refresh();
        logEl2.innerHTML = "";
        say("불러왔습니다.", "ok");
      }).catch(function (err) {
        say("불러오지 못했습니다: " + err.message, "error");
      });
    }

    function save() {
      logEl2.innerHTML = "";
      if (!token()) { say("토큰을 먼저 입력하세요.", "error"); $("auth-panel").open = true; return; }
      if (!ta.value.trim()) { say("내용이 비어 있습니다.", "error"); return; }

      var btn = $(opts.id + "-save");
      btn.disabled = true;
      var rendered = opts.render(ta.value);

      say("① 원본을 저장하는 중… (" + opts.path + ")");
      getFile(opts.path).then(
        function (f) { return f.sha; },
        function () { return null; }
      ).then(function (sha) {
        return putFile(opts.path, ta.value, "Update " + opts.label, sha);
      }).then(function () {
        say("① 완료", "ok");
        say("② 홈에 반영하는 중…");
        return getFile("index.html");
      }).then(function (f) {
        return putFile("index.html", replaceBetween(f.text, opts.marker, rendered),
          "Render " + opts.label + " into home", f.sha);
      }).then(function () {
        say("② 완료", "ok");
        say("저장했습니다. 배포까지 1분쯤 걸립니다.", "ok");
      }).catch(function (err) {
        say("실패: " + err.message, "error");
      }).then(function () {
        btn.disabled = false;
      });
    }

    $(opts.id + "-load").addEventListener("click", load);
    $(opts.id + "-save").addEventListener("click", save);
    return { load: load, loaded: function () { return !!ta.value.trim(); } };
  }

  var sections = {
    intro: section({
      id: "intro", path: "content/intro.md", marker: "INTRO",
      label: "intro", render: renderMarkdown
    }),
    now: section({
      id: "now", path: "content/now.md", marker: "NOW",
      label: "now", render: renderNow
    })
  };

  /* ---- 탭 ----------------------------------------------- */
  Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (btn) {
    btn.addEventListener("click", function () {
      var name = btn.dataset.tab;
      Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (b) {
        var on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      ["post", "intro", "now"].forEach(function (n) {
        $("pane-" + n).hidden = n !== name;
      });
      // 처음 열 때 현재 내용을 자동으로 불러옵니다.
      if (sections[name] && !sections[name].loaded() && token()) sections[name].load();
    });
  });

  /* ---- 이벤트 ------------------------------------------- */
  var preview = $("preview");
  function refreshPreview() {
    var body = $("body").value;
    preview.innerHTML = body.trim()
      ? renderMarkdown(body)
      : '<p class="hint">본문을 입력하면 여기에 표시됩니다.</p>';
  }

  $("body").addEventListener("input", refreshPreview);

  $("title").addEventListener("input", function () {
    if (!$("slug").dataset.touched) {
      var date = $("date").value || new Date().toISOString().slice(0, 10);
      $("slug").value = $("title").value.trim() ? date + "-" + slugify($("title").value) : "";
    }
  });
  $("slug").addEventListener("input", function () { $("slug").dataset.touched = "1"; });

  $("publish").addEventListener("click", publish);

  $("download").addEventListener("click", function () {
    var p = readForm();
    if (!p.title || !p.body.trim()) { log("제목과 본문을 먼저 입력하세요.", "error"); return; }
    var blob = new Blob([postPage(p, renderMarkdown(p.body))], { type: "text/html;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = p.slug + ".html";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  $("remember").addEventListener("change", function () {
    try {
      if (this.checked && token()) localStorage.setItem(TOKEN_KEY, token());
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { log("브라우저 저장소를 쓸 수 없습니다.", "error"); }
  });

  $("token").addEventListener("change", function () {
    if ($("remember").checked) {
      try { localStorage.setItem(TOKEN_KEY, token()); } catch (e) { /* 무시 */ }
    }
  });

  $("forget").addEventListener("click", function () {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* 무시 */ }
    $("token").value = "";
    $("remember").checked = false;
    log("저장된 토큰을 지웠습니다.", "ok");
  });

  /* ---- 초기 상태 ---------------------------------------- */
  $("date").value = new Date().toISOString().slice(0, 10);
  try {
    var saved = localStorage.getItem(TOKEN_KEY);
    if (saved) {
      $("token").value = saved;
      $("remember").checked = true;
      $("auth-panel").open = false;
    }
  } catch (e) { /* 접근 불가 시 무시 */ }
})();

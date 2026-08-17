/* ============================================================
   AI Engineering Notes
   - 테마 전환 (시스템 / 라이트 / 다크)
   - 구독 폼 유효성 검사
   - Google AdSense 로딩 (window.SITE_CONFIG 기반)
   ============================================================ */
(function () {
  "use strict";

  var CONFIG = window.SITE_CONFIG || {};

  /* ---- 1. 테마 ------------------------------------------ */
  var THEME_KEY = "aien-theme"; // "light" | "dark" | "auto"
  var root = document.documentElement;

  function storedTheme() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (e) {
      return null; // 프라이빗 모드 등에서 접근 불가
    }
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme === "light" || theme === "dark" ? theme : "auto");
    var icon = document.querySelector(".theme-icon");
    if (icon) icon.textContent = theme === "dark" ? "☾" : theme === "light" ? "☀" : "◐";
  }

  applyTheme(storedTheme() || "auto");

  var themeToggle = document.querySelector(".theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var order = ["auto", "light", "dark"];
      var next = order[(order.indexOf(storedTheme() || "auto") + 1) % order.length];
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (e) {
        /* 저장 실패는 무시하고 현재 세션에만 적용 */
      }
      applyTheme(next);
      themeToggle.setAttribute(
        "title",
        next === "auto" ? "시스템 설정 따름" : next === "light" ? "라이트 모드" : "다크 모드"
      );
    });
  }

  /* ---- 2. 연도 자동 갱신 --------------------------------- */
  Array.prototype.forEach.call(document.querySelectorAll("[data-year]"), function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  /* ---- 3. 구독 폼 --------------------------------------- */
  var form = document.querySelector(".subscribe-form");
  var note = document.querySelector(".form-note");

  if (form && note) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var input = form.querySelector("input[type='email']");
      var value = (input.value || "").trim();
      var valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

      note.classList.remove("is-error", "is-ok");
      if (!valid) {
        note.textContent = "이메일 주소를 다시 확인해 주세요.";
        note.classList.add("is-error");
        input.focus();
        return;
      }

      // 메일 서비스(Buttondown, ConvertKit 등)를 연결하기 전까지는
      // 폼 동작만 확인할 수 있도록 로컬에서 처리합니다.
      note.textContent = "신청되었습니다. 확인 메일을 보내드릴게요.";
      note.classList.add("is-ok");
      form.reset();
    });
  }

  /* ---- 4. Google AdSense -------------------------------- */
  var client = (CONFIG.adsenseClient || "").trim();
  var slots = CONFIG.adSlots || {};
  var slotEls = document.querySelectorAll(".ad-slot");

  var isPreview =
    /(^|\.)localhost$/.test(location.hostname) ||
    location.hostname === "127.0.0.1" ||
    location.protocol === "file:" ||
    location.search.indexOf("adpreview=1") !== -1;

  if (!client) {
    // 게시자 ID가 없으면 광고를 로드하지 않습니다.
    // 로컬/미리보기에서만 배치 확인용 자리표시자를 표시합니다.
    if (isPreview) {
      Array.prototype.forEach.call(slotEls, function (el) {
        el.setAttribute("data-placeholder", "");
        el.textContent = el.dataset.adPosition || "ad";
      });
    }
    return;
  }

  var script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src =
    "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" +
    encodeURIComponent(client);
  document.head.appendChild(script);

  Array.prototype.forEach.call(slotEls, function (el) {
    var position = el.dataset.adPosition;
    var slotId = (slots[position] || "").trim();
    if (!slotId) return; // 슬롯 ID가 비어 있는 영역은 건너뜁니다.

    var ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    ins.setAttribute("data-ad-client", client);
    ins.setAttribute("data-ad-slot", slotId);
    ins.setAttribute("data-ad-format", position === "inFeed" ? "fluid" : "auto");
    ins.setAttribute("data-full-width-responsive", "true");
    el.appendChild(ins);

    (window.adsbygoogle = window.adsbygoogle || []).push({});
  });
})();

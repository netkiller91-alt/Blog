/* 웹페이지 안에서 실행되는 함수들

   에이전트는 이 함수들로 페이지를 "봅니다". 각 함수는 toString() 으로
   페이지에 주입되므로 바깥 변수를 참조하면 안 됩니다(자기 안에서 완결).

   보이는 상호작용 요소마다 data-agent-id 를 붙이고, 모델은 그 번호로
   클릭·입력할 대상을 고릅니다. 번호는 같은 페이지 안에서 유지됩니다. */

export function snapshotPage(opts) {
  const maxText = (opts && opts.maxText) || 12000;
  const maxElements = (opts && opts.maxElements) || 250;
  const root = document.documentElement;
  let seq = Number(root.dataset.agentSeq || 0);

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
  };
  const clean = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

  const selector = [
    "a[href]", "button", "input:not([type=hidden])", "textarea", "select", "summary",
    "[role=button]", "[role=link]", "[role=checkbox]", "[role=radio]", "[role=tab]",
    "[role=menuitem]", "[role=option]", "[role=switch]", "[role=combobox]", "[role=textbox]",
    "[contenteditable=''], [contenteditable=true]", "[onclick]", "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  const inView = [];
  const offView = [];
  for (const el of document.querySelectorAll(selector)) {
    if (!visible(el)) continue;
    // 링크 안의 버튼처럼 겹친 요소는 바깥 하나만 남깁니다.
    if (el.parentElement && el.parentElement.closest(selector) && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
      const outer = el.parentElement.closest(selector);
      if (visible(outer) && clean(outer.innerText, 200) === clean(el.innerText, 200)) continue;
    }
    if (!el.dataset.agentId) el.dataset.agentId = String(++seq);

    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role");
    const type = el.getAttribute("type");
    let kind = role || tag;
    if (tag === "input") kind = `input[${type || "text"}]`;
    if (tag === "a") kind = "link";

    const label = clean(
      el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || el.getAttribute("alt") ||
      (tag === "input" && /^(submit|button)$/.test(type || "") ? el.value : "") ||
      (el.querySelector && el.querySelector("img[alt]") ? el.querySelector("img[alt]").alt : ""),
      80,
    );
    const parts = [`[${el.dataset.agentId}]`, kind];
    if (label) parts.push(JSON.stringify(label));
    if (/^(input|textarea)$/.test(tag)) {
      if (el.placeholder) parts.push(`placeholder=${JSON.stringify(clean(el.placeholder, 60))}`);
      if (el.name) parts.push(`name=${el.name}`);
      if (type === "checkbox" || type === "radio") parts.push(el.checked ? "checked" : "unchecked");
      else if (type !== "password" && el.value) parts.push(`value=${JSON.stringify(clean(el.value, 60))}`);
    }
    if (tag === "select") {
      const opts2 = [...el.options].slice(0, 15).map((o) => clean(o.textContent, 30));
      parts.push(`selected=${JSON.stringify(clean(el.options[el.selectedIndex] && el.options[el.selectedIndex].textContent, 40))}`);
      parts.push(`options=${JSON.stringify(opts2)}`);
    }
    if (tag === "a") {
      const href = el.getAttribute("href") || "";
      if (href && !href.startsWith("javascript:")) parts.push(`→ ${clean(href, 90)}`);
    }
    if (el.disabled || el.getAttribute("aria-disabled") === "true") parts.push("(비활성)");

    const r = el.getBoundingClientRect();
    (r.bottom > 0 && r.top < innerHeight ? inView : offView).push(parts.join(" "));
  }
  root.dataset.agentSeq = String(seq);

  const elements = inView.concat(offView.map((l) => `${l} (화면 밖)`)).slice(0, maxElements);
  const text = clean(document.body ? document.body.innerText : "", maxText * 2)
    .slice(0, maxText);
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);

  return {
    url: location.href,
    title: document.title,
    scroll: maxScroll ? `${Math.round((scrollY / maxScroll) * 100)}% (위치 ${Math.round(scrollY)} / ${maxScroll}px)` : "스크롤 없음",
    elementCount: inView.length + offView.length,
    elements: elements.join("\n"),
    text,
    truncated: (document.body ? document.body.innerText.length : 0) > maxText,
  };
}

// 요소를 화면 가운데로 옮기고, 클릭할 좌표와 요소 정보를 돌려줍니다.
export function locateElement(id) {
  const el = document.querySelector(`[data-agent-id="${CSS.escape(String(id))}"]`);
  if (!el) return { error: `요소 [${id}]를 찾을 수 없습니다. 페이지가 바뀌었을 수 있으니 read_page로 다시 확인하세요.` };
  el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
  const r = el.getBoundingClientRect();
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const form = el.closest("form");
  return {
    x: Math.round(r.left + r.width / 2),
    y: Math.round(r.top + r.height / 2),
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute("type") || "",
    label: clean(el.getAttribute("aria-label") || el.innerText || el.value || el.getAttribute("title")),
    isSubmit: el.type === "submit" || (el.tagName === "BUTTON" && !!form && !el.getAttribute("type")),
    formAction: form ? form.getAttribute("action") || "" : "",
    disabled: !!el.disabled,
    editable: /^(INPUT|TEXTAREA)$/.test(el.tagName) || el.isContentEditable,
    password: el.getAttribute("type") === "password",
  };
}

// 입력칸에 초점을 주고 기존 값을 비웁니다. 실제 타이핑은 브라우저가 합니다.
export function focusForTyping(id) {
  const el = document.querySelector(`[data-agent-id="${CSS.escape(String(id))}"]`);
  if (!el) return { error: `요소 [${id}]를 찾을 수 없습니다.` };
  el.scrollIntoView({ block: "center", behavior: "instant" });
  el.focus();
  if (el.isContentEditable) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("delete");
  } else if ("value" in el) {
    // React 같은 프레임워크가 값 변경을 알아채도록 네이티브 setter 를 씁니다.
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    return { error: `요소 [${id}]는 입력할 수 있는 칸이 아닙니다.` };
  }
  return { ok: true, password: el.getAttribute("type") === "password" };
}

export function readValue(id) {
  const el = document.querySelector(`[data-agent-id="${CSS.escape(String(id))}"]`);
  if (!el) return null;
  return el.isContentEditable ? el.innerText : el.value;
}

export function selectOption(args) {
  const el = document.querySelector(`[data-agent-id="${CSS.escape(String(args.id))}"]`);
  if (!el || el.tagName !== "SELECT") return { error: `요소 [${args.id}]는 선택 목록이 아닙니다.` };
  const want = String(args.option).trim();
  const opt = [...el.options].find((o) => o.value === want || o.textContent.trim() === want) ||
    [...el.options].find((o) => o.textContent.trim().includes(want));
  if (!opt) return { error: `"${want}" 항목이 없습니다. 가능한 항목: ${[...el.options].map((o) => o.textContent.trim()).join(", ")}` };
  el.value = opt.value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true, selected: opt.textContent.trim() };
}

export function scrollPage(args) {
  const dir = args.direction === "up" ? -1 : 1;
  if (args.direction === "top") scrollTo(0, 0);
  else if (args.direction === "bottom") scrollTo(0, document.documentElement.scrollHeight);
  else scrollBy(0, dir * innerHeight * 0.8);
  const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
  return { y: Math.round(scrollY), max };
}

// 함수를 페이지에서 실행할 코드 문자열로 바꿉니다.
export function inject(fn, arg) {
  return `(${fn.toString()})(${JSON.stringify(arg ?? null)})`;
}

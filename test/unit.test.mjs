import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInput } from "../app/lib/omnibox.js";
import { renderMarkdown } from "../app/ui/markdown.js";
import { TOOL_DEFS, validateInput, isRiskyClick, normalizeUrl } from "../app/agent/tools.js";
import { systemPrompt } from "../app/agent/agent.js";

test("주소창: 주소와 할 일을 구분한다", () => {
  assert.deepEqual(parseInput("example.com"), { type: "url", url: "https://example.com/" });
  assert.equal(parseInput("https://a.com/x?y=1").type, "url");
  assert.equal(parseInput("내일 서울 날씨 알려줘").type, "ask");
  assert.equal(parseInput("node.js 설치 방법").type, "ask");
});

test("마크다운: 원시 HTML과 위험한 링크를 막는다", () => {
  const html = renderMarkdown("<img src=x onerror=alert(1)> [x](javascript:alert(1))");
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("javascript:"));
});

test("도구 정의: 모두 strict 이고 스키마가 닫혀 있다", () => {
  for (const t of TOOL_DEFS) {
    assert.equal(t.strict, true, t.name);
    assert.equal(t.input_schema.additionalProperties, false, t.name);
    assert.deepEqual([...t.input_schema.required].sort(), Object.keys(t.input_schema.properties).sort(), t.name);
  }
});

test("도구 입력 검증", () => {
  assert.equal(validateInput("click", { element_id: 3 }), null);
  assert.match(validateInput("click", { element_id: "3" }), /정수/);
  assert.match(validateInput("click", {}), /필수/);
  assert.match(validateInput("type_text", { element_id: 1, text: "a" }), /submit/);
  assert.match(validateInput("scroll", { direction: "left" }), /down/);
  assert.match(validateInput("click", { element_id: 1, extra: true }), /알 수 없는/);
  assert.match(validateInput("hack", {}), /알 수 없는 도구/);
});

test("위험해 보이는 클릭을 알아본다", () => {
  assert.equal(isRiskyClick({ label: "결제하기" }), true);
  assert.equal(isRiskyClick({ label: "Place order" }), true);
  assert.equal(isRiskyClick({ label: "메일 보내기" }), true);
  assert.equal(isRiskyClick({ label: "검색" }), false);
  assert.equal(isRiskyClick({ label: "Sending tips" }), false);
  assert.equal(isRiskyClick({ label: "", isSubmit: true, formAction: "/checkout/pay" }), true);
  assert.equal(isRiskyClick({ label: "", isSubmit: true, formAction: "/search" }), false);
});

test("주소 정리: http(s)만 허용", () => {
  assert.equal(normalizeUrl("naver.com"), "https://naver.com/");
  assert.equal(normalizeUrl("http://a.com/b"), "http://a.com/b");
  assert.throws(() => normalizeUrl("file:///etc/passwd"));
  assert.throws(() => normalizeUrl("javascript:alert(1)"));
});

test("시스템 프롬프트에 안전 규칙과 날짜가 들어간다", () => {
  const p = systemPrompt(new Date("2026-10-08T00:00:00Z"));
  assert.match(p, /confirm_action/);
  assert.match(p, /2026-10-08/);
});

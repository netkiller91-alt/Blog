import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInput } from "../src/omnibox.js";
import { renderMarkdown } from "../src/markdown.js";
import { parseReaderResponse } from "../src/reader.js";
import { collectSources } from "../src/ai.js";

test("주소창: 주소와 질문을 구분한다", () => {
  assert.deepEqual(parseInput("https://example.com/a?b=1"), { type: "url", url: "https://example.com/a?b=1" });
  assert.deepEqual(parseInput("example.com"), { type: "url", url: "https://example.com/" });
  assert.deepEqual(parseInput("news.ycombinator.com/item?id=1"), { type: "url", url: "https://news.ycombinator.com/item?id=1" });
  assert.equal(parseInput("localhost:3000").type, "url");
  assert.deepEqual(parseInput("RAG 가 뭐야?"), { type: "ask", query: "RAG 가 뭐야?" });
  assert.equal(parseInput("node.js 설치 방법").type, "ask");
  assert.equal(parseInput("   "), null);
});

test("마크다운: 원시 HTML과 위험한 링크를 막는다", () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1)) ![i](data:image/png;base64,AAA)');
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("javascript:"));
  assert.ok(!html.includes("data:image"));
});

test("마크다운: 상대 주소를 페이지 기준으로 푼다", () => {
  const html = renderMarkdown("[다음](/next) ![그림](img/a.png)", "https://example.com/blog/post");
  assert.ok(html.includes('href="https://example.com/next"'));
  assert.ok(html.includes('src="https://example.com/blog/img/a.png"'));
});

test("마크다운: 제목·목록·표·코드", () => {
  const html = renderMarkdown("## 제목\n\n- a\n- **b**\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\n```js\nconst a = 1 < 2;\n```");
  assert.ok(html.includes("<h2>제목</h2>"));
  assert.ok(html.includes("<ul><li>a</li><li><strong>b</strong></li></ul>"));
  assert.ok(html.includes("<td>1</td><td>2</td>"));
  assert.ok(html.includes('<pre data-lang="js"><code>const a = 1 &lt; 2;</code></pre>'));
});

test("리더 응답 머리말을 걷어낸다", () => {
  const page = parseReaderResponse("Title: 예시\n\nURL Source: https://example.com/\n\nMarkdown Content:\n# 본문\n내용", "https://example.com");
  assert.equal(page.title, "예시");
  assert.equal(page.url, "https://example.com/");
  assert.equal(page.markdown, "# 본문\n내용");
});

test("출처: 인용된 것을 앞에, 중복 없이", () => {
  const sources = collectSources([
    { type: "web_search_tool_result", content: [{ url: "https://a.com", title: "A" }, { url: "https://b.com", title: "B" }] },
    { type: "text", text: "…", citations: [{ url: "https://b.com", title: "B" }] },
  ]);
  assert.deepEqual(sources.map((s) => s.url), ["https://b.com", "https://a.com"]);
});

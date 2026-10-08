/* Claude 호출

   정적 사이트라 서버가 없으므로, 사용자가 넣은 API 키로 브라우저에서
   바로 Anthropic API를 부릅니다. 키는 이 브라우저 밖으로 나가지 않습니다
   (api.anthropic.com 으로 가는 요청 헤더에만 실립니다). */

import Anthropic from "@anthropic-ai/sdk";

export const MODELS = [
  { id: "claude-opus-5-5", label: "Opus 5.5 · 가장 똑똑함" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5 · 빠르고 균형" },
  { id: "claude-haiku-5-5", label: "Haiku 5.5 · 가장 빠르고 저렴" },
];
export const DEFAULT_MODEL = MODELS[0].id;

export const EFFORTS = [
  { id: "low", label: "빠르게" },
  { id: "medium", label: "보통" },
  { id: "high", label: "꼼꼼하게" },
];

const MAX_CONTINUATIONS = 5;

// 동적 필터링 웹 도구는 Haiku 5.5에서 지원되지 않아 기본 검색만 씁니다.
function toolsFor(model) {
  if (model.startsWith("claude-haiku")) {
    return [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
  }
  return [
    { type: "web_search_20260209", name: "web_search", max_uses: 5 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 },
  ];
}

// 안전 분류기가 요청을 거절하면 서버가 알맞은 모델로 다시 돌립니다.
// Haiku 5.5에는 서버 측 대체가 없습니다.
function fallbackParams(model) {
  if (model.startsWith("claude-haiku")) return {};
  return { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
}

export function createClient(apiKey) {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

export const BROWSER_SYSTEM = [
  "당신은 웹 브라우저에 내장된 AI 어시스턴트입니다.",
  "사용자가 보고 있는 페이지가 문서로 첨부되면 그 내용을 근거로 답하고, 페이지에 없는 내용은 없다고 말한 뒤 필요하면 웹 검색으로 보완하세요.",
  "검색 질문에는 웹 검색으로 최신 정보를 확인하고 출처를 밝히세요.",
  "사용자가 쓴 언어로 답하세요. 답은 핵심부터, 마크다운(제목, 목록, 표, 링크)으로 읽기 쉽게 정리하세요.",
].join("\n");

// 현재 페이지를 대화 첫 메시지에 문서로 붙입니다.
// 같은 탭에서 이어지는 질문은 이 앞부분이 그대로라 캐시가 재사용됩니다.
export function pageContextBlock(page) {
  return {
    type: "document",
    source: { type: "text", media_type: "text/plain", data: page.markdown.slice(0, 400_000) },
    title: page.title || page.url,
    context: `사용자가 지금 브라우저에서 보고 있는 페이지입니다. 주소: ${page.url}`,
    cache_control: { type: "ephemeral" },
  };
}

// 응답에서 출처(인용·검색 결과)를 모읍니다. 인용된 것을 앞에 둡니다.
export function collectSources(content) {
  const seen = new Map();
  const add = (url, title, cited) => {
    if (!url) return;
    const prev = seen.get(url);
    if (!prev) seen.set(url, { url, title: title || url, cited });
    else if (cited) prev.cited = true;
  };
  for (const block of content || []) {
    if (block.type === "text") {
      for (const c of block.citations || []) add(c.url, c.title, true);
    } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) add(r.url, r.title, false);
    }
  }
  return [...seen.values()].sort((a, b) => Number(b.cited) - Number(a.cited));
}

/**
 * 한 턴을 스트리밍으로 실행합니다.
 * messages 는 그대로 이어 붙입니다(되돌려 고치지 않음) — 응답의 content 전체를
 * 붙여야 생각 블록과 도구 사용 기록이 다음 턴에도 유효합니다.
 */
export async function runTurn({ client, model, effort, messages, onText, onTool, signal }) {
  const tools = toolsFor(model);
  const contents = [];

  for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: 16000,
        system: BROWSER_SYSTEM,
        messages,
        tools,
        output_config: { effort },
        ...fallbackParams(model),
      },
      { signal },
    );

    for await (const event of stream) {
      if (event.type === "content_block_start" && event.content_block.type === "server_tool_use") {
        onTool?.(event.content_block.name);
      } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        onText?.(event.delta.text);
      }
    }

    const message = await stream.finalMessage();
    messages.push({ role: "assistant", content: message.content });
    contents.push(...message.content);

    if (message.stop_reason === "refusal") {
      return { stop: "refusal", sources: collectSources(contents) };
    }
    // 서버 측 도구 반복이 한도에 닿으면 같은 대화를 다시 보내 이어 갑니다.
    if (message.stop_reason !== "pause_turn") {
      return { stop: message.stop_reason, sources: collectSources(contents) };
    }
  }
  return { stop: "pause_turn", sources: collectSources(contents) };
}

export function describeError(err) {
  if (err?.name === "AbortError" || err instanceof Anthropic.APIUserAbortError) return "중단했습니다.";
  if (err instanceof Anthropic.AuthenticationError) return "API 키가 올바르지 않습니다. 설정에서 다시 확인해 주세요.";
  if (err instanceof Anthropic.PermissionDeniedError) return "이 API 키로는 해당 모델이나 기능을 쓸 권한이 없습니다.";
  if (err instanceof Anthropic.RateLimitError) return "요청 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.";
  if (err instanceof Anthropic.BadRequestError) return `요청이 거부되었습니다: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Anthropic API에 연결하지 못했습니다. 네트워크를 확인해 주세요.";
  if (err instanceof Anthropic.APIError) return `API 오류 (${err.status ?? "?"}): ${err.message}`;
  return err?.message || String(err);
}

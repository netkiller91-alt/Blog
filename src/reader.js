/* 페이지 읽기

   브라우저는 다른 사이트의 HTML을 직접 가져올 수 없습니다(CORS).
   그래서 페이지를 마크다운으로 바꿔 주는 리더 프록시를 거칩니다.
   기본값은 r.jina.ai 이고, 설정에서 다른 주소로 바꿀 수 있습니다. */

export const DEFAULT_READER = "https://r.jina.ai/";

// r.jina.ai 응답 머리말: "Title: …", "URL Source: …", "Markdown Content:" 다음이 본문
export function parseReaderResponse(text, url) {
  const title = text.match(/^Title:\s*(.*)$/m)?.[1]?.trim() || "";
  const source = text.match(/^URL Source:\s*(.*)$/m)?.[1]?.trim() || url;
  const marker = text.indexOf("Markdown Content:");
  const markdown = (marker >= 0 ? text.slice(marker + "Markdown Content:".length) : text).trim();
  return { title, url: source, markdown };
}

export async function readPage(url, { reader = DEFAULT_READER, readerKey = "", signal } = {}) {
  const base = reader.endsWith("/") ? reader : `${reader}/`;
  const headers = { Accept: "text/plain" };
  if (readerKey) headers.Authorization = `Bearer ${readerKey}`;

  const res = await fetch(base + url, { headers, signal });
  if (!res.ok) {
    const hint = res.status === 429 ? " (리더 프록시 요청 한도 초과)" : "";
    throw new Error(`페이지를 불러오지 못했습니다: HTTP ${res.status}${hint}`);
  }
  const page = parseReaderResponse(await res.text(), url);
  if (!page.markdown) throw new Error("페이지에서 읽을 수 있는 본문을 찾지 못했습니다.");
  return page;
}

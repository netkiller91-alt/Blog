/* 주소창 입력 해석

   주소처럼 보이면 페이지로 이동하고, 아니면 AI에게 묻습니다.
   "example.com", "localhost:3000/a" 처럼 스킴이 없어도 주소로 봅니다. */

const DOMAIN = /^(localhost|(\d{1,3}\.){3}\d{1,3}|([a-z0-9-]+\.)+[a-z]{2,})(:\d+)?(\/\S*)?$/i;

export function parseInput(text) {
  const t = String(text || "").trim();
  if (!t) return null;

  if (/^https?:\/\/\S+$/i.test(t)) {
    try { return { type: "url", url: new URL(t).href }; } catch { /* 아래로 */ }
  }
  if (!/\s/.test(t) && DOMAIN.test(t)) {
    try { return { type: "url", url: new URL(`https://${t}`).href }; } catch { /* 아래로 */ }
  }
  return { type: "ask", query: t };
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

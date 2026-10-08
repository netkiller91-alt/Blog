// 페이지를 열지 못했을 때 main.js 가 ?error=…&url=… 로 이 화면을 띄웁니다.
const params = new URLSearchParams(location.search);
if (params.get("error")) {
  const p = document.getElementById("error");
  p.textContent = `페이지를 열 수 없습니다: ${params.get("url") || ""} (${params.get("error")})`;
  p.hidden = false;
  document.title = "열 수 없음";
}

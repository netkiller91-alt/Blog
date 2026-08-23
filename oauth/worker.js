/* ============================================================
   GitHub 로그인용 Cloudflare Worker

   정적 사이트는 client secret 을 안전하게 보관할 수 없어서,
   OAuth 의 "code → access token" 교환만 이 작은 서버가 대신합니다.
   토큰은 여기에 저장되지 않고 그대로 브라우저로 전달됩니다.

   필요한 환경 변수 (wrangler secret / 대시보드에서 설정)
     GITHUB_CLIENT_ID      OAuth App 또는 GitHub App 의 Client ID
     GITHUB_CLIENT_SECRET  같은 앱의 Client Secret   ← secret 으로 저장
     SITE_ORIGIN           관리 화면 오리진 (예: https://demotetoprod.com)
     OAUTH_SCOPE           (선택) 기본값 public_repo. GitHub App 은 무시됩니다.

   엔드포인트
     GET /auth      GitHub 인증 화면으로 보냅니다
     GET /callback  code 를 토큰으로 바꿔 창을 연 쪽에 postMessage 합니다
   ============================================================ */

const STATE_COOKIE = "gh_oauth_state";

function randomState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

// 창을 연 쪽으로 결과를 넘기고 닫는 작은 페이지.
// 토큰이 주소창에 남지 않도록 postMessage 로만 전달합니다.
function closingPage(origin, payload) {
  const body = JSON.stringify(payload);
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8" /><title>GitHub 로그인</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 2rem; color: #1c1b18; background: #fbfaf7; }
  @media (prefers-color-scheme: dark) { body { background: #14140f; color: #e8e4da; } }
</style></head>
<body>
<p id="msg">처리 중…</p>
<script>
  var payload = ${body};
  var target = ${JSON.stringify(origin)};
  try {
    if (window.opener) {
      window.opener.postMessage({ source: "github-oauth", ...payload }, target);
      document.getElementById("msg").textContent =
        payload.token ? "로그인되었습니다. 이 창은 곧 닫힙니다." : ("실패: " + payload.error);
      if (payload.token) setTimeout(function () { window.close(); }, 600);
    } else {
      document.getElementById("msg").textContent =
        "이 창을 연 페이지를 찾을 수 없습니다. 관리 화면에서 다시 시도해 주세요.";
    }
  } catch (e) {
    document.getElementById("msg").textContent = "실패: " + e.message;
  }
<\/script>
</body></html>`;
}

function html(content, status = 200, headers = {}) {
  return new Response(content, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const siteOrigin = env.SITE_ORIGIN;

    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !siteOrigin) {
      return html("<p>설정이 끝나지 않았습니다: GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET / SITE_ORIGIN</p>", 500);
    }

    /* ---- 1단계: GitHub 인증 화면으로 ---------------------- */
    if (url.pathname === "/auth") {
      const state = randomState();
      const authorize = new URL("https://github.com/login/oauth/authorize");
      authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
      authorize.searchParams.set("redirect_uri", `${url.origin}/callback`);
      authorize.searchParams.set("state", state);
      // OAuth App 에서만 의미가 있습니다. GitHub App 은 설치 권한을 따릅니다.
      authorize.searchParams.set("scope", env.OAUTH_SCOPE || "public_repo");

      return new Response(null, {
        status: 302,
        headers: {
          Location: authorize.toString(),
          // 콜백에서 CSRF 를 확인하려고 잠깐만 둡니다.
          "Set-Cookie": `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
        }
      });
    }

    /* ---- 2단계: code 를 토큰으로 ------------------------- */
    if (url.pathname === "/callback") {
      const clearCookie = { "Set-Cookie": `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` };

      const error = url.searchParams.get("error");
      if (error) {
        return html(closingPage(siteOrigin, { error: url.searchParams.get("error_description") || error }), 200, clearCookie);
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const expected = readCookie(request, STATE_COOKIE);

      if (!code) {
        return html(closingPage(siteOrigin, { error: "code 가 없습니다." }), 400, clearCookie);
      }
      if (!state || !expected || state !== expected) {
        // 위조된 콜백이거나 쿠키가 만료된 경우입니다.
        return html(closingPage(siteOrigin, { error: "state 가 일치하지 않습니다. 다시 시도해 주세요." }), 400, clearCookie);
      }

      let data;
      try {
        const res = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code,
            redirect_uri: `${url.origin}/callback`
          })
        });
        data = await res.json();
      } catch (e) {
        return html(closingPage(siteOrigin, { error: `토큰 교환 실패: ${e.message}` }), 502, clearCookie);
      }

      if (data.error || !data.access_token) {
        return html(closingPage(siteOrigin, { error: data.error_description || data.error || "토큰을 받지 못했습니다." }), 400, clearCookie);
      }

      return html(closingPage(siteOrigin, {
        token: data.access_token,
        expiresIn: data.expires_in || null
      }), 200, clearCookie);
    }

    return html("<p>GitHub 로그인용 엔드포인트입니다. /auth 로 시작하세요.</p>", 404);
  }
};

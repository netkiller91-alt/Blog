# GitHub 로그인 (OAuth) 설정

관리 화면에서 토큰을 직접 붙여넣는 대신 **“GitHub으로 로그인”** 버튼을 쓰기 위한
설정입니다. 정적 사이트는 client secret 을 안전하게 보관할 수 없어서,
`code → access token` 교환만 이 작은 Worker 가 대신합니다.

토큰은 Worker 에 저장되지 않고 브라우저로 곧장 전달됩니다.

## 1. GitHub 앱 만들기

두 가지 중 하나를 고르세요. **GitHub App 쪽이 권한이 훨씬 좁습니다.**

| | GitHub App (권장) | OAuth App |
| --- | --- | --- |
| 권한 범위 | **이 저장소 하나** | 내 **모든 공개 저장소** 쓰기 |
| 토큰 수명 | 기본 8시간 (재로그인 필요) | 만료 없음 |
| 설정 난이도 | 항목이 조금 더 많음 | 더 간단 |

Worker 코드는 둘 다 동일하게 동작합니다. Client ID / Secret 만 바꿔 넣으면 됩니다.

### GitHub App 으로 할 경우

Settings → Developer settings → **GitHub Apps** → New GitHub App

- **Homepage URL**: `https://demotetoprod.com`
- **Callback URL**: `https://<워커주소>/callback` — 2단계에서 정해집니다.
  일단 아무 값이나 넣고 나중에 고쳐도 됩니다.
- **Webhook**: Active 체크 해제
- **Permissions → Repository permissions → Contents: Read and write**
- **Where can this GitHub App be installed?**: Only on this account

만든 뒤 **Install App** 으로 `Blog` 저장소에만 설치하고,
**Client ID** 를 복사하고 **Generate a new client secret** 으로 secret 을 발급받으세요.

### OAuth App 으로 할 경우

Settings → Developer settings → **OAuth Apps** → New OAuth App

- **Authorization callback URL**: `https://<워커주소>/callback`
- Client ID 복사, **Generate a new client secret**

## 2. Worker 배포

```bash
cd oauth
npx wrangler login          # Cloudflare 계정 연결 (브라우저 열림)
npx wrangler deploy         # 배포 → https://blog-oauth.<계정>.workers.dev
```

배포 주소가 나오면 그 주소로 1단계의 **Callback URL** 을 고쳐 주세요
(`https://blog-oauth.<계정>.workers.dev/callback`).

값 설정:

```bash
npx wrangler secret put GITHUB_CLIENT_SECRET   # 붙여넣기 (화면에 안 보입니다)
npx wrangler secret put GITHUB_CLIENT_ID       # secret 으로 넣어도 됩니다
```

`GITHUB_CLIENT_ID` 는 공개돼도 무방하므로 `wrangler.toml` 의 `[vars]` 에 적어도 됩니다.
`SITE_ORIGIN` 은 이미 `wrangler.toml` 에 들어 있습니다.

> **GitHub App 을 쓰는 경우** `OAUTH_SCOPE` 는 무시됩니다. 권한은 설치할 때 준
> Contents: Read and write 를 따릅니다.

## 3. 관리 화면에 주소 알려주기

`content/site.json` 의 `admin.oauth` 에 Worker 주소를 넣습니다.

```json
"admin": {
  "oauth": "https://blog-oauth.<계정>.workers.dev"
}
```

비워 두면 로그인 버튼이 숨겨지고 토큰 직접 입력만 남습니다.
설정을 마치기 전에도 관리 화면은 그대로 동작합니다.

## 동작 방식

```
관리 화면 ──팝업──▶ /auth ──▶ GitHub 인증 화면
                                    │ 승인
                                    ▼
브라우저 ◀──postMessage── /callback ──▶ GitHub (code + secret → token)
```

- `state` 를 쿠키에 담아 콜백에서 검증합니다 (CSRF 방지)
- 토큰은 주소창에 남지 않도록 `postMessage` 로만 전달하고,
  수신 대상 오리진을 `SITE_ORIGIN` 으로 고정합니다
- Worker 는 토큰을 저장하지도, 로그로 남기지도 않습니다

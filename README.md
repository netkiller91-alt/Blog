# AI Engineering Notes — 개인 블로그

AI Engineering(RAG · 에이전트 · 평가 · 서빙)을 주제로 한 개인 블로그입니다.
원본은 `content/` 의 마크다운이고, 의존성 없는 생성기가 사이트를 만들어
GitHub Pages로 배포합니다. 글쓰기·사진 업로드는 사이트의 `/admin/` 에서 합니다.

## 구성

```
content/              ← 원본은 전부 여기에 있습니다
  site.json             사이트 제목·주소·프로필 링크·AdSense 설정
  intro.md              홈 인사말
  now.md                요즘 섹션
  links.md              읽을거리(외부 기사 링크)
  posts/*.md            글
  pages/*.md            고정 페이지 (개인정보처리방침 등)
  media/                올린 사진
build/build.mjs       정적 사이트 생성기 (의존성 없음)
admin/                브라우저 관리 화면 (noindex, 광고 없음)
assets/css/style.css  스타일
assets/js/main.js     테마 전환, AdSense 로더
assets/js/markdown.mjs 마크다운 렌더러 (빌드와 관리 화면이 공유)
_site/                빌드 산출물 — 커밋하지 않습니다
```

**`_site/` 안의 HTML은 손으로 고치지 마세요.** 빌드할 때마다 통째로 다시
만들어집니다. 고칠 것은 언제나 `content/` 입니다.

## 사이트에서 글쓰기

홈 푸터의 **글쓰기** 링크, 또는 <https://demotetoprod.com/admin/> 로 들어갑니다.

1. [Fine-grained 토큰](https://github.com/settings/personal-access-tokens/new)을
   발급합니다. Repository access는 **이 저장소 하나**,
   권한은 **Contents: Read and write** 만 주세요.
2. 토큰을 붙여넣으면 글 목록이 뜹니다.

| 탭 | 하는 일 |
| --- | --- |
| 글 | 목록에서 골라 수정, `+ 새 글`로 작성, 삭제 |
| 인사말 | `content/intro.md` |
| 요즘 | `content/now.md` |
| 읽을거리 | `content/links.md` |

저장하면 해당 마크다운 파일 **하나만** 커밋되고, GitHub Actions가
사이트 전체를 다시 빌드해 배포합니다. 보통 1분쯤 걸립니다.

인사말·요즘·읽을거리 탭은 **현재 내용을 불러오기 전까지 입력과 저장이 잠깁니다.**
빈 칸에 쓴 내용으로 기존 파일을 통째로 덮어쓰는 사고를 막기 위한 것이라,
잠겨 있다면 토큰을 넣거나 `다시 불러오기`를 누르면 풀립니다.

### 사진

본문 편집기에서 **사진 올리기** 버튼을 누르거나, 본문 영역에 파일을
끌어다 놓으면 `content/media/` 에 올라가고 커서 위치에
`![설명](/content/media/파일명)` 이 삽입됩니다. 한 장에 5MB까지입니다.

### 초안

`초안으로 두기`를 체크하면 파일에 `draft: true` 가 붙고 빌드에서 제외됩니다.
저장소에는 남지만 사이트에는 나오지 않습니다.

### 본문 문법

`##` 제목, `**굵게**`, `*강조*`(형광펜), `` `코드` ``, ``` 코드 블록,
`-`/`1.` 목록, `>` 인용, `[링크](주소)`, `![설명](이미지)`, `---` 구분선.
입력은 모두 이스케이프되므로 본문에 HTML을 직접 넣을 수는 없습니다.

### 토큰 취급

`admin/` 은 **광고·분석 스크립트를 싣지 않고** `noindex` 이며 `robots.txt`
에서도 제외됩니다. 토큰이 서드파티 스크립트와 같은 페이지에 있지 않게 하려는
설계이므로, **이 페이지에 AdSense 슬롯을 추가하지 마세요.**

토큰은 체크박스를 켠 경우에만 `localStorage` 에 저장되고 `api.github.com`
외에는 전송되지 않습니다. 공용 PC에서는 저장하지 마세요.

## 로컬에서 보기

```bash
node build/build.mjs
python3 -m http.server 8000 --directory _site
# http://localhost:8000
```

로컬(localhost) 또는 `?adpreview=1` 로 접속하면 광고 자리표시자가 표시됩니다.

## 배포 (GitHub Pages)

`main`에 푸시하면 `.github/workflows/pages.yml`이 `node build/build.mjs`
를 돌려 `_site/` 를 만들고 배포합니다. 외부 패키지를 설치하지 않아 20초쯤 걸립니다.

PR에서는 `build-check.yml`이 같은 빌드를 돌려 결과물이 제대로 나오는지
먼저 확인합니다. 배포가 빌드에 의존하므로, 깨진 빌드를 main에 올리기 전에
잡으려는 목적입니다.

- 공개 주소: <https://demotetoprod.com/>
- **최초 1회만** 저장소 Settings → Pages → Build and deployment →
  Source를 `GitHub Actions`로 설정해야 합니다. `GITHUB_TOKEN`에는 Pages
  사이트를 새로 생성할 권한이 없어서, 이 설정 없이 워크플로를 돌리면
  `Create Pages site failed: Resource not accessible by integration`으로
  실패합니다. 한 번 켜두면 이후로는 푸시만으로 배포됩니다.

### 커스텀 도메인

`demotetoprod.com`을 쓰도록 설정되어 있습니다 (저장소 루트의 `CNAME` 파일).
도메인 등록기관 DNS에 아래 레코드가 있어야 합니다.

| 타입 | 이름 | 값 |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `netkiller91-alt.github.io` |

DNS를 먼저 넣은 뒤 Settings → Pages에서 도메인을 확인하고
**Enforce HTTPS**를 켜세요. 인증서 발급에 수 분~1시간이 걸립니다.

DNS를 Cloudflare에서 관리하고 프록시(주황색 구름)를 켠다면,
SSL/TLS 암호화 모드를 `Automatic` 또는 `Full (strict)`로 두어야 합니다.
`Flexible`이면 Cloudflare가 오리진에 HTTP로 요청하고 GitHub이 HTTPS로
돌려보내면서 무한 리다이렉트(`ERR_TOO_MANY_REDIRECTS`)가 발생합니다.
인증서를 처음 발급받을 때는 프록시를 꺼 두어야 검증이 통과합니다.

## 남은 작업

- 직접 쓴 글이 아직 없습니다. AdSense 심사에는 실제 콘텐츠 분량이 필요합니다.
- 승인 후 `content/site.json` 의 `adsense.client` 와 `adsense.slots` 를 채우고
  `ads.txt` 주석을 해제하세요. 비어 있으면 광고 스크립트를 아예 로드하지 않습니다.

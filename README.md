# AI Engineering Notes — 개인 블로그

AI Engineering(RAG · 에이전트 · 평가 · 서빙)을 주제로 한 개인 블로그입니다.
빌드 도구 없이 동작하는 정적 HTML/CSS/JS라 GitHub Pages에 그대로 올릴 수 있고,
Google AdSense 연동 지점이 미리 준비되어 있습니다.

## 구성

```
index.html            홈 (인사 · 글 · 읽을거리 · 요즘)
editor.html           브라우저 편집 도구 (noindex, 광고 없음)
posts/                발행된 글 (editor.html이 생성)
content/intro.md      인사말 원본 (홈에 렌더링됨)
content/now.md        요즘 섹션 원본
privacy.html          개인정보처리방침 (AdSense 심사에 필요)
feed.xml              RSS 피드
assets/css/style.css  단일 칼럼 레이아웃, 라이트/다크
assets/js/main.js     테마 전환, AdSense 로더
assets/js/editor.js   글쓰기 도구 로직
ads.txt               AdSense 게시자 인증 파일 (승인 후 값 입력)
robots.txt            크롤러 정책 (Mediapartners-Google 허용)
sitemap.xml           사이트맵
CNAME                 커스텀 도메인 (demotetoprod.com)
.nojekyll             GitHub Pages의 Jekyll 처리 비활성화
```

## 디자인 방침

랜딩 페이지형 템플릿이 아니라 **읽으려고 만든 개인 블로그**에 맞췄습니다.

- 단일 칼럼(최대 40rem), 좌측 정렬. 히어로 배너·그라데이션·아이콘 카드 없음
- 글 목록은 타일이 아니라 날짜 목록
- **웹폰트를 쓰지 않습니다.** 시스템 서체로 즉시 렌더되고 외부 요청이 0건입니다
  (한글에 라틴용 자간을 주면 글자가 벌어지므로 자간은 최소로 둡니다)
- 색은 종이 느낌의 웜 그레이 한 벌. 본문 대비는 WCAG AA(4.5:1) 이상

색·간격을 바꾸려면 `assets/css/style.css` 최상단 `:root` 변수만 수정하면
라이트·다크에 함께 반영됩니다.

## 로컬에서 보기

```bash
python3 -m http.server 8000
# http://localhost:8000
```

로컬(localhost) 또는 `?adpreview=1`로 접속하면 광고 자리표시자가 표시되어
배치를 확인할 수 있습니다.

## Google AdSense 붙이기

1. [AdSense](https://adsense.google.com)에 사이트를 등록하고 승인을 받습니다.
2. `index.html` 상단의 `window.SITE_CONFIG`에 값을 채웁니다.

   ```js
   window.SITE_CONFIG = {
     adsenseClient: "ca-pub-1234567890123456",
     adSlots: {
       top: "1234567890",      // 글 목록 위
       inFeed: "2345678901",   // 글 목록 중간
       footer: "3456789012"    // 푸터 위
     }
   };
   ```

3. `ads.txt`의 주석을 해제하고 게시자 ID를 본인 것으로 교체합니다.
4. 사이트 주소는 `https://demotetoprod.com/`로 설정되어 있습니다.
   도메인을 다시 바꾸면 `CNAME`과 함께 `robots.txt`, `sitemap.xml`,
   `feed.xml`, `index.html`의 `canonical`/`og:url`도 같이 고쳐야 합니다.

`adsenseClient`가 비어 있으면 AdSense 스크립트를 아예 로드하지 않으므로,
승인 전에도 콘솔 오류 없이 사이트를 운영할 수 있습니다.
슬롯 ID가 비어 있는 영역은 건너뛰므로, 광고를 두 곳만 쓰고 싶다면 나머지는 빈 값으로 두면 됩니다.

> AdSense 심사에는 충분한 분량의 실제 콘텐츠가 필요합니다. 현재 글 목록은
> 레이아웃 확인용 예시이므로, 실제 글로 교체한 뒤 심사를 신청하세요.

## 사이트에서 바로 글쓰기

`/editor.html`에서 글을 쓰면 GitHub Contents API로 저장소에 직접 커밋되고,
배포 워크플로가 사이트에 반영합니다. 로컬 개발 환경이 없어도 됩니다.

1. [Fine-grained 토큰](https://github.com/settings/personal-access-tokens/new)을
   발급합니다. 권한은 **이 저장소 하나**에 **Contents: Read and write**만 주세요.
2. `/editor.html`에서 토큰을 붙여넣고 제목·요약·본문을 씁니다.
3. **발행하기**를 누르면 커밋 3건이 생성됩니다.
   - `posts/<slug>.html` 생성
   - `index.html`의 `<!-- POSTS:START -->` 뒤에 목록 항목 삽입
   - `feed.xml`의 `<!-- FEED:START -->` 뒤에 `<item>` 삽입

> **마커 주석을 지우지 마세요.** `POSTS:START` / `FEED:START` 주석이 삽입 지점이라
> 없어지면 발행이 실패합니다.

본문은 마크다운 일부를 지원합니다 — `##` 제목, `**굵게**`, `*기울임*`, `` `코드` ``,
```` ``` ```` 코드 블록, `-`/`1.` 목록, `>` 인용, `[링크](주소)`, `---` 구분선.
입력은 모두 이스케이프되므로 본문에 HTML을 직접 넣을 수는 없습니다.

### 인사말 · 요즘 수정

편집기 상단 탭에서 **인사말**과 **요즘**도 고칠 수 있습니다.
탭을 열면 현재 내용을 자동으로 불러오고, 저장하면 커밋 2건이 생깁니다.

| 탭 | 원본 | 홈의 반영 위치 |
| --- | --- | --- |
| 인사말 | `content/intro.md` | `<!-- INTRO:START -->` ~ `END` |
| 요즘 | `content/now.md` | `<!-- NOW:START -->` ~ `END` |

원본 마크다운을 저장소에 두고 홈에는 렌더링 결과만 넣기 때문에, 여러 번 고쳐도
HTML을 되돌려 읽는 과정이 없어 내용이 뭉개지지 않습니다.

**인사말**은 글 본문과 같은 마크다운을 씁니다. `*강조*`는 형광펜 표시가 됩니다.
링크 줄(GitHub · LinkedIn · 메일 · RSS)은 마커 바깥이라 편집 대상이 아닙니다.

**요즘**은 한 줄에 `라벨: 내용` 형식입니다. `---` 아래 한 줄은 목록 밑 작은 설명이 됩니다.

```
하는 일: 평가 파이프라인을 다시 짜는 중입니다.
보는 것: 긴 컨텍스트 관련 논문들.

---
2026년 8월 기준. 가끔 갱신합니다.
```

마커 사이 구간은 저장할 때마다 통째로 교체되므로, `index.html`에서 직접 고치지 말고
편집기나 `content/*.md`를 고치세요.

### 토큰 취급

`editor.html`은 **광고·분석 스크립트를 싣지 않고** `noindex`입니다.
토큰이 서드파티 스크립트에 노출되지 않도록 의도한 설계이므로,
이 페이지에 AdSense 슬롯을 추가하지 마세요.

토큰은 체크박스를 켠 경우에만 `localStorage`에 저장되고 `api.github.com` 외에는
전송되지 않습니다. 공용 PC에서는 저장하지 말고, 유출이 의심되면
GitHub 설정에서 토큰을 폐기하세요.

## 읽을거리 / 외부 링크

홈의 `읽을거리` 섹션은 **실제 기사로 나가는 외부 링크**로 채워져 있습니다
(2026년 8월, 각 항목에 출처 표시). 링크는 시간이 지나면 낡으므로 주기적으로
갈아 끼우거나, 직접 쓴 글로 교체하세요.

직접 쓴 글을 넣을 때는 `.source`를 빼고 `href`를 자기 글 주소로 바꾸면 됩니다.

```html
<li>
  <time datetime="2026-09-01">09.01</time>
  <div>
    <a href="./posts/글-주소.html">제목</a>
    <p>한 줄 요약.</p>
  </div>
</li>
```

연도별로 묶고 싶으면 목록 앞에 `<p class="year">2026</p>`을 넣으면 됩니다.
글이 쌓이면 Hugo·Astro 같은 정적 사이트 생성기로 옮기고,
`feed.xml`도 생성기가 만들도록 넘기는 편이 편합니다.

## 배포 (GitHub Pages)

`main`에 푸시하면 `.github/workflows/pages.yml`이 자동으로 배포합니다.
빌드 단계 없이 저장소 루트를 그대로 올립니다.

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
- 승인 후 `SITE_CONFIG`에 게시자 ID·슬롯 ID를 넣고 `ads.txt` 주석을 해제하세요.

# AI Engineering Notes — 개인 블로그

AI Engineering(RAG · 에이전트 · 평가 · 서빙)을 주제로 한 개인 블로그입니다.
빌드 도구 없이 동작하는 정적 HTML/CSS/JS라 GitHub Pages에 그대로 올릴 수 있고,
Google AdSense 연동 지점이 미리 준비되어 있습니다.

## 구성

```
index.html            홈 (인사 · 읽을거리 · 요즘)
privacy.html          개인정보처리방침 (AdSense 심사에 필요)
feed.xml              RSS 피드
assets/css/style.css  단일 칼럼 레이아웃, 라이트/다크
assets/js/main.js     테마 전환, AdSense 로더
ads.txt               AdSense 게시자 인증 파일 (승인 후 값 입력)
robots.txt            크롤러 정책 (Mediapartners-Google 허용)
sitemap.xml           사이트맵
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
4. 사이트 주소는 `https://netkiller91-alt.github.io/desktop-tutorial/`로 설정되어 있습니다.
   커스텀 도메인을 붙였다면 `robots.txt`, `sitemap.xml`, `feed.xml`,
   `index.html`의 `canonical`/`og:url`을 새 주소로 바꾸세요.

`adsenseClient`가 비어 있으면 AdSense 스크립트를 아예 로드하지 않으므로,
승인 전에도 콘솔 오류 없이 사이트를 운영할 수 있습니다.
슬롯 ID가 비어 있는 영역은 건너뛰므로, 광고를 두 곳만 쓰고 싶다면 나머지는 빈 값으로 두면 됩니다.

> AdSense 심사에는 충분한 분량의 실제 콘텐츠가 필요합니다. 현재 글 목록은
> 레이아웃 확인용 예시이므로, 실제 글로 교체한 뒤 심사를 신청하세요.

## 읽을거리 / 글 목록

홈의 `읽을거리` 섹션은 지금 **실제 기사로 나가는 외부 링크**로 채워져 있습니다
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

- 공개 주소: <https://netkiller91-alt.github.io/desktop-tutorial/>
- **최초 1회만** 저장소 Settings → Pages → Build and deployment →
  Source를 `GitHub Actions`로 설정해야 합니다. `GITHUB_TOKEN`에는 Pages
  사이트를 새로 생성할 권한이 없어서, 이 설정 없이 워크플로를 돌리면
  `Create Pages site failed: Resource not accessible by integration`으로
  실패합니다. 한 번 켜두면 이후로는 푸시만으로 배포됩니다.
- 커스텀 도메인을 쓰려면 저장소 루트에 `CNAME` 파일을 추가하고
  Settings → Pages에서 도메인을 등록하세요.

## 남은 연결 작업

- 인사말의 GitHub 링크를 실제 프로필 주소로 교체하세요.
- 인사말과 `요즘` 섹션 내용은 예시 문구입니다. 본인 이야기로 바꾸세요.

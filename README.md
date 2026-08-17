# AI Engineering Notes — 개인 블로그 랜딩 페이지

AI Engineering(RAG · 에이전트 · 평가 · 서빙)을 주제로 한 개인 블로그의 랜딩 페이지입니다.
빌드 도구 없이 동작하는 정적 HTML/CSS/JS로 만들어져 GitHub Pages에 바로 올릴 수 있고,
Google AdSense 연동 지점이 미리 준비되어 있습니다.

## 구성

```
index.html          랜딩 페이지 (히어로 · 주제 · 최신 글 · 소개 · 구독)
privacy.html        개인정보처리방침 (AdSense 심사에 필요)
assets/css/style.css  디자인 토큰 기반 스타일 (라이트/다크)
assets/js/main.js     테마 전환, 모바일 메뉴, 구독 폼, AdSense 로더
ads.txt             AdSense 게시자 인증 파일 (승인 후 값 입력)
robots.txt          크롤러 정책 (Mediapartners-Google 허용)
sitemap.xml         사이트맵
.nojekyll           GitHub Pages의 Jekyll 처리 비활성화
```

## 로컬에서 보기

```bash
python3 -m http.server 8000
# http://localhost:8000 접속
```

로컬(localhost) 또는 `?adpreview=1` 쿼리로 접속하면 광고 자리표시자가 표시되어
배치를 확인할 수 있습니다.

## Google AdSense 붙이기

1. [AdSense](https://adsense.google.com)에 사이트를 등록하고 승인을 받습니다.
2. `index.html` 상단의 `window.SITE_CONFIG`에 값을 채웁니다.

   ```js
   window.SITE_CONFIG = {
     adsenseClient: "ca-pub-1234567890123456",
     adSlots: {
       header: "1234567890",   // 본문 상단 디스플레이 광고
       inFeed: "2345678901",   // 글 목록 중간 인피드 광고
       footer: "3456789012"    // 푸터 위 디스플레이 광고
     }
   };
   ```

3. `ads.txt`의 주석을 해제하고 게시자 ID를 본인 것으로 교체합니다.
4. `robots.txt`, `sitemap.xml`, `index.html`의 `canonical`/`og:url`에 있는
   `https://example.com` 을 실제 도메인으로 바꿉니다.

`adsenseClient`가 비어 있으면 AdSense 스크립트를 아예 로드하지 않으므로,
승인 전에도 콘솔 오류 없이 사이트를 운영할 수 있습니다.

> AdSense 심사에는 충분한 분량의 실제 콘텐츠가 필요합니다. 현재 최신 글 목록은
> 레이아웃 확인용 예시이므로, 실제 글로 교체한 뒤 심사를 신청하세요.

## 배포 (GitHub Pages)

저장소 **Settings → Pages → Source**를 `Deploy from a branch`로 두고
배포할 브랜치와 `/ (root)`를 선택하면 됩니다.

## 커스터마이징

- **색상 / 간격**: `assets/css/style.css` 최상단의 CSS 변수(`:root`)만 바꾸면
  라이트·다크 테마에 함께 반영됩니다.
- **뉴스레터**: 현재 구독 폼은 클라이언트 검증까지만 수행합니다.
  Buttondown·ConvertKit 등의 폼 엔드포인트를 `assets/js/main.js`의 submit 핸들러에 연결하세요.

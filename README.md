# AI 브라우저

웹에서 바로 쓰는 AI 브라우저입니다. <https://demotetoprod.com>

- **주소를 넣으면** 광고와 군더더기를 걷어낸 읽기 모드로 페이지를 엽니다.
- **질문을 넣으면** Claude가 웹을 검색해 출처와 함께 답합니다.
- **옆 패널의 Claude**에게 지금 보는 페이지를 요약·번역·설명해 달라고 하거나 무엇이든 물을 수 있습니다.
- 탭, 뒤로/앞으로, 방문 기록이 있고, 열린 탭은 다음에 들어와도 그대로 남습니다.

## 쓰는 법

1. 오른쪽 위 ⚙ 에서 [Anthropic API 키](https://platform.claude.com/settings/keys)를 넣습니다.
   키는 이 브라우저에만 보관되고 `api.anthropic.com` 으로 가는 요청에만 쓰입니다.
   "이 브라우저에 저장"을 끄면 탭을 닫을 때 지워집니다.
2. 주소창에 주소(`example.com`)나 질문(`오늘 AI 뉴스 정리해줘`)을 넣고 Enter.

| 단축키 | 동작 |
| --- | --- |
| Ctrl/⌘ + L, Ctrl/⌘ + K | 주소창으로 |
| Ctrl/⌘ + J | Claude 패널 열기/닫기 |
| Alt + T / Alt + W | 새 탭 / 탭 닫기 |
| Alt + ← / → | 뒤로 / 앞으로 |
| 주소창에서 Ctrl/⌘ + Enter | 새 탭에서 열기 |
| 링크 Ctrl/⌘ 클릭, 가운데 클릭 | 백그라운드 탭에서 열기 |

`https://demotetoprod.com/?q=검색어` 로 들어오면 바로 새 탭에서 엽니다.
브라우저 주소창의 검색엔진으로도 등록할 수 있습니다(OpenSearch).

## 구조

정적 사이트라 서버가 없습니다. 두 가지 외부 서비스를 브라우저에서 직접 부릅니다.

- **페이지 읽기**: 브라우저는 다른 사이트의 HTML을 직접 가져올 수 없어서(CORS),
  페이지를 마크다운으로 바꿔 주는 리더 프록시(기본 `https://r.jina.ai/`)를 거칩니다.
  설정에서 다른 프록시나 키로 바꿀 수 있습니다. 읽기에 실패하면 "Claude가 대신 읽기"로
  Claude의 웹 가져오기 도구를 쓸 수 있습니다.
- **Claude**: 공식 SDK(`@anthropic-ai/sdk`)로 Messages API를 스트리밍 호출합니다.
  웹 검색·웹 가져오기 서버 도구를 켜 두었고, 안전 분류기가 요청을 거절하면 서버가
  알맞은 모델로 다시 돌리도록(`fallbacks: "default"`) 했습니다.
  보고 있는 페이지는 대화 첫 메시지에 문서로 붙이고 캐시해서, 같은 페이지에 대한
  이어지는 질문은 싸게 처리됩니다.

```
src/
  index.html     화면 뼈대
  styles.css     스타일 (라이트/다크 자동)
  main.js        탭·주소창·읽기 모드·대화 화면
  ai.js          Claude 호출 (모델, 도구, 스트리밍, 오류 문구)
  reader.js      리더 프록시로 페이지 읽기
  markdown.js    마크다운 → HTML (외부 입력은 전부 이스케이프)
  omnibox.js     주소창 입력이 주소인지 질문인지 판별
  store.js       설정·탭·기록 저장 (localStorage)
public/          그대로 복사되는 파일 (CNAME, robots.txt, opensearch.xml)
scripts/build.mjs  esbuild로 묶어 _site/ 생성
test/            단위 테스트
```

## 개발

```sh
npm install
npm test          # 단위 테스트
npm run dev       # 빌드 후 http://localhost:5173
npm run build     # _site/ 생성
```

`main` 에 머지되면 GitHub Actions가 빌드해 GitHub Pages로 배포합니다.
PR에서는 테스트와 빌드가 먼저 돕니다.

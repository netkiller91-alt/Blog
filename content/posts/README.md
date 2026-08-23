글은 이 디렉터리에 `<slug>.md` 로 저장됩니다.
사이트의 `/admin/` 에서 쓰면 자동으로 여기에 커밋됩니다.

```
---
title: 제목
date: 2026-09-01
slug: 2026-09-01-my-post
summary: 목록과 RSS에 쓰이는 한 줄 요약
tags: RAG, 평가
cover: /content/media/사진.png
draft: false
---

본문 마크다운.
```

`draft: true` 이면 빌드에서 제외됩니다. 이 README.md 는 `.md` 지만
front matter 가 없어 제목이 파일명으로 잡히므로, 빌드 대상에서 빼려면
지우지 말고 그대로 두세요 — `posts/README.md` 는 빌드가 건너뜁니다.

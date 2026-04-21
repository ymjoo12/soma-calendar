# 기여 가이드

소마 멘토링 시간표(Soma Calendar)에 관심을 가져주셔서 감사합니다. 이 문서는 버그 리포트, 기능 제안, 코드 변경을 제안하시는 분들을 위한 안내입니다. 한국어로 편하게 작성해주셔도 괜찮습니다.

## 🐛 이슈 제기

[GitHub Issues](https://github.com/ymjoo12/soma-calendar/issues)에 새 이슈를 열어주세요.

버그 리포트에는 다음 정보를 포함해주시면 확인이 훨씬 빨라집니다.

- 재현 경로 (어느 페이지에서 어떤 동작을 했는지)
- 브라우저 종류와 버전 (Chrome/Firefox/기타)
- 확장 프로그램 버전 (`manifest.json`의 `version` 혹은 팝업 화면의 버전 표시)
- 기대한 동작과 실제 동작
- 가능하다면 스크린샷 또는 콘솔 에러 메시지

## 🛠 개발 환경 준비

1. 저장소를 포크한 뒤 클론합니다.

   ```bash
   git clone https://github.com/<your-id>/soma-calendar.git
   cd soma-calendar
   ```

2. pre-commit 훅을 활성화합니다. 커밋 시 Prettier가 자동으로 실행되어 포매팅을 맞춰줍니다.

   ```bash
   git config core.hooksPath .githooks
   ```

3. 브라우저에 확장 프로그램을 로드합니다. 설치 방법은 [README.md의 수동 설치 방법](README.md#-수동-설치-방법)을 참고해주세요.

4. 소마 홈페이지에 로그인한 뒤, 확장이 매칭하는 페이지에서 동작을 확인합니다.
   - 접수 내역: `https://swmaestro.ai/sw/mypage/userAnswer/history.do?menuNo=200047`
   - 멘토링/특강 목록: `https://swmaestro.ai/sw/mypage/mentoLec/list.do?...`
   - 멘토링/특강 상세: `https://swmaestro.ai/sw/mypage/mentoLec/view.do?...`

## 🌿 브랜치 & 커밋

- 기능/수정 브랜치는 `main`에서 분기하고, PR의 base 브랜치도 `main`으로 지정해주세요.
- 브랜치 이름 예시: `feature/<간단한-설명>`, `fix/<버그-요약>`
- 커밋 메시지는 한국어/영어 모두 환영합니다. `feat:`, `fix:`, `refactor:` 같은 접두어를 사용하시면 변경 이력 파악이 쉬워집니다.
- `manifest.json`의 `version` 필드는 수정하지 말아주세요. 릴리스 시 유지보수자가 일괄로 관리합니다.

## 🎨 코드 스타일

- `.prettierrc`에 정의된 Prettier 3 설정을 그대로 따릅니다. (2칸 공백, 세미콜론, 쌍따옴표, 끝 콤마 유지)
- 커밋 전 pre-commit 훅이 자동으로 포매팅을 적용하지만, 수동으로 확인하려면 다음을 실행해주세요.

  ```bash
  npx prettier@3 --check .
  ```

- PR에서는 `prettier-check`, `firefox-lint` 워크플로우가 실행됩니다. 두 체크가 모두 통과해야 리뷰가 진행됩니다.
- 코드와 코드 내 주석은 영어로 작성해주세요. 사용자에게 노출되는 UI 문구는 한국어가 기본입니다.

## 📸 스타일/기능 변경 시 스크린샷 첨부

UI가 바뀌거나 새 기능이 추가되는 PR은 **변경 전/후 스크린샷**을 PR 본문에 가급적 포함해주세요. 리뷰어가 디자인 의도와 변경 사항을 빠르게 판단하는 데 필요합니다.

- 포함 대상 예시: 접수 내역 페이지 캘린더, 멘토링/특강 목록 페이지의 강조/팝업, 상세 페이지 경고, 확장 팝업(`popup.html`) 등 변경이 보이는 모든 화면.
- 애니메이션/인터랙션이 변경된 경우에는 짧은 GIF 혹은 mp4를 첨부해주셔도 됩니다.
- 서로 다른 기기 픽셀 밀도에서 레이아웃이 깨지는 경우가 종종 있으므로, 가능하면 **기본 확대/축소 100%** 상태에서 캡처해주세요.

## ⚡ 캘린더 로드 성능 확인 필수

이 확장은 소마 홈페이지의 내부 페이지(`history.do`, `mentoLec/view.do` 등)를 `fetch`로 가져와 파싱하는 구조입니다. 네트워크 호출 수나 파싱 비용이 조금만 늘어도 캘린더 렌더 지연으로 직결되므로, 다음 항목을 반드시 확인하고 결과를 PR 본문에 남겨주세요.

1. **신규 네트워크 호출이 늘지 않았는가?**

   DevTools Network 탭에서 `history.do`, `mentoLec/view.do`, `mentoLec/list.do`로 필터링하여 PR 적용 전/후 요청 수를 비교해주세요. 불가피하게 호출이 늘었다면 그 이유를 PR 본문에 적어주세요.

2. **N+1 호출 패턴이 생기지 않았는가?**

   `src/utils.js`의 `getAllLectures()`는 페이지 수만큼, `src/content.js`의 `updateCalendarElement()`는 접수 내역 수만큼 이미 직렬 `fetch`를 수행합니다. 여기에 `await`을 하나 더 추가하면 전체 렌더 시간이 배로 늘어납니다. 추가 호출이 필요한 경우 `Promise.all`로 병렬화하거나 기존 응답 파싱 단계에서 같이 뽑아낼 수 있는지 먼저 검토해주세요.

## ✅ PR 체크리스트

PR을 올리시기 전에 아래 항목을 확인해주세요.

- [ ] 로컬에서 Prettier 체크 통과 (`npx prettier@3 --check .`)
- [ ] 접수 내역/목록/상세 페이지 중 영향 범위를 직접 확인
- [ ] UI/스타일 변경이 있다면 Before/After 스크린샷 첨부
- [ ] `manifest.json`의 `version` 필드는 수정하지 않음

## 🙋 도움이 필요할 때

- 질문/토론: [GitHub Issues](https://github.com/ymjoo12/soma-calendar/issues)
- 릴리스/배포 관련 작업은 유지보수자가 진행합니다. PR에서 따로 버전 업이나 스토어 업로드를 시도하지 않아주시면 됩니다.

여러분의 기여를 기다리고 있습니다. 감사합니다! 🙌

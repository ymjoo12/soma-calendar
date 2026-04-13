# 소마 멘토링 시간표 (Browser Extension)

연수생이 접수한 멘토링/특강 내역을 접수 내역 페이지에서 시간표 형태로 확인할 수 있는 브라우저 확장 프로그램입니다.

(연수생분들의 기능 추가/수정 PR을 환영합니다 😀)

![소마 멘토링 시간표 스크린샷](assets/screenshot-calendar.png)


## 📖 주요 기능

1. **접수 내역 페이지**

- 접수한 내역을 날짜별로 제목, 멘토명, 시간, 장소, 인원수, 개설 확정 여부 순으로 표시합니다.
- 시간이 겹치는 내역은 **붉은색 배경**으로 표시되어 한눈에 확인할 수 있습니다.
- 접수 내역을 클릭하면 해당 페이지로 이동합니다.
- 접수 내역을 **ICS 파일**로 다운로드할 수 있습니다. (외부 캘린더 추가 가능)
- 접수 내역을 **구글 캘린더**에 추가할 수 있습니다. (구글 로그인 필요)
- 접수 내역을 캘린더에서 취소할 수 있습니다.

2. **멘토링/특강 목록 페이지**

- 이미 접수한 내역과 시간이 겹치는 항목은 붉은색으로 표시합니다.
- 이미 접수한 내역과 시간이 겹치는 항목이 무엇인지 마우스 오버시 팝업으로 표시합니다.

3. **멘토링/특강 상세 페이지**

- 이미 접수한 내역과 시간이 겹치는 항목일 경우 경고를 표시합니다.

4. **확장 프로그램 팝업**

- 소마 홈페이지, 멘토링/특강 접수 내역 페이지로 이동할 수 있는 버튼을 제공합니다.
- 확장 프로그램의 버전 정보를 표시합니다.


## 🧩 지원 브라우저

- **Chrome** (호환 브라우저 포함)
- **Firefox**


## 📦 설치 방법

### ✅ 배포 버전 자동 설치

정식 배포 버전은 각 브라우저 스토어에서 설치합니다.

- Chrome: ~~[Chrome Web Store](https://chromewebstore.google.com/detail/nlemmjbkihccbkdaihfgijnepogepoob)~~ (스토어 검토 대기중)
- Firefox: [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/소마-멘토링-시간표)

### 🧪 배포 버전 수동 설치 (ZIP 수동 로드)

스토어 반영 전 최신 버전을 직접 확인하려면 Release ZIP을 받아 수동으로 로드합니다.

1. [Releases](https://github.com/ymjoo12/soma-calendar/releases) 페이지에서 최신 버전의 zip 파일을 다운로드합니다.
2. 압축을 해제합니다.
3. 브라우저에 맞는 방법으로 확장 프로그램을 로드합니다.
4. `soma-calendar` 폴더(압축 해제된 폴더)를 선택합니다.

#### Chrome

1. 주소창에 `chrome://extensions`를 입력합니다.
2. `개발자 모드`를 켭니다.
3. `압축해제된 확장 프로그램을 로드합니다`를 누릅니다.
4. `soma-calendar` 폴더를 선택합니다.

#### Firefox

1. 주소창에 `about:debugging#/runtime/this-firefox`를 입력합니다.
2. `임시 부가 기능 로드...`를 누릅니다.
3. `manifest.json`이 포함된 압축 해제 폴더를 선택합니다.

### 🛠️ 소스코드 기준 설치

```bash
git clone https://github.com/ymjoo12/soma-calendar.git
```

- 클론한 저장소를 위 `사전 배포 버전 설치 (ZIP 수동 로드)`와 같은 방식으로 브라우저에 로드합니다.
- 최신 변경은 `git pull`로 반영할 수 있습니다.


## 🙌 Contributors

| 기여자 | 기여 내용 | 관련 PR |
|---|---|----|
| [@ymjoo12](https://github.com/ymjoo12) | 초기 버전 개발 및 유지보수 | – |
| [@younghun1124](https://github.com/younghun1124) | 도메인 이슈 해결 | [#2](https://github.com/ymjoo12/soma-calendar/pull/2) |
| [@alsgud8311](https://github.com/alsgud8311) | ICS 파일 생성 기능 | [#3](https://github.com/ymjoo12/soma-calendar/pull/3) |
| [@skymygo](https://github.com/skymygo) | 멘토링 일정 중복 경고 / 버그 수정 | [#4](https://github.com/ymjoo12/soma-calendar/pull/4), [#8](https://github.com/ymjoo12/soma-calendar/pull/8), [#17](https://github.com/ymjoo12/soma-calendar/pull/17), [#20](https://github.com/ymjoo12/soma-calendar/pull/20) |
| [@SioJeong](https://github.com/SioJeong) | UI 개선 | [#5](https://github.com/ymjoo12/soma-calendar/pull/5) |
| [@3ae3ae](https://github.com/3ae3ae) | Firefox 지원 | [#6](https://github.com/ymjoo12/soma-calendar/pull/6) |
| [@jang-namu](https://github.com/jang-namu) | 멘토링 일정 중복 시 마우스 오버 팝업 | [#10](https://github.com/ymjoo12/soma-calendar/pull/10) |
| [@qyinm](https://github.com/qyinm) | 구글 캘린더 추가 기능 | [#22](https://github.com/ymjoo12/soma-calendar/pull/22) |
| [@softwareDefine](https://github.com/softwareDefine) | 도메인 변경 및 레이아웃 변경 반영 | [#27](https://github.com/ymjoo12/soma-calendar/pull/27), [#29](https://github.com/ymjoo12/soma-calendar/pull/29) |
| [@lickelon](https://github.com/lickelon) | 멘토링/특강 달력 활동 정보 요약 보기 | [#30](https://github.com/ymjoo12/soma-calendar/pull/30) |

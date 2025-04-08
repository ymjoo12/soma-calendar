# 소마 멘토링 시간표 (Browser Extension)

본인이 접수한 멘토링/특강 내역을 접수 내역 페이지에서 시간표 형태로 확인할 수 있는 브라우저 확장 프로그램입니다.

---

## 📖 주요 기능

1. 접수 내역 페이지

- 접수한 내역을 날짜별로 제목, 멘토명, 시간, 장소, 인원수, 개설 확정 여부 순으로 표시합니다.
- 시간이 겹치는 내역은 **붉은색 배경**으로 표시되어 한눈에 확인할 수 있습니다.
- 접수 내역을 클릭하면 해당 페이지로 이동합니다.
- 접수 내역을 ICS 파일로 다운로드할 수 있습니다. (캘린더 추가 가능)
- 접수 내역을 캘린더에서 취소할 수 있습니다.

2. 멘토링/특강 목록 페이지

- 이미 접수한 내역과 시간이 겹치는 항목은 붉은색으로 표시합니다.
- 이미 접수한 내역과 시간이 겹치는 항목이 무엇인지 마우스 오버시 팝업으로 표시합니다.

3. 멘토링/특강 상세 페이지

- 이미 접수한 내역과 시간이 겹치는 항목일 경우 경고를 표시합니다.

4. 확장 프로그램 팝업

- 소마 홈페이지, 멘토링/특강 접수 내역 페이지로 이동할 수 있는 버튼을 제공합니다.
- 확장 프로그램의 버전 정보를 표시합니다.

---

## 🧩 지원 브라우저

- **Chrome**
- **Firefox**

---

## 📦 설치 방법

1. [Releases](https://github.com/ymjoo12/soma-calendar/releases) 페이지에서 최신 버전의 zip 파일을 다운로드합니다.
2. 압축을 해제합니다.
3. 브라우저에 맞는 방법으로 확장 프로그램을 로드합니다.
4. `soma-calendar` 폴더를 선택합니다.

### 🔧 Chrome

1. 크롬 주소창에 [`chrome://extensions`](chrome://extensions) 입력
2. 우측 상단의 "개발자 모드 (Developer mode)" 설정
3. "압축해제된 확장 프로그램 로드 (Load unpacked)" 클릭
4. `soma-calendar` 폴더 선택

### 🔧 Firefox

1. 주소창에 [`about:debugging#/runtime/this-firefox`](about:debugging#/runtime/this-firefox) 입력
2. "임시로 확장 프로그램 로드" 클릭
3. `soma-calendar` 폴더 선택

### 🔧 개발 버전 설치

```bash
git clone https://github.com/ymjoo12/soma-calendar.git
```

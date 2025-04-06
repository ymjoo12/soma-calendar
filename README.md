# 소마 멘토링 시간표 (Chrome & Firefox Extension)

본인이 접수한 멘토링/특강 내역을 접수 내역 페이지에서 시간표 형태로 확인할 수 있는 브라우저 확장 프로그램입니다.

- 접수한 내역을 날짜별로 제목, 멘토명, 시간, 장소, 최대 인원수 순으로 표시합니다.
- 시간이 겹치는 내역은 **붉은색 배경**으로 표시되어 한눈에 확인할 수 있습니다.

---

## 🧩 지원 브라우저

- **Chrome**
- **Firefox**

---

## 📦 설치 방법

```bash
git clone https://github.com/ymjoo12/soma-calendar.git somaCalendar
cd somaCalendar
```

### 🔧 크롬

1. `build-chrome.bat` 혹은 `build-chrome.sh` 실행  
2. 크롬 주소창에 `chrome://extensions` 입력  
3. "압축해제된 확장 프로그램 로드" 클릭  
4. `dist/chrome` 폴더 선택

### 🔧 파이어폭스

1. `build-firefox.bat` 혹은 `build-firefox.sh` 실행  
2. 주소창에 `about:debugging` 입력  
3. "임시로 확장 프로그램 로드" 클릭  
4. `dist/firefox` 폴더 선택

---

## 🖼️ 스크린샷

![](https://i.imgur.com/yLEuLMn.png)  
![](https://i.imgur.com/g4YfG0i.png)
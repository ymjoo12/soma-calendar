let lectures = [];

function createCalendarButton(className, label, title, url, extraClass = "") {
  const button = document.createElement("button");
  button.className = extraClass ? `${className} ${extraClass}` : className;
  button.dataset.id = url;
  button.style.flex = "1";
  button.title = title;
  button.textContent = label;
  return button;
}

function createCalendarLectureElement(
  ev,
  isConflict,
  isAlreadyPassed,
  isEnded,
) {
  const lectureElement = document.createElement("div");
  lectureElement.className =
    `calendar-lecture ${isConflict ? "conflict" : ""} ${isEnded ? "ended" : ""}`.trim();
  lectureElement.title = ev.title;

  const infoLink = document.createElement("a");
  infoLink.href = ev.url;
  infoLink.className = "info-group";

  const titleElement = document.createElement("div");
  titleElement.className = "text-title";
  titleElement.dataset.role = "title";
  titleElement.textContent = ev.title;

  const authorElement = document.createElement("div");
  authorElement.dataset.role = "author";
  authorElement.style.fontSize = "small";
  authorElement.style.marginBottom = "4px";
  authorElement.textContent = ev.author;

  const timeElement = document.createElement("div");
  timeElement.dataset.role = "time";
  timeElement.style.fontSize = "smaller";
  timeElement.textContent = ev.timeRangeStr;

  const locElement = document.createElement("div");
  locElement.dataset.role = "loc";
  locElement.style.fontSize = "smaller";
  locElement.textContent = "장소 로딩중..";

  const npeopleElement = document.createElement("div");
  npeopleElement.dataset.role = "npeople";
  npeopleElement.style.fontSize = "smaller";
  npeopleElement.textContent = "인원수 로딩중..";

  infoLink.append(
    titleElement,
    authorElement,
    timeElement,
    locElement,
    npeopleElement,
  );

  const buttonGroup = document.createElement("div");
  buttonGroup.className = "button-group";
  buttonGroup.append(
    createCalendarButton(
      "export-btn",
      "💾 ICS",
      "Export (ICS로 내보내기)",
      ev.url,
    ),
    createCalendarButton(
      "gcal-btn",
      "📅 구글",
      "Add to Google Calendar",
      ev.url,
    ),
    createCalendarButton(
      "cancel-btn",
      "❌ 취소",
      "Cancel (접수 취소)",
      ev.url,
      isAlreadyPassed ? "already" : "",
    ),
  );

  lectureElement.append(infoLink, buttonGroup);
  return lectureElement;
}

async function generateCalendarElement() {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - today.getDay());
  const wrapper = document.createElement("div");
  wrapper.id = "history-calendar";

  lectures = await getAllLectures();

  for (let i = 0; i < 28; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);

    const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
    const dayStr = `${date.getMonth() + 1}월 ${date.getDate()}일 (${weekday})`;
    const isToday = date.toDateString() === today.toDateString();
    const filteredEvents = lectures.filter((ev) => {
      const eventDate = new Date(ev.startAt);
      return eventDate.toDateString() === date.toDateString();
    });

    const cell = document.createElement("div");
    cell.className = `calendar-cell ${isToday ? "today-bg" : ""}`.trim();

    const dateElement = document.createElement("div");
    dateElement.className =
      `calendar-date ${isToday ? "today-text" : ""}`.trim();
    dateElement.textContent = `${dayStr}${isToday ? " [오늘]" : ""}`;
    cell.appendChild(dateElement);

    filteredEvents.forEach((ev, index) => {
      const isConflict =
        (index > 0 && filteredEvents[index - 1].endAt > ev.startAt) ||
        (index < filteredEvents.length - 1 &&
          filteredEvents[index + 1].startAt < ev.endAt);
      const isAlreadyPassed = ev.startAt < today;
      const isEnded = ev.endAt < today;
      cell.appendChild(
        createCalendarLectureElement(ev, isConflict, isAlreadyPassed, isEnded),
      );
    });

    wrapper.appendChild(cell);
  }

  return wrapper;
}

async function main() {
  let target =
    document.querySelector("#contentsList > div > div > ul.tabs-st1.col2") ||
    document.querySelector("#contentsList > div > div > ul.tabs-st1.col3"); // 셀렉터 fallback 옵션 추가

  let newElement = await generateCalendarElement();
  target.after(newElement);
}

// 구글 캘린더 이벤트 URL 생성 함수
function generateGoogleCalendarURL(lecture) {
  // URL 인코딩 함수
  const encode = (str) => encodeURIComponent(str).replace(/%20/g, "+");

  // 구글 캘린더 기본 URL
  const baseUrl = "https://calendar.google.com/calendar/render?action=TEMPLATE";

  // 제목 추가
  const title = `&text=${encode(lecture.title)}`;

  // 시작 및 종료 시간 추가 (ISO 형식으로 변환)
  const startTime = lecture.startAt.toISOString().replace(/-|:|\.\d+/g, "");
  const endTime = lecture.endAt.toISOString().replace(/-|:|\.\d+/g, "");
  const dates = `&dates=${startTime}/${endTime}`;

  // 위치 추가
  const location = lecture.loc ? `&location=${encode(lecture.loc)}` : "";

  // 설명 추가 (멘토 정보와 URL 포함)
  const description = `&details=${encode(`멘토: ${lecture.author}\n${lecture.url}`)}`;

  // 완성된 URL 반환
  return `${baseUrl}${title}${dates}${location}${description}`;
}

async function updateCalendarElement() {
  const eventElems = document.querySelectorAll("div.calendar-lecture");
  for (let ev of eventElems) {
    const res = await fetch(ev.querySelector("a").href, {
      credentials: "include",
    });
    const html = await res.text();
    const eventDetails = extractLectureDetailFromHTML(html);
    const { loc, npeople, applyId } = eventDetails;
    let lecture = lectures.find(
      (lec) => lec.url === ev.querySelector("a").href,
    );
    lecture.loc = loc;
    lecture.npeople = npeople;
    lecture.applyId = applyId;
    let locElem = ev.querySelector('[data-role="loc"]');
    locElem.innerText = loc;
    let npeopleElem = ev.querySelector('[data-role="npeople"]');
    npeopleElem.innerText =
      npeople + (lecture.isApproved ? " [개설 확정]" : " [미승인]");
    if (!lecture.isApproved && !ev.classList.contains("ended")) {
      // 가독성을 위해 이미 지나간 강의는 미승인 글자색 강조 X
      npeopleElem.style.color = "red";
    }

    // ICS 내보내기 버튼 이벤트 리스너
    let exportBtn = ev.querySelector(".export-btn");
    exportBtn.addEventListener("click", (e) => {
      const icsContent = generateICS(lecture);
      const blob = new Blob([icsContent], { type: "text/calendar" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${lecture.title.replace(/\s+/g, "_")}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });

    // 구글 캘린더 버튼 이벤트 리스너
    let gcalBtn = ev.querySelector(".gcal-btn");
    gcalBtn.addEventListener("click", (e) => {
      const googleCalendarURL = generateGoogleCalendarURL(lecture);
      window.open(googleCalendarURL, "_blank");
    });

    // 취소 버튼 이벤트 리스너
    let cancelBtn = ev.querySelector(".cancel-btn");
    cancelBtn.addEventListener("click", (e) => {
      if (lecture.startAt < new Date()) {
        alert("이미 지나간 강의는 취소할 수 없습니다.");
      } else {
        cancelApply(lecture.applyId, lecture.lectureId);
      }
    });
  }
}

function generateICS(lecture) {
  const pad = (n) => n.toString().padStart(2, "0");
  const toICSDate = (date) => {
    return (
      date.getUTCFullYear().toString() +
      pad(date.getUTCMonth() + 1) +
      pad(date.getUTCDate()) +
      "T" +
      pad(date.getUTCHours()) +
      pad(date.getUTCMinutes()) +
      pad(date.getUTCSeconds()) +
      "Z"
    );
  };

  const start = toICSDate(lecture.startAt);
  const end = toICSDate(lecture.endAt);
  const title = lecture.title.replace(/\n/g, " ");
  const description = `멘토: ${lecture.author}`;
  const location = lecture.loc;
  const url = lecture.url;

  return `BEGIN:VCALENDAR
VERSION:2.0
CALSCALE:GREGORIAN
BEGIN:VEVENT
SUMMARY:${title}
DTSTART:${start}
DTEND:${end}
DESCRIPTION:${description}\\n${url}
LOCATION:${location}
URL:${url}
STATUS:CONFIRMED
SEQUENCE:0
BEGIN:VALARM
TRIGGER:-PT10M
ACTION:DISPLAY
DESCRIPTION:Event Reminder
END:VALARM
END:VEVENT
END:VCALENDAR`.replace(/\n/g, "\r\n");
}

main()
  .then(() => {
    updateCalendarElement();
  })
  .catch((err) => {
    console.error(err);
  });

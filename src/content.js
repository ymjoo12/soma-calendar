let lectures = [];

async function generateCalendarElement() {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - today.getDay());
  const days = [];

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

    days.push(`
      <div class="calendar-cell ${isToday ? "today-bg" : ""}">
        <div class="calendar-date ${isToday ? "today-text" : ""}">${dayStr} ${isToday ? " [오늘]" : ""}</div>
        ${filteredEvents
          .map((ev, i) => {
            const isConflict =
              (i > 0 && filteredEvents[i - 1].endAt > ev.startAt) ||
              (i < filteredEvents.length - 1 &&
                filteredEvents[i + 1].startAt < ev.endAt);
            const isAlreadyPassed = ev.startAt < today;
            return `
            <div class="calendar-lecture ${
              isConflict ? "conflict" : ""
            }" title="${ev.title}">
              <a href="${
                ev.url
              }" style="margin-bottom: 4px; font-size: larger; font-weight: bold;">
                <div id="title" class="ellipsis-2-lines" style="color: #114C9D;">${
                  ev.title
                }</div>
                <div id="author" style="font-size: small; margin-bottom: 4px;">${
                  ev.author
                }</div>
                <div id="time" style="font-size: smaller;">${ev.timeRangeStr}</div>
                <div id="loc" style="font-size: smaller;">장소 로딩중..</div>
                <div id="npeople" style="font-size: smaller;">인원수 로딩중..</div>
              </a>
              <div style="display: flex; gap: 6px; font-weight: bold;">
                <button class="export-btn" data-id="${ev.url}" style="flex: 5;" title="Export (ICS로 내보내기)">📅 내보내기</button>
                <button class="cancel-btn ${isAlreadyPassed ? "already" : ""}" data-id="${ev.url}" style="flex: 1;" title="Cancel (접수 취소)">취소</button>
              </div>
            </div>
          `;
          })
          .join("")}
      </div>
    `);
  }

  const wrapper = document.createElement("div");
  wrapper.id = "history-calendar";
  wrapper.innerHTML = days.join("");

  return wrapper;
}

async function main() {
  let target = document.querySelector(
    "#contentsList > div > div > ul.tabs-st1.col2"
  );
  let newElement = await generateCalendarElement();
  target.after(newElement);

}

async function updateCalendarElement() {
  const eventElems = document.querySelectorAll("div.calendar-lecture");
  for (let ev of eventElems) {
    const res = await fetch(ev.querySelector("a").href, { credentials: "include" });
    const html = await res.text();
    const eventDetails = extractLectureDetailFromHTML(html);
    const { loc, npeople } = eventDetails;
    let lecture = lectures.find(
      (lecture) => lecture.url === ev.querySelector("a").href
    );
    lecture.loc = loc;
    lecture.npeople = npeople;
    let locElem = ev.querySelector("#loc");
    locElem.innerText = loc;
    let npeopleElem = ev.querySelector("#npeople");
    npeopleElem.innerText = npeople + (lecture.isApproved ? " [개설 확정]" : " [미승인]");
    if (!lecture.isApproved) {
      npeopleElem.style.color = "red";
    }
    let exportBtn = ev.querySelector(".export-btn");
    exportBtn.addEventListener("click", (e) => {
      const icsContent = generateICS(lecture);
      const blob = new Blob([icsContent], { type: "text/calendar" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${ev.title.replace(/\s+/g, "_")}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
    let cancelBtn = ev.querySelector(".cancel-btn");
    cancelBtn.addEventListener("click", (e) => {
      if (lecture.startAt < new Date()) {
        alert("이미 지나간 강의는 취소할 수 없습니다.");
      }
      else if (confirm("선택된 항목의 접수를 취소 하시겠습니까?")) {
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

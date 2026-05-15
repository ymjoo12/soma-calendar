let lectures = [];
const CALENDAR_BASE_DETAIL_FIELDS = [
  "dateStr",
  "timeRangeStr",
  "timeStr",
  "location",
  "capacityText",
];
const CALENDAR_CURRENT_DETAIL_FIELDS = [
  ...CALENDAR_BASE_DETAIL_FIELDS,
  "totalCount",
  "appliedCount",
  "isApproved",
];
const CALENDAR_ACTION_DETAIL_FIELDS = [
  "title",
  "author",
  "dateStr",
  "timeRangeStr",
  "location",
];

// Calendar rendering
function createCalendarButton(
  className,
  label,
  title,
  url,
  extraClass = "",
  disabled = false,
) {
  const button = document.createElement("button");
  button.className = extraClass ? `${className} ${extraClass}` : className;
  button.dataset.id = url;
  button.style.flex = "1";
  button.title = title;
  button.textContent = label;
  button.disabled = disabled;
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

  const locationElement = document.createElement("div");
  locationElement.dataset.role = "location";
  locationElement.style.fontSize = "smaller";
  locationElement.textContent = "장소 로딩중..";

  const peopleElement = document.createElement("div");
  peopleElement.dataset.role = "people";
  peopleElement.style.fontSize = "smaller";
  peopleElement.textContent = "인원수 로딩중..";

  infoLink.append(
    titleElement,
    authorElement,
    timeElement,
    locationElement,
    peopleElement,
  );

  const buttonGroup = document.createElement("div");
  buttonGroup.className = "button-group";
  const isCancelUnavailable = !ev.cancelId;
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
      isCancelUnavailable
        ? "Cancel unavailable (접수 취소 불가)"
        : "Cancel (접수 취소)",
      ev.url,
      isCancelUnavailable ? "unavailable" : isAlreadyPassed ? "past" : "",
      isCancelUnavailable,
    ),
  );

  lectureElement.append(infoLink, buttonGroup);
  return lectureElement;
}

function createDayCell(date, today, lectures) {
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  const dayStr = `${date.getMonth() + 1}월 ${date.getDate()}일 (${weekday})`;
  const isToday = date.toDateString() === today.toDateString();
  const filteredEvents = lectures.filter(
    (ev) => ev.startAt.toDateString() === date.toDateString(),
  );

  const cell = document.createElement("div");
  cell.className = `calendar-cell ${isToday ? "today-bg" : ""}`.trim();
  cell.dataset.calendarDate = formatDateKey(date);

  const dateElement = document.createElement("div");
  dateElement.className = `calendar-date ${isToday ? "today-text" : ""}`.trim();
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

  return cell;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRenderedCalendarLecture(ev) {
  const url = ev.querySelector("a")?.href;
  const location = ev.querySelector('[data-role="location"]')?.innerText;
  if (!url || !location || location === "장소 로딩중..") {
    return null;
  }

  const peopleElem = ev.querySelector('[data-role="people"]');
  return {
    url,
    title: ev.querySelector('[data-role="title"]')?.innerText,
    author: ev.querySelector('[data-role="author"]')?.innerText,
    timeRangeStr: ev.querySelector('[data-role="time"]')?.innerText,
    location,
    peopleText: peopleElem?.innerText,
    peopleColor: peopleElem?.style.color,
  };
}

function renderPreservedCalendarLecture(ev, rendered) {
  ev.title = rendered.title;
  setLectureText(ev, "title", rendered.title);
  setLectureText(ev, "author", rendered.author);
  setLectureText(ev, "time", rendered.timeRangeStr);
  setLectureText(ev, "location", rendered.location);

  const peopleElem = ev.querySelector('[data-role="people"]');
  if (peopleElem && rendered.peopleText) {
    peopleElem.innerText = rendered.peopleText;
    peopleElem.style.color = rendered.peopleColor || "";
  }
}

function refreshVisibleCalendarCells(
  wrapper,
  today,
  changedLectures,
  extraDateKeys = [],
  knownLectures = [],
) {
  const changedDateKeys = new Set(
    changedLectures.map((lecture) => formatDateKey(lecture.startAt)),
  );
  for (const dateKey of extraDateKeys) {
    changedDateKeys.add(dateKey);
  }
  const knownLectureByUrl = new Map(
    knownLectures.map((lecture) => [lecture.url, lecture]),
  );
  const cells = wrapper.querySelectorAll(".calendar-cell[data-calendar-date]");
  const refreshedEventElems = [];
  for (const cell of cells) {
    if (!changedDateKeys.has(cell.dataset.calendarDate)) {
      continue;
    }
    const renderedLectureByUrl = new Map();
    for (const oldEventElem of cell.querySelectorAll(".calendar-lecture")) {
      const renderedLecture = getRenderedCalendarLecture(oldEventElem);
      if (renderedLecture) {
        renderedLectureByUrl.set(renderedLecture.url, renderedLecture);
      }
    }

    const date = new Date(`${cell.dataset.calendarDate}T00:00:00`);
    const newCell = createDayCell(date, today, lectures);
    if (cell.dataset.pastCell) {
      newCell.dataset.pastCell = cell.dataset.pastCell;
    }
    cell.replaceWith(newCell);
    const newEventElems = newCell.querySelectorAll(".calendar-lecture");
    for (const newEventElem of newEventElems) {
      const knownLecture = knownLectureByUrl.get(
        newEventElem.querySelector("a")?.href,
      );
      if (knownLecture) {
        renderCalendarLecture(newEventElem, knownLecture);
        continue;
      }
      const renderedLecture = renderedLectureByUrl.get(
        newEventElem.querySelector("a")?.href,
      );
      if (renderedLecture) {
        renderPreservedCalendarLecture(newEventElem, renderedLecture);
      }
    }
    refreshedEventElems.push(...newEventElems);
  }
  if (refreshedEventElems.length === 0) {
    return;
  }
  updateCalendarElement(refreshedEventElems, wrapper, today).catch((error) => {
    console.error(error);
  });
}

function createPastButton(wrapper, startDate, today) {
  let currentStart = new Date(startDate);
  const initialStart = new Date(startDate);

  const cell = document.createElement("div");
  cell.className = "calendar-cell past-btn-cell";

  const pastBtn = document.createElement("button");
  pastBtn.className = "past-btn";
  pastBtn.textContent = "⬆ 이전 2주 보기";

  const resetBtn = document.createElement("button");
  resetBtn.className = "past-btn";
  resetBtn.textContent = "↩ 이번주부터 보기";
  resetBtn.hidden = true;

  pastBtn.addEventListener("click", () => {
    currentStart.setDate(currentStart.getDate() - 14);
    const insertBefore = cell.nextSibling;
    const addedEventElems = [];
    for (let i = 0; i < 14; i++) {
      const date = new Date(currentStart);
      date.setDate(currentStart.getDate() + i);
      const dayCell = createDayCell(date, today, lectures);
      dayCell.dataset.pastCell = "true";
      wrapper.insertBefore(dayCell, insertBefore);
      addedEventElems.push(...dayCell.querySelectorAll(".calendar-lecture"));
    }
    resetBtn.hidden = false;
    updateCalendarElement(addedEventElems, wrapper, today).catch((error) => {
      console.error(error);
    });
  });

  resetBtn.addEventListener("click", () => {
    for (const pastCell of wrapper.querySelectorAll(
      '.calendar-cell[data-past-cell="true"]',
    )) {
      pastCell.remove();
    }
    currentStart = new Date(initialStart);
    resetBtn.hidden = true;
  });

  cell.append(pastBtn, resetBtn);
  return cell;
}

async function generateCalendarElement() {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - today.getDay());
  const wrapper = document.createElement("div");
  wrapper.id = "history-calendar";

  const calendarLectures = await Service.getCalendarLectures(startDate);
  lectures = calendarLectures.lectures;

  wrapper.appendChild(createPastButton(wrapper, startDate, today));

  for (let i = 0; i < 28; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    wrapper.appendChild(createDayCell(date, today, lectures));
  }

  if (calendarLectures.loadPastLectures) {
    calendarLectures
      .loadPastLectures((pageLectures) => {
        lectures = Service.updateLectures(lectures, pageLectures);
        refreshVisibleCalendarCells(wrapper, today, pageLectures);
      })
      .catch((error) => {
        console.error(error);
      });
  }

  return wrapper;
}

async function main() {
  // Support both tab-count selectors so the calendar can mount when the history page tab layout changes.
  const target =
    document.querySelector("#contentsList > div > div > ul.tabs-st1.col2") ||
    document.querySelector("#contentsList > div > div > ul.tabs-st1.col3");

  const newElement = await generateCalendarElement();
  target.after(newElement);
}

// Detail rendering
function generateGoogleCalendarURL(lecture) {
  const encode = (str) => encodeURIComponent(str).replace(/%20/g, "+");
  const baseUrl = "https://calendar.google.com/calendar/render?action=TEMPLATE";
  const title = `&text=${encode(lecture.title)}`;
  // Google Calendar expects compact UTC timestamps.
  const startTime = lecture.startAt.toISOString().replace(/-|:|\.\d+/g, "");
  const endTime = lecture.endAt.toISOString().replace(/-|:|\.\d+/g, "");
  const dates = `&dates=${startTime}/${endTime}`;
  const locationParam = lecture.location
    ? `&location=${encode(lecture.location)}`
    : "";
  const description = `&details=${encode(`멘토: ${lecture.author}\n${lecture.url}`)}`;

  return `${baseUrl}${title}${dates}${locationParam}${description}`;
}

function setLectureText(ev, role, value) {
  if (value === undefined || value === null) {
    return;
  }
  const elem = ev.querySelector(`[data-role="${role}"]`);
  if (elem) {
    elem.innerText = value;
  }
}

function getCalendarPeopleText(lecture) {
  const hasPeopleCounts =
    /^\d+$/.test(lecture.appliedCount) && /^\d+$/.test(lecture.totalCount);
  const peopleText = hasPeopleCounts
    ? `${lecture.appliedCount}명 / ${lecture.totalCount}명`
    : lecture.capacityText;
  if (!peopleText) {
    return null;
  }
  return peopleText + (lecture.isApproved ? " [개설 확정]" : " [미승인]");
}

function renderCalendarLecture(ev, lecture) {
  ev.title = lecture.title;
  setLectureText(ev, "title", lecture.title);
  setLectureText(ev, "author", lecture.author);
  setLectureText(ev, "time", lecture.timeRangeStr);
  setLectureText(ev, "location", lecture.location);

  const peopleElem = ev.querySelector('[data-role="people"]');
  const peopleText = getCalendarPeopleText(lecture);
  if (peopleElem && peopleText) {
    peopleElem.innerText = peopleText;
    peopleElem.style.color = "";
    if (!lecture.isApproved && !ev.classList.contains("ended")) {
      // Keep past lectures visually muted even when approval is missing.
      peopleElem.style.color = "red";
    }
  }
}

// Actions
function attachCalendarLectureActions(ev, lecture) {
  if (ev.dataset.actionsAttached === "true") {
    return;
  }

  const exportBtn = ev.querySelector(".export-btn");
  exportBtn.addEventListener("click", async () => {
    exportBtn.disabled = true;
    try {
      const latestLecture = await getCalendarLectureForAction(ev, lecture);
      const icsContent = generateICS(latestLecture);
      const blob = new Blob([icsContent], { type: "text/calendar" });
      const downloadLink = document.createElement("a");
      downloadLink.href = URL.createObjectURL(blob);
      downloadLink.download = `${latestLecture.title.replace(/\s+/g, "_")}.ics`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (error) {
      console.error(error);
    } finally {
      exportBtn.disabled = false;
    }
  });

  const gcalBtn = ev.querySelector(".gcal-btn");
  gcalBtn.addEventListener("click", async () => {
    const calendarWindow = window.open("", "_blank");
    gcalBtn.disabled = true;
    try {
      const latestLecture = await getCalendarLectureForAction(ev, lecture);
      const googleCalendarURL = generateGoogleCalendarURL(latestLecture);
      if (calendarWindow) {
        calendarWindow.location.href = googleCalendarURL;
      } else {
        window.open(googleCalendarURL, "_blank");
      }
    } catch (error) {
      if (calendarWindow) {
        calendarWindow.close();
      }
      console.error(error);
    } finally {
      gcalBtn.disabled = false;
    }
  });

  const cancelBtn = ev.querySelector(".cancel-btn");
  if (!cancelBtn.disabled && lecture.startAt >= new Date()) {
    cancelBtn.addEventListener("click", () => {
      cancelApply(lecture.cancelId, lecture.lectureId, lecture.cancelGubun);
    });
  }

  ev.dataset.actionsAttached = "true";
}

function cancelApply(cancelId, qustnrSn, gubun = "mentoLec") {
  if (!cancelId || !qustnrSn) {
    alert("취소할 수 없는 항목입니다.");
    return;
  }

  if (typeof window.delDate === "function") {
    window.delDate(cancelId, qustnrSn, gubun);
    return;
  }

  if (confirm("선택된 항목의 접수를 취소 하시겠습니까?")) {
    fetch(`${Utils.getCenterPathPrefix()}/sw/mypage/userAnswer/cancel.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        id: cancelId,
        qustnrSn,
        gubun,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        const { resultCode, cancelAt } = data;
        if (resultCode === "success") {
          if (cancelAt === "Y") {
            alert("취소 하였습니다.");
          } else {
            alert("강의날짜 하루 전날부터는 취소가 불가능 합니다.");
          }
          Cache.clearHistorySessionCache();
          location.reload();
        } else {
          alert("삭제에 실패하였습니다.");
        }
      })
      .catch((error) => {
        console.error(error);
        alert("취소 요청 중 오류가 발생했습니다.");
      });
  }
}

// Entry
function getLectureByUrl(url) {
  return lectures.find((lec) => lec.url === url);
}

function updateCalendarLectureRender(
  wrapper,
  today,
  ev,
  previousDateKey,
  previousStartAt,
  previousEndAt,
  eventDetails,
) {
  lectures = Service.updateLectures(lectures, [eventDetails]);
  const lecture = getLectureByUrl(eventDetails.url) || eventDetails;
  if (!lecture.startAt || !lecture.endAt) {
    renderCalendarLecture(ev, lecture);
    return;
  }

  const nextDateKey = formatDateKey(lecture.startAt);
  const hasScheduleChange =
    previousDateKey !== nextDateKey ||
    previousStartAt !== lecture.startAt.getTime() ||
    previousEndAt !== lecture.endAt.getTime();

  if (hasScheduleChange && wrapper) {
    refreshVisibleCalendarCells(
      wrapper,
      today,
      [lecture],
      [previousDateKey],
      [lecture],
    );
    return;
  }

  renderCalendarLecture(ev, lecture);
}

async function getCalendarLectureForAction(ev, lecture) {
  const wrapper = document.getElementById("history-calendar");
  const today = new Date();
  const previousDateKey = formatDateKey(lecture.startAt);
  const previousStartAt = lecture.startAt.getTime();
  const previousEndAt = lecture.endAt.getTime();
  const eventDetails = await Service.getLectureDetail(lecture.url, {
    requiredFields: CALENDAR_ACTION_DETAIL_FIELDS,
  });

  if (ev.isConnected) {
    updateCalendarLectureRender(
      wrapper,
      today,
      ev,
      previousDateKey,
      previousStartAt,
      previousEndAt,
      eventDetails,
    );
  }

  return getLectureByUrl(lecture.url) || eventDetails;
}

async function updateCalendarLectureElement(ev, wrapper, today) {
  if (!ev.isConnected) {
    return;
  }

  const link = ev.querySelector("a");
  const lecture = getLectureByUrl(link?.href);
  if (!link || !lecture) {
    return;
  }

  attachCalendarLectureActions(ev, lecture);
  const previousDateKey = formatDateKey(lecture.startAt);
  const previousStartAt = lecture.startAt.getTime();
  const previousEndAt = lecture.endAt.getTime();

  try {
    const requiredFields = Utils.isBeforeCurrentWeek(lecture)
      ? CALENDAR_BASE_DETAIL_FIELDS
      : CALENDAR_CURRENT_DETAIL_FIELDS;
    let eventDetails = await Service.getLectureDetail(link.href, {
      requiredFields,
    });
    if (
      requiredFields === CALENDAR_BASE_DETAIL_FIELDS &&
      !Utils.isBeforeCurrentWeek(eventDetails)
    ) {
      eventDetails = await Service.getLectureDetail(link.href, {
        requiredFields: CALENDAR_CURRENT_DETAIL_FIELDS,
      });
    }
    if (!ev.isConnected) {
      return;
    }
    updateCalendarLectureRender(
      wrapper,
      today,
      ev,
      previousDateKey,
      previousStartAt,
      previousEndAt,
      eventDetails,
    );
  } catch (error) {
    console.error(error);
  }
}

async function updateCalendarElement(
  eventElems,
  wrapper = document.getElementById("history-calendar"),
  today = new Date(),
) {
  const allEventElems = Array.from(
    eventElems ?? document.querySelectorAll("div.calendar-lecture"),
  );
  for (const ev of allEventElems) {
    const link = ev.querySelector("a");
    const lecture = getLectureByUrl(link?.href);
    if (link && lecture) {
      attachCalendarLectureActions(ev, lecture);
    }
  }
  const targetEventElems = allEventElems.filter(
    (ev) =>
      ev.querySelector('[data-role="location"]')?.innerText === "장소 로딩중..",
  );
  await Utils.mapWithConcurrency(
    targetEventElems,
    LECTURE_DETAIL_CONCURRENCY_LIMIT,
    (ev) => updateCalendarLectureElement(ev, wrapper, today),
  );
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
  const location = lecture.location;
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
    return updateCalendarElement();
  })
  .catch((err) => {
    console.error(err);
  });

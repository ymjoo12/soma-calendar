let lectures = [];
let unverifiedIds = new Set();
const LOCATION_UNAVAILABLE = "장소 확인 불가";
const DAY_MS = 24 * 60 * 60 * 1000;
const CANCEL_RETRY_DELAY_MS = 30_000;
const cancellationChecks = new Map();
const pendingExports = new Set();
let cancellationTimer;
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
  button.type = "button";
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
  lectureElement.dataset.lectureId = Cache.getLectureRecordId(ev);
  lectureElement.dataset.startAt = ev.startAt.getTime();
  lectureElement.dataset.endAt = ev.endAt.getTime();
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
  const needsHistory = unverifiedIds.has(ev.lectureId);
  const isCancelUnavailable = !ev.cancelId || needsHistory;
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
      needsHistory
        ? "접수내역 확인 전에는 취소할 수 없습니다"
        : isCancelUnavailable
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

function updateDayLabel(cell, date, isToday) {
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  const dayStr = `${date.getMonth() + 1}월 ${date.getDate()}일 (${weekday})`;
  cell.classList.toggle("today-bg", isToday);
  const label = cell.firstElementChild;
  label.classList.toggle("today-text", isToday);
  label.textContent = dayStr + (isToday ? " [오늘]" : "");
}

function createDayCell(date, today, lectures, renderedDetailIds) {
  const filteredEvents = lectures.filter(
    (ev) => ev.startAt.toDateString() === date.toDateString(),
  );

  const cell = document.createElement("div");
  cell.className = "calendar-cell";
  cell.dataset.calendarDate = formatDateKey(date);

  const dateElement = document.createElement("div");
  dateElement.className = "calendar-date";
  cell.appendChild(dateElement);
  updateDayLabel(cell, date, date.toDateString() === today.toDateString());

  let latestEndTime = -Infinity;
  filteredEvents.forEach((ev, index) => {
    const isConflict =
      ev.startAt.getTime() < latestEndTime ||
      (index < filteredEvents.length - 1 &&
        filteredEvents[index + 1].startAt < ev.endAt);
    latestEndTime = Math.max(latestEndTime, ev.endAt.getTime());
    const isAlreadyPassed = ev.startAt <= today;
    const isEnded = ev.endAt <= today;
    const card = createCalendarLectureElement(
      ev,
      isConflict,
      isAlreadyPassed,
      isEnded,
    );
    if (renderedDetailIds?.has(card.dataset.lectureId)) {
      renderCalendarLecture(card, ev);
    }
    cell.appendChild(card);
  });

  return cell;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hasRenderedLocation(ev) {
  const location = ev.querySelector('[data-role="location"]')?.innerText;
  return (
    !ev.dataset.detailLoadFailed &&
    location &&
    location !== "장소 로딩중.." &&
    location !== "-" &&
    location !== LOCATION_UNAVAILABLE
  );
}

function refreshVisibleCalendarCells(
  wrapper,
  today,
  changedLectures,
  knownLectures = [],
) {
  // A replacement snapshot rebuilds every visible day from fresh data.
  const refreshAll = changedLectures === undefined;
  const changedDateKeys = new Set(
    (changedLectures ?? []).map((lecture) => formatDateKey(lecture.startAt)),
  );
  if (!refreshAll) {
    const changedIds = new Set(changedLectures.map(Cache.getLectureRecordId));
    // Another response may already have moved the card since this request began.
    for (const card of wrapper.querySelectorAll(".calendar-lecture")) {
      if (changedIds.has(card.dataset.lectureId)) {
        changedDateKeys.add(
          card.closest(".calendar-cell").dataset.calendarDate,
        );
      }
    }
  }
  const knownIds = knownLectures.map(Cache.getLectureRecordId);
  const focused = document.activeElement;
  const focusedCard =
    wrapper.contains(focused) && focused.closest(".calendar-lecture");
  const cells = wrapper.querySelectorAll(".calendar-cell[data-calendar-date]");
  const refreshedEventElems = [];
  for (const cell of cells) {
    if (!refreshAll && !changedDateKeys.has(cell.dataset.calendarDate)) {
      continue;
    }
    const renderedDetailIds = new Set(knownIds);
    const oldEventElems = refreshAll
      ? []
      : cell.querySelectorAll(".calendar-lecture");
    for (const oldEventElem of oldEventElems) {
      if (hasRenderedLocation(oldEventElem)) {
        renderedDetailIds.add(oldEventElem.dataset.lectureId);
      }
    }

    const date = new Date(`${cell.dataset.calendarDate}T00:00:00`);
    const newCell = createDayCell(date, today, lectures, renderedDetailIds);
    if (cell.dataset.pastCell) {
      newCell.dataset.pastCell = cell.dataset.pastCell;
    }
    cell.replaceWith(newCell);
    refreshedEventElems.push(...newCell.querySelectorAll(".calendar-lecture"));
  }
  if (
    focusedCard &&
    !focused.isConnected &&
    document.activeElement === document.body
  ) {
    const replacement = refreshedEventElems.find(
      (card) => card.dataset.lectureId === focusedCard.dataset.lectureId,
    );
    const index = [...focusedCard.querySelectorAll("a, button")].indexOf(
      focused,
    );
    replacement
      ?.querySelectorAll("a, button")
      [index]?.focus({ preventScroll: true });
  }
  if (refreshedEventElems.length === 0) {
    return;
  }
  updateCalendarElement(refreshedEventElems, wrapper).catch((error) => {
    console.error(error);
  });
}

function setCalendarRange(wrapper, today, pastDays) {
  const weekStart = Utils.getCurrentWeekStartDate(today);
  const first = new Date(weekStart);
  first.setDate(first.getDate() - pastDays);
  const afterLast = new Date(weekStart);
  afterLast.setDate(afterLast.getDate() + 28);
  const firstKey = formatDateKey(first);
  const afterLastKey = formatDateKey(afterLast);
  const todayKey = formatDateKey(today);
  for (const cell of wrapper.querySelectorAll("[data-calendar-date]")) {
    const key = cell.dataset.calendarDate;
    if (key < firstKey || key >= afterLastKey) cell.remove();
  }

  // Leave overlapping cells in place so focus, detail requests and scroll anchors survive.
  const added = [];
  let next = wrapper.querySelector(".past-btn-cell").nextElementSibling;
  for (
    const date = new Date(first);
    date < afterLast;
    date.setDate(date.getDate() + 1)
  ) {
    const key = formatDateKey(date);
    let cell = next;
    if (cell?.dataset.calendarDate === key) {
      next = cell.nextElementSibling;
      if (cell.classList.contains("today-bg") !== (key === todayKey)) {
        updateDayLabel(cell, date, key === todayKey);
      }
    } else {
      cell = createDayCell(date, today, lectures);
      wrapper.insertBefore(cell, next);
      added.push(...cell.querySelectorAll(".calendar-lecture"));
    }
    if (date < weekStart) cell.dataset.pastCell = "true";
    else delete cell.dataset.pastCell;
  }
  wrapper.dataset.today = todayKey;
  if (wrapper.isConnected && added.length) {
    // The clock may be reconciling buttons in this same turn.
    queueMicrotask(() => {
      updateCalendarElement(added, wrapper).catch(console.error);
    });
  }
}

function createPastButton(wrapper) {
  const cell = document.createElement("div");
  cell.className = "calendar-cell past-btn-cell";

  const pastBtn = document.createElement("button");
  pastBtn.type = "button";
  pastBtn.className = "past-btn";
  pastBtn.textContent = "⬆ 이전 2주 보기";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "past-btn";
  resetBtn.textContent = "↩ 이번주부터 보기";
  resetBtn.hidden = true;

  pastBtn.addEventListener("click", () => {
    const pastDays = wrapper.querySelectorAll("[data-past-cell]").length;
    setCalendarRange(wrapper, new Date(), pastDays + 14);
    resetBtn.hidden = false;
  });

  resetBtn.addEventListener("click", () => {
    setCalendarRange(wrapper, new Date(), 0);
    resetBtn.hidden = true;
  });

  cell.append(pastBtn, resetBtn);
  return cell;
}

async function loadRemainingCalendarLectures(calendarLectures, wrapper) {
  while (calendarLectures.loadPastLectures) {
    const generation = Cache.historyGeneration;
    const isCurrent = await calendarLectures.loadPastLectures(
      (pageLectures, previousLectures = [], removedIds) => {
        if (removedIds?.size) {
          lectures = lectures.filter(
            (lecture) => !removedIds.has(Cache.getLectureRecordId(lecture)),
          );
        }
        lectures = Service.updateLectures(lectures, pageLectures);
        refreshVisibleCalendarCells(wrapper, new Date(), [
          ...previousLectures,
          ...pageLectures,
        ]);
      },
    );
    if (isCurrent) return;

    calendarLectures = await Service.getCalendarLectures(
      Utils.getCurrentWeekStartDate(),
      generation !== Cache.historyGeneration,
    );
    lectures = calendarLectures.lectures;
    unverifiedIds = calendarLectures.unverifiedIds;
    refreshVisibleCalendarCells(wrapper, new Date());
  }
}

async function generateCalendarElement() {
  const startDate = Utils.getCurrentWeekStartDate();
  const wrapper = document.createElement("div");
  wrapper.id = "history-calendar";

  const calendarLectures = await Service.getCalendarLectures(startDate);
  lectures = calendarLectures.lectures;
  unverifiedIds = calendarLectures.unverifiedIds;

  wrapper.appendChild(createPastButton(wrapper));
  setCalendarRange(wrapper, new Date(), 0);
  loadRemainingCalendarLectures(calendarLectures, wrapper).catch(console.error);

  return wrapper;
}

async function main() {
  // Support both tab-count selectors so the calendar can mount when the history page tab layout changes.
  const target =
    document.querySelector("#contentsList > div > div > ul.tabs-st1.col2") ||
    document.querySelector("#contentsList > div > div > ul.tabs-st1.col3");
  if (!target) return;

  const newElement = await generateCalendarElement();
  target.after(newElement);
  const retryCancellationChecks = () => refreshCancellationButtons(true);
  document.addEventListener("visibilitychange", retryCancellationChecks);
  window.addEventListener("pageshow", retryCancellationChecks);
  window.addEventListener("online", retryCancellationChecks);
  return newElement;
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

function getCalendarPeopleText(lecture, showApproval = true) {
  const hasPeopleCounts =
    /^\d+$/.test(lecture.appliedCount) && /^\d+$/.test(lecture.totalCount);
  const peopleText = hasPeopleCounts
    ? `${lecture.appliedCount}명 / ${lecture.totalCount}명`
    : lecture.capacityText;
  if (peopleText === undefined) return "인원 확인 불가";
  if (!showApproval) return peopleText ?? "-";
  return (
    (peopleText ?? "-") + (lecture.isApproved ? " [개설 확정]" : " [미승인]")
  );
}

function calendarLocationText(location) {
  return location === undefined ? LOCATION_UNAVAILABLE : location || "-";
}

function renderCalendarPeople(ev, lecture, showApproval = true) {
  const peopleElem = ev.querySelector('[data-role="people"]');
  if (peopleElem) {
    peopleElem.innerText = getCalendarPeopleText(lecture, showApproval);
    // Keep past lectures visually muted even when approval is missing.
    peopleElem.style.color =
      showApproval && !lecture.isApproved && !ev.classList.contains("ended")
        ? "red"
        : "";
  }
}

function renderCalendarLecture(ev, lecture) {
  delete ev.dataset.detailLoadFailed;
  ev.title = lecture.title;
  setLectureText(ev, "title", lecture.title);
  setLectureText(ev, "author", lecture.author);
  setLectureText(ev, "time", lecture.timeRangeStr);
  setLectureText(ev, "location", calendarLocationText(lecture.location));

  renderCalendarPeople(ev, lecture);
}

// Actions
function applyCancellationRows(pending, rows, retry) {
  const updates = [];
  const removed = new Set();
  const previous = [];
  for (const [id, { check, baseline }] of pending) {
    const lecture = getLectureByUrl(check.url);
    if (
      !lecture ||
      cancellationChecks.get(id) !== check ||
      Cache.historyGeneration !== check.generation ||
      Service.getCancellationPage(id) !== check.source ||
      unverifiedIds.has(id) ||
      lecture.cancelId !== check.cancelId ||
      lecture.startAt.getTime() !== check.cardStart
    ) {
      continue;
    }

    const row = rows.get(id);
    check.grant = row?.cancelId ? row : null;
    if (!row) {
      removed.add(id);
      previous.push(lecture);
      continue;
    }
    check.start = row.startAt.getTime();
    if (!(row.startAt < row.endAt)) continue;
    const end = row.endAt.getTime();
    const localEnd = lecture.endAt.getTime();
    const previousEnd = baseline.endAt.getTime();
    const startChanged = check.start !== check.cardStart;
    const localEndChanged = localEnd !== previousEnd;
    if (
      retry &&
      localEndChanged &&
      (startChanged || (end !== previousEnd && end !== localEnd))
    ) {
      // Two different intervals changed during the request. Read the complete row once more.
      check.grant = undefined;
      check.requestedAt = Date.now();
      retry.set(id, { check, baseline: { ...lecture } });
      continue;
    }
    if (
      (!localEndChanged && (startChanged || end !== localEnd)) ||
      ["title", "author", "isApproved"].some(
        (field) =>
          lecture[field] === baseline[field] && row[field] !== baseline[field],
      )
    ) {
      updates.push({ row, baseline, requestedAt: check.requestedAt });
      previous.push({ ...lecture });
    }
  }
  if (!previous.length) return;
  const updated = Service.reconcileCancellationHistory(updates, removed);
  lectures = Service.updateLectures(
    lectures.filter((item) => !removed.has(Cache.getLectureRecordId(item))),
    updated,
  );
  const wrapper = document.getElementById("history-calendar");
  if (wrapper) {
    const renderedIds = new Set(
      [...wrapper.querySelectorAll(".calendar-lecture")]
        .filter(hasRenderedLocation)
        .map((card) => card.dataset.lectureId),
    );
    refreshVisibleCalendarCells(
      wrapper,
      new Date(),
      [...previous, ...updated],
      updated.filter(
        (lecture) =>
          lecture.location !== undefined && renderedIds.has(lecture.lectureId),
      ),
    );
  }
}

async function verifyCancellationRows(pending) {
  for (let attempt = 0; attempt < 2 && pending.size; attempt++) {
    const retry = new Map();
    try {
      const rows = await Service.getCurrentCancellations(
        new Set(pending.keys()),
      );
      applyCancellationRows(pending, rows, attempt === 0 ? retry : null);
    } catch (error) {
      // Retry once while the tab stays open. Returning to the tab can retry again.
      for (const { check } of pending.values()) {
        check.retryAt = check.isAutomaticRetry
          ? Infinity
          : Date.now() + CANCEL_RETRY_DELAY_MS;
      }
      console.error(error);
      return;
    }
    pending = retry;
  }
}

function refreshCancellationButtons(retryFailed = false, clickedButton) {
  clearTimeout(cancellationTimer);
  if (document.hidden) return;

  const now = Date.now();
  const today = new Date(now);
  const wrapper = document.getElementById("history-calendar");
  let next = Infinity;
  if (wrapper?.dataset.today) {
    if (wrapper.dataset.today !== formatDateKey(today)) {
      const pastDays = wrapper.querySelectorAll("[data-past-cell]").length;
      setCalendarRange(wrapper, today, pastDays);
    }
    next = today.setHours(24, 0, 0, 0);
  }
  const generation = Cache.historyGeneration;
  const pending = new Map();
  const byUrl = new Map(lectures.map((lecture) => [lecture.url, lecture]));
  for (const [id, check] of cancellationChecks) {
    if (!byUrl.has(check.url) || check.generation !== generation) {
      cancellationChecks.delete(id);
    }
  }
  let selectedGrant;
  for (const button of document.querySelectorAll(
    ".calendar-lecture .cancel-btn",
  )) {
    const lecture = byUrl.get(button.dataset.id);
    const card = button.closest(".calendar-lecture");
    const end = Number(card.dataset.endAt);
    if (now < end) next = Math.min(next, end);
    const ended = now >= end;
    if (card.classList.contains("ended") !== ended) {
      card.classList.toggle("ended", ended);
      const people = card.querySelector('[data-role="people"]');
      if (ended && people?.style.color === "red") people.style.color = "";
      if (
        !ended &&
        lecture &&
        !lecture.isApproved &&
        people?.innerText === getCalendarPeopleText(lecture)
      ) {
        people.style.color = "red";
      }
    }
    const id = lecture?.lectureId;
    const cardStart = lecture?.startAt?.getTime();
    const source = Service.getCancellationPage(id);
    const retired = source && source.generation !== generation;
    const unverified = unverifiedIds.has(id);
    let check = cancellationChecks.get(id);
    const rescheduled =
      check && check.source === source && check.cardStart !== cardStart;
    if (
      check &&
      (check.source !== source ||
        check.cardStart !== cardStart ||
        check.cancelId !== lecture?.cancelId)
    ) {
      check = undefined;
    }
    const start = check?.start ?? cardStart;
    let grant = null;
    let needsHistory = unverified;
    if (
      lecture?.cancelId &&
      !unverified &&
      now < start &&
      (!source || retired || source.cancelId === lecture.cancelId)
    ) {
      const cutoff = start - DAY_MS;
      next = Math.min(next, now < cutoff ? cutoff : start);
      const checkedAt = check?.requestedAt ?? source?.requestedAt;
      const failed = check?.retryAt !== undefined;
      if (
        (check || (!retired && !rescheduled)) &&
        (now < cutoff || checkedAt >= cutoff) &&
        !(failed && (retryFailed || now >= check.retryAt))
      ) {
        grant = check ? check.grant : lecture;
      } else {
        check = {
          source,
          cardStart,
          start,
          url: lecture.url,
          cancelId: lecture.cancelId,
          generation,
          requestedAt: now,
          isAutomaticRetry: failed && !retryFailed,
        };
        cancellationChecks.set(id, check);
        pending.set(id, { check, baseline: { ...lecture } });
      }
      if (check && check.grant === undefined) needsHistory = true;
      if (check?.retryAt) next = Math.min(next, check.retryAt);
    }
    button.disabled = !grant;
    button.classList.toggle("unavailable", !grant);
    button.classList.toggle("past", Boolean(lecture?.cancelId) && now >= start);
    button.title = grant
      ? "Cancel (접수 취소)"
      : needsHistory
        ? "접수내역 확인 전에는 취소할 수 없습니다"
        : "Cancel unavailable (접수 취소 불가)";
    if (button === clickedButton) selectedGrant = grant;
  }
  if (Number.isFinite(next)) {
    cancellationTimer = setTimeout(
      refreshCancellationButtons,
      Math.min(next - now, 2 ** 31 - 1),
    );
  }
  if (pending.size) {
    verifyCancellationRows(pending).finally(() => refreshCancellationButtons());
  }
  return selectedGrant;
}

function attachExportAction(card, selector, exportLecture) {
  const button = card.querySelector(selector);
  const id = card.dataset.lectureId;
  const key = selector + ":" + id;
  button.disabled = pendingExports.has(key);
  button.addEventListener("click", async () => {
    if (!card.isConnected || pendingExports.has(key)) return;
    pendingExports.add(key);
    button.disabled = true;
    try {
      await exportLecture();
    } catch (error) {
      console.error(error);
    } finally {
      pendingExports.delete(key);
      button.disabled = false;
      if (!card.isConnected) {
        const replacement = document.querySelector(
          `#history-calendar .calendar-lecture[data-lecture-id="${CSS.escape(id)}"] ${selector}`,
        );
        if (replacement) replacement.disabled = false;
      }
    }
  });
}

function attachCalendarLectureActions(ev, lecture) {
  if (ev.dataset.actionsAttached === "true") {
    return;
  }

  attachExportAction(ev, ".export-btn", async () => {
    const latestLecture = await getCalendarLectureForAction(ev, lecture);
    const icsContent = generateICS(latestLecture);
    const blob = new Blob([icsContent], { type: "text/calendar" });
    const downloadLink = document.createElement("a");
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = `${latestLecture.title.replace(/\s+/g, "_")}.ics`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  });

  attachExportAction(ev, ".gcal-btn", async () => {
    const calendarWindow = window.open("", "_blank");
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
      throw error;
    }
  });

  const cancelBtn = ev.querySelector(".cancel-btn");
  cancelBtn.addEventListener("click", () => {
    // Timers can be delayed in background tabs and during a native confirmation dialog.
    const currentGrant = () => refreshCancellationButtons(false, cancelBtn);
    const grant = currentGrant();
    if (grant) {
      const { cancelId, lectureId, cancelGubun } = grant;
      cancelApply(cancelId, lectureId, cancelGubun, () => {
        const current = currentGrant();
        return (
          current?.cancelId === cancelId && current.cancelGubun === cancelGubun
        );
      });
    }
  });

  ev.dataset.actionsAttached = "true";
}

function cancelApply(cancelId, qustnrSn, gubun = "mentoLec", stillAllowed) {
  if (!cancelId || !qustnrSn) {
    alert("취소할 수 없는 항목입니다.");
    return;
  }

  if (typeof window.delDate === "function") {
    window.delDate(cancelId, qustnrSn, gubun);
    return;
  }

  if (confirm("선택된 항목의 접수를 취소 하시겠습니까?")) {
    if (stillAllowed && !stillAllowed()) {
      alert(
        "취소 요청을 보내지 않았습니다. 취소 버튼 상태를 확인한 뒤 다시 시도해주세요.",
      );
      return;
    }
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
  ev,
  generation,
  eventDetails,
  fromAction = false,
) {
  const id = ev.dataset.lectureId;
  if (
    generation !== Cache.historyGeneration ||
    (!ev.isConnected && !wrapper?.isConnected) ||
    !lectures.some((item) => Cache.getLectureRecordId(item) === id)
  ) {
    return null;
  }
  lectures = Service.updateLectures(lectures, [eventDetails]);
  const lecture = lectures.find(
    (item) => Cache.getLectureRecordId(item) === id,
  );
  const findCard = () =>
    ev.isConnected
      ? ev
      : wrapper?.querySelector(
          `.calendar-lecture[data-lecture-id="${CSS.escape(id)}"]`,
        );
  const currentCard = findCard();
  const previousCard = currentCard ?? ev;
  const keepPartial =
    previousCard.dataset.detailLoadFailed ||
    (fromAction &&
      (previousCard.querySelector('[data-role="location"]')?.innerText ===
        "장소 로딩중.." ||
        previousCard.querySelector('[data-role="people"]')?.innerText ===
          "인원수 로딩중.."));
  if (
    currentCard &&
    (!wrapper?.isConnected ||
      (Number(currentCard.dataset.startAt) === lecture.startAt.getTime() &&
        Number(currentCard.dataset.endAt) === lecture.endAt.getTime()))
  ) {
    renderCalendarLecture(currentCard, lecture);
  } else {
    refreshVisibleCalendarCells(wrapper, new Date(), [lecture], [lecture]);
  }
  // An export can complete before the display fields have finished loading.
  if (keepPartial) renderCachedCalendarFields(findCard(), true);
  return lecture;
}

async function getCalendarLectureForAction(ev, lecture) {
  const wrapper = document.getElementById("history-calendar");
  const generation = Cache.historyGeneration;
  let eventDetails;
  try {
    eventDetails = await Service.getLectureDetail(lecture.url, {
      requiredFields: CALENDAR_ACTION_DETAIL_FIELDS,
    });
  } catch (error) {
    const card = getLectureByUrl(lecture.url) || lecture;
    if (card.title && card.startAt?.getTime() < card.endAt?.getTime()) {
      return card;
    }
    throw error;
  }

  const rendered = updateCalendarLectureRender(
    wrapper,
    ev,
    generation,
    eventDetails,
    true,
  );
  if (rendered) return rendered;

  // A removed registration can still finish its export without rejoining the grid.
  const [latest] = Service.updateLectures(
    [getLectureByUrl(lecture.url) || lecture],
    [eventDetails],
  );
  return latest;
}

function renderCachedCalendarFields(ev, afterSuccess = false) {
  if (!ev?.isConnected) return;
  const id = ev.dataset.lectureId;
  if (!lectures.some((item) => Cache.getLectureRecordId(item) === id)) return;
  const location = ev.querySelector('[data-role="location"]');
  const needsLocation = afterSuccess || location?.innerText === "장소 로딩중..";
  const needsPeople =
    afterSuccess ||
    ev.querySelector('[data-role="people"]')?.innerText === "인원수 로딩중..";
  if (!needsLocation && !needsPeople) return;
  const displayFields = [
    "location",
    "capacityText",
    "appliedCount",
    "totalCount",
    "isApproved",
  ];
  const fields = Cache.getFreshLectureFieldValues(id, displayFields);
  if (
    afterSuccess &&
    displayFields.every((field) => fields[field] !== undefined)
  ) {
    delete ev.dataset.detailLoadFailed;
  } else {
    ev.dataset.detailLoadFailed = "true";
  }
  if (needsLocation) {
    location.innerText = calendarLocationText(fields.location);
  }
  if (needsPeople)
    renderCalendarPeople(ev, fields, fields.isApproved !== undefined);
}

async function updateCalendarLectureElement(ev, wrapper) {
  if (!ev.isConnected) {
    return;
  }

  const link = ev.querySelector("a");
  const lecture = getLectureByUrl(link?.href);
  if (!link || !lecture) {
    return;
  }

  attachCalendarLectureActions(ev, lecture);
  const generation = Cache.historyGeneration;

  try {
    const requiredFields = Utils.isBeforeCurrentWeek(lecture)
      ? CALENDAR_BASE_DETAIL_FIELDS
      : CALENDAR_CURRENT_DETAIL_FIELDS;
    let eventDetails = await Service.getLectureDetail(link.href, {
      requiredFields,
    });
    if (
      generation === Cache.historyGeneration &&
      requiredFields === CALENDAR_BASE_DETAIL_FIELDS &&
      !Utils.isBeforeCurrentWeek(eventDetails)
    ) {
      eventDetails = await Service.getLectureDetail(link.href, {
        requiredFields: CALENDAR_CURRENT_DETAIL_FIELDS,
      });
    }
    updateCalendarLectureRender(wrapper, ev, generation, eventDetails);
  } catch (error) {
    if (generation === Cache.historyGeneration) {
      renderCachedCalendarFields(ev);
      console.error(error);
    }
  }
  if (
    generation !== Cache.historyGeneration &&
    ev.isConnected &&
    ev.querySelector('[data-role="location"]')?.innerText === "장소 로딩중.."
  ) {
    await updateCalendarLectureElement(ev, wrapper);
  }
}

async function updateCalendarElement(
  eventElems,
  wrapper = document.getElementById("history-calendar"),
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
  refreshCancellationButtons();
  await Utils.mapWithConcurrency(
    targetEventElems,
    LECTURE_DETAIL_CONCURRENCY_LIMIT,
    (ev) => updateCalendarLectureElement(ev, wrapper),
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
  const locationLine = lecture.location ? `LOCATION:${lecture.location}\n` : "";
  const url = lecture.url;

  return `BEGIN:VCALENDAR
VERSION:2.0
CALSCALE:GREGORIAN
BEGIN:VEVENT
SUMMARY:${title}
DTSTART:${start}
DTEND:${end}
DESCRIPTION:${description}\\n${url}
${locationLine}URL:${url}
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
  .then((wrapper) => {
    if (wrapper)
      return updateCalendarElement(
        wrapper.querySelectorAll(".calendar-lecture"),
        wrapper,
      );
  })
  .catch((err) => {
    console.error(err);
  });

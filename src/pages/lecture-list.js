const FILTER_STORAGE_KEY = "soma-online-filter";

// Online / offline filter
function saveOnlineFilter(value) {
  sessionStorage.setItem(FILTER_STORAGE_KEY, value);
}

function loadSavedOnlineFilter() {
  return sessionStorage.getItem(FILTER_STORAGE_KEY) ?? "all";
}

let currentOnlineFilter = loadSavedOnlineFilter();
const rowIsOnlineMap = new Map();
let rowOnlineStatusPromise = null;
let onlineFilterUpdateQueued = false;

function getLectureListItems() {
  return Service.getLectureListItemsFromDocument(document);
}

async function loadAllRowOnlineStatuses() {
  if (rowOnlineStatusPromise) {
    return rowOnlineStatusPromise;
  }

  rowOnlineStatusPromise = Utils.mapWithConcurrency(
    getLectureListItems(),
    LECTURE_DETAIL_CONCURRENCY_LIMIT,
    async ({ row, lecture }) => {
      try {
        const detail = await Service.getLectureDetail(lecture.url, {
          requiredFields: ["isOnline"],
        });
        rowIsOnlineMap.set(row, detail?.isOnline ?? null);
      } catch (error) {
        console.error(error);
        rowIsOnlineMap.set(row, null);
      }
      queueApplyOnlineFilter();
    },
  );
  return rowOnlineStatusPromise;
}

function queueApplyOnlineFilter() {
  if (currentOnlineFilter === "all" || onlineFilterUpdateQueued) {
    return;
  }

  onlineFilterUpdateQueued = true;
  requestAnimationFrame(() => {
    onlineFilterUpdateQueued = false;
    applyOnlineFilter();
  });
}

function applyOnlineFilter() {
  for (const { row } of getLectureListItems()) {
    if (currentOnlineFilter === "all") {
      row.style.display = "";
      continue;
    }
    const isOnline = rowIsOnlineMap.get(row);
    if (isOnline === undefined || isOnline === null) {
      row.style.display = "";
      continue;
    }
    row.style.display =
      (currentOnlineFilter === "online") === isOnline ? "" : "none";
  }
}

function insertOnlineFilterUI() {
  if (!Utils.isBusanCenterPage()) return;

  const existingTabs = document.querySelector("ul.tabs-sort");
  if (!existingTabs) return;

  const onlineTabsList = document.createElement("ul");
  onlineTabsList.className = "tabs-sort soma-online-tabs";

  for (const { text, value } of [
    { text: "전체", value: "all" },
    { text: "온라인", value: "online" },
    { text: "오프라인", value: "offline" },
  ]) {
    const li = document.createElement("li");
    li.dataset.onlineFilter = value;
    if (value === currentOnlineFilter) li.classList.add("active");

    const a = document.createElement("a");
    a.href = "javascript:void(0);";
    a.textContent = text;

    a.addEventListener("click", () => {
      onlineTabsList
        .querySelectorAll("li[data-online-filter]")
        .forEach((item) => item.classList.remove("active"));
      li.classList.add("active");
      currentOnlineFilter = value;
      saveOnlineFilter(value);

      if (value !== "all") {
        loadAllRowOnlineStatuses().catch((error) => {
          console.error(error);
        });
      }

      applyOnlineFilter();
    });

    li.appendChild(a);
    onlineTabsList.appendChild(li);
  }

  existingTabs.after(onlineTabsList);
}

// Calendar popup enrichment
function getCalendarPopupElements(item) {
  const trigger =
    item.firstElementChild?.tagName === "A"
      ? item.firstElementChild
      : item.querySelector("a");
  const popup = item.querySelector(".calendarPop");
  const detailLink = popup?.querySelector(
    'a[href*="/sw/mypage/mentoLec/view.do"]',
  );

  return { trigger, popup, detailLink };
}

function isCalendarPopupVisible(popup) {
  if (!popup) {
    return false;
  }

  const style = getComputedStyle(popup);
  return (
    style.display !== "none" &&
    style.visibility === "visible" &&
    style.opacity !== "0"
  );
}

function getCalendarPopupDetailContainer(popup) {
  const list = popup.querySelector(".calendarPop__list") || popup;
  let container = list.querySelector(".calendar-pop-extra");

  if (!container) {
    container = document.createElement(list.tagName === "UL" ? "li" : "div");
    container.className = "calendar-pop-extra";
    list.appendChild(container);
  }

  return container;
}

function renderCalendarPopupDetail(container, detail) {
  container.className = "calendar-pop-extra";
  container.replaceChildren();

  if (detail.loading) {
    container.classList.add("calendar-pop-extra-loading");
    container.textContent = "상세 정보 로딩중...";
    return;
  }

  if (detail.error) {
    container.classList.add("calendar-pop-extra-error");
    container.textContent = "상세 정보를 불러오지 못했습니다.";
    return;
  }

  const hasPeopleCounts =
    /^\d+$/.test(detail.appliedCount) && /^\d+$/.test(detail.totalCount);
  const peopleText = hasPeopleCounts
    ? `${detail.appliedCount}/${detail.totalCount}`
    : detail.totalCount
      ? `${detail.appliedCount ?? "-"}/${detail.totalCount}`
      : detail.capacityText;
  const fields = [
    ["시간", detail.timeStr],
    ["장소", detail.location],
    ["인원", peopleText],
  ];

  for (const [label, value] of fields) {
    const row = document.createElement("div");
    row.className = "calendar-pop-extra__row";

    const labelElement = document.createElement("span");
    labelElement.className = "calendar-pop-extra__label";
    labelElement.textContent = label;

    const valueElement = document.createElement("span");
    valueElement.className = "calendar-pop-extra__value";
    valueElement.textContent = value;

    row.appendChild(labelElement);
    row.appendChild(valueElement);
    container.appendChild(row);
  }
}

async function enrichCalendarPopup(item, token) {
  const { popup, detailLink } = getCalendarPopupElements(item);

  if (token && item.dataset.somaPopupEnrichmentToken !== token) {
    return;
  }

  if (!popup || !detailLink || !isCalendarPopupVisible(popup)) {
    return;
  }

  const container = getCalendarPopupDetailContainer(popup);

  if (
    container.dataset.loadingToken === token ||
    container.dataset.loadedToken === token
  ) {
    return;
  }

  container.dataset.state = "loading";
  container.dataset.loadingToken = token;
  renderCalendarPopupDetail(container, { loading: true });

  try {
    const detail = await Service.getLectureDetail(detailLink.href, {
      forceRefresh: true,
      requiredFields: [
        "location",
        "timeStr",
        "capacityText",
        "totalCount",
        "appliedCount",
      ],
    });
    if (token && item.dataset.somaPopupEnrichmentToken !== token) {
      return;
    }
    container.dataset.state = "loaded";
    container.dataset.loadedToken = token;
    renderCalendarPopupDetail(container, detail);
  } catch (error) {
    container.dataset.state = "error";
    renderCalendarPopupDetail(container, { error: true });
    console.error(error);
  } finally {
    if (container.dataset.loadingToken === token) {
      delete container.dataset.loadingToken;
    }
  }
}

// Native popup visibility changes after its click animation starts.
function scheduleCalendarPopupEnrichment(item) {
  const token = `${Date.now()}-${Math.random()}`;
  item.dataset.somaPopupEnrichmentToken = token;
  const retryDelays = [0, 100, 300, 700];

  for (const delay of retryDelays) {
    window.setTimeout(() => {
      enrichCalendarPopup(item, token);
    }, delay);
  }
}

function observeCalendarPopups() {
  const calendarItems = document.querySelectorAll("li.category");

  document.addEventListener(
    "click",
    (event) => {
      const trigger = event.target.closest("li.category > a");
      const item = trigger?.closest("li.category");

      if (!item) {
        return;
      }

      scheduleCalendarPopupEnrichment(item);
    },
    { capture: true },
  );

  for (const item of calendarItems) {
    const { trigger, popup, detailLink } = getCalendarPopupElements(item);

    if (!trigger || !popup || !detailLink) {
      continue;
    }

    trigger.addEventListener("click", () => {
      scheduleCalendarPopupEnrichment(item);
    });

    const observer = new MutationObserver(() => {
      if (trigger.classList.contains("active")) {
        scheduleCalendarPopupEnrichment(item);
      }
    });

    observer.observe(trigger, {
      attributes: true,
      attributeFilter: ["class"],
    });

    if (trigger.classList.contains("active")) {
      scheduleCalendarPopupEnrichment(item);
    }
  }
}

// Overlap warnings
function renderOverlapPopup(overlapPopupElement, overlappingLectures) {
  overlapPopupElement.replaceChildren();

  const title = document.createElement("h4");
  title.textContent = "겹치는 멘토링 목록";
  overlapPopupElement.appendChild(title);

  for (const lecture of overlappingLectures) {
    const lectureElement = document.createElement("div");
    lectureElement.className = "overlap-lecture";

    const titleRow = document.createElement("div");
    const titleStrong = document.createElement("strong");
    titleStrong.textContent = lecture.title;
    titleRow.appendChild(titleStrong);

    const authorRow = document.createElement("div");
    authorRow.textContent = `멘토: ${lecture.author}`;

    const timeRow = document.createElement("div");
    timeRow.textContent = `일시: ${lecture.dateStr} ${lecture.timeRangeStr}`;

    lectureElement.append(titleRow, authorRow, timeRow);
    overlapPopupElement.appendChild(lectureElement);
  }
}

if (Utils.isBusanCenterPage()) {
  insertOnlineFilterUI();
}

if (Utils.isBusanCenterPage() && currentOnlineFilter !== "all") {
  applyOnlineFilter();
}

Service.getAllLectures().then((lectures) => {
  const lecturesDictionary = Utils.convertLectureDictionary(lectures);

  const overlapPopupElement = document.createElement("div");
  overlapPopupElement.className = "overlap-popup";
  document.body.appendChild(overlapPopupElement);

  for (const {
    row: lectureRow,
    lecture: rowLecture,
  } of getLectureListItems()) {
    const datePart = rowLecture.dateStr;
    const timePart = rowLecture.timeRangeStr;
    if (!lecturesDictionary.hasOwnProperty(datePart)) {
      continue;
    }

    let targetList = lecturesDictionary[datePart];
    let [startMin, endMin] = timePart.split(" ~ ");
    let hasConflict = false;
    let overlappingLectures = [];

    for (let j = 0; j < targetList.length; j++) {
      let [targetStartMin, targetEndMin] = targetList[j].split(" ~ ");

      if (Utils.getMin(endMin) <= Utils.getMin(targetStartMin)) {
        continue;
      }

      if (Utils.getMin(startMin) >= Utils.getMin(targetEndMin)) {
        continue;
      }

      const conflictLecture = lectures.find(
        (lec) => lec.dateStr === datePart && lec.timeRangeStr === targetList[j],
      );

      if (conflictLecture) {
        hasConflict = true;
        overlappingLectures.push(conflictLecture);
      }
    }

    if (hasConflict) {
      lectureRow.classList.add("conflict-item");
      lectureRow.style.color = "red";
      lectureRow.querySelector(".tit").style.color = "red";

      lectureRow.addEventListener("mousemove", (e) => {
        renderOverlapPopup(overlapPopupElement, overlappingLectures);
        overlapPopupElement.style.display = "block";

        const offset = 15;
        overlapPopupElement.style.left = e.clientX + offset + "px";
        overlapPopupElement.style.top = e.clientY + offset + "px";

        const overlapPopupRect = overlapPopupElement.getBoundingClientRect();
        if (overlapPopupRect.right > window.innerWidth) {
          overlapPopupElement.style.left =
            e.clientX - overlapPopupRect.width - offset + "px";
        }
        if (overlapPopupRect.bottom > window.innerHeight) {
          overlapPopupElement.style.top =
            e.clientY - overlapPopupRect.height - offset + "px";
        }
      });

      lectureRow.addEventListener("mouseleave", () => {
        overlapPopupElement.style.display = "none";
      });
    }
  }

  document.addEventListener("scroll", () => {
    if (overlapPopupElement.style.display === "block") {
      const activeItem = document.querySelector(".conflict-item:hover");
      if (!activeItem) {
        overlapPopupElement.style.display = "none";
      }
    }
  });

  observeCalendarPopups();
});

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
let rowOnlineStatusGeneration = Cache.historyGeneration;
let rowOnlineStatusPromise = null;
let onlineFilterUpdateQueued = false;
let lectureListItems = null;

function getLectureListItems() {
  lectureListItems ??= Service.getLectureListItemsFromDocument(document);
  return lectureListItems;
}

function syncRowOnlineStatusGeneration() {
  const generation = Cache.historyGeneration;
  if (rowOnlineStatusGeneration !== generation) {
    rowOnlineStatusGeneration = generation;
    rowOnlineStatusPromise = null;
    for (const row of rowIsOnlineMap.keys()) rowIsOnlineMap.set(row, null);
    queueApplyOnlineFilter();
  }
  return generation;
}

async function loadAllRowOnlineStatuses() {
  const generation = syncRowOnlineStatusGeneration();
  if (rowOnlineStatusPromise) {
    return rowOnlineStatusPromise;
  }

  const pendingItems = getLectureListItems().filter(
    ({ row }) => typeof rowIsOnlineMap.get(row) !== "boolean",
  );
  rowOnlineStatusPromise = Utils.mapWithConcurrency(
    pendingItems,
    LECTURE_DETAIL_CONCURRENCY_LIMIT,
    async ({ row, lecture }) => {
      if (generation !== Cache.historyGeneration) return;
      rowIsOnlineMap.set(row, null);
      let isOnline = null;
      try {
        const detail = await Service.getLectureDetail(lecture.url, {
          requiredFields: ["isOnline"],
        });
        isOnline = detail?.isOnline ?? null;
      } catch (error) {
        if (generation === Cache.historyGeneration) console.error(error);
      }
      if (generation === Cache.historyGeneration) {
        rowIsOnlineMap.set(row, isOnline);
        queueApplyOnlineFilter();
      }
    },
  ).finally(() => {
    if (generation === syncRowOnlineStatusGeneration()) {
      rowOnlineStatusPromise = null;
    }
  });
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
  for (const [row, isOnline] of rowIsOnlineMap) {
    if (currentOnlineFilter === "all" || typeof isOnline !== "boolean") {
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

  function applySelection() {
    if (currentOnlineFilter !== "all") {
      loadAllRowOnlineStatuses().catch((error) => console.error(error));
    }
    applyOnlineFilter();
  }

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

      applySelection();
    });

    li.appendChild(a);
    onlineTabsList.appendChild(li);
  }

  existingTabs.after(onlineTabsList);
  applySelection();
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
    ["인원", peopleText === undefined ? "인원 확인 불가" : (peopleText ?? "-")],
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

  const isCurrentPopup = () =>
    !token || item.dataset.somaPopupEnrichmentToken === token;
  if (!isCurrentPopup()) {
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

  const generation = syncRowOnlineStatusGeneration();
  try {
    const detail = await Service.getLectureDetail(detailLink.href, {
      requiredFields: [
        "location",
        "timeStr",
        "capacityText",
        "totalCount",
        "appliedCount",
      ],
    });
    if (generation !== Cache.historyGeneration) return;
    // A closed popup can still have an up-to-date status for its list row.
    for (const { row, lecture } of lectureListItems ?? []) {
      if (lecture.lectureId === detail.lectureId && rowIsOnlineMap.has(row)) {
        rowIsOnlineMap.set(row, detail.isOnline ?? null);
        queueApplyOnlineFilter();
      }
    }
    if (!isCurrentPopup()) return;
    container.dataset.state = "loaded";
    container.dataset.loadedToken = token;
    renderCalendarPopupDetail(container, detail);
  } catch (error) {
    if (generation !== Cache.historyGeneration || !isCurrentPopup()) return;
    container.dataset.state = "error";
    renderCalendarPopupDetail(container, { error: true });
    console.error(error);
  } finally {
    if (container.dataset.loadingToken === token) {
      delete container.dataset.loadingToken;
    }
    if (
      generation !== syncRowOnlineStatusGeneration() &&
      isCurrentPopup() &&
      isCalendarPopupVisible(popup)
    ) {
      scheduleCalendarPopupEnrichment(item);
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

function highlightOverlappingLectures(lectures) {
  const overlapPopupElement = document.createElement("div");
  overlapPopupElement.className = "overlap-popup";
  document.body.appendChild(overlapPopupElement);

  for (const {
    row: lectureRow,
    lecture: rowLecture,
  } of getLectureListItems()) {
    const overlappingLectures = lectures.filter(
      (lecture) =>
        rowLecture.startAt < lecture.endAt &&
        lecture.startAt < rowLecture.endAt,
    );
    if (overlappingLectures.length > 0) {
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
}

Service.getAllLectures()
  .then(highlightOverlappingLectures)
  .catch((error) => console.error(error));
observeCalendarPopups();

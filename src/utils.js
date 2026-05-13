function parseHtmlDocument(html) {
  return new DOMParser().parseFromString(html, "text/html");
}

function setPageIndexToOne(url) {
  if (url === undefined) {
    return undefined;
  }
  const _url = new URL(url);
  _url.searchParams.set("pageIndex", PAGE_ONE);
  return _url.toString();
}

function normalizeTimeStr(time) {
  const [h, m, s = "0"] = time.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}`;
}

function getSwPathPrefix() {
  return location.pathname.match(/^(.*)\/sw(?:\/|$)/)?.[1] || "";
}

function getLectureHistoryPath() {
  return `${getSwPathPrefix()}/sw/mypage/userAnswer/history.do?menuNo=200047`;
}

function getTodayStartDate(today = new Date()) {
  const startDate = new Date(today);
  startDate.setHours(0, 0, 0, 0);
  return startDate;
}

function getCurrentWeekStartDate(today = new Date()) {
  const startDate = getTodayStartDate(today);
  startDate.setDate(startDate.getDate() - startDate.getDay());
  return startDate;
}

function isBeforeCurrentWeek(lecture, today = new Date()) {
  return lecture.startAt < getCurrentWeekStartDate(today);
}

function extractLectureListFromHTML(html) {
  const container = parseHtmlDocument(html);

  const rows = container.querySelectorAll(
    "#contentsList > div > div > div.boardlist > div.tbl-ovx > table > tbody > tr",
  );
  const lectures = [];

  for (const row of rows) {
    const tds = row.querySelectorAll("td");
    if (tds.length < 6) continue;

    const applied = tds[6].innerText.trim();
    if (applied !== "접수완료") continue;

    const url = setPageIndexToOne(tds[2].querySelector("a")?.href);
    const title = tds[2].innerText.trim();
    const author = tds[3].innerText.trim();
    if (!url || !title || !author) continue;

    const [dateStr, timeRangeStr] = tds[4].innerText
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map((str) => str.trim())
      .filter(Boolean);
    if (!dateStr || !timeRangeStr) continue;

    const isApproved = tds[7].innerText.trim() === "OK";
    const cancelHref = row
      .querySelector('a[href*="delDate("]')
      ?.getAttribute("href");
    const cancelMatch = cancelHref?.match(
      /delDate\('([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\)/,
    );
    const params = new URL(url).searchParams;
    const lectureId = cancelMatch?.[2] || params.get("qustnrSn");
    const cancelId = cancelMatch?.[1] || null;
    const cancelGubun = cancelMatch?.[3] || null;

    lectures.push({
      url,
      title,
      author,
      dateStr,
      timeRangeStr,
      isApproved,
      lectureId,
      cancelId,
      cancelGubun,
    });
  }

  return lectures;
}

function extractLectureDetailFromHTML(html) {
  const container = parseHtmlDocument(html);
  const cancelBtn = container.querySelector(
    "#contentsList > div > div > div.btn_w-st1.mt50 > button.btn-st1.bg-black_r",
  );
  const getIsOnline = (deliveryMethod) => {
    return deliveryMethod?.includes("온라인") ?? false;
  };
  const getTopValue = (label) => {
    const group = [...container.querySelectorAll("div.top .group")].find(
      (item) => item.querySelector(".t")?.innerText.trim() === label,
    );
    return (
      group?.querySelector(".c")?.innerText.replace(/\s+/g, " ").trim() || null
    );
  };
  const capacityText = getTopValue("모집인원");
  const approvedText = getTopValue("개설 승인");
  const appliedSummary =
    container
      .querySelector(".total-normal.mt50")
      ?.innerText.replace(/\s+/g, " ")
      .trim() || "";
  const appliedCount = appliedSummary.match(/\[(\d+)\s*명\]/)?.[1] || null;
  const totalCount = capacityText?.match(/(\d+)/)?.[1] || null;
  const deliveryMethod = getTopValue("진행방식");
  return {
    location: getTopValue("장소"),
    deliveryMethod,
    isOnline: getIsOnline(deliveryMethod),
    capacityText,
    timeStr: getTopValue("강의날짜"),
    appliedCount,
    totalCount,
    isApproved: approvedText ? approvedText === "OK" : null,
    applyId: cancelBtn ? cancelBtn.getAttribute("onclick").split("'")[3] : null,
  };
}

async function mapWithConcurrency(items, limit, callback) {
  const results = [];
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await callback(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

function normalizeLectureDates(lectures) {
  for (const lecture of lectures) {
    const datePart = lecture.dateStr.split("(")[0].trim();
    const [startTime, endTime] = lecture.timeRangeStr
      .split("~")
      .map((s) => normalizeTimeStr(s.trim()));

    lecture.startAt = new Date(`${datePart}T${startTime}`);
    lecture.endAt = new Date(`${datePart}T${endTime}`);
    lecture.timeRangeStr = `${startTime.replace(/:\d{2}$/, "")} ~ ${endTime.replace(
      /:\d{2}$/,
      "",
    )}`;
  }

  lectures.sort((a, b) => a.startAt - b.startAt);
  return lectures;
}

function getLectureCacheId(lecture) {
  return lecture.lectureId || getLectureDetailCacheKey(lecture.url);
}

function getLectureCacheIds(lectures) {
  return new Set(lectures.map(getLectureCacheId));
}

function hasLectureCacheHit(cacheIds, lectures) {
  return lectures.some((lecture) => cacheIds.has(getLectureCacheId(lecture)));
}

function mergeLectures(...lectureGroups) {
  const lectureMap = new Map();
  for (const lectureGroup of lectureGroups) {
    for (const lecture of lectureGroup) {
      const key = getLectureCacheId(lecture);
      if (!lectureMap.has(key)) {
        lectureMap.set(key, lecture);
      }
    }
  }
  return normalizeLectureDates(Array.from(lectureMap.values()));
}

async function fetchLectureHistoryHead(path) {
  const res = await fetch(path, { credentials: "include" });
  const html = await res.text();
  const container = parseHtmlDocument(html);
  const totalStr = container.querySelector(".bbs-total strong.color-blue")
    ?.nextSibling?.textContent;
  const total = parseInt(totalStr?.replace(":", "")?.trim()) || 0;
  const lectures = normalizeLectureDates(extractLectureListFromHTML(html));
  const totalPages = Math.ceil(total / 10);
  writeHistoryPageCache(path, PAGE_ONE, lectures);
  return {
    totalPages,
    lectures,
  };
}

function isPastLecturePage(lectures, startDate) {
  return (
    lectures.length > 0 &&
    lectures.every((lecture) => lecture.startAt < startDate)
  );
}

async function cachePastLecturePages(
  path,
  startPage,
  totalPages,
  startDate,
  onPage,
  includePastLectures = true,
) {
  let foundCurrentOrFutureLecture = false;

  for (let page = startPage; page <= totalPages; page++) {
    const pageLectures = await fetchLecturePage(path, page);
    const pastLectures = pageLectures.filter(
      (lecture) => lecture.startAt < startDate,
    );
    const hasCurrentLectures = pastLectures.length !== pageLectures.length;

    if (pastLectures.length > 0) {
      writePastLectureCache(path, pastLectures);
    }

    const lecturesForPage = hasCurrentLectures
      ? pageLectures
      : includePastLectures
        ? pastLectures
        : [];
    if (onPage && lecturesForPage.length > 0) {
      onPage(lecturesForPage);
    }

    if (hasCurrentLectures) {
      foundCurrentOrFutureLecture = true;
    }
  }

  if (!foundCurrentOrFutureLecture) {
    markPastLectureCacheComplete(path);
  }
}

async function getCalendarLectures(startDate) {
  const path = getLectureHistoryPath();
  const firstPage = await fetchLectureHistoryHead(path);
  const totalPages = firstPage.totalPages;
  if (totalPages === 0) {
    return {
      lectures: [],
      loadPastLectures: null,
    };
  }

  const freshLectures = [];
  const cachedPast = readPastLectureCache(path);
  const hasFreshPastCache = cachedPast?.complete === true;
  const cachedPastIds = getLectureCacheIds(cachedPast?.lectures ?? []);
  let firstPastPage = null;

  for (let page = 1; page <= totalPages; page++) {
    const pageLectures =
      page === 1 ? firstPage.lectures : await fetchLecturePage(path, page);
    const pastLectures = pageLectures.filter(
      (lecture) => lecture.startAt < startDate,
    );
    if (pastLectures.length > 0) {
      writePastLectureCache(path, pastLectures);
    }

    if (isPastLecturePage(pageLectures, startDate)) {
      firstPastPage = page;
      break;
    }

    freshLectures.push(...pageLectures);
    if (hasFreshPastCache && hasLectureCacheHit(cachedPastIds, pastLectures)) {
      firstPastPage = page;
      break;
    }
  }

  if (firstPastPage === null) {
    markPastLectureCacheComplete(path);
  }

  const initialLectures = mergeLectures(
    freshLectures,
    firstPastPage === null ? [] : getCachedPastLectures(path, startDate),
  );

  return {
    lectures: initialLectures,
    loadPastLectures:
      firstPastPage !== null && !hasFreshPastCache
        ? (onPage) =>
            cachePastLecturePages(
              path,
              firstPastPage + 1,
              totalPages,
              startDate,
              onPage,
              true,
            )
        : null,
  };
}

async function getAllLectures() {
  const lectures = [];
  const path = getLectureHistoryPath();
  const firstPage = await fetchLectureHistoryHead(path);
  const totalPages = firstPage.totalPages;
  const cachedPast = readPastLectureCache(path);
  const hasFreshPastCache = cachedPast?.complete === true;
  const cachedPastIds = getLectureCacheIds(cachedPast?.lectures ?? []);
  const startDate = getTodayStartDate();
  let fetchedAllPages = true;

  for (let page = 1; page <= totalPages; page++) {
    const pageLectures =
      page === 1 ? firstPage.lectures : await fetchLecturePage(path, page);
    const pastLectures = pageLectures.filter(
      (lecture) => lecture.startAt < startDate,
    );
    if (pastLectures.length > 0) {
      writePastLectureCache(path, pastLectures);
    }

    lectures.push(...pageLectures);
    if (
      hasFreshPastCache &&
      (isPastLecturePage(pageLectures, startDate) ||
        hasLectureCacheHit(cachedPastIds, pastLectures))
    ) {
      fetchedAllPages = false;
      break;
    }
  }

  if (fetchedAllPages) {
    markPastLectureCacheComplete(path);
  }

  return mergeLectures(
    lectures,
    hasFreshPastCache ? getCachedPastLectures(path, startDate) : [],
  );
}

function getMin(timeStr) {
  let splitTime = timeStr.split(":");
  return parseInt(splitTime[0]) * 60 + parseInt(splitTime[1]);
}

function convertLectureDictionary(lectures) {
  let lecturesDictionary = Object();
  for (let i = 0; i < lectures.length; i++) {
    if (!lecturesDictionary.hasOwnProperty(lectures[i].dateStr)) {
      lecturesDictionary[lectures[i].dateStr] = [];
    }
    lecturesDictionary[lectures[i].dateStr].push(lectures[i].timeRangeStr);
  }

  return lecturesDictionary;
}

function convertLectureDictionaryWithoutDate(lectures) {
  let lecturesDictionary = Object();
  for (let i = 0; i < lectures.length; i++) {
    const dateStrWithoutDate = lectures[i].dateStr.slice(0, -3);
    if (!lecturesDictionary.hasOwnProperty(dateStrWithoutDate)) {
      lecturesDictionary[dateStrWithoutDate] = [];
    }
    lecturesDictionary[dateStrWithoutDate].push(lectures[i].timeRangeStr);
  }

  return lecturesDictionary;
}

function getLectureId(url) {
  const params = new URL(url).searchParams;
  const qustnrSn = params.get("qustnrSn");
  return qustnrSn;
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
    fetch(`${getSwPathPrefix()}/sw/mypage/userAnswer/cancel.json`, {
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
          clearHistorySessionCache();
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

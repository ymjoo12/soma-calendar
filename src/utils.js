const Utils = (() => {
  // URL helpers
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

  function getCenterPathPrefix() {
    return location.pathname.match(/^(.*)\/sw(?:\/|$)/)?.[1] || "";
  }

  function getLectureHistoryPath() {
    return `${getCenterPathPrefix()}/sw/mypage/userAnswer/history.do?menuNo=200047`;
  }

  function isBusanCenterPage() {
    return getCenterPathPrefix() === "/busan";
  }

  // Date helpers
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

  // Async helpers
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

  // Lecture helpers
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

  function getMin(timeStr) {
    let splitTime = timeStr.split(":");
    return parseInt(splitTime[0]) * 60 + parseInt(splitTime[1]);
  }

  function getDateWithoutWeekday(dateStr) {
    return dateStr.split("(")[0].trim();
  }

  function convertLectureDictionaryByDate(lectures, getDateKey) {
    let lecturesDictionary = Object();
    for (let i = 0; i < lectures.length; i++) {
      const dateKey = getDateKey(lectures[i].dateStr);
      if (!lecturesDictionary.hasOwnProperty(dateKey)) {
        lecturesDictionary[dateKey] = [];
      }
      lecturesDictionary[dateKey].push(lectures[i].timeRangeStr);
    }

    return lecturesDictionary;
  }

  function convertLectureDictionary(lectures) {
    return convertLectureDictionaryByDate(lectures, (dateStr) => dateStr);
  }

  function convertLectureDictionaryWithoutDate(lectures) {
    return convertLectureDictionaryByDate(lectures, getDateWithoutWeekday);
  }

  function getLectureId(url) {
    const params = new URL(url).searchParams;
    const qustnrSn = params.get("qustnrSn");
    return qustnrSn;
  }

  return {
    convertLectureDictionary,
    convertLectureDictionaryWithoutDate,
    getCenterPathPrefix,
    getCurrentWeekStartDate,
    getLectureHistoryPath,
    getLectureId,
    getMin,
    getTodayStartDate,
    isBeforeCurrentWeek,
    isBusanCenterPage,
    mapWithConcurrency,
    normalizeLectureDates,
    normalizeTimeStr,
    setPageIndexToOne,
  };
})();

const Service = (() => {
  // Lecture identity
  function getLectureCacheIds(lectures) {
    return new Set(lectures.map(Cache.getLectureRecordId));
  }

  // Shared lecture objects
  function updateLectures(...lectureGroups) {
    const lectureMap = new Map();
    for (const lectureGroup of lectureGroups) {
      for (const lecture of lectureGroup) {
        const key = Cache.getLectureRecordId(lecture);
        const record = Cache.readLectureRecord(key);
        lectureMap.set(
          key,
          record ? Cache.getLectureObjectFromRecord(record) : lecture,
        );
      }
    }
    return Utils.normalizeLectureDates(Array.from(lectureMap.values()));
  }

  function getLectureListItemsFromDocument(container) {
    return Client.parseLectureListDocument(container).map(
      ({ row, lecture }) => ({
        row,
        lecture: Cache.updateLectureCache(lecture),
      }),
    );
  }

  function getLectureFromDetailDocument(container, url = location.href) {
    const lecture = Client.parseLectureDetailDocument(container);
    return Cache.updateLectureCache({
      ...lecture,
      lectureId: Utils.getLectureId(url),
      url: Utils.setPageIndexToOne(url),
    });
  }

  // Cached requests
  function isPastLecturePage(lectures, startDate) {
    return (
      lectures.length > 0 &&
      lectures.every((lecture) => lecture.startAt < startDate)
    );
  }

  async function getLectureHistoryHead(path) {
    const firstPage = await Client.fetchLectureHistoryHead(path);
    Cache.writeHistoryPageCache(path, PAGE_ONE, firstPage.lectures);
    return firstPage;
  }

  async function getLiveLecturePage(path, page, firstPage) {
    if (page === 1 && firstPage) {
      return firstPage.lectures;
    }

    const lectures = await Client.fetchLecturePage(path, page);
    Cache.writeHistoryPageCache(path, page, lectures);
    return lectures;
  }

  function loadLectureDetail(key, requestUrl) {
    return Cache.loadLectureDetailRequest(key, () =>
      Client.fetchLectureDetail(requestUrl).then((detail) =>
        Cache.updateLectureCache({
          ...detail,
          lectureId: key,
          url: requestUrl,
        }),
      ),
    );
  }

  async function getLectureDetail(url, options = {}) {
    const requiredFields = options.requiredFields ?? LECTURE_RECORD_FIELDS;
    const key = Cache.getLectureDetailCacheKey(url);

    const cachedPast = Cache.getCachedPastLectureFields(url, requiredFields);
    if (cachedPast) {
      return cachedPast;
    }

    const cached = Cache.getCachedLectureFields(url, requiredFields);
    if (cached) {
      return cached;
    }

    return loadLectureDetail(key, url);
  }

  // History pagination
  function cachePastLecturesFromPage(path, pageLectures, startDate) {
    const pastLectures = pageLectures.filter(
      (lecture) => lecture.startAt < startDate,
    );
    if (pastLectures.length > 0) {
      Cache.writePastLectureCache(path, pastLectures);
    }
    return pastLectures;
  }

  function getMissingCalendarLectureIds(path, liveLectures, startDate) {
    const liveIds = getLectureCacheIds(liveLectures);
    return new Set(
      Cache.getCachedCalendarLectureIds(path, startDate).filter(
        (id) => !liveIds.has(id),
      ),
    );
  }

  function getCachedLectureSnapshots(ids) {
    return Array.from(ids)
      .map((id) => {
        const record = Cache.readLectureRecord(id);
        return record ? { ...Cache.getLectureObjectFromRecord(record) } : null;
      })
      .filter(Boolean);
  }

  function removeFoundCalendarIds(pageLectures, missingIds) {
    const pageIds = getLectureCacheIds(pageLectures);
    const foundIds = new Set();

    for (const id of missingIds) {
      if (pageIds.has(id)) {
        foundIds.add(id);
      }
    }

    for (const id of foundIds) {
      missingIds.delete(id);
    }
    return foundIds;
  }

  async function cachePastLecturePages(
    path,
    startPage,
    endPage,
    totalPages,
    startDate,
    onPage,
    includePastLectures = true,
    missingCalendarIds = new Set(),
  ) {
    for (let page = startPage; page <= endPage; page++) {
      const previousMissingLectures =
        missingCalendarIds.size > 0
          ? getCachedLectureSnapshots(missingCalendarIds)
          : [];
      const pageLectures = await getLiveLecturePage(path, page);
      const pastLectures = cachePastLecturesFromPage(
        path,
        pageLectures,
        startDate,
      );
      const hasCurrentLectures = pastLectures.length !== pageLectures.length;
      const lecturesForPage = hasCurrentLectures
        ? pageLectures
        : includePastLectures
          ? pastLectures
          : [];

      if (onPage && lecturesForPage.length > 0) {
        const foundIds = removeFoundCalendarIds(
          pageLectures,
          missingCalendarIds,
        );
        const previousFoundLectures = previousMissingLectures.filter(
          (lecture) => foundIds.has(Cache.getLectureRecordId(lecture)),
        );
        onPage(lecturesForPage, previousFoundLectures);
      } else {
        removeFoundCalendarIds(pageLectures, missingCalendarIds);
      }
    }

    if (endPage === totalPages) {
      const staleCalendarIds = new Set(missingCalendarIds);
      const staleLectures = getCachedLectureSnapshots(staleCalendarIds);
      missingCalendarIds.clear();
      Cache.markHistoryLectureCacheComplete(path);
      Cache.markPastLectureCacheComplete(path);
      Cache.removeHistoryLectureIds(path, staleCalendarIds);
      if (onPage && staleLectures.length > 0) {
        onPage([], staleLectures, staleCalendarIds);
      }
    }
  }

  // Page entry points
  async function getCalendarLectures(startDate) {
    const path = Utils.getLectureHistoryPath();
    const firstPage = await getLectureHistoryHead(path);
    const totalPages = firstPage.totalPages;
    if (totalPages === 0) {
      Cache.markPastLectureCacheComplete(path);
      Cache.markHistoryLectureCacheComplete(path);
      return {
        lectures: [],
        loadPastLectures: null,
      };
    }

    const freshLectures = [];
    const fetchedLectures = [];
    const cachedPast = Cache.readPastLectureCache(path);
    const hasFreshPastCache = cachedPast?.complete === true;
    let firstPastPage = null;

    for (let page = 1; page <= totalPages; page++) {
      const pageLectures = await getLiveLecturePage(path, page, firstPage);
      cachePastLecturesFromPage(path, pageLectures, startDate);
      fetchedLectures.push(...pageLectures);

      if (isPastLecturePage(pageLectures, startDate)) {
        firstPastPage = page;
        break;
      }

      freshLectures.push(...pageLectures);
    }

    const scannedAllPages =
      firstPastPage === null || firstPastPage === totalPages;
    if (scannedAllPages) {
      Cache.markPastLectureCacheComplete(path);
      Cache.markHistoryLectureCacheComplete(path);
    }
    const hasCompleteHistoryCache = Cache.hasCompleteHistoryLectureCache(path);
    const missingCalendarIds = getMissingCalendarLectureIds(
      path,
      fetchedLectures,
      startDate,
    );
    if (scannedAllPages) {
      Cache.removeHistoryLectureIds(path, missingCalendarIds);
    }
    const shouldLoadRemainingHistory =
      firstPastPage !== null &&
      !scannedAllPages &&
      (!hasCompleteHistoryCache ||
        !hasFreshPastCache ||
        missingCalendarIds.size > 0);

    return {
      lectures: updateLectures(
        freshLectures,
        firstPastPage === null
          ? []
          : Cache.getCachedCalendarLectures(path, startDate),
        firstPastPage === null
          ? []
          : Cache.getCachedPastLectures(path, startDate),
      ),
      loadPastLectures:
        shouldLoadRemainingHistory && firstPastPage + 1 <= totalPages
          ? (onPage) =>
              cachePastLecturePages(
                path,
                firstPastPage + 1,
                totalPages,
                totalPages,
                startDate,
                onPage,
                true,
                missingCalendarIds,
              )
          : null,
    };
  }

  async function getAllLectures() {
    const lectures = [];
    const path = Utils.getLectureHistoryPath();
    const firstPage = await getLectureHistoryHead(path);
    const totalPages = firstPage.totalPages;
    const cachedPast = Cache.readPastLectureCache(path);
    const hasFreshPastCache = cachedPast?.complete === true;
    const startDate = Utils.getCurrentWeekStartDate();
    let firstPastPage = null;

    for (let page = 1; page <= totalPages; page++) {
      const pageLectures = await getLiveLecturePage(path, page, firstPage);
      cachePastLecturesFromPage(path, pageLectures, startDate);

      lectures.push(...pageLectures);
      if (isPastLecturePage(pageLectures, startDate)) {
        firstPastPage = page;
        break;
      }
    }

    const missingCalendarIds = getMissingCalendarLectureIds(
      path,
      lectures,
      startDate,
    );
    const scannedAllPages =
      firstPastPage === null || firstPastPage === totalPages;

    if (scannedAllPages) {
      Cache.markPastLectureCacheComplete(path);
      Cache.markHistoryLectureCacheComplete(path);
      Cache.removeHistoryLectureIds(path, missingCalendarIds);
    } else {
      const hasCompleteHistoryCache =
        Cache.hasCompleteHistoryLectureCache(path);
      const shouldScanRemainingHistory =
        !hasCompleteHistoryCache || missingCalendarIds.size > 0;
      if (shouldScanRemainingHistory && firstPastPage < totalPages) {
        await cachePastLecturePages(
          path,
          firstPastPage + 1,
          totalPages,
          totalPages,
          startDate,
          (pageLectures) => {
            lectures.push(...pageLectures);
          },
          false,
          missingCalendarIds,
        );
      }
    }

    return updateLectures(
      lectures,
      Cache.getCachedCalendarLectures(path, startDate),
      hasFreshPastCache ? Cache.getCachedPastLectures(path, startDate) : [],
    );
  }

  return {
    getAllLectures,
    getCalendarLectures,
    getLectureDetail,
    getLectureFromDetailDocument,
    getLectureListItemsFromDocument,
    updateLectures,
  };
})();

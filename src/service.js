const Service = (() => {
  // Keep invalidated results usable without writing them back to the cache.
  const uncachedLectureDetails = new WeakSet();

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
        const visible = lectureMap.get(key);
        if (visible?.title) lecture.title ??= visible.title;
        if (uncachedLectureDetails.has(lecture)) {
          if (
            (!lecture.dateStr || !lecture.timeRangeStr) &&
            visible?.dateStr &&
            visible.timeRangeStr
          ) {
            lecture.dateStr = visible.dateStr;
            lecture.timeRangeStr = visible.timeRangeStr;
          }
        }
        lectureMap.set(key, lecture);
      }
    }
    const lectures = Array.from(lectureMap, ([key, lecture]) => {
      const record = Cache.readLectureRecord(key);
      if (!record) return lecture;
      return uncachedLectureDetails.has(lecture)
        ? Object.assign(lecture, record.fields)
        : Cache.getLectureObjectFromRecord(record);
    });
    return Utils.normalizeLectureDates(lectures);
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
    Cache.writeHistoryPageCache(path, PAGE_ONE, firstPage.lectures, 0);
    return firstPage;
  }

  async function getLiveLecturePage(
    path,
    page,
    firstPage,
    previousLectureCount,
  ) {
    if (page === 1 && firstPage) {
      return firstPage.lectures;
    }

    const lectures = await Client.fetchLecturePage(
      path,
      page,
      firstPage.total,
      firstPage.hasExpectedRowNumbers,
    );
    Cache.writeHistoryPageCache(path, page, lectures, previousLectureCount);
    return lectures;
  }

  function loadLectureDetail(key, requestUrl) {
    return Cache.loadLectureDetailRequest(key, async (isCurrent, baseline) => {
      const detail = await Client.fetchLectureDetail(requestUrl);
      const lecture = {
        ...detail,
        lectureId: key,
        url: requestUrl,
      };
      if (isCurrent()) {
        return Cache.updateLectureCache(lecture, baseline);
      }

      // Clearing the cache must not let an older request repopulate it.
      Object.assign(lecture, Cache.readLectureRecord(key)?.fields);
      if (
        typeof lecture.dateStr === "string" &&
        typeof lecture.timeRangeStr === "string"
      ) {
        Utils.normalizeLectureDates([lecture]);
      }
      uncachedLectureDetails.add(lecture);
      return lecture;
    });
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

  function getMissingHistoryLectureIds(path, liveLectures) {
    const liveIds = getLectureCacheIds(liveLectures);
    return new Set(
      Cache.getCachedHistoryLectureIds(path).filter((id) => !liveIds.has(id)),
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

  function removeFoundLectureIds(pageLectures, missingIds) {
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
    firstPage,
    previousLectureCount,
    startDate,
    onPage,
    includePastLectures = true,
    missingIds = new Set(),
    stopWhenMissingIdsFound = false,
  ) {
    for (let page = startPage; page <= firstPage.totalPages; page++) {
      const previousMissingLectures =
        missingIds.size > 0 ? getCachedLectureSnapshots(missingIds) : [];
      const pageLectures = await getLiveLecturePage(
        path,
        page,
        firstPage,
        previousLectureCount,
      );
      previousLectureCount += pageLectures.length;
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
        const foundIds = removeFoundLectureIds(pageLectures, missingIds);
        const previousFoundLectures = previousMissingLectures.filter(
          (lecture) => foundIds.has(Cache.getLectureRecordId(lecture)),
        );
        onPage(lecturesForPage, previousFoundLectures);
      } else {
        removeFoundLectureIds(pageLectures, missingIds);
      }

      if (stopWhenMissingIdsFound && missingIds.size === 0) {
        return;
      }
    }

    const staleHistoryIds = new Set(missingIds);
    const staleLectures = getCachedLectureSnapshots(staleHistoryIds);
    missingIds.clear();
    Cache.markHistoryLectureCacheComplete(path);
    Cache.markPastLectureCacheComplete(path);
    Cache.removeHistoryLectureIds(path, staleHistoryIds);
    if (onPage && staleLectures.length > 0) {
      onPage([], staleLectures, staleHistoryIds);
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
        unverifiedIds: new Set(),
        loadPastLectures: null,
      };
    }

    const freshLectures = [];
    const fetchedLectures = [];
    const cachedPast = Cache.readPastLectureCache(path);
    const hasFreshPastCache = cachedPast?.complete === true;
    let firstPastPage = null;

    for (let page = 1; page <= totalPages; page++) {
      const pageLectures = await getLiveLecturePage(
        path,
        page,
        firstPage,
        fetchedLectures.length,
      );
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
    const missingHistoryIds = getMissingHistoryLectureIds(
      path,
      fetchedLectures,
    );
    if (scannedAllPages) {
      Cache.removeHistoryLectureIds(path, missingHistoryIds);
    }
    const shouldLoadRemainingHistory =
      firstPastPage !== null &&
      !scannedAllPages &&
      (!hasCompleteHistoryCache ||
        !hasFreshPastCache ||
        missingHistoryIds.size > 0);

    return {
      // This set shrinks as background pages confirm cached registrations.
      unverifiedIds: missingHistoryIds,
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
                firstPage,
                fetchedLectures.length,
                startDate,
                onPage,
                true,
                missingHistoryIds,
                hasCompleteHistoryCache && hasFreshPastCache,
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
      const pageLectures = await getLiveLecturePage(
        path,
        page,
        firstPage,
        lectures.length,
      );
      cachePastLecturesFromPage(path, pageLectures, startDate);

      lectures.push(...pageLectures);
      if (isPastLecturePage(pageLectures, startDate)) {
        firstPastPage = page;
        break;
      }
    }

    const missingHistoryIds = getMissingHistoryLectureIds(path, lectures);
    const scannedAllPages =
      firstPastPage === null || firstPastPage === totalPages;

    if (scannedAllPages) {
      Cache.markPastLectureCacheComplete(path);
      Cache.markHistoryLectureCacheComplete(path);
      Cache.removeHistoryLectureIds(path, missingHistoryIds);
    } else {
      const hasCompleteHistoryCache =
        Cache.hasCompleteHistoryLectureCache(path);
      const shouldScanRemainingHistory =
        !hasCompleteHistoryCache ||
        !hasFreshPastCache ||
        missingHistoryIds.size > 0;
      if (shouldScanRemainingHistory && firstPastPage < totalPages) {
        await cachePastLecturePages(
          path,
          firstPastPage + 1,
          firstPage,
          lectures.length,
          startDate,
          (pageLectures) => {
            lectures.push(...pageLectures);
          },
          false,
          missingHistoryIds,
          hasCompleteHistoryCache && hasFreshPastCache,
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

const Service = (() => {
  // Lecture identity
  function getLectureCacheIds(lectures) {
    return new Set(lectures.map(Cache.getLectureRecordId));
  }

  function getLectureFromCache(id) {
    const record = Cache.readLectureRecord(id);
    return record ? Cache.getLectureObjectFromRecord(record) : null;
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

  function getCalendarLecturesFromPage(pageLectures, startDate) {
    return pageLectures.filter((lecture) => lecture.startAt >= startDate);
  }

  function getMissingCalendarLectureIds(path, liveLectures, startDate) {
    const liveIds = getLectureCacheIds(liveLectures);
    return new Set(
      Cache.getCachedCalendarLectureIds(path, startDate).filter(
        (id) => !liveIds.has(id),
      ),
    );
  }

  function getHistoryPageByIndex(index) {
    return Math.floor(index / LECTURE_HISTORY_PAGE_SIZE) + 1;
  }

  function getMissingCalendarAnchors(path, missingIds) {
    const historyIds = Cache.getCachedHistoryLectureIds(path);
    const today = Utils.getTodayStartDate();
    const anchors = new Map();

    for (const missingId of missingIds) {
      const missingIndex = historyIds.indexOf(missingId);
      let anchor = null;

      if (missingIndex !== -1) {
        for (let index = missingIndex + 1; index < historyIds.length; index++) {
          const lecture = getLectureFromCache(historyIds[index]);
          if (lecture?.startAt < today) {
            anchor = {
              id: historyIds[index],
              page: getHistoryPageByIndex(index),
            };
            break;
          }
        }
      }

      anchors.set(missingId, anchor);
    }

    return anchors;
  }

  function removeMissingIdsWithFetchedAnchors(path, missingIds, anchors, page) {
    const staleIds = [];
    for (const id of Array.from(missingIds)) {
      const anchor = anchors.get(id);
      if (anchor && anchor.page <= page) {
        staleIds.push(id);
        missingIds.delete(id);
      }
    }
    Cache.removeHistoryLectureIds(path, staleIds);
  }

  function getMissingCalendarScanEndPage(missingIds, anchors, totalPages) {
    let endPage = 0;
    for (const id of missingIds) {
      const anchor = anchors.get(id);
      if (!anchor) {
        return totalPages;
      }
      endPage = Math.max(endPage, anchor.page);
    }
    return endPage;
  }

  function reconcileMissingCalendarIds(pageLectures, missingIds, anchors) {
    const pageIds = getLectureCacheIds(pageLectures);
    const staleIds = [];

    for (const id of Array.from(missingIds)) {
      if (pageIds.has(id)) {
        missingIds.delete(id);
        continue;
      }

      const anchor = anchors.get(id);
      if (anchor && pageIds.has(anchor.id)) {
        staleIds.push(id);
        missingIds.delete(id);
      }
    }

    return staleIds;
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
    missingCalendarAnchors = new Map(),
  ) {
    const staleCalendarIds = new Set();

    for (let page = startPage; page <= endPage; page++) {
      const pageLectures = await getLiveLecturePage(path, page);
      const pastLectures = cachePastLecturesFromPage(
        path,
        pageLectures,
        startDate,
      );
      const calendarLectures = getCalendarLecturesFromPage(
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
        onPage(lecturesForPage);
      }

      for (const lecture of calendarLectures) {
        missingCalendarIds.delete(Cache.getLectureRecordId(lecture));
      }
      for (const id of reconcileMissingCalendarIds(
        pageLectures,
        missingCalendarIds,
        missingCalendarAnchors,
      )) {
        staleCalendarIds.add(id);
      }
    }

    if (endPage === totalPages) {
      for (const id of missingCalendarIds) {
        staleCalendarIds.add(id);
      }
      missingCalendarIds.clear();
      Cache.markHistoryLectureCacheComplete(path);
      Cache.markPastLectureCacheComplete(path);
    }
    Cache.removeHistoryLectureIds(path, staleCalendarIds);
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
    const cachedPast = Cache.readPastLectureCache(path);
    const hasFreshPastCache = cachedPast?.complete === true;
    let firstPastPage = null;

    for (let page = 1; page <= totalPages; page++) {
      const pageLectures = await getLiveLecturePage(path, page, firstPage);
      cachePastLecturesFromPage(path, pageLectures, startDate);

      if (isPastLecturePage(pageLectures, startDate)) {
        firstPastPage = page;
        break;
      }

      freshLectures.push(...pageLectures);
    }

    if (firstPastPage === null) {
      Cache.markPastLectureCacheComplete(path);
      Cache.markHistoryLectureCacheComplete(path);
    }
    const hasCompleteHistoryCache = Cache.hasCompleteHistoryLectureCache(path);
    const missingCalendarIds = getMissingCalendarLectureIds(
      path,
      freshLectures,
      startDate,
    );
    if (firstPastPage === null) {
      Cache.removeHistoryLectureIds(path, missingCalendarIds);
    }
    const missingCalendarAnchors = getMissingCalendarAnchors(
      path,
      missingCalendarIds,
    );
    if (firstPastPage !== null) {
      removeMissingIdsWithFetchedAnchors(
        path,
        missingCalendarIds,
        missingCalendarAnchors,
        firstPastPage,
      );
    }
    const missingCalendarScanEndPage = getMissingCalendarScanEndPage(
      missingCalendarIds,
      missingCalendarAnchors,
      totalPages,
    );
    const historyScanEndPage = hasCompleteHistoryCache
      ? missingCalendarScanEndPage
      : totalPages;
    const pastScanEndPage = hasFreshPastCache ? historyScanEndPage : totalPages;

    if (firstPastPage !== null && historyScanEndPage > firstPastPage) {
      await cachePastLecturePages(
        path,
        firstPastPage + 1,
        historyScanEndPage,
        totalPages,
        startDate,
        null,
        false,
        missingCalendarIds,
        missingCalendarAnchors,
      );
    }
    const loadPastStartPage =
      firstPastPage === null
        ? totalPages + 1
        : Math.max(firstPastPage + 1, historyScanEndPage + 1);

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
        firstPastPage !== null && loadPastStartPage <= pastScanEndPage
          ? (onPage) =>
              cachePastLecturePages(
                path,
                loadPastStartPage,
                pastScanEndPage,
                totalPages,
                startDate,
                onPage,
                true,
                missingCalendarIds,
                missingCalendarAnchors,
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

    if (firstPastPage === null) {
      Cache.markPastLectureCacheComplete(path);
      Cache.markHistoryLectureCacheComplete(path);
    } else {
      const hasCompleteHistoryCache =
        Cache.hasCompleteHistoryLectureCache(path);
      const missingCalendarIds = getMissingCalendarLectureIds(
        path,
        lectures,
        startDate,
      );
      const missingCalendarAnchors = getMissingCalendarAnchors(
        path,
        missingCalendarIds,
      );
      removeMissingIdsWithFetchedAnchors(
        path,
        missingCalendarIds,
        missingCalendarAnchors,
        firstPastPage,
      );
      const scanEndPage = hasCompleteHistoryCache
        ? getMissingCalendarScanEndPage(
            missingCalendarIds,
            missingCalendarAnchors,
            totalPages,
          )
        : totalPages;
      if (scanEndPage > firstPastPage) {
        await cachePastLecturePages(
          path,
          firstPastPage + 1,
          scanEndPage,
          totalPages,
          startDate,
          (pageLectures) => {
            lectures.push(...pageLectures);
          },
          false,
          missingCalendarIds,
          missingCalendarAnchors,
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

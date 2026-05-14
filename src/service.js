const Service = (() => {
  // Lecture identity
  function getLectureCacheIds(lectures) {
    return new Set(lectures.map(Cache.getLectureRecordId));
  }

  function getLectureFromCache(id) {
    const record = Cache.readLectureRecord(id);
    return record ? Cache.getLectureObjectFromRecord(record) : null;
  }

  function hasLectureCacheHit(cacheIds, lectures) {
    return lectures.some((lecture) =>
      cacheIds.has(Cache.getLectureRecordId(lecture)),
    );
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

  async function getLecturePage(path, page, options = {}) {
    const cached = Cache.readHistoryPageCache(path, page, options.totalPages);
    if (cached) {
      return cached;
    }

    const lectures = await Client.fetchLecturePage(path, page);
    Cache.writeHistoryPageCache(path, page, lectures);
    return lectures;
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
  async function getHistoryPageLectures(path, page, firstPage, totalPages) {
    return page === 1
      ? firstPage.lectures
      : getLecturePage(path, page, { totalPages });
  }

  function cachePastLecturesFromPage(path, pageLectures, startDate) {
    const pastLectures = pageLectures.filter(
      (lecture) => lecture.startAt < startDate,
    );
    if (pastLectures.length > 0) {
      Cache.writePastLectureCache(path, pastLectures);
    }
    return pastLectures;
  }

  function syncCalendarLectureIdsFromPage(path, pageLectures, startDate) {
    const calendarLectures = pageLectures.filter(
      (lecture) => lecture.startAt >= startDate,
    );
    if (calendarLectures.length > 0) {
      Cache.writeCalendarLectureCache(path, calendarLectures, startDate);
    }
    Cache.removeCalendarLectureIds(
      path,
      pageLectures
        .filter((lecture) => lecture.startAt < startDate)
        .map(Cache.getLectureRecordId),
    );
    return calendarLectures;
  }

  function getMissingCalendarLectureIds(path, liveLectures) {
    const liveIds = getLectureCacheIds(liveLectures);
    return new Set(
      Cache.getCachedCalendarLectureIds(path).filter((id) => !liveIds.has(id)),
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
    Cache.removeCalendarLectureIds(path, staleIds);
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
    let foundCurrentOrFutureLecture = false;
    const staleCalendarIds = new Set();

    for (let page = startPage; page <= endPage; page++) {
      const pageLectures = await getLiveLecturePage(path, page);
      const pastLectures = cachePastLecturesFromPage(
        path,
        pageLectures,
        startDate,
      );
      const calendarLectures = syncCalendarLectureIdsFromPage(
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
        onPage(lecturesForPage);
      }

      if (hasCurrentLectures) {
        foundCurrentOrFutureLecture = true;
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
      Cache.markCalendarLectureCacheComplete(path);
    }
    Cache.removeCalendarLectureIds(path, staleCalendarIds);
    if (endPage === totalPages && !foundCurrentOrFutureLecture) {
      Cache.markPastLectureCacheComplete(path);
    }
  }

  // Page entry points
  async function getCalendarLectures(startDate) {
    const path = Utils.getLectureHistoryPath();
    const firstPage = await getLectureHistoryHead(path);
    const totalPages = firstPage.totalPages;
    if (totalPages === 0) {
      Cache.markPastLectureCacheComplete(path);
      Cache.markCalendarLectureCacheComplete(path);
      return {
        lectures: [],
        loadPastLectures: null,
      };
    }

    const freshLectures = [];
    const cachedPast = Cache.readPastLectureCache(path);
    const hasFreshPastCache = cachedPast?.complete === true;
    const hasCompleteCalendarCache =
      Cache.hasCompleteCalendarLectureCache(path);
    let firstPastPage = null;

    for (let page = 1; page <= totalPages; page++) {
      const pageLectures = await getLiveLecturePage(path, page, firstPage);
      cachePastLecturesFromPage(path, pageLectures, startDate);
      syncCalendarLectureIdsFromPage(path, pageLectures, startDate);

      if (isPastLecturePage(pageLectures, startDate)) {
        firstPastPage = page;
        break;
      }

      freshLectures.push(...pageLectures);
    }

    if (firstPastPage === null) {
      Cache.markPastLectureCacheComplete(path);
      Cache.markCalendarLectureCacheComplete(path);
    }
    const missingCalendarIds = getMissingCalendarLectureIds(
      path,
      freshLectures,
    );
    if (firstPastPage === null) {
      Cache.removeCalendarLectureIds(path, missingCalendarIds);
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
    const pastScanEndPage = hasFreshPastCache
      ? getMissingCalendarScanEndPage(
          missingCalendarIds,
          missingCalendarAnchors,
          totalPages,
        )
      : totalPages;
    const calendarScanEndPage = hasCompleteCalendarCache
      ? pastScanEndPage
      : totalPages;

    return {
      lectures: updateLectures(
        freshLectures,
        firstPastPage === null
          ? []
          : Cache.getCachedPastLectures(path, startDate),
      ),
      loadPastLectures:
        firstPastPage !== null &&
        (!hasFreshPastCache ||
          !hasCompleteCalendarCache ||
          missingCalendarIds.size > 0)
          ? (onPage) =>
              cachePastLecturePages(
                path,
                firstPastPage + 1,
                calendarScanEndPage,
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
    const cachedPastIds = getLectureCacheIds(cachedPast?.lectures ?? []);
    const startDate = Utils.getTodayStartDate();
    let fetchedAllPages = true;

    for (let page = 1; page <= totalPages; page++) {
      const pageLectures = await getHistoryPageLectures(
        path,
        page,
        firstPage,
        totalPages,
      );
      const pastLectures = cachePastLecturesFromPage(
        path,
        pageLectures,
        startDate,
      );

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
      Cache.markPastLectureCacheComplete(path);
    }

    return updateLectures(
      lectures,
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

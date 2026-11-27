const Service = (() => {
  // Keep invalidated results usable without writing them back to the cache.
  const uncachedLectureDetails = new WeakSet();
  const cancellationPages = new Map();
  let historyRevision = 0;

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
        if (
          (!lecture.dateStr || !lecture.timeRangeStr) &&
          visible?.dateStr &&
          visible.timeRangeStr
        ) {
          lecture.dateStr = visible.dateStr;
          lecture.timeRangeStr = visible.timeRangeStr;
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

  function rememberCancellationPage(lectures, page, requestedAt) {
    for (const { lectureId, cancelId } of lectures) {
      if (cancelId || cancellationPages.has(lectureId)) {
        cancellationPages.set(lectureId, {
          cancelId,
          page,
          requestedAt,
          generation: Cache.historyGeneration,
        });
      }
    }
  }

  function getCancellationPage(id) {
    return cancellationPages.get(id);
  }

  async function getCurrentCancellations(ids) {
    const path = Utils.getLectureHistoryPath();
    const generation = Cache.historyGeneration;
    const head = await Client.fetchLectureHistoryHead(path, 1, "no-store");
    const isCurrent = () => generation === Cache.historyGeneration;
    const scan = { rowKeys: head.rowKeys, isCurrent };
    const found = new Map();
    function collect(page, rows) {
      for (const row of rows) {
        if (ids.has(row.lectureId) && !found.has(row.lectureId)) {
          found.set(row.lectureId, { ...row, page });
        }
      }
    }
    const readPage = (page, sequence) =>
      Client.fetchLecturePage(
        path,
        page,
        head.total,
        head.hasExpectedRowNumbers,
        sequence,
        "no-store",
      );
    collect(1, head.lectures);
    let through = 1;
    const hints = new Set(
      Array.from(ids, (id) => getCancellationPage(id)?.page),
    );
    for (const page of hints) {
      if (!isCurrent() || found.size === ids.size) return found;
      if (!page || page <= through || page > head.totalPages) continue;
      const adjacent = page === through + 1;
      collect(page, await readPage(page, adjacent ? scan : undefined));
      if (adjacent) through = page;
    }
    if (found.size < ids.size) {
      // Hints establish presence. Establish absence in native page order.
      for (const [id, row] of found) {
        if (row.page > through) found.delete(id);
      }
      for (
        let page = through + 1;
        page <= head.totalPages && isCurrent();
        page++
      ) {
        collect(page, await readPage(page, scan));
        if (found.size === ids.size) break;
      }
    }
    return found;
  }

  function reconcileCancellationHistory(updates, removedIds) {
    // A normal scan started before this observation must not restore its old snapshot.
    historyRevision++;
    Cache.removeHistoryLectureIds(Utils.getLectureHistoryPath(), removedIds);
    for (const id of removedIds) cancellationPages.delete(id);
    return updates.map(({ row, baseline, requestedAt }) => {
      const lecture = Cache.updateLectureCache(row, { fields: baseline });
      if (
        lecture.cancelId === row.cancelId &&
        lecture.startAt?.getTime() === row.startAt.getTime()
      ) {
        rememberCancellationPage([row], row.page, requestedAt);
      }
      return lecture;
    });
  }

  function historyChanged(error) {
    return (
      error?.code === "HISTORY_ORDER_CHANGED" ||
      error?.code === "HISTORY_PAGE_CHANGED"
    );
  }

  async function readCurrentHistory(readPages, input, retryOrder = true) {
    const path = Utils.getLectureHistoryPath();
    let retriedGeneration = retryOrder ? null : Cache.historyGeneration;
    // A foreground reader still needs a result if the popup clears its scan.
    for (;;) {
      const generation = Cache.historyGeneration;
      const revision = historyRevision;
      const isCurrent = () =>
        generation === Cache.historyGeneration && revision === historyRevision;
      const canRetryOrder = retriedGeneration !== generation;
      const cache = canRetryOrder ? "no-cache" : "no-store";
      try {
        const requestedAt = Date.now();
        const firstPage = await Client.fetchLectureHistoryHead(path, 1, cache);
        if (!isCurrent()) continue;
        Cache.writeHistoryPageCache(path, PAGE_ONE, firstPage.lectures, 0);
        rememberCancellationPage(firstPage.lectures, 1, requestedAt);
        const result = await readPages(
          path,
          { ...firstPage, isCurrent, canRetryOrder, cache },
          input,
        );
        if (isCurrent()) return result;
      } catch (error) {
        if (isCurrent()) {
          if (!canRetryOrder || !historyChanged(error)) throw error;
          retriedGeneration = generation;
        }
      }
    }
  }

  async function getLiveLecturePage(
    path,
    page,
    firstPage,
    previousLectureCount,
  ) {
    if (!firstPage.isCurrent()) return [];
    if (page === 1) return firstPage.lectures;

    const requestedAt = Date.now();
    const lectures = await Client.fetchLecturePage(
      path,
      page,
      firstPage.total,
      firstPage.hasExpectedRowNumbers,
      firstPage,
      firstPage.cache,
    );
    if (firstPage.isCurrent()) {
      Cache.writeHistoryPageCache(path, page, lectures, previousLectureCount);
      rememberCancellationPage(lectures, page, requestedAt);
    }
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
    const cached = Cache.getCachedLectureFields(url, requiredFields);
    if (cached) {
      return cached;
    }

    return loadLectureDetail(Cache.getLectureDetailCacheKey(url), url);
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
  ) {
    // Unread pages may contain registrations that were previously cancelled.
    for (let page = startPage; page <= firstPage.totalPages; page++) {
      const previousMissingLectures =
        missingIds.size > 0 ? getCachedLectureSnapshots(missingIds) : [];
      const pageLectures = await getLiveLecturePage(
        path,
        page,
        firstPage,
        previousLectureCount,
      );
      if (!firstPage.isCurrent()) return;
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
    }

    if (!firstPage.isCurrent()) return;
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
  async function getCalendarLectures(path, firstPage, startDate) {
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
    let firstPastPage = null;

    for (let page = 1; page <= totalPages; page++) {
      const pageLectures = await getLiveLecturePage(
        path,
        page,
        firstPage,
        fetchedLectures.length,
      );
      if (!firstPage.isCurrent()) return;
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
    const missingHistoryIds = getMissingHistoryLectureIds(
      path,
      fetchedLectures,
    );
    if (scannedAllPages) {
      Cache.markPastLectureCacheComplete(path);
      Cache.markHistoryLectureCacheComplete(path);
      Cache.removeHistoryLectureIds(path, missingHistoryIds);
    }

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
      loadPastLectures: scannedAllPages
        ? null
        : (onPage) =>
            cachePastLecturePages(
              path,
              firstPastPage + 1,
              { ...firstPage, retryTransient: true },
              fetchedLectures.length,
              startDate,
              onPage,
              true,
              missingHistoryIds,
            ).then(firstPage.isCurrent, (error) => {
              if (
                !firstPage.isCurrent() ||
                (firstPage.canRetryOrder && historyChanged(error))
              ) {
                return false;
              }
              throw error;
            }),
    };
  }

  async function getAllLectures(path, firstPage, { allowPartial = true } = {}) {
    const lectures = [];
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
      if (!firstPage.isCurrent()) return;
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
      const hadCompleteCache =
        hasFreshPastCache && Cache.hasCompleteHistoryLectureCache(path);
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
      ).catch((error) => {
        // Keep verified overlap warnings if only the additional tail scan failed.
        if (
          !allowPartial ||
          !hadCompleteCache ||
          missingHistoryIds.size > 0 ||
          !firstPage.isCurrent() ||
          error?.code === "HISTORY_ORDER_CHANGED" ||
          (firstPage.canRetryOrder && historyChanged(error))
        ) {
          throw error;
        }
        console.error(error);
      });
      if (!firstPage.isCurrent()) return;
    }

    return updateLectures(
      lectures,
      Cache.getCachedCalendarLectures(path, startDate),
      hasFreshPastCache ? Cache.getCachedPastLectures(path, startDate) : [],
    );
  }

  return {
    getAllLectures: (options) => readCurrentHistory(getAllLectures, options),
    getCalendarLectures: (startDate, retryOrder) =>
      readCurrentHistory(getCalendarLectures, startDate, retryOrder),
    getLectureDetail,
    getCancellationPage,
    getCurrentCancellations,
    reconcileCancellationHistory,
    getLectureFromDetailDocument,
    getLectureListItemsFromDocument,
    updateLectures,
  };
})();

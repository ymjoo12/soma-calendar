// Lecture identity
function getLectureCacheIds(lectures) {
  return new Set(lectures.map(getLectureRecordId));
}

function hasLectureCacheHit(cacheIds, lectures) {
  return lectures.some((lecture) => cacheIds.has(getLectureRecordId(lecture)));
}

// Shared lecture objects
function updateLectures(...lectureGroups) {
  const lectureMap = new Map();
  for (const lectureGroup of lectureGroups) {
    for (const lecture of lectureGroup) {
      const key = getLectureRecordId(lecture);
      const record = readLectureRecord(key);
      lectureMap.set(
        key,
        record ? getLectureObjectFromRecord(record) : lecture,
      );
    }
  }
  return normalizeLectureDates(Array.from(lectureMap.values()));
}

function getLectureListItemsFromDocument(container) {
  return Client.parseLectureListDocument(container).map(({ row, lecture }) => ({
    row,
    lecture: updateLectureCache(lecture),
  }));
}

function getLectureFromDetailDocument(container, url = location.href) {
  const lecture = Client.parseLectureDetailDocument(container);
  return updateLectureCache({
    ...lecture,
    lectureId: getLectureId(url),
    url: setPageIndexToOne(url),
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
  writeHistoryPageCache(path, PAGE_ONE, firstPage.lectures);
  return firstPage;
}

async function getLecturePage(path, page, options = {}) {
  if (!options.forceRefresh) {
    const cached = readHistoryPageCache(path, page, options.totalPages);
    if (cached) {
      return cached;
    }
  }

  const lectures = await Client.fetchLecturePage(path, page);
  writeHistoryPageCache(path, page, lectures);
  return lectures;
}

function loadLectureDetail(key, requestUrl) {
  if (lectureDetailRequests.has(key)) {
    return lectureDetailRequests.get(key);
  }

  const request = Client.fetchLectureDetail(requestUrl)
    .then((detail) => {
      const record = writeLectureRecord({
        ...detail,
        lectureId: key,
        url: requestUrl,
      });
      return getLectureObjectFromRecord(record);
    })
    .finally(() => {
      lectureDetailRequests.delete(key);
    });

  lectureDetailRequests.set(key, request);
  return request;
}

async function getLectureDetail(url, options = {}) {
  const requiredFields = options.requiredFields ?? LECTURE_RECORD_FIELDS;
  const key = getLectureDetailCacheKey(url);

  const cachedPast = getCachedPastLectureFields(url, requiredFields);
  if (cachedPast) {
    return cachedPast;
  }

  if (!options.forceRefresh) {
    const cached = getCachedLectureFields(url, requiredFields);
    if (cached) {
      return cached;
    }
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
    writePastLectureCache(path, pastLectures);
  }
  return pastLectures;
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
    const pageLectures = await getLecturePage(path, page, { totalPages });
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

// Page entry points
async function getCalendarLectures(startDate) {
  const path = getLectureHistoryPath();
  const firstPage = await getLectureHistoryHead(path);
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

  return {
    lectures: updateLectures(
      freshLectures,
      firstPastPage === null ? [] : getCachedPastLectures(path, startDate),
    ),
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
  const firstPage = await getLectureHistoryHead(path);
  const totalPages = firstPage.totalPages;
  const cachedPast = readPastLectureCache(path);
  const hasFreshPastCache = cachedPast?.complete === true;
  const cachedPastIds = getLectureCacheIds(cachedPast?.lectures ?? []);
  const startDate = getTodayStartDate();
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
    markPastLectureCacheComplete(path);
  }

  return updateLectures(
    lectures,
    hasFreshPastCache ? getCachedPastLectures(path, startDate) : [],
  );
}

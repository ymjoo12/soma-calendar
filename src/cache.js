const Cache = (() => {
  const LECTURE_RECORD_CACHE_PREFIX = "soma-lecture-record:";
  const LECTURE_ORDER_CACHE_PREFIX = "soma-lecture-order:";
  const LECTURE_PAST_STATE_PREFIX = "soma-lecture-past-state:";
  const LECTURE_CALENDAR_STATE_PREFIX = "soma-lecture-calendar-state:";
  const LECTURE_ORDER_HISTORY_LATEST = "history-latest";
  const LECTURE_ORDER_PAST_LATEST = "past-latest";
  const LECTURE_ORDER_CALENDAR_CURRENT = "calendar-current";
  const LEGACY_CACHE_PREFIXES = [
    "soma-lecture-detail:",
    "soma-history-item:",
    "soma-history-order:",
    "soma-history-first-page:",
    "soma-history-past-lectures:",
    "soma-past-lecture-detail:",
    "soma-lecture-first-page:",
  ];
  const lectureRecordMemory = new Map();
  const lectureObjectMemory = new Map();
  const lectureDetailRequests = new Map();

  // Cache keys
  function getLectureDetailCacheKey(url) {
    const parsedUrl = new URL(url, location.href);
    return parsedUrl.searchParams.get("qustnrSn") || parsedUrl.toString();
  }

  function getLectureRecordId(lecture) {
    return lecture.lectureId || getLectureDetailCacheKey(lecture.url);
  }

  function getLectureRecordCacheKey(id) {
    return LECTURE_RECORD_CACHE_PREFIX + id;
  }

  function getLectureOrderCacheKey(path, type) {
    return `${LECTURE_ORDER_CACHE_PREFIX}${type}:${path}`;
  }

  function getLecturePastStateKey(path) {
    return LECTURE_PAST_STATE_PREFIX + path;
  }

  function getLectureCalendarStateKey(path) {
    return LECTURE_CALENDAR_STATE_PREFIX + path;
  }

  // Lecture records
  function getStoredLectureRecord(storage, id) {
    try {
      const raw = storage.getItem(getLectureRecordCacheKey(id));
      if (!raw) {
        return null;
      }

      const record = JSON.parse(raw);
      if (
        record.version !== LECTURE_CACHE_VERSION ||
        record.id !== id ||
        !record.fields ||
        !record.fieldSavedAt
      ) {
        storage.removeItem(getLectureRecordCacheKey(id));
        return null;
      }

      return record;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function writeStoredLectureRecord(storage, record) {
    try {
      storage.setItem(
        getLectureRecordCacheKey(record.id),
        JSON.stringify(record),
      );
    } catch (error) {
      console.error(error);
    }
  }

  function mergeLectureRecords(...records) {
    const merged = {
      version: LECTURE_CACHE_VERSION,
      id: null,
      fields: {},
      fieldSavedAt: {},
    };

    for (const record of records) {
      if (!record) {
        continue;
      }
      merged.id = merged.id || record.id;
      for (const [field, value] of Object.entries(record.fields)) {
        const savedAt = record.fieldSavedAt[field];
        if (
          savedAt === undefined ||
          (merged.fieldSavedAt[field] !== undefined &&
            merged.fieldSavedAt[field] > savedAt)
        ) {
          continue;
        }
        merged.fields[field] = value;
        merged.fieldSavedAt[field] = savedAt;
      }
    }

    return merged.id ? merged : null;
  }

  function readLectureRecord(id) {
    const memoryRecord = lectureRecordMemory.get(id);
    const sessionRecord = getStoredLectureRecord(sessionStorage, id);
    const localRecord = getStoredLectureRecord(localStorage, id);
    const record = mergeLectureRecords(
      memoryRecord,
      sessionRecord,
      localRecord,
    );
    if (record) {
      lectureRecordMemory.set(id, record);
    }
    return record;
  }

  function normalizeLectureObject(lecture) {
    if (
      typeof Utils === "object" &&
      typeof Utils.normalizeLectureDates === "function" &&
      typeof lecture.dateStr === "string" &&
      typeof lecture.timeRangeStr === "string"
    ) {
      Utils.normalizeLectureDates([lecture]);
    }
    return lecture;
  }

  function getLectureObjectFromRecord(record) {
    let lecture = lectureObjectMemory.get(record.id);
    if (!lecture) {
      lecture = { lectureId: record.id };
      lectureObjectMemory.set(record.id, lecture);
    }

    for (const [field, value] of Object.entries(record.fields)) {
      if (value !== undefined && value !== null) {
        lecture[field] = value;
      }
    }

    return normalizeLectureObject(lecture);
  }

  function getLectureStartAt(fields) {
    if (
      typeof fields.dateStr !== "string" ||
      typeof fields.timeRangeStr !== "string"
    ) {
      return null;
    }

    const datePart = fields.dateStr.split("(")[0].trim();
    const startTime = fields.timeRangeStr.split("~")[0]?.trim();
    if (!datePart || !startTime) {
      return null;
    }

    const startAt = new Date(
      `${datePart}T${Utils.normalizeTimeStr(startTime)}`,
    );
    return Number.isNaN(startAt.getTime()) ? null : startAt;
  }

  function isPastLectureFields(fields) {
    const startAt = getLectureStartAt(fields);
    return startAt ? startAt < Utils.getTodayStartDate() : false;
  }

  function getLectureFieldTtl(fields, field) {
    if (isPastLectureFields(fields)) {
      return LECTURE_PAST_CACHE_TTL_MS;
    }
    return LECTURE_FIELD_TTLS_MS[field] ?? LECTURE_BASIC_CACHE_TTL_MS;
  }

  function hasLectureFields(record, fields) {
    return fields.every(
      (field) =>
        record.fields[field] !== undefined && record.fields[field] !== null,
    );
  }

  function hasFreshLectureFields(record, fields) {
    if (!hasLectureFields(record, fields)) {
      return false;
    }

    const values = record.fields;
    return fields.every((field) => {
      const ttl = getLectureFieldTtl(values, field);
      if (ttl <= 0) {
        return false;
      }
      return Date.now() - record.fieldSavedAt[field] <= ttl;
    });
  }

  function pickLectureFields(lecture) {
    const fields = {};
    for (const field of LECTURE_RECORD_FIELDS) {
      if (lecture[field] !== undefined && lecture[field] !== null) {
        fields[field] = lecture[field];
      }
    }
    return fields;
  }

  function writeLectureRecord(lecture) {
    const id = getLectureRecordId(lecture);
    const currentRecord = readLectureRecord(id);
    const now = Date.now();
    const incomingFields = pickLectureFields({ ...lecture, lectureId: id });
    const fields = {
      ...(currentRecord?.fields ?? {}),
      ...incomingFields,
    };
    const fieldSavedAt = { ...(currentRecord?.fieldSavedAt ?? {}) };

    for (const field of Object.keys(incomingFields)) {
      fieldSavedAt[field] = now;
    }

    const nextRecord = {
      version: LECTURE_CACHE_VERSION,
      id,
      fields,
      fieldSavedAt,
    };
    lectureRecordMemory.set(id, nextRecord);

    const storage = isPastLectureFields(fields) ? localStorage : sessionStorage;
    writeStoredLectureRecord(storage, nextRecord);
    if (storage === localStorage) {
      sessionStorage.removeItem(getLectureRecordCacheKey(id));
    } else {
      localStorage.removeItem(getLectureRecordCacheKey(id));
    }

    return nextRecord;
  }

  function writeLectureRecords(lectures) {
    for (const lecture of lectures) {
      writeLectureRecord(lecture);
    }
  }

  function getCachedLectureFieldsById(id, requiredFields) {
    const record = readLectureRecord(id);
    if (!record || !hasFreshLectureFields(record, requiredFields)) {
      return null;
    }
    return getLectureObjectFromRecord(record);
  }

  function getCachedLectureFields(url, requiredFields) {
    return getCachedLectureFieldsById(
      getLectureDetailCacheKey(url),
      requiredFields,
    );
  }

  function getCachedPastLectureFields(url, requiredFields) {
    const record = readLectureRecord(getLectureDetailCacheKey(url));
    if (
      !record ||
      !isPastLectureFields(record.fields) ||
      !hasFreshLectureFields(record, requiredFields)
    ) {
      return null;
    }
    return getLectureObjectFromRecord(record);
  }

  function getCachedLectureListItem(id) {
    const fields = getCachedLectureFieldsById(id, LECTURE_HISTORY_FIELDS);
    if (!fields) {
      return null;
    }
    return fields;
  }

  // History order
  function readLectureOrder(path, type, storage = sessionStorage) {
    const storageKey = getLectureOrderCacheKey(path, type);
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) {
        return null;
      }

      const cached = JSON.parse(raw);
      const ttl =
        storage === localStorage
          ? LECTURE_PAST_CACHE_TTL_MS
          : LECTURE_BASIC_CACHE_TTL_MS;
      if (
        cached.version !== LECTURE_CACHE_VERSION ||
        typeof cached.savedAt !== "number" ||
        Date.now() - cached.savedAt > ttl ||
        !Array.isArray(cached.ids)
      ) {
        storage.removeItem(storageKey);
        return null;
      }

      return cached.ids;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function writeLectureOrder(path, type, ids, storage = sessionStorage) {
    try {
      storage.setItem(
        getLectureOrderCacheKey(path, type),
        JSON.stringify({
          version: LECTURE_CACHE_VERSION,
          savedAt: Date.now(),
          ids,
        }),
      );
    } catch (error) {
      console.error(error);
    }
  }

  function canReuseHistoryTail(currentIds, orderIds) {
    if (currentIds.length === 0 || orderIds.length === 0) {
      return false;
    }

    const isSameHead = currentIds.every((id, index) => orderIds[index] === id);
    if (isSameHead) {
      return true;
    }

    const oldHeadIndex = currentIds.indexOf(orderIds[0]);
    if (oldHeadIndex <= 0) {
      return false;
    }

    return currentIds
      .slice(oldHeadIndex)
      .every((id, index) => orderIds[index] === id);
  }

  function mergeHistoryOrderWithFirstPage(path, firstPageLectures) {
    const currentIds = firstPageLectures.map(getLectureRecordId);
    const orderIds = readLectureOrder(path, LECTURE_ORDER_HISTORY_LATEST);

    if (orderIds && canReuseHistoryTail(currentIds, orderIds)) {
      writeLectureOrder(path, LECTURE_ORDER_HISTORY_LATEST, [
        ...currentIds,
        ...orderIds.filter((id) => !currentIds.includes(id)),
      ]);
      return;
    }

    writeLectureOrder(path, LECTURE_ORDER_HISTORY_LATEST, currentIds);
  }

  function mergeHistoryOrderWithPage(path, page, lectures) {
    const pageStartIndex = (Number(page) - 1) * LECTURE_HISTORY_PAGE_SIZE;
    const pageIds = lectures.map(getLectureRecordId);
    const orderIds = readLectureOrder(path, LECTURE_ORDER_HISTORY_LATEST) ?? [];
    const nextOrderIds = orderIds.filter((id) => !pageIds.includes(id));

    nextOrderIds.splice(pageStartIndex, pageIds.length, ...pageIds);
    writeLectureOrder(path, LECTURE_ORDER_HISTORY_LATEST, nextOrderIds);
  }

  function readHistoryPageCache(path, page, totalPages) {
    if (String(page) === PAGE_ONE) {
      return null;
    }

    const orderIds = readLectureOrder(path, LECTURE_ORDER_HISTORY_LATEST);
    if (!orderIds) {
      return null;
    }

    const pageStartIndex = (Number(page) - 1) * LECTURE_HISTORY_PAGE_SIZE;
    const pageIds = orderIds.slice(
      pageStartIndex,
      pageStartIndex + LECTURE_HISTORY_PAGE_SIZE,
    );
    const isLastPage = Number(page) === totalPages;
    if (
      pageIds.length === 0 ||
      (!isLastPage && pageIds.length < LECTURE_HISTORY_PAGE_SIZE)
    ) {
      return null;
    }

    const lectures = [];
    for (const id of pageIds) {
      const lecture = getCachedLectureListItem(id);
      if (!lecture) {
        return null;
      }
      lectures.push(lecture);
    }

    return Utils.normalizeLectureDates(lectures);
  }

  function getCachedHistoryLectureIds(path) {
    return readLectureOrder(path, LECTURE_ORDER_HISTORY_LATEST) ?? [];
  }

  function writeHistoryPageCache(path, page, lectures) {
    writeLectureRecords(lectures);

    if (String(page) === PAGE_ONE) {
      mergeHistoryOrderWithFirstPage(path, lectures);
      return;
    }

    mergeHistoryOrderWithPage(path, page, lectures);
  }

  // Past lectures
  function readPastLectureState(path) {
    try {
      const raw = localStorage.getItem(getLecturePastStateKey(path));
      if (!raw) {
        return { complete: false };
      }

      const cached = JSON.parse(raw);
      if (
        cached.version !== LECTURE_CACHE_VERSION ||
        typeof cached.savedAt !== "number" ||
        Date.now() - cached.savedAt > LECTURE_PAST_CACHE_TTL_MS
      ) {
        localStorage.removeItem(getLecturePastStateKey(path));
        return { complete: false };
      }

      return {
        complete: cached.complete === true,
      };
    } catch (error) {
      console.error(error);
      return { complete: false };
    }
  }

  function readCalendarLectureState(path) {
    try {
      const raw = localStorage.getItem(getLectureCalendarStateKey(path));
      if (!raw) {
        return { complete: false };
      }

      const cached = JSON.parse(raw);
      if (
        cached.version !== LECTURE_CACHE_VERSION ||
        typeof cached.savedAt !== "number" ||
        Date.now() - cached.savedAt > LECTURE_PAST_CACHE_TTL_MS
      ) {
        localStorage.removeItem(getLectureCalendarStateKey(path));
        return { complete: false };
      }

      return {
        complete: cached.complete === true,
      };
    } catch (error) {
      console.error(error);
      return { complete: false };
    }
  }

  function writePastLectureState(path, complete) {
    try {
      localStorage.setItem(
        getLecturePastStateKey(path),
        JSON.stringify({
          version: LECTURE_CACHE_VERSION,
          savedAt: Date.now(),
          complete,
        }),
      );
    } catch (error) {
      console.error(error);
    }
  }

  function writeCalendarLectureState(path, complete) {
    try {
      localStorage.setItem(
        getLectureCalendarStateKey(path),
        JSON.stringify({
          version: LECTURE_CACHE_VERSION,
          savedAt: Date.now(),
          complete,
        }),
      );
    } catch (error) {
      console.error(error);
    }
  }

  function readPastLectureCache(path) {
    const ids =
      readLectureOrder(path, LECTURE_ORDER_PAST_LATEST, localStorage) ?? [];
    const lectures = ids.map(getCachedLectureListItem).filter(Boolean);
    return {
      lectures: Utils.normalizeLectureDates(lectures),
      complete: ids.length > 0 && readPastLectureState(path).complete,
    };
  }

  function getCachedPastLectures(path, startDate) {
    return readPastLectureCache(path).lectures.filter(
      (lecture) => lecture.startAt < startDate,
    );
  }

  function getCachedCalendarLectureIds(path) {
    return (
      readLectureOrder(path, LECTURE_ORDER_CALENDAR_CURRENT, localStorage) ?? []
    );
  }

  function writeCalendarLectureCache(path, lectures, startDate) {
    const currentLectures = lectures.filter(
      (lecture) => lecture.startAt >= startDate,
    );
    if (currentLectures.length === 0) {
      return;
    }

    writeLectureRecords(currentLectures);
    const currentIds = currentLectures.map(getLectureRecordId);
    const existingIds = getCachedCalendarLectureIds(path);
    const lecturesById = new Map();
    const unknownIds = [];
    for (const id of existingIds) {
      const record = readLectureRecord(id);
      const lecture = record ? getLectureObjectFromRecord(record) : null;
      if (lecture && lecture.startAt >= startDate) {
        lecturesById.set(id, lecture);
      } else if (!lecture) {
        unknownIds.push(id);
      }
    }
    for (const lecture of currentLectures) {
      lecturesById.set(getLectureRecordId(lecture), lecture);
    }

    writeLectureOrder(
      path,
      LECTURE_ORDER_CALENDAR_CURRENT,
      [
        ...Utils.normalizeLectureDates(Array.from(lecturesById.values())).map(
          getLectureRecordId,
        ),
        ...unknownIds.filter((id) => !currentIds.includes(id)),
      ],
      localStorage,
    );
  }

  function removeCalendarLectureIds(path, ids) {
    const removeIds = new Set(ids);
    if (removeIds.size === 0) {
      return;
    }

    const existingIds =
      readLectureOrder(path, LECTURE_ORDER_CALENDAR_CURRENT, localStorage) ??
      [];
    writeLectureOrder(
      path,
      LECTURE_ORDER_CALENDAR_CURRENT,
      existingIds.filter((id) => !removeIds.has(id)),
      localStorage,
    );
  }

  function writePastLectureCache(path, lectures, complete = false) {
    const pastLectures = lectures.filter((lecture) =>
      isPastLectureFields(lecture),
    );
    if (pastLectures.length === 0) {
      return;
    }

    writeLectureRecords(pastLectures);
    const existingIds =
      readLectureOrder(path, LECTURE_ORDER_PAST_LATEST, localStorage) ?? [];
    const pastIds = pastLectures.map(getLectureRecordId);
    writeLectureOrder(
      path,
      LECTURE_ORDER_PAST_LATEST,
      [...pastIds, ...existingIds.filter((id) => !pastIds.includes(id))],
      localStorage,
    );
    if (complete) {
      writePastLectureState(path, true);
    }
  }

  function markPastLectureCacheComplete(path) {
    writePastLectureState(path, true);
  }

  function hasCompleteCalendarLectureCache(path) {
    return readCalendarLectureState(path).complete;
  }

  function markCalendarLectureCacheComplete(path) {
    writeCalendarLectureState(path, true);
  }

  function updateLectureCache(lecture) {
    return getLectureObjectFromRecord(writeLectureRecord(lecture));
  }

  // Cached requests
  function loadLectureDetailRequest(key, createRequest) {
    if (lectureDetailRequests.has(key)) {
      return lectureDetailRequests.get(key);
    }

    const request = createRequest().finally(() => {
      lectureDetailRequests.delete(key);
    });

    lectureDetailRequests.set(key, request);
    return request;
  }

  // Cache clearing
  function removeCacheKeysByPrefix(storage, prefixes) {
    for (let index = storage.length - 1; index >= 0; index--) {
      const key = storage.key(index);
      if (prefixes.some((prefix) => key?.startsWith(prefix))) {
        storage.removeItem(key);
      }
    }
  }

  function clearAllLectureCache() {
    const prefixes = [
      LECTURE_RECORD_CACHE_PREFIX,
      LECTURE_ORDER_CACHE_PREFIX,
      LECTURE_PAST_STATE_PREFIX,
      LECTURE_CALENDAR_STATE_PREFIX,
      ...LEGACY_CACHE_PREFIXES,
    ];
    try {
      lectureRecordMemory.clear();
      lectureObjectMemory.clear();
      lectureDetailRequests.clear();
      removeCacheKeysByPrefix(sessionStorage, prefixes);
      removeCacheKeysByPrefix(localStorage, prefixes);
    } catch (error) {
      console.error(error);
    }
  }

  function clearHistorySessionCache() {
    const prefixes = [
      LECTURE_RECORD_CACHE_PREFIX,
      LECTURE_ORDER_CACHE_PREFIX,
      ...LEGACY_CACHE_PREFIXES,
    ];
    try {
      lectureRecordMemory.clear();
      lectureObjectMemory.clear();
      removeCacheKeysByPrefix(sessionStorage, prefixes);
    } catch (error) {
      console.error(error);
    }
  }

  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type !== "SOMA_CLEAR_CACHE") {
        return false;
      }

      clearAllLectureCache();
      sendResponse({ ok: true });
      return false;
    });
  }

  return {
    clearAllLectureCache,
    clearHistorySessionCache,
    getCachedCalendarLectureIds,
    getCachedHistoryLectureIds,
    getCachedLectureFields,
    getCachedPastLectureFields,
    getCachedPastLectures,
    getLectureDetailCacheKey,
    getLectureObjectFromRecord,
    getLectureRecordId,
    hasCompleteCalendarLectureCache,
    loadLectureDetailRequest,
    markCalendarLectureCacheComplete,
    markPastLectureCacheComplete,
    readHistoryPageCache,
    readLectureRecord,
    readPastLectureCache,
    removeCalendarLectureIds,
    updateLectureCache,
    writeCalendarLectureCache,
    writeHistoryPageCache,
    writePastLectureCache,
  };
})();

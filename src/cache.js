const Cache = (() => {
  const LECTURE_RECORD_CACHE_PREFIX = "soma-lecture-record:";
  const LECTURE_ORDER_CACHE_PREFIX = "soma-lecture-order:";
  const LECTURE_PAST_STATE_PREFIX = "soma-lecture-past-state:";
  const LECTURE_HISTORY_STATE_PREFIX = "soma-lecture-history-state:";
  const LECTURE_ORDER_HISTORY_LATEST = "history-latest";
  const LEGACY_CACHE_PREFIXES = [
    "soma-lecture-detail:",
    "soma-history-item:",
    "soma-history-order:",
    "soma-history-first-page:",
    "soma-history-past-lectures:",
    "soma-past-lecture-detail:",
    "soma-lecture-first-page:",
    "soma-lecture-calendar-state:",
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

  function getLectureHistoryStateKey(path) {
    return LECTURE_HISTORY_STATE_PREFIX + path;
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
    return getLectureDateTime(fields, 0);
  }

  function getLectureEndAt(fields) {
    return getLectureDateTime(fields, 1);
  }

  function getLectureDateTime(fields, timeIndex) {
    if (
      typeof fields.dateStr !== "string" ||
      typeof fields.timeRangeStr !== "string"
    ) {
      return null;
    }

    const datePart = fields.dateStr.split("(")[0].trim();
    const time = fields.timeRangeStr.split("~")[timeIndex]?.trim();
    if (!datePart || !time) {
      return null;
    }

    const dateTime = new Date(`${datePart}T${Utils.normalizeTimeStr(time)}`);
    return Number.isNaN(dateTime.getTime()) ? null : dateTime;
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

  function getLectureOrderEntry(lecture) {
    const id =
      typeof lecture === "string" ? lecture : getLectureRecordId(lecture);
    const record = readLectureRecord(id);
    const fields =
      typeof lecture === "string"
        ? { ...(record?.fields ?? {}) }
        : {
            ...(record?.fields ?? {}),
            ...pickLectureFields({ ...lecture, lectureId: id }),
          };
    const startAt = getLectureStartAt(fields);
    const endAt = getLectureEndAt(fields);

    return {
      id,
      dateStr: fields.dateStr ?? null,
      timeRangeStr: fields.timeRangeStr ?? null,
      startAt: startAt ? startAt.getTime() : null,
      endAt: endAt ? endAt.getTime() : null,
    };
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
    updateLectureOrderEntries(id, nextRecord.fields);

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
  function readLectureOrderCache(path, type, storage = sessionStorage) {
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
      const hasIds = Array.isArray(cached.ids);
      const hasItems = Array.isArray(cached.items);
      if (
        cached.version !== LECTURE_CACHE_VERSION ||
        typeof cached.savedAt !== "number" ||
        Date.now() - cached.savedAt > ttl ||
        (!hasIds && !hasItems)
      ) {
        storage.removeItem(storageKey);
        return null;
      }

      return cached;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function normalizeLectureOrderEntry(entry) {
    if (typeof entry === "string") {
      return getLectureOrderEntry(entry);
    }

    const id = entry?.id;
    if (!id) {
      return null;
    }

    const currentEntry = getLectureOrderEntry(id);
    const fields = {
      ...currentEntry,
      dateStr: entry.dateStr ?? currentEntry.dateStr,
      timeRangeStr: entry.timeRangeStr ?? currentEntry.timeRangeStr,
    };
    const startAt =
      typeof entry.startAt === "number"
        ? entry.startAt
        : getLectureStartAt(fields)?.getTime();
    const endAt =
      typeof entry.endAt === "number"
        ? entry.endAt
        : getLectureEndAt(fields)?.getTime();

    return {
      id,
      dateStr: fields.dateStr ?? null,
      timeRangeStr: fields.timeRangeStr ?? null,
      startAt: startAt ?? null,
      endAt: endAt ?? null,
    };
  }

  function getLectureOrderEntriesFromCache(cached) {
    const source = Array.isArray(cached.items) ? cached.items : cached.ids;
    return source.map(normalizeLectureOrderEntry).filter(Boolean);
  }

  function readLectureOrderEntries(path, type, storage = sessionStorage) {
    const cached = readLectureOrderCache(path, type, storage);
    return cached ? getLectureOrderEntriesFromCache(cached) : null;
  }

  function writeLectureOrderCacheByKey(
    storage,
    storageKey,
    entries,
    savedAt = Date.now(),
  ) {
    const items = entries.map(normalizeLectureOrderEntry).filter(Boolean);
    try {
      storage.setItem(
        storageKey,
        JSON.stringify({
          version: LECTURE_CACHE_VERSION,
          savedAt,
          ids: items.map((entry) => entry.id),
          items,
        }),
      );
    } catch (error) {
      console.error(error);
    }
  }

  function writeLectureOrder(path, type, entries, storage = sessionStorage) {
    writeLectureOrderCacheByKey(
      storage,
      getLectureOrderCacheKey(path, type),
      entries,
    );
  }

  function updateLectureOrderEntries(id, fields) {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (!key?.startsWith(LECTURE_ORDER_CACHE_PREFIX)) {
        continue;
      }

      try {
        const raw = localStorage.getItem(key);
        const cached = raw ? JSON.parse(raw) : null;
        if (
          !cached ||
          cached.version !== LECTURE_CACHE_VERSION ||
          typeof cached.savedAt !== "number" ||
          Date.now() - cached.savedAt > LECTURE_PAST_CACHE_TTL_MS
        ) {
          continue;
        }

        const entries = getLectureOrderEntriesFromCache(cached);
        const entryIndex = entries.findIndex((entry) => entry.id === id);
        if (entryIndex === -1) {
          continue;
        }

        entries[entryIndex] = getLectureOrderEntry({
          ...fields,
          lectureId: id,
        });
        writeLectureOrderCacheByKey(localStorage, key, entries, cached.savedAt);
      } catch (error) {
        console.error(error);
      }
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
    const currentEntries = firstPageLectures.map(getLectureOrderEntry);
    const currentIds = currentEntries.map((entry) => entry.id);
    const orderEntries =
      readLectureOrderEntries(
        path,
        LECTURE_ORDER_HISTORY_LATEST,
        localStorage,
      ) ?? [];
    const orderIds = orderEntries.map((entry) => entry.id);

    if (canReuseHistoryTail(currentIds, orderIds)) {
      const currentIdSet = new Set(currentIds);
      writeLectureOrder(
        path,
        LECTURE_ORDER_HISTORY_LATEST,
        [
          ...currentEntries,
          ...orderEntries.filter((entry) => !currentIdSet.has(entry.id)),
        ],
        localStorage,
      );
      return;
    }

    writeLectureOrder(
      path,
      LECTURE_ORDER_HISTORY_LATEST,
      currentEntries,
      localStorage,
    );
    writeHistoryLectureState(path, false);
  }

  function mergeHistoryOrderWithPage(path, page, lectures) {
    const pageStartIndex = (Number(page) - 1) * LECTURE_HISTORY_PAGE_SIZE;
    const pageEntries = lectures.map(getLectureOrderEntry);
    const pageIds = pageEntries.map((entry) => entry.id);
    const orderEntries =
      readLectureOrderEntries(
        path,
        LECTURE_ORDER_HISTORY_LATEST,
        localStorage,
      ) ?? [];
    const orderIds = orderEntries.map((entry) => entry.id);
    const currentPageIds = orderIds.slice(
      pageStartIndex,
      pageStartIndex + pageIds.length,
    );
    const isSamePage = pageIds.every(
      (id, index) => currentPageIds[index] === id,
    );
    const pageIdSet = new Set(pageIds);
    const nextOrderEntries = orderEntries.filter(
      (entry) => !pageIdSet.has(entry.id),
    );

    nextOrderEntries.splice(pageStartIndex, pageIds.length, ...pageEntries);
    writeLectureOrder(
      path,
      LECTURE_ORDER_HISTORY_LATEST,
      nextOrderEntries,
      localStorage,
    );
    if (!isSamePage) {
      writeHistoryLectureState(path, false);
    }
  }

  function getCachedHistoryLectureIds(path) {
    return getCachedHistoryLectureEntries(path).map((entry) => entry.id);
  }

  function getCachedHistoryLectureEntries(path) {
    return (
      readLectureOrderEntries(
        path,
        LECTURE_ORDER_HISTORY_LATEST,
        localStorage,
      ) ?? []
    );
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

  function readHistoryLectureState(path) {
    try {
      const raw = localStorage.getItem(getLectureHistoryStateKey(path));
      if (!raw) {
        return { complete: false };
      }

      const cached = JSON.parse(raw);
      if (
        cached.version !== LECTURE_CACHE_VERSION ||
        typeof cached.savedAt !== "number" ||
        Date.now() - cached.savedAt > LECTURE_PAST_CACHE_TTL_MS
      ) {
        localStorage.removeItem(getLectureHistoryStateKey(path));
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

  function writeHistoryLectureState(path, complete) {
    try {
      localStorage.setItem(
        getLectureHistoryStateKey(path),
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
    const ids = getCachedHistoryLectureIds(path);
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

  function getCachedCalendarLectureIds(path, startDate) {
    const startTime = startDate.getTime();
    return getCachedHistoryLectureEntries(path)
      .filter((entry) => entry.startAt === null || entry.startAt >= startTime)
      .map((entry) => entry.id);
  }

  function getCachedCalendarLectures(path, startDate) {
    return getCachedCalendarLectureIds(path, startDate)
      .map(getCachedLectureListItem)
      .filter(Boolean)
      .filter((lecture) => lecture.startAt >= startDate);
  }

  function removeHistoryLectureIds(path, ids) {
    const removeIds = new Set(ids);
    if (removeIds.size === 0) {
      return;
    }

    const existingEntries = getCachedHistoryLectureEntries(path);
    writeLectureOrder(
      path,
      LECTURE_ORDER_HISTORY_LATEST,
      existingEntries.filter((entry) => !removeIds.has(entry.id)),
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
    if (complete) {
      writePastLectureState(path, true);
    }
  }

  function markPastLectureCacheComplete(path) {
    writePastLectureState(path, true);
  }

  function hasCompleteHistoryLectureCache(path) {
    return readHistoryLectureState(path).complete;
  }

  function markHistoryLectureCacheComplete(path) {
    writeHistoryLectureState(path, true);
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
      LECTURE_HISTORY_STATE_PREFIX,
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
    getCachedCalendarLectures,
    getCachedHistoryLectureEntries,
    getCachedHistoryLectureIds,
    getCachedLectureFields,
    getCachedPastLectureFields,
    getCachedPastLectures,
    getLectureDetailCacheKey,
    getLectureObjectFromRecord,
    getLectureRecordId,
    hasCompleteHistoryLectureCache,
    loadLectureDetailRequest,
    markHistoryLectureCacheComplete,
    markPastLectureCacheComplete,
    readLectureRecord,
    readPastLectureCache,
    removeHistoryLectureIds,
    updateLectureCache,
    writeHistoryPageCache,
    writePastLectureCache,
  };
})();

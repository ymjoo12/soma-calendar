const PAGE_ONE = "1";
const LECTURE_DETAIL_CONCURRENCY_LIMIT = 5;
const LECTURE_CACHE_VERSION = 2;
const LECTURE_RECORD_CACHE_PREFIX = "soma-lecture-record:";
const LECTURE_ORDER_CACHE_PREFIX = "soma-lecture-order:";
const LECTURE_PAST_STATE_PREFIX = "soma-lecture-past-state:";
const LECTURE_BASIC_CACHE_TTL_MS = 30 * 60 * 1000;
const LECTURE_VOLATILE_CACHE_TTL_MS = 30 * 1000;
const LECTURE_PAST_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LECTURE_HISTORY_PAGE_SIZE = 10;
const LECTURE_ORDER_HISTORY_LATEST = "history-latest";
const LECTURE_ORDER_PAST_LATEST = "past-latest";
const LECTURE_RECORD_FIELDS = [
  "url",
  "title",
  "author",
  "dateStr",
  "timeRangeStr",
  "lectureId",
  "cancelId",
  "cancelGubun",
  "deliveryMethod",
  "isOnline",
  "timeStr",
  "location",
  "capacityText",
  "totalCount",
  "appliedCount",
  "isApproved",
  "applyId",
];
const LECTURE_HISTORY_FIELDS = [
  "url",
  "title",
  "author",
  "dateStr",
  "timeRangeStr",
  "lectureId",
  "isApproved",
];
const LECTURE_FIELD_TTLS_MS = {
  url: LECTURE_BASIC_CACHE_TTL_MS,
  title: LECTURE_BASIC_CACHE_TTL_MS,
  author: LECTURE_BASIC_CACHE_TTL_MS,
  dateStr: LECTURE_BASIC_CACHE_TTL_MS,
  timeRangeStr: LECTURE_BASIC_CACHE_TTL_MS,
  lectureId: LECTURE_BASIC_CACHE_TTL_MS,
  cancelId: LECTURE_BASIC_CACHE_TTL_MS,
  cancelGubun: LECTURE_BASIC_CACHE_TTL_MS,
  deliveryMethod: LECTURE_BASIC_CACHE_TTL_MS,
  isOnline: LECTURE_BASIC_CACHE_TTL_MS,
  timeStr: LECTURE_BASIC_CACHE_TTL_MS,
  location: LECTURE_VOLATILE_CACHE_TTL_MS,
  capacityText: LECTURE_VOLATILE_CACHE_TTL_MS,
  totalCount: LECTURE_VOLATILE_CACHE_TTL_MS,
  appliedCount: LECTURE_VOLATILE_CACHE_TTL_MS,
  isApproved: LECTURE_BASIC_CACHE_TTL_MS,
  applyId: LECTURE_VOLATILE_CACHE_TTL_MS,
};
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
const lectureDetailRequests = new Map();

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
  const record = mergeLectureRecords(memoryRecord, sessionRecord, localRecord);
  if (record) {
    lectureRecordMemory.set(id, record);
  }
  return record;
}

function getRecordValues(record) {
  return { ...record.fields };
}

function getLectureStartAtFromListFields(fields) {
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

  const startAt = new Date(`${datePart}T${normalizeTimeStr(startTime)}`);
  return Number.isNaN(startAt.getTime()) ? null : startAt;
}

function getLectureStartAtFromDetailFields(fields) {
  if (typeof fields.timeStr !== "string") {
    return null;
  }

  const dateMatch = fields.timeStr.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!dateMatch) {
    return null;
  }

  const [, year, month, day] = dateMatch;
  const timeText = fields.timeStr.slice(dateMatch.index + dateMatch[0].length);
  const timeMatch = timeText.match(/(\d{1,2})(?::(\d{2}))?\s*시?/);
  if (!timeMatch) {
    return null;
  }

  const [, hour, minute = "0"] = timeMatch;
  const datePart = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const startAt = new Date(
    `${datePart}T${normalizeTimeStr(`${hour}:${minute}:0`)}`,
  );
  return Number.isNaN(startAt.getTime()) ? null : startAt;
}

function getLectureStartAt(fields) {
  return (
    getLectureStartAtFromListFields(fields) ||
    getLectureStartAtFromDetailFields(fields)
  );
}

function isPastLectureFields(fields) {
  const startAt = getLectureStartAt(fields);
  return startAt ? startAt < getTodayStartDate() : false;
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

  const values = getRecordValues(record);
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
  return getRecordValues(record);
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
  return getRecordValues(record);
}

function getCachedLectureListItem(id) {
  const fields = getCachedLectureFieldsById(id, LECTURE_HISTORY_FIELDS);
  if (!fields) {
    return null;
  }
  return fields;
}

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

function writeHistoryLatestOrder(path, ids) {
  writeLectureOrder(path, LECTURE_ORDER_HISTORY_LATEST, ids);
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
    writeHistoryLatestOrder(path, [
      ...currentIds,
      ...orderIds.filter((id) => !currentIds.includes(id)),
    ]);
    return;
  }

  writeHistoryLatestOrder(path, currentIds);
}

function mergeHistoryOrderWithPage(path, page, lectures) {
  const pageStartIndex = (Number(page) - 1) * LECTURE_HISTORY_PAGE_SIZE;
  const pageIds = lectures.map(getLectureRecordId);
  const orderIds = readLectureOrder(path, LECTURE_ORDER_HISTORY_LATEST) ?? [];
  const nextOrderIds = orderIds.filter((id) => !pageIds.includes(id));

  nextOrderIds.splice(pageStartIndex, pageIds.length, ...pageIds);
  writeHistoryLatestOrder(path, nextOrderIds);
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

  return normalizeLectureDates(lectures);
}

function writeHistoryPageCache(path, page, lectures) {
  writeLectureRecords(lectures);

  if (String(page) === PAGE_ONE) {
    mergeHistoryOrderWithFirstPage(path, lectures);
    return;
  }

  mergeHistoryOrderWithPage(path, page, lectures);
}

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

function readPastLectureCache(path) {
  const ids =
    readLectureOrder(path, LECTURE_ORDER_PAST_LATEST, localStorage) ?? [];
  const lectures = ids.map(getCachedLectureListItem).filter(Boolean);
  return {
    lectures: normalizeLectureDates(lectures),
    complete: ids.length > 0 && readPastLectureState(path).complete,
  };
}

function getCachedPastLectures(path, startDate) {
  return readPastLectureCache(path).lectures.filter(
    (lecture) => lecture.startAt < startDate,
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

async function fetchLecturePageHtml(path, page) {
  const res = await fetch(path + "&pageIndex=" + page, {
    credentials: "include",
  });
  return res.text();
}

async function fetchLecturePage(path, page, options = {}) {
  if (!options.forceRefresh) {
    const cached = readHistoryPageCache(path, page, options.totalPages);
    if (cached) {
      return cached;
    }
  }

  const html = await fetchLecturePageHtml(path, page);
  const lectures = normalizeLectureDates(extractLectureListFromHTML(html));
  writeHistoryPageCache(path, page, lectures);
  return lectures;
}

function fetchLectureDetail(key, requestUrl) {
  if (lectureDetailRequests.has(key)) {
    return lectureDetailRequests.get(key);
  }

  const request = fetch(requestUrl, { credentials: "include" })
    .then((res) => res.text())
    .then((html) => {
      const detail = extractLectureDetailFromHTML(html);
      writeLectureRecord({
        ...detail,
        lectureId: key,
        url: requestUrl,
      });
      return detail;
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

  if (options.preferPastCache) {
    const cached = getCachedPastLectureFields(url, requiredFields);
    if (cached) {
      return cached;
    }
  }

  if (!options.forceRefresh) {
    const cached = getCachedLectureFields(url, requiredFields);
    if (cached) {
      return cached;
    }
  }

  return fetchLectureDetail(key, url);
}

function updateLectureCache(lecture) {
  return writeLectureRecord(lecture);
}

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
    ...LEGACY_CACHE_PREFIXES,
  ];
  try {
    lectureRecordMemory.clear();
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

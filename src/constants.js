// Lecture constants
const PAGE_ONE = "1";
const LECTURE_DETAIL_CONCURRENCY_LIMIT = 5;
const LECTURE_CACHE_VERSION = 3;
const LECTURE_BASIC_CACHE_TTL_MS = 30 * 60 * 1000;
const LECTURE_VOLATILE_CACHE_TTL_MS = 30 * 1000;
const LECTURE_PAST_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LECTURE_HISTORY_PAGE_SIZE = 10;
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

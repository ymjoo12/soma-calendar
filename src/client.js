const Client = (() => {
  // Shared parsing
  function getDetailTimeFields(timeStr) {
    if (typeof timeStr !== "string") {
      return {};
    }

    const datePattern = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/g;
    const [dateMatch, endDate, extraDate] = timeStr.matchAll(datePattern);
    if (!dateMatch || extraDate) {
      return {};
    }

    const [, year, month, day] = dateMatch;
    // A history card represents one date. Only strip a repeated end date if it matches.
    if (
      endDate &&
      [1, 2, 3].some((i) => Number(endDate[i]) !== Number(dateMatch[i]))
    ) {
      return {};
    }
    const timeText = timeStr
      .slice(dateMatch.index + dateMatch[0].length)
      .replace(datePattern, " ");
    const timeMatches = [...timeText.matchAll(/(\d{1,2})(?::(\d{2}))?\s*시?/g)];
    if (timeMatches.length < 2) {
      return {};
    }

    const formatTime = ([, hour, minute = "0"]) =>
      `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
    const weekday = timeStr.match(/\([^)]+\)/)?.[0] || "";
    const fields = {
      dateStr: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}${weekday}`,
      timeRangeStr: `${formatTime(timeMatches[0])} ~ ${formatTime(timeMatches[1])}`,
    };
    const [{ startAt, endAt }] = Utils.normalizeLectureDates([{ ...fields }]);
    return startAt < endAt && startAt.getDate() === Number(day) ? fields : {};
  }

  function getTopValue(container, label) {
    const group = [...container.querySelectorAll("div.top .group")].find(
      (item) => item.querySelector(".t")?.innerText.trim() === label,
    );
    const value = group?.querySelector(".c");
    return value
      ? value.innerText.replace(/\s+/g, " ").trim() || null
      : undefined;
  }

  function getPeopleCount(text) {
    return text?.match(/(\d+)\s*명/)?.[1] || text?.match(/(\d+)/)?.[1] || null;
  }

  function getAppliedCount(text) {
    return text?.match(/\[(\d+)\s*명\]/)?.[1] || getPeopleCount(text);
  }

  // History pages
  function parseLectureHistoryRow(row, rowKeys) {
    const tds = row.querySelectorAll("td");
    if (tds.length < 8) {
      throw new Error("Incomplete lecture history row");
    }

    const applied = tds[6].innerText.trim();
    const href = tds[2].querySelector("a")?.href;
    const urlId = href && Utils.getLectureId(href);
    // Match possible moves independently of status, but compare both on reread.
    rowKeys.push({
      key: urlId ? JSON.stringify([urlId, tds[5].innerText.trim()]) : null,
      applied,
    });
    // Deleted lectures can still have a history row without a detail link.
    if (applied !== "접수완료" || !href) {
      return null;
    }
    const url = Utils.setPageIndexToOne(href);
    const title = tds[2].innerText.trim();
    const author = tds[3].innerText.trim();
    if (!title || !author) {
      throw new Error("Incomplete registered lecture");
    }

    const [dateStr, timeRangeStr] = tds[4].innerText
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map((str) => str.trim())
      .filter(Boolean);
    if (!dateStr || !timeRangeStr) {
      throw new Error("Missing registered lecture schedule");
    }

    const isApproved = tds[7].innerText.trim() === "OK";
    const cancelHref = row
      .querySelector('a[href*="delDate("]')
      ?.getAttribute("href");
    const cancelMatch = cancelHref?.match(
      /delDate\('([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\)/,
    );
    const lectureId = urlId || cancelMatch?.[2];
    const canCancel = cancelMatch && cancelMatch[2] === lectureId;

    return {
      url,
      title,
      author,
      dateStr,
      timeRangeStr,
      isApproved,
      lectureId,
      cancelId: canCancel ? cancelMatch[1] : null,
      cancelGubun: canCancel ? cancelMatch[3] : null,
    };
  }

  function parseLectureHistoryDocument(container, page, expectedTotal) {
    const totalText = container
      .querySelector(".bbs-total strong.color-blue")
      ?.nextSibling?.textContent.trim();
    const count = totalText?.match(
      /^:?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\s*건)?(?=\s|$)/,
    );
    const total = count ? Number(count[1].replace(/,/g, "")) : NaN;
    const table = container.querySelector(
      "#contentsList > div > div > div.boardlist > div.tbl-ovx > table",
    );
    if (!Number.isSafeInteger(total) || !table) {
      throw new Error("Invalid lecture history document");
    }

    const rows = table.querySelectorAll(":scope > tbody > tr");
    const firstRowNumber = total - (page - 1) * LECTURE_HISTORY_PAGE_SIZE;
    // The last page may legitimately be empty after registrations are removed.
    const pageDisappeared =
      expectedTotal !== undefined &&
      total < expectedTotal &&
      firstRowNumber <= 0;
    if (total === 0 || pageDisappeared) {
      if (
        rows.length > 1 ||
        (rows.length === 1 && rows[0].querySelectorAll("td").length !== 1)
      ) {
        throw new Error("History rows contradict the empty registration count");
      }
      return {
        total,
        totalPages: Math.ceil(total / LECTURE_HISTORY_PAGE_SIZE),
        lectures: [],
        rowKeys: [],
        hasExpectedRowNumbers: false,
      };
    }
    const expectedRows = Math.min(LECTURE_HISTORY_PAGE_SIZE, firstRowNumber);
    if (expectedRows <= 0 || rows.length !== expectedRows) {
      throw new Error("Incomplete lecture history page");
    }
    // Only the native descending NO. layout can establish page identity.
    const hasExpectedRowNumbers = [...rows].every(
      (row, index) =>
        row.querySelectorAll("td")[0]?.innerText.trim() ===
        String(firstRowNumber - index),
    );
    const rowKeys = [];
    const lectures = Utils.normalizeLectureDates(
      [...rows]
        .map((row) => parseLectureHistoryRow(row, rowKeys))
        .filter(Boolean),
    );
    if (
      lectures.some(
        (lecture) =>
          Number.isNaN(lecture.startAt.getTime()) ||
          Number.isNaN(lecture.endAt.getTime()),
      )
    ) {
      throw new Error("Invalid registered lecture schedule");
    }
    return {
      total,
      totalPages: Math.ceil(total / LECTURE_HISTORY_PAGE_SIZE),
      lectures,
      rowKeys,
      hasExpectedRowNumbers,
    };
  }

  // Lecture list page
  function parseLectureListRow(row) {
    const link = row.querySelector('a[href*="mentoLec/view.do"]');
    const dateTimeText = row
      .querySelector("td:nth-child(4)")
      ?.innerText.replace(/\u00a0/g, " ");
    const [dateStr, timeRangeStr] =
      dateTimeText
        ?.split("\n")
        .map((text) => text.trim())
        .filter(Boolean) ?? [];
    const title = row.querySelector(".tit")?.innerText.trim();
    if (!link || !dateStr || !timeRangeStr) {
      return null;
    }

    return {
      url: Utils.setPageIndexToOne(link.href),
      title,
      dateStr,
      timeRangeStr,
      lectureId: Utils.getLectureId(link.href),
    };
  }

  function parseLectureListDocument(container) {
    const rows = container.querySelectorAll(
      "#listFrm > div.boardlist.mt50 > table > tbody > tr",
    );
    return [...rows]
      .map((row) => ({
        row,
        lecture: parseLectureListRow(row),
      }))
      .filter((item) => item.lecture);
  }

  // Lecture detail page
  function parseLectureDetailDocument(container) {
    const cancelBtn = container.querySelector(
      "#contentsList > div > div > div.btn_w-st1.mt50 > button.btn-st1.bg-black_r",
    );
    const capacityText = getTopValue(container, "모집인원");
    const approvedText = getTopValue(container, "개설 승인");
    const appliedSummary = container.querySelector(".total-normal.mt50");
    const deliveryMethod = getTopValue(container, "진행방식");
    const timeStr = getTopValue(container, "강의날짜");
    const title = getTopValue(container, "모집 명");
    if (!title && !timeStr) {
      throw new Error("Invalid lecture detail document");
    }

    return {
      title,
      author: getTopValue(container, "작성자"),
      location: getTopValue(container, "장소"),
      deliveryMethod,
      isOnline: deliveryMethod ? deliveryMethod.includes("온라인") : null,
      capacityText,
      timeStr,
      ...getDetailTimeFields(timeStr),
      appliedCount: appliedSummary
        ? getAppliedCount(appliedSummary.innerText)
        : undefined,
      totalCount:
        capacityText === undefined ? undefined : getPeopleCount(capacityText),
      isApproved: approvedText ? approvedText === "OK" : null,
      applyId: cancelBtn
        ? cancelBtn.getAttribute("onclick").split("'")[3]
        : null,
    };
  }

  // Network requests
  function requestError(message, code, cause) {
    return Object.assign(new Error(message, { cause }), { code });
  }

  // Once the extension needs fresh data, revalidate any cached HTTP response.
  async function fetchDocument(url, cache = "no-cache") {
    let res;
    let html;
    try {
      res = await fetch(url, { credentials: "include", cache });
      if (res.ok) html = await res.text();
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      throw requestError(
        "Lecture request interrupted",
        "LECTURE_TRANSIENT",
        error,
      );
    }
    if (!res.ok) {
      const message = `Lecture request failed (HTTP ${res.status})`;
      if (res.status === 408 || res.status >= 500) {
        throw requestError(message, "LECTURE_TRANSIENT");
      }
      throw new Error(message);
    }
    return new DOMParser().parseFromString(html, "text/html");
  }

  async function fetchHistoryDocument(url, page = 1, cache, expectedTotal) {
    return parseLectureHistoryDocument(
      await fetchDocument(url, cache),
      page,
      expectedTotal,
    );
  }

  async function fetchLecturePage(
    path,
    page,
    expectedTotal,
    verifyRowNumbers,
    scan,
    cache,
  ) {
    async function readPage(index, cacheMode = cache) {
      const url = index === 1 ? path : path + "&pageIndex=" + index;
      const result = await fetchHistoryDocument(
        url,
        index,
        cacheMode,
        expectedTotal,
      ).catch((error) => {
        if (
          error?.code !== "LECTURE_TRANSIENT" ||
          !scan?.retryTransient ||
          !scan.isCurrent()
        ) {
          throw error;
        }
        scan.retryTransient = false;
        return fetchHistoryDocument(url, index, "no-store", expectedTotal);
      });
      if (expectedTotal !== undefined && result.total !== expectedTotal) {
        throw requestError(
          "Lecture history count changed during pagination",
          "HISTORY_PAGE_CHANGED",
        );
      }
      // Other numbering layouts remain supported without this optional check.
      if (verifyRowNumbers && !result.hasExpectedRowNumbers) {
        throw requestError(
          "Unexpected lecture history page",
          "HISTORY_PAGE_CHANGED",
        );
      }
      return result;
    }

    const { lectures, rowKeys } = await readPage(page);
    const previousRows = scan?.rowKeys;
    if (previousRows && scan.isCurrent()) {
      const previousKeys = new Set(previousRows.map((row) => row.key));
      if (
        rowKeys.some((row) => row.key !== null && previousKeys.has(row.key))
      ) {
        // Reapplication can produce genuinely similar rows. Confirm that the
        // preceding page changed before discarding this scan.
        const reread = await readPage(page - 1, "no-store");
        if (
          reread.rowKeys.some(
            (row, index) =>
              row.key !== previousRows[index].key ||
              row.applied !== previousRows[index].applied,
          )
        ) {
          throw requestError(
            "Lecture history order changed during pagination",
            "HISTORY_ORDER_CHANGED",
          );
        }
      }
    }
    if (scan) scan.rowKeys = rowKeys;
    return lectures;
  }

  async function fetchLectureDetail(url) {
    return parseLectureDetailDocument(await fetchDocument(url));
  }

  return {
    fetchLectureDetail,
    fetchLectureHistoryHead: fetchHistoryDocument,
    fetchLecturePage,
    parseLectureDetailDocument,
    parseLectureListDocument,
  };
})();

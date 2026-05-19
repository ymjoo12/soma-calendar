const Client = (() => {
  // Shared parsing
  function parseHtmlDocument(html) {
    return new DOMParser().parseFromString(html, "text/html");
  }

  function getDetailTimeFields(timeStr) {
    if (typeof timeStr !== "string") {
      return {};
    }

    const dateMatch = timeStr.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (!dateMatch) {
      return {};
    }

    const [, year, month, day] = dateMatch;
    const timeText = timeStr.slice(dateMatch.index + dateMatch[0].length);
    const timeMatches = [...timeText.matchAll(/(\d{1,2})(?::(\d{2}))?\s*시?/g)];
    if (timeMatches.length < 2) {
      return {};
    }

    const formatTime = ([, hour, minute = "0"]) =>
      `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
    const weekday = timeStr.match(/\([^)]+\)/)?.[0] || "";

    return {
      dateStr: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}${weekday}`,
      timeRangeStr: `${formatTime(timeMatches[0])} ~ ${formatTime(timeMatches[1])}`,
    };
  }

  function getTopValue(container, label) {
    const group = [...container.querySelectorAll("div.top .group")].find(
      (item) => item.querySelector(".t")?.innerText.trim() === label,
    );
    return (
      group?.querySelector(".c")?.innerText.replace(/\s+/g, " ").trim() || null
    );
  }

  function getPeopleCount(text) {
    return text?.match(/(\d+)\s*명/)?.[1] || text?.match(/(\d+)/)?.[1] || null;
  }

  function getAppliedCount(text) {
    return text?.match(/\[(\d+)\s*명\]/)?.[1] || getPeopleCount(text);
  }

  // History pages
  function parseLectureHistoryRow(row) {
    const tds = row.querySelectorAll("td");
    if (tds.length < 8) {
      return null;
    }

    const applied = tds[6].innerText.trim();
    if (applied !== "접수완료") {
      return null;
    }

    const url = Utils.setPageIndexToOne(tds[2].querySelector("a")?.href);
    const title = tds[2].innerText.trim();
    const author = tds[3].innerText.trim();
    if (!url || !title || !author) {
      return null;
    }

    const [dateStr, timeRangeStr] = tds[4].innerText
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map((str) => str.trim())
      .filter(Boolean);
    if (!dateStr || !timeRangeStr) {
      return null;
    }

    const isApproved = tds[7].innerText.trim() === "OK";
    const cancelHref = row
      .querySelector('a[href*="delDate("]')
      ?.getAttribute("href");
    const cancelMatch = cancelHref?.match(
      /delDate\('([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\)/,
    );
    const params = new URL(url).searchParams;
    const lectureId = cancelMatch?.[2] || params.get("qustnrSn");

    return {
      url,
      title,
      author,
      dateStr,
      timeRangeStr,
      isApproved,
      lectureId,
      cancelId: cancelMatch?.[1] || null,
      cancelGubun: cancelMatch?.[3] || null,
    };
  }

  function parseLectureHistoryDocument(container) {
    const rows = container.querySelectorAll(
      "#contentsList > div > div > div.boardlist > div.tbl-ovx > table > tbody > tr",
    );
    return [...rows].map(parseLectureHistoryRow).filter(Boolean);
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
    const appliedSummary =
      container
        .querySelector(".total-normal.mt50")
        ?.innerText.replace(/\s+/g, " ")
        .trim() || "";
    const deliveryMethod = getTopValue(container, "진행방식");
    const timeStr = getTopValue(container, "강의날짜");

    return {
      title: getTopValue(container, "모집 명"),
      author: getTopValue(container, "작성자"),
      location: getTopValue(container, "장소"),
      deliveryMethod,
      isOnline: deliveryMethod?.includes("온라인") ?? false,
      capacityText,
      timeStr,
      ...getDetailTimeFields(timeStr),
      appliedCount: getAppliedCount(appliedSummary),
      totalCount: getPeopleCount(capacityText),
      isApproved: approvedText ? approvedText === "OK" : null,
      applyId: cancelBtn
        ? cancelBtn.getAttribute("onclick").split("'")[3]
        : null,
    };
  }

  // Network requests
  async function fetchLectureHistoryHead(path) {
    const res = await fetch(path, { credentials: "include" });
    const html = await res.text();
    const container = parseHtmlDocument(html);
    const totalStr = container.querySelector(".bbs-total strong.color-blue")
      ?.nextSibling?.textContent;
    const total = parseInt(totalStr?.replace(":", "")?.trim()) || 0;

    return {
      totalPages: Math.ceil(total / 10),
      lectures: Utils.normalizeLectureDates(
        parseLectureHistoryDocument(container),
      ),
    };
  }

  async function fetchLecturePage(path, page) {
    const res = await fetch(path + "&pageIndex=" + page, {
      credentials: "include",
    });
    const html = await res.text();
    return Utils.normalizeLectureDates(
      parseLectureHistoryDocument(parseHtmlDocument(html)),
    );
  }

  async function fetchLectureDetail(url) {
    const res = await fetch(url, { credentials: "include" });
    const html = await res.text();
    return parseLectureDetailDocument(parseHtmlDocument(html));
  }

  return {
    fetchLectureDetail,
    fetchLectureHistoryHead,
    fetchLecturePage,
    parseLectureDetailDocument,
    parseLectureListDocument,
  };
})();

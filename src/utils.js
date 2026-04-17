const PAGE_ONE = "1";

function parseHtmlDocument(html) {
  return new DOMParser().parseFromString(html, "text/html");
}

function setPageIndexToOne(url) {
  if (url === undefined) {
    return undefined;
  }
  const _url = new URL(url);
  _url.searchParams.set("pageIndex", PAGE_ONE);
  return _url.toString();
}

function normalizeTimeStr(time) {
  const [h, m, s] = time.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}`;
}

function getSwPathPrefix() {
  return location.pathname.match(/^(.*)\/sw(?:\/|$)/)?.[1] || "";
}

function extractLectureListFromHTML(html) {
  const container = parseHtmlDocument(html);

  const rows = container.querySelectorAll(
    "#contentsList > div > div > div.boardlist > div.tbl-ovx > table > tbody > tr",
  );
  const lectures = [];

  for (const row of rows) {
    const tds = row.querySelectorAll("td");
    if (tds.length < 6) continue;

    const applied = tds[6].innerText.trim();
    if (applied !== "접수완료") continue;

    const url = setPageIndexToOne(tds[2].querySelector("a")?.href);
    const title = tds[2].innerText.trim();
    const author = tds[3].innerText.trim();
    if (!url || !title || !author) continue;

    const [dateStr, timeRangeStr] = tds[4].innerText
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map((str) => str.trim())
      .filter(Boolean);
    if (!dateStr || !timeRangeStr) continue;

    const isApproved = tds[7].innerText.trim() === "OK";
    const cancelHref = row
      .querySelector('a[href*="delDate("]')
      ?.getAttribute("href");
    const cancelMatch = cancelHref?.match(
      /delDate\('([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\)/,
    );
    const params = new URL(url).searchParams;
    const lectureId = cancelMatch?.[2] || params.get("qustnrSn");
    const cancelId = cancelMatch?.[1] || null;
    const cancelGubun = cancelMatch?.[3] || null;

    lectures.push({
      url,
      title,
      author,
      dateStr,
      timeRangeStr,
      isApproved,
      lectureId,
      cancelId,
      cancelGubun,
    });
  }

  return lectures;
}

function extractLectureDetailFromHTML(html) {
  const container = parseHtmlDocument(html);
  const cancelBtn = container.querySelector(
    "#contentsList > div > div > div.btn_w-st1.mt50 > button.btn-st1.bg-black_r",
  );
  const getTopValue = (label) => {
    const group = [...container.querySelectorAll("div.top .group")].find(
      (item) => item.querySelector(".t")?.innerText.trim() === label,
    );
    return (
      group?.querySelector(".c")?.innerText.replace(/\s+/g, " ").trim() || null
    );
  };
  const npeople = getTopValue("모집인원");
  const appliedSummary =
    container
      .querySelector(".total-normal.mt50")
      ?.innerText.replace(/\s+/g, " ")
      .trim() || "";
  const appliedCount = appliedSummary.match(/\[(\d+)\s*명\]/)?.[1] || null;
  const totalCount = npeople?.match(/(\d+)/)?.[1] || null;
  return {
    loc: getTopValue("장소"),
    npeople,
    timeStr: getTopValue("강의날짜"),
    appliedCount,
    totalCount,
    applyId: cancelBtn ? cancelBtn.getAttribute("onclick").split("'")[3] : null,
  };
}

async function getTotalPages(baseUrl) {
  const res = await fetch(baseUrl, { credentials: "include" });
  const html = await res.text();
  const container = parseHtmlDocument(html);
  const totalStr = container.querySelector(".bbs-total strong.color-blue")
    ?.nextSibling?.textContent;
  const total = parseInt(totalStr?.replace(":", "")?.trim()) || 0;
  const totalPages = Math.ceil(total / 10);
  return totalPages;
}

async function getAllLectures() {
  const lectures = [];

  const path = `${getSwPathPrefix()}/sw/mypage/userAnswer/history.do?menuNo=200047`;
  const totalPages = await getTotalPages(path);

  for (let page = 1; page <= totalPages; page++) {
    const res = await fetch(path + "&pageIndex=" + page, {
      credentials: "include",
    });
    const html = await res.text();
    const pageLectures = extractLectureListFromHTML(html);
    lectures.push(...pageLectures);
  }

  for (let ev of lectures) {
    const datePart = ev.dateStr.split("(")[0].trim(); // "2025-04-10"
    const [startTime, endTime] = ev.timeRangeStr
      .split("~")
      .map((s) => normalizeTimeStr(s.trim())); // "18:30:00"

    ev.startAt = new Date(`${datePart}T${startTime}`);
    ev.endAt = new Date(`${datePart}T${endTime}`);
    ev.timeRangeStr = `${startTime.replace(/:\d{2}$/, "")} ~ ${endTime.replace(
      /:\d{2}$/,
      "",
    )}`;
  }

  lectures.sort((a, b) => a.startAt - b.startAt);
  return lectures;
}

function getMin(timeStr) {
  let splitTime = timeStr.split(":");
  return parseInt(splitTime[0]) * 60 + parseInt(splitTime[1]);
}

function convertLectureDictionary(lectures) {
  let lecturesDictionary = Object();
  for (let i = 0; i < lectures.length; i++) {
    if (!lecturesDictionary.hasOwnProperty(lectures[i].dateStr)) {
      lecturesDictionary[lectures[i].dateStr] = [];
    }
    lecturesDictionary[lectures[i].dateStr].push(lectures[i].timeRangeStr);
  }

  return lecturesDictionary;
}

function convertLectureDictionaryWithoutDate(lectures) {
  let lecturesDictionary = Object();
  for (let i = 0; i < lectures.length; i++) {
    dateStrWithoutDate = lectures[i].dateStr.slice(0, -3);
    if (!lecturesDictionary.hasOwnProperty(dateStrWithoutDate)) {
      lecturesDictionary[dateStrWithoutDate] = [];
    }
    lecturesDictionary[dateStrWithoutDate].push(lectures[i].timeRangeStr);
  }

  return lecturesDictionary;
}

function getLectureId(url) {
  const params = new URL(url).searchParams;
  const qustnrSn = params.get("qustnrSn");
  return qustnrSn;
}

function cancelApply(cancelId, qustnrSn, gubun = "mentoLec") {
  if (!cancelId || !qustnrSn) {
    alert("취소할 수 없는 항목입니다.");
    return;
  }

  if (typeof window.delDate === "function") {
    window.delDate(cancelId, qustnrSn, gubun);
    return;
  }

  if (confirm("선택된 항목의 접수를 취소 하시겠습니까?")) {
    fetch(`${getSwPathPrefix()}/sw/mypage/userAnswer/cancel.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        id: cancelId,
        qustnrSn,
        gubun,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        const { resultCode, cancelAt } = data;
        if (resultCode === "success") {
          if (cancelAt === "Y") {
            alert("취소 하였습니다.");
          } else {
            alert("강의날짜 하루 전날부터는 취소가 불가능 합니다.");
          }
          location.reload();
        } else {
          alert("삭제에 실패하였습니다.");
        }
      })
      .catch(() => {
        alert("취소 요청 중 오류가 발생했습니다.");
      });
  }
}

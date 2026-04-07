const PAGE_ONE = "1"

function setPageIndexToOne(url){
  if(url === undefined){
    return undefined;
  }
  const _url = new URL(url);
  _url.searchParams.set("pageIndex", PAGE_ONE);
  return _url.toString();
}

function normalizeTimeStr(time) {
    const [h, m, s] = time.split(':');
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:${s.padStart(2, '0')}`;
  }
  
function extractLectureListFromHTML(html) {
  const container = document.createElement('div');
  container.innerHTML = html;

  const rows = container.querySelectorAll("#contentsList > div > div > div.boardlist > div.tbl-ovx > table > tbody > tr");
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
    
    const dateHTML = tds[4].innerHTML
      .trim()
      .replace(/&nbsp;/g, "")
      .trim();
    const [dateStr, timeRangeStr] = dateHTML
      .split("<br>")
      .map((str) => str.trim());
    if (!dateStr || !timeRangeStr) continue;

    const isApproved = tds[7].innerText.trim() === "OK";
    const params = new URL(url).searchParams;
    const lectureId = params.get('qustnrSn');

    lectures.push({ url, title, author, dateStr, timeRangeStr, isApproved, lectureId });
  }

  return lectures;
}

function extractLectureDetailFromHTML(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  const cancelBtn = container.querySelector("#contentsList > div > div > div.btn_w-st1.mt50 > button.btn-st1.bg-black_r");
  return {
    loc: container
      .querySelector("div.top > div:nth-child(4) > div:nth-child(1) > div.c")
      .innerText.trim(),
    npeople: container
      .querySelector("div.top > div:nth-child(4) > div:nth-child(2) > div.c")
      .innerText.trim(),
    applyId: cancelBtn ? cancelBtn.getAttribute('onclick').split("'")[3] : null,
  };
}

async function getTotalPages(baseUrl){
  const res = await fetch(baseUrl, { credentials: "include" });
  const html = await res.text();
  const container = document.createElement("div")
  container.innerHTML = html
  const totalStr = container.querySelector(".bbs-total strong.color-blue")?.nextSibling?.textContent
  const total = parseInt(totalStr?.replace(":", "")?.trim()) || 0;
  const totalPages = Math.ceil(total / 10);
  return totalPages;
}

async function getAllLectures() {
  const lectures = [];

  const path = "/sw/mypage/userAnswer/history.do?menuNo=200047";
  const totalPages = await getTotalPages(path)

  for (let page = 1; page <= totalPages; page++) {
    const res = await fetch(path + "&pageIndex=" + page, { credentials: "include" });
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
      ""
    )}`;
  }

  lectures.sort((a, b) => a.startAt - b.startAt);
  return lectures;
}

function getMin(timeStr){
  let splitTime = timeStr.split(":");
  return (parseInt(splitTime[0]) * 60) + parseInt(splitTime[1]) 
}

function convertLectureDictionary(lectures){
  let lecturesDictionary = Object()
  for(let i=0;i<lectures.length;i++){
      if(!lecturesDictionary.hasOwnProperty(lectures[i].dateStr)){
        lecturesDictionary[lectures[i].dateStr] = []
      }
      lecturesDictionary[lectures[i].dateStr].push(lectures[i].timeRangeStr)
  }
  
  return lecturesDictionary
}

function convertLectureDictionaryWithoutDate(lectures){
  let lecturesDictionary = Object()
  for(let i=0;i<lectures.length;i++){
    dateStrWithoutDate = lectures[i].dateStr.slice(0, -3)
      if(!lecturesDictionary.hasOwnProperty(dateStrWithoutDate)){
        lecturesDictionary[dateStrWithoutDate] = []
      }
      lecturesDictionary[dateStrWithoutDate].push(lectures[i].timeRangeStr)
  }
  
  return lecturesDictionary
}

function getLectureId(url){
  const params = new URL(url).searchParams;
  const qustnrSn = params.get('qustnrSn');
  return qustnrSn
}

function cancelApply(applySn, qustnrSn) {
  if (confirm("선택된 항목의 접수를 취소 하시겠습니까?")) {
    fetch("/sw/mypage/mentoLec/applyCancel.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        id: applySn,
        qustnrSn: qustnrSn
      })
    })
    .then(res => res.json())
    .then(data => {
      const { resultCode, cancelAt } = data;
      if (resultCode === "success") {
        if (cancelAt === "Y") {
          alert("취소 하였습니다.");
        } else {
          alert("강의 날 이후 부터는 취소가 불가능 합니다.");
        }
        location.reload();
      } else {
        alert("작업에 실패하였습니다.");
      }
    });
  }
}
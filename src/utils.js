function normalizeTimeStr(time) {
    const [h, m, s] = time.split(':');
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:${s.padStart(2, '0')}`;
  }
  
function extractEventListFromHTML(html) {
  const container = document.createElement('div');
  container.innerHTML = html;

  const rows = container.querySelectorAll("#contentsList > div > div > div.boardlist > div.tbl-ovx > table > tbody > tr");
  const events = [];

  for (const row of rows) {
    const tds = row.querySelectorAll("td");
    if (tds.length < 6) continue;

    const applied = tds[6].innerText.trim();
    if (applied !== "접수완료") continue;

    const url = tds[2].querySelector("a")?.href;
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

    events.push({ url, title, author, dateStr, timeRangeStr });
  }

  return events;
}

async function getTotalpages(baseUrl){
  const res = await fetch(baseUrl, { credentials: "include" });
  const html = await res.text();
  const container = document.createElement("div")
  container.innerHTML = html
  const totalStr = container.querySelector(".bbs-total strong.color-blue")?.nextSibling?.textContent
  const total = parseInt(totalStr?.replace(":", "")?.trim()) || 0;
  const totalPages = Math.ceil(total / 10);
  return totalPages;
}

async function getAllMentoringEvents() {
  const events = [];

  const path = "/sw/mypage/userAnswer/history.do?menuNo=200047";
  const totalPages = await getTotalpages(path)

  for (let page = 1; page <= totalPages; page++) {
    const res = await fetch(path + "&pageIndex=" + page, { credentials: "include" });
    const html = await res.text();
    const pageEvents = extractEventListFromHTML(html);
    events.push(...pageEvents);
  }

  for (let ev of events) {
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

  events.sort((a, b) => a.startAt - b.startAt);
  return events;
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
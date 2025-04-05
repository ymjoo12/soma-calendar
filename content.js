function normalizeTimeStr(time) {
  const [h, m, s] = time.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}`;
}

function extractEventListFromHTML(html) {
  const container = document.createElement("div");
  container.innerHTML = html;

  const rows = container.querySelectorAll(
    "#contentsList > div > div > div.boardlist > div.tbl-ovx > table > tbody > tr"
  );
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

function extractEventDetailFromHTML(html) {
  const container = document.createElement("div");
  container.innerHTML = html;

  const loc = container
    .querySelector(
      "#board > div > div.top > div:nth-child(4) > div:nth-child(1) > div"
    )
    .innerText.trim();
  const npeople = container
    .querySelector(
      "#board > div > div.top > div:nth-child(4) > div:nth-child(2) > div"
    )
    .innerText.trim();

  return { loc, npeople };
}

async function getAllMentoringEvents() {
  const events = [];

  const baseUrl = location.href;
  const totalStr = document.querySelector(".bbs-total strong.color-blue")
    ?.nextSibling?.textContent;
  const total = parseInt(totalStr?.replace(":", "")?.trim()) || 0;
  const totalPages = Math.ceil(total / 10);

  for (let page = 1; page <= totalPages; page++) {
    const url = new URL(baseUrl);
    url.searchParams.set("pageIndex", page.toString());

    const res = await fetch(url, { credentials: "include" });
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

const addToCalendarBtn = (ev) => {
  if (isAppleDevice()) {
    return `<button class="add-to-calendar" data-id="${ev.url}" style="margin-top: 8px; background-color: #1493D2; color:white; border-radius: 4px; padding:4px; width: 100%;">
  📅 캘린더에 추가
  </button>`;
  }
  return "";
};

async function generateCalendarElement() {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - today.getDay());
  const days = [];

  const events = await getAllMentoringEvents();

  for (let i = 0; i < 28; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);

    const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
    const dayStr = `${date.getMonth() + 1}월 ${date.getDate()}일 (${weekday})`;
    const isToday = date.toDateString() === today.toDateString();
    const filteredEvents = events.filter((ev) => {
      const eventDate = new Date(ev.startAt);
      return eventDate.toDateString() === date.toDateString();
    });

    days.push(`
      <div class="calendar-cell">
        <div class="calendar-date ${isToday ? "today" : ""}">${dayStr} ${
      isToday ? " [오늘]" : ""
    }</div>
        ${filteredEvents
          .map((ev, i) => {
            const isConflict =
              (i > 0 && filteredEvents[i - 1].endAt > ev.startAt) ||
              (i < filteredEvents.length - 1 &&
                filteredEvents[i + 1].startAt < ev.endAt);
            return `
            <div class="calendar-event ${
              isConflict ? "conflict" : ""
            }" title="${ev.title}">
              <a href="${
                ev.url
              }" style="margin-bottom: 4px; font-size: larger; font-weight: bold;">
                <div class="ellipsis-2-lines" style="color: #114C9D;">${
                  ev.title
                }</div>
                <div style="font-size: small; margin-bottom: 4px;">${
                  ev.author
                }</div>
                <div style="font-size: smaller;">${ev.timeRangeStr}</div>
              </a>
              ${addToCalendarBtn(ev)}
            </div>
          `;
          })
          .join("")}
      </div>
    `);
  }

  const wrapper = document.createElement("div");
  wrapper.id = "history-calendar";
  wrapper.innerHTML = days.join("");

  return wrapper;
}

async function main() {
  let target = document.querySelector(
    "#contentsList > div > div > ul.tabs-st1.col2"
  );
  let newElement = await generateCalendarElement();

  target.after(newElement);
  const events = await getAllMentoringEvents();
  attachCalendarButtons(events);
}

async function updateCalendarElement() {
  const events = document.querySelectorAll("div.calendar-event");
  for (let ev of events) {
    const url = ev.querySelector("a").href;
    const res = await fetch(url, { credentials: "include" });
    const html = await res.text();
    const eventDetails = extractEventDetailFromHTML(html);
    const { loc, npeople } = eventDetails;
    let target = ev.querySelector("a > div:nth-child(3)");
    let newElement = document.createElement("div");
    newElement.innerHTML = `<div style="font-size: smaller">${loc} / ${npeople}</div>`;
    target.after(newElement);
  }
}

function attachCalendarButtons(events) {
  document.querySelectorAll(".add-to-calendar").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const url = btn.dataset.id;
      const ev = events.find((ev) => ev.url === url);
      if (!ev) return;

      const icsContent = generateICS(ev);
      const blob = new Blob([icsContent], { type: "text/calendar" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${ev.title.replace(/\s+/g, "_")}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  });
}

function isAppleDevice() {
  return /Macintosh|iPhone|iPad|iPod/.test(navigator.userAgent);
}

function generateICS(event) {
  const pad = (n) => n.toString().padStart(2, "0");
  const toICSDate = (date) => {
    return (
      date.getUTCFullYear().toString() +
      pad(date.getUTCMonth() + 1) +
      pad(date.getUTCDate()) +
      "T" +
      pad(date.getUTCHours()) +
      pad(date.getUTCMinutes()) +
      pad(date.getUTCSeconds()) +
      "Z"
    );
  };

  const start = toICSDate(event.startAt);
  const end = toICSDate(event.endAt);
  const title = event.title.replace(/\n/g, " ");
  const description = `멘토: ${event.author}`;
  const location = event.loc || "장소 미정";
  const url = event.url;

  return `BEGIN:VCALENDAR
VERSION:2.0
CALSCALE:GREGORIAN
BEGIN:VEVENT
SUMMARY:${title}
DTSTART:${start}
DTEND:${end}
DESCRIPTION:${description}\\n${url}
LOCATION:${location}
URL:${url}
STATUS:CONFIRMED
SEQUENCE:0
BEGIN:VALARM
TRIGGER:-PT10M
ACTION:DISPLAY
DESCRIPTION:Event Reminder
END:VALARM
END:VEVENT
END:VCALENDAR`.replace(/\n/g, "\r\n");
}

main()
  .then(() => {
    updateCalendarElement();
  })
  .catch((err) => {
    console.error(err);
  });

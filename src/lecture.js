const lecturePopupDetailCache = new Map()
const lecturePopupDetailRequests = new Map()

// 달력 항목에서 팝업 조회에 필요한 요소를 추출
function getCalendarPopupElements(item) {
    const trigger = item.firstElementChild?.tagName === "A"
        ? item.firstElementChild
        : item.querySelector("a")
    const popup = item.querySelector(".calendarPop")
    const detailLink = popup?.querySelector('a[href*="/sw/mypage/mentoLec/view.do"]')

    return { trigger, popup, detailLink }
}

// 사이트 기본 팝업이 실제로 열린 상태인지 판별
function isCalendarPopupVisible(popup) {
    if (!popup) {
        return false
    }

    const style = getComputedStyle(popup)
    return (
        style.display !== "none" &&
        style.visibility === "visible" &&
        style.opacity !== "0"
    )
}

// 팝업 상세 정보를 그릴 컨테이너를 보장
function getCalendarPopupDetailContainer(popup) {
    const list = popup.querySelector(".calendarPop__list") || popup
    let container = list.querySelector(".calendar-pop-extra")

    if (!container) {
        container = document.createElement(list.tagName === "UL" ? "li" : "div")
        container.className = "calendar-pop-extra"
        list.appendChild(container)
    }

    return container
}

// 불러온 상세 정보를 팝업 하단에 표시
function renderCalendarPopupDetail(container, detail) {
    container.className = "calendar-pop-extra"
    container.replaceChildren()

    if (detail.loading) {
        container.classList.add("calendar-pop-extra-loading")
        container.textContent = "상세 정보 로딩중..."
        return
    }

    if (detail.error) {
        container.classList.add("calendar-pop-extra-error")
        container.textContent = "상세 정보를 불러오지 못했습니다."
        return
    }

    const peopleText = detail.totalCount
        ? `${detail.appliedCount ?? 0}/${detail.totalCount}`
        : detail.npeople || "정보 없음"
    const fields = [
        ["시간", detail.timeStr || "정보 없음"],
        ["장소", detail.loc || "정보 없음"],
        ["인원", peopleText],
    ]

    for (const [label, value] of fields) {
        const row = document.createElement("div")
        row.className = "calendar-pop-extra__row"

        const labelElement = document.createElement("span")
        labelElement.className = "calendar-pop-extra__label"
        labelElement.textContent = label

        const valueElement = document.createElement("span")
        valueElement.className = "calendar-pop-extra__value"
        valueElement.textContent = value

        row.appendChild(labelElement)
        row.appendChild(valueElement)
        container.appendChild(row)
    }
}

// 상세 페이지를 조회하고 결과를 캐시
async function fetchCalendarPopupDetail(url) {
    if (lecturePopupDetailCache.has(url)) {
        return lecturePopupDetailCache.get(url)
    }

    if (lecturePopupDetailRequests.has(url)) {
        return lecturePopupDetailRequests.get(url)
    }

    const request = fetch(url, { credentials: "include" })
        .then((res) => {
            if (!res.ok) {
                throw new Error(`Failed to fetch popup detail: ${res.status}`)
            }

            return res.text()
        })
        .then((html) => {
            const detail = extractLectureDetailFromHTML(html)
            lecturePopupDetailCache.set(url, detail)
            return detail
        })
        .finally(() => {
            lecturePopupDetailRequests.delete(url)
        })

    lecturePopupDetailRequests.set(url, request)
    return request
}

// 현재 열린 팝업에 상세 정보를 채워 넣기
async function enrichCalendarPopup(item) {
    const { popup, detailLink } = getCalendarPopupElements(item)

    if (!popup || !detailLink || !isCalendarPopupVisible(popup)) {
        return
    }

    const container = getCalendarPopupDetailContainer(popup)
    const cachedDetail = lecturePopupDetailCache.get(detailLink.href)

    if (cachedDetail) {
        renderCalendarPopupDetail(container, cachedDetail)
        return
    }

    if (container.dataset.state === "loading") {
        return
    }

    container.dataset.state = "loading"
    renderCalendarPopupDetail(container, { loading: true })

    try {
        const detail = await fetchCalendarPopupDetail(detailLink.href)
        container.dataset.state = "loaded"
        renderCalendarPopupDetail(container, detail)
    } catch (error) {
        container.dataset.state = "error"
        renderCalendarPopupDetail(container, { error: true })
        console.error(error)
    }
}

// 팝업 열림 애니메이션 타이밍을 고려해 여러 번 재시도
function scheduleCalendarPopupEnrichment(item) {
    const retryDelays = [0, 100, 300, 700]

    for (const delay of retryDelays) {
        window.setTimeout(() => {
            enrichCalendarPopup(item)
        }, delay)
    }
}

// 달력 팝업 열림을 감지해 상세 정보 로딩을 연결
function observeCalendarPopups() {
    const calendarItems = document.querySelectorAll("li.category")

    document.addEventListener("click", (event) => {
        const trigger = event.target.closest("li.category > a")
        const item = trigger?.closest("li.category")

        if (!item) {
            return
        }

        scheduleCalendarPopupEnrichment(item)
    }, { capture: true })

    for (const item of calendarItems) {
        const { trigger, popup, detailLink } = getCalendarPopupElements(item)

        if (!trigger || !popup || !detailLink) {
            continue
        }

        trigger.addEventListener("click", () => {
            scheduleCalendarPopupEnrichment(item)
        })

        const observer = new MutationObserver(() => {
            if (trigger.classList.contains("active")) {
                scheduleCalendarPopupEnrichment(item)
            }
        })

        observer.observe(trigger, {
            attributes: true,
            attributeFilter: ["class"],
        })

        if (trigger.classList.contains("active")) {
            scheduleCalendarPopupEnrichment(item)
        }
    }
}

function renderConflictLectures(popupElement, conflictingLectures) {
    popupElement.replaceChildren()

    const title = document.createElement("h4")
    title.textContent = "겹치는 멘토링 목록"
    popupElement.appendChild(title)

    for (const lecture of conflictingLectures) {
        const lectureElement = document.createElement("div")
        lectureElement.className = "overlap-lecture"

        const titleRow = document.createElement("div")
        const titleStrong = document.createElement("strong")
        titleStrong.textContent = lecture.title
        titleRow.appendChild(titleStrong)

        const authorRow = document.createElement("div")
        authorRow.textContent = `멘토: ${lecture.author}`

        const timeRow = document.createElement("div")
        timeRow.textContent = `일시: ${lecture.dateStr} ${lecture.timeRangeStr}`

        lectureElement.append(titleRow, authorRow, timeRow)
        popupElement.appendChild(lectureElement)
    }
}

getAllLectures().then((lectures) => {
    const lecturesDictionary = convertLectureDictionary(lectures);
    const lectureDates = document.querySelectorAll("#listFrm > div.boardlist.mt50 > table > tbody > tr > td:nth-child(4)");
    
    // 팝업 요소 생성
    const popupElement = document.createElement('div');
    popupElement.className = 'overlap-popup';
    document.body.appendChild(popupElement);
    
    for (let i = 0; i < lectureDates.length; i++) {
        const [datePart, timePart] = lectureDates[i].innerText.split("\n");
        if (!lecturesDictionary.hasOwnProperty(datePart)) {
            continue;
        }
        
        let targetList = lecturesDictionary[datePart];
        let [startMin, endMin] = timePart.split(" ~ ");
        let hasConflict = false;
        let conflictingLectures = [];
        
        // 현재 멘토링 정보 가져오기
        const lectureRow = lectureDates[i].parentElement;
        
        for (let j = 0; j < targetList.length; j++) {
            let [targetStartMin, targetEndMin] = targetList[j].split(" ~ ");

            if (getMin(endMin) <= getMin(targetStartMin)) {
                continue;
            }

            if (getMin(startMin) >= getMin(targetEndMin)) {
                continue;
            }

            // 자기 자신과의 비교는 건너뛰기
            const conflictLecture = lectures.find(lec => 
                lec.dateStr === datePart && 
                lec.timeRangeStr === targetList[j]
            );
            
            if (conflictLecture) {
                hasConflict = true;
                conflictingLectures.push(conflictLecture);
            }
        }
        
        if (hasConflict) {
            // 행에 conflict-item 클래스 추가
            lectureRow.classList.add('conflict-item');
            lectureRow.style.color = 'red';
            lectureRow.querySelector(".tit").style.color = 'red';
            
            // 마우스 이벤트 추가
            lectureRow.addEventListener('mousemove', (e) => {
                // 팝업 표시
                renderConflictLectures(popupElement, conflictingLectures);
                popupElement.style.display = 'block';
                
                // 마우스 커서 위치에 따라 팝업 위치 설정
                const offset = 15; // 마우스 커서로부터의 간격
                popupElement.style.left = (e.clientX + offset) + 'px';
                popupElement.style.top = (e.clientY + offset) + 'px';
                
                // 팝업이 화면 밖으로 나가는지 확인하고 조정
                const popupRect = popupElement.getBoundingClientRect();
                if (popupRect.right > window.innerWidth) {
                    popupElement.style.left = (e.clientX - popupRect.width - offset) + 'px';
                }
                if (popupRect.bottom > window.innerHeight) {
                    popupElement.style.top = (e.clientY - popupRect.height - offset) + 'px';
                }
            });
            
            lectureRow.addEventListener('mouseleave', () => {
                popupElement.style.display = 'none';
            });
        }
    }
    
    // 스크롤 시 팝업 숨기기 (마우스 이동 없이 스크롤만 할 경우 팝업 제거)
    document.addEventListener('scroll', () => {
        if (popupElement.style.display === 'block') {
            const activeItem = document.querySelector('.conflict-item:hover');
            if (!activeItem) {
                popupElement.style.display = 'none';
            }
        }
    });
    
    observeCalendarPopups();
});

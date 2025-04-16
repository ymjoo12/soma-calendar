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
                // 팝업 내용 생성
                let popupContent = `<h4>겹치는 멘토링 목록</h4>`;
                conflictingLectures.forEach(lecture => {
                    popupContent += `
                        <div class="overlap-lecture">
                            <div><strong>${lecture.title}</strong></div>
                            <div>멘토: ${lecture.author}</div>
                            <div>일시: ${lecture.dateStr} ${lecture.timeRangeStr}</div>
                        </div>
                    `;
                });
                
                // 팝업 표시
                popupElement.innerHTML = popupContent;
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
});
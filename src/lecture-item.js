getAllLectures().then((lectures) => {
    const lecturesDictionary = convertLectureDictionaryWithoutDate(lectures);
    const thisLectureId = getLectureId(location.href);
    for(let i = 0; i< lectures.length;i++){
        if(getLectureId(lectures[i].url) == thisLectureId){
            return
        }
    }

    const timeStr = document.querySelector(" div.top > div:nth-child(3) > div:nth-child(2) > div.c").innerText;
    let [datePart, timePart] = timeStr.split(/\s{2,}/); // 공백 2개 이상 기준으로 나눔
    const [startTime, endTime] = timePart.replace(/시/g, '').split(' ~ ');

    datePart = datePart.replaceAll(".", "-")

    if(!lecturesDictionary.hasOwnProperty(datePart)){
        return
    }
    const targetList = lecturesDictionary[datePart]
    for (let j = 0; j < targetList.length; j++) {
        const [targetStartTime, targetEndTime ] = targetList[j].split(" ~ ");
        if (getMin(endTime) <= getMin(targetStartTime))
            break
        
        if (getMin(startTime) >= getMin(targetEndTime))
            continue
        
        alert("시간이 겹치는 강의입니다. 신청하시기 전에 주의해주세요.")
        break
    }
});

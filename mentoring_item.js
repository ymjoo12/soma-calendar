getAllMentoringEvents().then((lectures) => {
    console.log(lectures)
    const lecturesDictionary = convertLectureDictionaryWithoutDate(lectures);
    
    console.log(lecturesDictionary)
    

    const timeStr = document.querySelector(" div.top > div:nth-child(3) > div:nth-child(2) > div.c").innerText;
    let titleStr = document.querySelector("div.top > div.group > div").innerText;
    titleStr = titleStr.slice(titleStr.indexOf("]")+1,titleStr.length).trim();
    console.log(titleStr);
    let [datePart, timePart] = timeStr.split(/\s{2,}/); // 공백 2개 이상 기준으로 나눔
    const [startTime, endTime] = timePart.replace(/시/g, '').split(' ~ ');

    datePart = datePart.replaceAll(".", "-")

    if(!lecturesDictionary.hasOwnProperty(datePart)){
        return
    }
    const targetList = lecturesDictionary[datePart]
    console.log(targetList)
    for (const [_title, _date] of Object.entries(targetList)) {
        const [targetStartTime, targetEndTime ] = _date.split(" ~ ")
        if (getMin(endTime) < getMin(targetStartTime))
            break
        // time and title check
        else if((getMin(startTime) > getMin(targetEndTime)) || (_title === titleStr))
            continue
        else {
            alert("시간이 겹치는 강의입니다. 신청하시기 전에 주의해주세요.")
            break
        }
    }
});

getAllMentoringEvents().then((lectures) => {
    const lecturesDictionary = convertLectureDictionary(lectures);
    const lectureDates = document.querySelectorAll("#listFrm > div.boardlist.mt50 > table > tbody > tr > td:nth-child(4)")
    for (let i = 0; i < lectureDates.length; i++) {
        const [datePart, timePart] = lectureDates[i].innerText.split("\n")
        if(!lecturesDictionary.hasOwnProperty(datePart)){
            continue
        }
        let targetList = lecturesDictionary[datePart]
        let [startMin, endMin] = timePart.split(" ~ ")
        for (let j = 0; j < targetList.length; j++) {
            let [targetStartMin, targetEndMin] = targetList[j].split(" ~ ")

            if (getMin(endMin) < getMin(targetStartMin))
                break

            if (getMin(startMin) > getMin(targetEndMin))
                continue

            lectureDates[i].parentElement.style.color = 'red';
            lectureDates[i].parentElement.querySelector(".tit").style.color = 'red';
        }
    }
});

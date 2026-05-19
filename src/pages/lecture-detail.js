// Overlap warning
Service.getAllLectures().then((lectures) => {
  const lecturesDictionary =
    Utils.convertLectureDictionaryWithoutDate(lectures);
  const thisLectureId = Utils.getLectureId(location.href);
  for (let i = 0; i < lectures.length; i++) {
    if (Utils.getLectureId(lectures[i].url) == thisLectureId) {
      return;
    }
  }

  const lecture = Service.getLectureFromDetailDocument(document);
  const datePart = lecture.dateStr?.split("(")[0].trim();
  const [startTime, endTime] = lecture.timeRangeStr?.split(" ~ ") ?? [];
  if (!datePart || !startTime || !endTime) {
    return;
  }

  if (!lecturesDictionary.hasOwnProperty(datePart)) {
    return;
  }
  const targetList = lecturesDictionary[datePart];
  for (let j = 0; j < targetList.length; j++) {
    const [targetStartTime, targetEndTime] = targetList[j].split(" ~ ");
    if (Utils.getMin(endTime) <= Utils.getMin(targetStartTime)) break;

    if (Utils.getMin(startTime) >= Utils.getMin(targetEndTime)) continue;

    alert("시간이 겹치는 강의입니다. 신청하시기 전에 주의해주세요.");
    break;
  }
});

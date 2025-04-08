// popup.js

const localVersion = chrome.runtime.getManifest().version;

fetch("https://api.github.com/repos/ymjoo12/soma-calendar/releases/latest")
  .then(res => res.json())
  .then(data => {
    const latest = data.tag_name;
    const el = document.getElementById("version-status");
    if (localVersion >= latest) {
      el.textContent = `✅ 최신 버전입니다: ${localVersion}`;
    } else {
      el.textContent = `🔁 업데이트 가능: ${localVersion} → ${latest}`;
      el.style.color = 'red';
    }
  })
  .catch(() => {
    document.getElementById("version-status").textContent = "❌ 버전 확인 실패";
  });
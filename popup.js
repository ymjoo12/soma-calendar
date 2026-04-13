// popup.js

const STORE_LINKS = {
  chrome: "https://chromewebstore.google.com/detail/nlemmjbkihccbkdaihfgijnepogepoob",
  firefox: "https://addons.mozilla.org/firefox/addon/soma-calendar",
};

function compareVersions(v1, v2) {
  const toNums = (v) => v.split(".").map(Number);
  const [a1, b1, c1, d1] = toNums(v1);
  const [a2, b2, c2, d2] = toNums(v2);

  if (a1 !== a2) return a1 - a2;
  if (b1 !== b2) return b1 - b2;
  if (c1 !== c2) return c1 - c2;
  return d1 - d2;
}

function getStoreLink() {
  return /Firefox/i.test(navigator.userAgent)
    ? STORE_LINKS.firefox
    : STORE_LINKS.chrome;
}

document.getElementById("store-link").href = getStoreLink();

const localVersion = chrome.runtime.getManifest().version;

fetch("https://api.github.com/repos/ymjoo12/soma-calendar/releases/latest")
  .then((res) => res.json())
  .then((data) => {
    const latest = data.tag_name;
    const el = document.getElementById("version-status");
    if (compareVersions(localVersion, latest) >= 0) {
      el.textContent = `✅ 최신 버전입니다: ${localVersion}`;
    } else {
      el.textContent = `🔁 업데이트 가능: ${localVersion} → ${latest}`;
      el.style.color = "red";
    }
  })
  .catch(() => {
    document.getElementById("version-status").textContent = "❌ 버전 확인 실패";
  });

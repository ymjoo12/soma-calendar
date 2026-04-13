// popup.js

const STORE_LINKS = {
  chrome: {
    title: "Chrome 배포 버전 설치",
    copy: "Chrome 및 Chromium 계열 브라우저에서는 Chrome Web Store에서 설치합니다.",
    label: "Chrome 스토어로 이동",
    url: "https://chromewebstore.google.com/detail/nlemmjbkihccbkdaihfgijnepogepoob",
  },
  firefox: {
    title: "Firefox 배포 버전 설치",
    copy: "Firefox에서는 Mozilla Add-ons 배포 페이지에서 설치합니다.",
    label: "Firefox 부가 기능 페이지",
    url: "https://addons.mozilla.org/firefox/addon/%EC%86%8C%EB%A7%88-%EB%A9%98%ED%86%A0%EB%A7%81-%EC%8B%9C%EA%B0%84%ED%91%9C",
  },
};

function compareVersions(v1, v2) {
  const toNums = (v) => v.split('.').map(Number);
  const [a1, b1, c1, d1] = toNums(v1);
  const [a2, b2, c2, d2] = toNums(v2);

  if (a1 !== a2) return a1 - a2;
  if (b1 !== b2) return b1 - b2;
  if (c1 !== c2) return c1 - c2;
  return d1 - d2;
}

function getStoreConfig() {
  return /Firefox/i.test(navigator.userAgent) ? STORE_LINKS.firefox : STORE_LINKS.chrome;
}

const localVersion = chrome.runtime.getManifest().version;
const storeConfig = getStoreConfig();

document.getElementById("store-title").textContent = storeConfig.title;
document.getElementById("store-copy").textContent = storeConfig.copy;

const storeLink = document.getElementById("store-link");
storeLink.href = storeConfig.url;
storeLink.textContent = storeConfig.label;

fetch("https://api.github.com/repos/ymjoo12/soma-calendar/releases/latest")
  .then(res => res.json())
  .then(data => {
    const latest = data.tag_name;
    const el = document.getElementById("version-status");
    const comparison = compareVersions(localVersion, latest);
    if (comparison === 0) {
      el.textContent = `✅ 최신 버전입니다: ${localVersion}`;
      el.style.color = "";
    } else if (comparison < 0) {
      el.textContent = `🔁 업데이트 가능: ${localVersion} → ${latest}`;
      el.style.color = 'red';
    } else {
      el.textContent = `🧪 개발 버전 사용 중: ${localVersion} (배포 최신 ${latest})`;
      el.style.color = '#1249a7';
    }
  })
  .catch(() => {
    document.getElementById("version-status").textContent = "❌ 버전 확인 실패";
  });

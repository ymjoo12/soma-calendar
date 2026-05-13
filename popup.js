// popup.js

const STORE_LINKS = {
  chrome:
    "https://chromewebstore.google.com/detail/nlemmjbkihccbkdaihfgijnepogepoob",
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

const clearCacheButton = document.getElementById("clear-cache");
const cacheStatus = document.getElementById("cache-status");

function setCacheStatus(text, color = "#666") {
  cacheStatus.textContent = text;
  cacheStatus.style.color = color;
}

function clearCacheInTab(tab) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tab.id,
      { type: "SOMA_CLEAR_CACHE" },
      (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          resolve(false);
          return;
        }
        resolve(true);
      },
    );
  });
}

clearCacheButton.addEventListener("click", () => {
  clearCacheButton.disabled = true;
  setCacheStatus("캐시 초기화 중...");

  chrome.tabs.query({}, async (tabs) => {
    const results = await Promise.all(tabs.map(clearCacheInTab));
    const clearedCount = results.filter(Boolean).length;
    if (clearedCount > 0) {
      setCacheStatus("캐시를 초기화했습니다.");
    } else {
      setCacheStatus("소마 페이지를 연 뒤 다시 눌러주세요.", "red");
    }
    clearCacheButton.disabled = false;
  });
});

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
      const isChrome = !/Firefox/i.test(navigator.userAgent);
      if (isChrome) {
        const hint = document.getElementById("update-hint");
        if (hint) hint.style.display = "block";
      }
    }
  })
  .catch(() => {
    document.getElementById("version-status").textContent = "❌ 버전 확인 실패";
  });

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
const CACHE_CLEAR_HISTORY_URLS = [
  "https://www.swmaestro.ai/sw/mypage/userAnswer/history.do?menuNo=200047",
  "https://www.swmaestro.ai/busan/sw/mypage/userAnswer/history.do?menuNo=200047",
];
const CACHE_CLEAR_RETRY_COUNT = 12;
const CACHE_CLEAR_RETRY_DELAY_MS = 250;
const CACHE_CLEAR_MESSAGE_TIMEOUT_MS = 500;

function setCacheStatus(text, color = "#666") {
  cacheStatus.textContent = text;
  cacheStatus.style.color = color;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clearCacheInTab(tab) {
  return new Promise((resolve) => {
    if (!tab?.id) {
      resolve(false);
      return;
    }

    let resolved = false;
    const timeoutId = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      resolve(false);
    }, CACHE_CLEAR_MESSAGE_TIMEOUT_MS);

    chrome.tabs.sendMessage(
      tab.id,
      { type: "SOMA_CLEAR_CACHE" },
      (response) => {
        const lastError = chrome.runtime.lastError;
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        if (lastError || !response?.ok) {
          resolve(false);
          return;
        }
        resolve(true);
      },
    );
  });
}

function queryTabs(queryInfo) {
  return new Promise((resolve) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      resolve(tabs || []);
    });
  });
}

function createTab(createProperties) {
  return new Promise((resolve) => {
    chrome.tabs.create(createProperties, (tab) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(tab);
    });
  });
}

function updateTab(tabId, updateProperties) {
  return new Promise((resolve) => {
    chrome.tabs.update(tabId, updateProperties, (tab) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(tab);
    });
  });
}

async function clearCacheInOpenTabs() {
  const tabs = await queryTabs({});
  const results = await Promise.all(tabs.map(clearCacheInTab));
  return results.filter(Boolean).length;
}

async function waitAndClearCacheInTab(tab) {
  for (let count = 0; count < CACHE_CLEAR_RETRY_COUNT; count++) {
    if (await clearCacheInTab(tab)) {
      return true;
    }
    await delay(CACHE_CLEAR_RETRY_DELAY_MS);
  }
  return false;
}

async function clearCacheInOpenedHistoryTab() {
  let tab = await createTab({
    url: CACHE_CLEAR_HISTORY_URLS[0],
    active: false,
  });
  if (!tab?.id) {
    return false;
  }

  if (await waitAndClearCacheInTab(tab)) {
    return true;
  }

  tab = await updateTab(tab.id, { url: CACHE_CLEAR_HISTORY_URLS[1] });
  return waitAndClearCacheInTab(tab);
}

clearCacheButton.addEventListener("click", async () => {
  clearCacheButton.disabled = true;
  setCacheStatus("캐시 초기화 중...");

  try {
    const clearedCount = await clearCacheInOpenTabs();
    if (clearedCount > 0) {
      setCacheStatus("캐시를 초기화했습니다.");
    } else {
      setCacheStatus("접수 내역 탭을 열어 캐시 초기화 중...");
      const openedTabCleared = await clearCacheInOpenedHistoryTab();
      if (openedTabCleared) {
        setCacheStatus("접수 내역 탭을 열어 캐시를 초기화했습니다.");
      } else {
        setCacheStatus(
          "새로 열린 접수 내역 탭에서 로그인 후 다시 눌러주세요.",
          "red",
        );
      }
    }
  } finally {
    clearCacheButton.disabled = false;
  }
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

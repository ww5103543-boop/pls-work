let proxyModule = null;
let proxyReady = false;
let proxyInitPromise = null;
let toastTimer = null;
const toastEl = document.getElementById('toast-message');

function showToast(msg, duration = 1800) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), duration);
}

const urlInput = document.getElementById('url-input');
const loadingIcon = document.querySelector('.loading-icon');
if (urlInput) urlInput.disabled = false;
if (loadingIcon) loadingIcon.classList.add('hidden');

async function initProxy() {
  if (proxyInitPromise) return proxyInitPromise;
  if (proxyReady) return proxyModule;

  proxyInitPromise = (async () => {
    try {
      const m = await import("/ximplesc/ximple.mjs");
      proxyModule = m;

      const w = localStorage.getItem('wispServer') || "wss://wisp.waved.site/";
      const t = localStorage.getItem('transport') || "libcurl";

      await Promise.all([
        m.setWisp?.(w).catch(() => {}),
        m.setTransport?.(t).catch(() => {})
      ]);

      proxyReady = true;
      showToast('Proxy ready', 1200);
      console.log("[sunlit] proxy initialized");
      return m;
    } catch(e) {
      console.error("[sunlit] proxy init failed:", e);
      showToast('Proxy failed to load', 3000);
      throw e;
    }
  })();

  return proxyInitPromise;
}

initProxy();

window.proxyModule = () => proxyModule;
window.proxyReady = () => proxyReady;
window.initProxy = initProxy;
window.showToast = showToast;

async function getProxied(url) {
  if (!window.proxyReady()) await window.initProxy();
  const module = window.proxyModule();
  if (!module?.getProxied) throw new Error("Proxy not available");
  return module.getProxied(url);
}

function getProxiedSync(url) {
  if (!window.proxyReady() || !window.proxyModule()?.getProxiedSync) throw new Error("Proxy not ready");
  return window.proxyModule().getProxiedSync(url);
}

async function setWisp(url) {
  if (!window.proxyReady()) await window.initProxy();
  const module = window.proxyModule();
  if (module?.setWisp) return module.setWisp(url);
}

async function setTransport(t) {
  if (!window.proxyReady()) await window.initProxy();
  const module = window.proxyModule();
  if (module?.setTransport) return module.setTransport(t);
}

const tabContainer = document.getElementById('tab-container');
const newTabBtn = document.getElementById('new-tab-btn');
const contentDiv = document.getElementById('web-container');
const backBtn = document.getElementById('back-btn');
const forwardBtn = document.getElementById('forward-btn');
const reloadBtn = document.getElementById('reload-btn');
const menuBtn = document.getElementById('menu-dots');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const exitFullscreenBtn = document.getElementById('exit-fullscreen-btn');
const dropdown = document.getElementById('dropdown-menu');
const ddDuck = document.getElementById('dd-duck');
const ddBrave = document.getElementById('dd-brave');
const duckCheck = document.getElementById('duck-check');
const braveCheck = document.getElementById('brave-check');
const ddSettings = document.getElementById('dd-settings');
const settingsModal = document.getElementById('settings-modal');
const wispInput = document.getElementById('wisp-url');
const transportSelect = document.getElementById('transport-select');
const closeSettingsBtn = document.getElementById('close-settings');
const saveSettingsBtn = document.getElementById('save-settings');

let tabs = [];
let activeTabId = null;
let tabCounter = 0;
let searchEngine = localStorage.getItem('searchEngine') || 'duckduckgo';
let isFullscreen = false;

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
}

function getSearchPlaceholder() {
  return searchEngine === 'brave' ? 'Search Brave or enter URL...' : 'Search DuckDuckGo or enter URL...';
}

function buildDestUrl(raw) {
  let s = raw.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(s) && !s.includes(' ')) return 'https://' + s;
  return searchEngine === 'brave'
    ? 'https://search.brave.com/search?q=' + encodeURIComponent(s)
    : 'https://duckduckgo.com/?q=' + encodeURIComponent(s);
}

function getTabIconUrl(tab) {
  const u = tab.destUrl || tab.displayUrl || '';
  try {
    const host = new URL(u).hostname;
    if (host) {
      const iconUrl = 'https://www.google.com/s2/favicons?sz=32&domain=' + encodeURIComponent(host);
      const img = new Image();
      img.onerror = () => {};
      img.src = iconUrl;
      return iconUrl;
    }
  } catch (_) {}
  return '';
}

function renderTabs() {
  tabContainer.querySelectorAll('.tab').forEach(el => el.remove());
  for (let tab of tabs) {
    let tabEl = document.createElement('div');
    tabEl.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
    const iconUrl = getTabIconUrl(tab);
    const iconHtml = iconUrl ? '<img class="tab-icon" alt="" src="' + escapeHtml(iconUrl) + '" onerror="this.style.visibility=\'hidden\'">' : '';
    tabEl.innerHTML = iconHtml + '<span class="tab-title">' + escapeHtml(tab.title) + '</span><span class="tab-close" data-id="' + tab.id + '">&#x2715;</span>';
    tabEl.addEventListener('click', e => {
      if (!e.target.classList.contains('tab-close')) switchTab(tab.id);
    });
    tabEl.querySelector('.tab-close').addEventListener('click', e => {
      e.stopPropagation();
      closeTab(tab.id);
    });
    tabContainer.insertBefore(tabEl, newTabBtn);
  }
}

function attachTabContent(tab) {
  if (!tab.frame.isConnected) contentDiv.appendChild(tab.frame);
  if (!tab.newtab.isConnected) contentDiv.appendChild(tab.newtab);
}

function detachTabContent(tab) {
  tab.frame.classList.remove('active');
  tab.newtab.classList.remove('active');
  if (tab.frame.isConnected) tab.frame.remove();
  if (tab.newtab.isConnected) tab.newtab.remove();
}

function switchTab(id) {
  let previousTab = tabs.find(t => t.id === activeTabId);
  if (previousTab && previousTab.id !== id) {
    detachTabContent(previousTab);
  }

  activeTabId = id;
  let activeTab = tabs.find(t => t.id === id);
  if (!activeTab) return;

  attachTabContent(activeTab);
  activeTab.frame.classList.toggle('active', !!activeTab.proxiedUrl);
  activeTab.newtab.classList.toggle('active', !activeTab.proxiedUrl);
  urlInput.value = activeTab.displayUrl || '';
  renderTabs();
}

function closeTab(id) {
  let idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  let tab = tabs[idx];
  if (tab._loadTimer) clearTimeout(tab._loadTimer);
  tab.frame.remove();
  tab.newtab.remove();
  tabs.splice(idx, 1);
  if (tabs.length === 0) {
    createTab();
    return;
  }
  if (activeTabId === id) {
    switchTab(tabs[Math.min(idx, tabs.length - 1)].id);
  } else {
    renderTabs();
  }
}

async function doNavigate(tab, destUrl) {
  if (!destUrl) return;

  let proxied = null;
  if (window.proxyReady() && getProxiedSync) {
    try { proxied = getProxiedSync(destUrl); } catch (_) {}
  }

  if (proxied) {
    tab.proxiedUrl = proxied;
    tab.destUrl = destUrl;
    tab.frame.src = proxied;
    tab.newtab.classList.remove('active');
    if (activeTabId === tab.id) tab.frame.classList.add('active');
  }

  tab.loadState = 'loading';
  tab.title = 'Loading…';
  tab.displayUrl = destUrl;
  if (activeTabId === tab.id) urlInput.value = destUrl;
  renderTabs();

  if (proxied) {
    tab.frame.onload = onFrameLoad;
    tab.frame.onerror = onFrameError;
    return;
  }

  if (!window.proxyReady()) {
    showToast('Initializing proxy...', 2000);
    await window.initProxy();
  }

  if (!window.proxyReady()) {
    showToast('Proxy not available', 3000);
    tab.loadState = 'error';
    tab.title = 'Error';
    renderTabs();
    return;
  }

  try {
    proxied = await getProxied(destUrl);
  } catch (err) {
    showToast('Proxy error: ' + (err?.message ?? String(err)), 3000);
    tab.loadState = 'error';
    tab.title = 'Failed';
    renderTabs();
    return;
  }

  if (!proxied) {
    showToast('Proxy returned empty', 3000);
    return;
  }

  tab.proxiedUrl = proxied;
  tab.destUrl = destUrl;

  tab.frame.onload = onFrameLoad;
  tab.frame.onerror = onFrameError;
  tab.frame.src = proxied;
  tab.newtab.classList.remove('active');
  if (activeTabId === tab.id) tab.frame.classList.add('active');

  function onFrameLoad() {
    tab.loadState = 'loaded';
    tab.retryCount = 0;
    let resolvedDisplay = destUrl;
    try {
      let href = tab.frame.contentWindow?.location?.href || '';
      let match = href.match(/\/scramjet\/(.+)$/);
      if (match) resolvedDisplay = decodeURIComponent(match[1]);
    } catch(_) {}
    tab.displayUrl = resolvedDisplay;
    try {
      tab.title = new URL(resolvedDisplay).hostname.replace(/^www\./, '') || 'Page';
    } catch(_) {
      tab.title = 'Page';
    }
    if (activeTabId === tab.id) urlInput.value = tab.displayUrl;
    renderTabs();
  }

  function onFrameError() {
    tab.loadState = 'error';
    tab.title = 'Error';
    renderTabs();
  }
}

async function navigateTab(tabId, raw) {
  raw = (raw || '').trim();
  if (!raw) return;
  let tab = tabs.find(t => t.id === tabId);
  if (!tab) return;
  let destUrl = buildDestUrl(raw);
  if (!destUrl) return;
  tab.retryCount = 0;
  await doNavigate(tab, destUrl);
}

function createTab(initialUrl) {
  let id = ++tabCounter;

  let frame = document.createElement('iframe');
  frame.className = 'browser-frame';
  frame.setAttribute('allow', 'fullscreen; microphone; camera; autoplay; clipboard-read; clipboard-write; accelerometer; gyroscope; payment; usb; xr-spatial-tracking');

  let newtabDiv = document.createElement('div');
  newtabDiv.className = 'new-tab-page';
  newtabDiv.innerHTML = '<div class="nt-greeting">Sunlit</div><div class="nt-search-area"><input class="nt-search" type="text" placeholder="' + escapeHtml(getSearchPlaceholder()) + '" autocomplete="off" spellcheck="false"></div>';

  let tabObj = {
    id, frame, newtab: newtabDiv,
    title: 'New Tab',
    proxiedUrl: null, destUrl: null, displayUrl: '',
    loadState: 'idle', retryCount: 0, _loadTimer: null
  };
  tabs.push(tabObj);

  let ntInput = newtabDiv.querySelector('.nt-search');
  ntInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && ntInput.value.trim()) {
      navigateTab(id, ntInput.value);
    }
  });

  renderTabs();
  switchTab(id);

  if (initialUrl) {
    navigateTab(id, initialUrl);
  } else {
    setTimeout(() => ntInput.focus(), 50);
  }

  return id;
}

function toggleFullscreen() {
  if (!isFullscreen) {
    document.body.classList.add('fullscreen-mode');
    fullscreenBtn.textContent = '✕';
    fullscreenBtn.title = 'Exit Fullscreen';
    isFullscreen = true;
    showToast('Fullscreen mode enabled', 1500);
  } else {
    document.body.classList.remove('fullscreen-mode');
    fullscreenBtn.textContent = '⛶';
    fullscreenBtn.title = 'Fullscreen';
    isFullscreen = false;
    showToast('Fullscreen mode disabled', 1500);
  }
}

function exitFullscreen() {
  if (isFullscreen) {
    document.body.classList.remove('fullscreen-mode');
    fullscreenBtn.textContent = '⛶';
    fullscreenBtn.title = 'Fullscreen';
    isFullscreen = false;
    showToast('Fullscreen mode disabled', 1500);
  }
}

function updateEngineUI() {
  duckCheck.textContent = searchEngine === 'duckduckgo' ? '✓' : '';
  braveCheck.textContent = searchEngine === 'brave' ? '✓' : '';
  let ph = getSearchPlaceholder();
  urlInput.placeholder = ph;
  document.querySelectorAll('.nt-search').forEach(el => { el.placeholder = ph; });
}

urlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && urlInput.value.trim()) {
    navigateTab(activeTabId, urlInput.value);
  }
});

newTabBtn.addEventListener('click', () => createTab());

backBtn.addEventListener('click', () => {
  let tab = tabs.find(t => t.id === activeTabId);
  try { tab?.frame?.contentWindow?.history.back(); } catch(_) {}
});

forwardBtn.addEventListener('click', () => {
  let tab = tabs.find(t => t.id === activeTabId);
  try { tab?.frame?.contentWindow?.history.forward(); } catch(_) {}
});

reloadBtn.addEventListener('click', () => {
  let tab = tabs.find(t => t.id === activeTabId);
  if (tab?.destUrl) navigateTab(activeTabId, tab.destUrl);
});

fullscreenBtn.addEventListener('click', toggleFullscreen);
exitFullscreenBtn.addEventListener('click', exitFullscreen);

ddDuck.addEventListener('click', () => {
  searchEngine = 'duckduckgo';
  localStorage.setItem('searchEngine', 'duckduckgo');
  updateEngineUI();
  dropdown.classList.remove('open');
});

ddBrave.addEventListener('click', () => {
  searchEngine = 'brave';
  localStorage.setItem('searchEngine', 'brave');
  updateEngineUI();
  dropdown.classList.remove('open');
});

ddSettings.addEventListener('click', () => {
  wispInput.value = localStorage.getItem('wispServer') || 'wss://wisp.waved.site/';
  transportSelect.value = localStorage.getItem('transport') || 'libcurl';
  settingsModal.classList.add('open');
  dropdown.classList.remove('open');
});

menuBtn.addEventListener('click', e => {
  e.stopPropagation();
  dropdown.classList.toggle('open');
});

document.addEventListener('click', () => {
  dropdown.classList.remove('open');
});

closeSettingsBtn.addEventListener('click', () => {
  settingsModal.classList.remove('open');
});

saveSettingsBtn.addEventListener('click', async () => {
  let newWisp = wispInput.value.trim();
  let newTransport = transportSelect.value;
  if (newWisp) {
    localStorage.setItem('wispServer', newWisp);
    if (setWisp) await setWisp(newWisp);
  }
  localStorage.setItem('transport', newTransport);
  if (setTransport) await setTransport(newTransport);
  showToast('Settings saved');
  settingsModal.classList.remove('open');
});

updateEngineUI();
createTab();

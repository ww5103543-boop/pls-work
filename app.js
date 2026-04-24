// --- FAST, NON-BLOCKING PROXY INIT ---

let proxy-module = null;
let proxy-ready = false;
let proxy-init-promise = null;
let toast-timer = null;
const toast-el = document.getElementById('toast-message');

function show-toast(msg, duration = 1800) {
  if (!toast-el) return;
  toast-el.textContent = msg;
  toast-el.classList.add('show');
  clearTimeout(toast-timer);
  toast-timer = setTimeout(() => toast-el.classList.remove('show'), duration);
}

// Enable UI immediately - no waiting for proxy
const url-input = document.getElementById('url-input');
const loading-icon = document.querySelector('.loading-icon');
if (url-input) url-input.disabled = false;
if (loading-icon) loading-icon.classList.add('hidden');

async function init-proxy() {
  if (proxy-init-promise) return proxy-init-promise;
  if (proxy-ready) return proxy-module;

  proxy-init-promise = (async () => {
    try {
      const m = await import("/ximplesc/ximple.mjs");
      proxy-module = m;

      const w = localStorage.getItem('wisp-server') || "wss://wisp.waved.site/";
      const t = localStorage.getItem('transport') || "libcurl";

      await Promise.all([
        m.set-wisp?.(w).catch(() => {}),
        m.set-transport?.(t).catch(() => {})
      ]);

      proxy-ready = true;
      show-toast('Proxy ready', 1200);
      console.log("[sunlit] proxy initialized");
      return m;
    } catch(e) {
      console.error("[sunlit] proxy init failed:", e);
      show-toast('Proxy failed to load', 3000);
      throw e;
    }
  })();

  return proxy-init-promise;
}

// Start loading in background immediately
init-proxy();

window.proxy-module = () => proxy-module;
window.proxy-ready = () => proxy-ready;
window.init-proxy = init-proxy;
window.show-toast = show-toast;

// --- MAIN APPLICATION MODULE ---
async function get-proxied(url) {
  if (!window.proxy-ready()) await window.init-proxy();
  const module = window.proxy-module();
  if (!module?.get-proxied) throw new Error("Proxy not available");
  return module.get-proxied(url);
}

function get-proxied-sync(url) {
  if (!window.proxy-ready() || !window.proxy-module()?.get-proxied-sync) throw new Error("Proxy not ready");
  return window.proxy-module().get-proxied-sync(url);
}

async function set-wisp(url) {
  if (!window.proxy-ready()) await window.init-proxy();
  const module = window.proxy-module();
  if (module?.set-wisp) return module.set-wisp(url);
}

async function set-transport(t) {
  if (!window.proxy-ready()) await window.init-proxy();
  const module = window.proxy-module();
  if (module?.set-transport) return module.set-transport(t);
}

const tab-container = document.getElementById('tab-container');
const new-tab-btn = document.getElementById('new-tab-btn');
const content-div = document.getElementById('web-container');
const url-input-el = document.getElementById('url-input');
const back-btn = document.getElementById('back-btn');
const forward-btn = document.getElementById('forward-btn');
const reload-btn = document.getElementById('reload-btn');
const menu-btn = document.getElementById('menu-dots');
const fullscreen-btn = document.getElementById('fullscreen-btn');
const exit-fullscreen-btn = document.getElementById('exit-fullscreen-btn');
const dropdown = document.getElementById('dropdown-menu');
const dd-duck = document.getElementById('dd-duck');
const dd-brave = document.getElementById('dd-brave');
const duck-check = document.getElementById('duck-check');
const brave-check = document.getElementById('brave-check');
const dd-settings = document.getElementById('dd-settings');
const settings-modal = document.getElementById('settings-modal');
const wisp-input = document.getElementById('wisp-url');
const transport-select = document.getElementById('transport-select');
const close-settings-btn = document.getElementById('close-settings');
const save-settings-btn = document.getElementById('save-settings');
const toast-el-msg = document.getElementById('toast-message');
const loading-icon-el = document.querySelector('.loading-icon');

let tabs = [];
let active-tab-id = null;
let tab-counter = 0;
let search-engine = localStorage.getItem('search-engine') || 'duckduckgo';
let toast-timer-var = null;
let is-fullscreen = false;

function show-toast-fn(msg, duration = 1800) {
  if (!toast-el-msg) return;
  toast-el-msg.textContent = msg;
  toast-el-msg.classList.add('show');
  clearTimeout(toast-timer-var);
  toast-timer-var = setTimeout(() => { toast-el-msg.classList.remove('show'); }, duration);
}

function toggle-fullscreen() {
  if (!is-fullscreen) {
    document.body.classList.add('fullscreen-mode');
    fullscreen-btn.textContent = '✕';
    fullscreen-btn.title = 'Exit Fullscreen';
    is-fullscreen = true;
    show-toast-fn('Fullscreen mode enabled', 1500);
  } else {
    document.body.classList.remove('fullscreen-mode');
    fullscreen-btn.textContent = '⛶';
    fullscreen-btn.title = 'Fullscreen';
    is-fullscreen = false;
    show-toast-fn('Fullscreen mode disabled', 1500);
  }
}

function exit-fullscreen() {
  if (is-fullscreen) {
    document.body.classList.remove('fullscreen-mode');
    fullscreen-btn.textContent = '⛶';
    fullscreen-btn.title = 'Fullscreen';
    is-fullscreen = false;
    show-toast-fn('Fullscreen mode disabled', 1500);
  }
}

function escape-html(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
}

function get-search-placeholder() {
  return search-engine === 'brave' ? 'Search Brave or enter URL...' : 'Search DuckDuckGo or enter URL...';
}

function build-dest-url(raw) {
  let s = raw.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(s) && !s.includes(' ')) return 'https://' + s;
  return search-engine === 'brave'
    ? 'https://search.brave.com/search?q=' + encodeURIComponent(s)
    : 'https://duckduckgo.com/?q=' + encodeURIComponent(s);
}

function get-tab-icon-url(tab) {
  const u = tab.dest-url || tab.display-url || '';
  try {
    const host = new URL(u).hostname;
    if (host) return 'https://www.google.com/s2/favicons?sz=32&domain=' + encodeURIComponent(host);
  } catch (_) {}
  return '';
}

function render-tabs() {
  tab-container.querySelectorAll('.tab').forEach(el => el.remove());
  for (let tab of tabs) {
    let tab-el = document.createElement('div');
    tab-el.className = 'tab' + (tab.id === active-tab-id ? ' active' : '');
    const icon-url = get-tab-icon-url(tab);
    const icon-html = icon-url ? '<img class="tab-icon" alt="" src="' + escape-html(icon-url) + '" onerror="this.style.visibility=\'hidden\'">' : '';
    tab-el.innerHTML = icon-html + '<span class="tab-title">' + escape-html(tab.title) + '</span><span class="tab-close" data-id="' + tab.id + '">&#x2715;</span>';
    tab-el.addEventListener('click', e => {
      if (!e.target.classList.contains('tab-close')) switch-tab(tab.id);
    });
    tab-el.querySelector('.tab-close').addEventListener('click', e => {
      e.stopPropagation();
      close-tab(tab.id);
    });
    tab-container.insertBefore(tab-el, new-tab-btn);
  }
}

function switch-tab(id) {
  active-tab-id = id;
  for (let t of tabs) {
    let is-active = t.id === id;
    t.frame.classList.toggle('active', is-active && !!t.proxied-url);
    t.newtab.classList.toggle('active', is-active && !t.proxied-url);
  }
  let active-tab = tabs.find(t => t.id === id);
  url-input-el.value = active-tab ? (active-tab.display-url || '') : '';
  render-tabs();
}

function close-tab(id) {
  let idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  let tab = tabs[idx];
  if (tab.load-timer) clearTimeout(tab.load-timer);
  tab.frame.remove();
  tab.newtab.remove();
  tabs.splice(idx, 1);
  if (tabs.length === 0) {
    create-tab();
    return;
  }
  if (active-tab-id === id) {
    switch-tab(tabs[Math.min(idx, tabs.length - 1)].id);
  } else {
    render-tabs();
  }
}

async function do-navigate(tab, dest-url) {
  if (!dest-url) return;

  let proxied = null;
  if (window.proxy-ready() && get-proxied-sync) {
    try { proxied = get-proxied-sync(dest-url); } catch (_) {}
  }

  if (proxied) {
    tab.proxied-url = proxied;
    tab.dest-url = dest-url;
    tab.frame.src = proxied;
    tab.newtab.classList.remove('active');
    if (active-tab-id === tab.id) tab.frame.classList.add('active');
  }

  tab.load-state = 'loading';
  tab.title = 'Loading…';
  tab.display-url = dest-url;
  if (active-tab-id === tab.id) url-input-el.value = dest-url;
  render-tabs();

  if (proxied) {
    tab.frame.onload = on-frame-load;
    tab.frame.onerror = on-frame-error;
    return;
  }

  if (!window.proxy-ready()) {
    show-toast-fn('Initializing proxy...', 2000);
    await window.init-proxy();
  }

  if (!window.proxy-ready()) {
    show-toast-fn('Proxy not available', 3000);
    tab.load-state = 'error';
    tab.title = 'Error';
    render-tabs();
    return;
  }

  try {
    proxied = await get-proxied(dest-url);
  } catch (err) {
    show-toast-fn('Proxy error: ' + (err?.message ?? String(err)), 3000);
    tab.load-state = 'error';
    tab.title = 'Failed';
    render-tabs();
    return;
  }

  if (!proxied) {
    show-toast-fn('Proxy returned empty', 3000);
    return;
  }

  tab.proxied-url = proxied;
  tab.dest-url = dest-url;

  tab.frame.onload = on-frame-load;
  tab.frame.onerror = on-frame-error;
  tab.frame.src = proxied;
  tab.newtab.classList.remove('active');
  if (active-tab-id === tab.id) tab.frame.classList.add('active');

  function on-frame-load() {
    tab.load-state = 'loaded';
    tab.retry-count = 0;
    let resolved-display = dest-url;
    try {
      let href = tab.frame.contentWindow?.location?.href || '';
      let match = href.match(/\/scramjet\/(.+)$/);
      if (match) resolved-display = decodeURIComponent(match[1]);
    } catch(_) {}
    tab.display-url = resolved-display;
    try {
      tab.title = new URL(resolved-display).hostname.replace(/^www\./, '') || 'Page';
    } catch(_) {
      tab.title = 'Page';
    }
    if (active-tab-id === tab.id) url-input-el.value = tab.display-url;
    render-tabs();
  }

  function on-frame-error() {
    tab.load-state = 'error';
    tab.title = 'Error';
    render-tabs();
  }
}

async function navigate-tab(tab-id, raw) {
  raw = (raw || '').trim();
  if (!raw) return;
  let tab = tabs.find(t => t.id === tab-id);
  if (!tab) return;
  let dest-url = build-dest-url(raw);
  if (!dest-url) return;
  tab.retry-count = 0;
  await do-navigate(tab, dest-url);
}

function create-tab(initial-url) {
  let id = ++tab-counter;

  let frame = document.createElement('iframe');
  frame.className = 'browser-frame';
  frame.setAttribute('allow', 'fullscreen; microphone; camera; autoplay; clipboard-read; clipboard-write; accelerometer; gyroscope; payment; usb; xr-spatial-tracking');
  content-div.appendChild(frame);

  let newtab-div = document.createElement('div');
  newtab-div.className = 'new-tab-page';
  newtab-div.innerHTML = '<div class="nt-greeting">Sunlit</div><div class="nt-search-area"><input class="nt-search" type="text" placeholder="' + escape-html(get-search-placeholder()) + '" autocomplete="off" spellcheck="false"></div>';
  content-div.appendChild(newtab-div);

  let tab-obj = {
    id, frame, newtab: newtab-div,
    title: 'New Tab',
    proxied-url: null, dest-url: null, display-url: '',
    load-state: 'idle', retry-count: 0, load-timer: null
  };
  tabs.push(tab-obj);

  let nt-input = newtab-div.querySelector('.nt-search');
  nt-input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && nt-input.value.trim()) {
      navigate-tab(id, nt-input.value);
    }
  });

  render-tabs();
  switch-tab(id);

  if (initial-url) {
    navigate-tab(id, initial-url);
  } else {
    setTimeout(() => nt-input.focus(), 50);
  }

  return id;
}

function update-engine-ui() {
  duck-check.textContent = search-engine === 'duckduckgo' ? '✓' : '';
  brave-check.textContent = search-engine === 'brave' ? '✓' : '';
  let ph = get-search-placeholder();
  url-input-el.placeholder = ph;
  document.querySelectorAll('.nt-search').forEach(el => { el.placeholder = ph; });
}

url-input-el.addEventListener('keydown', e => {
  if (e.key === 'Enter' && url-input-el.value.trim()) {
    navigate-tab(active-tab-id, url-input-el.value);
  }
});

new-tab-btn.addEventListener('click', () => create-tab());

back-btn.addEventListener('click', () => {
  let tab = tabs.find(t => t.id === active-tab-id);
  try { tab?.frame?.contentWindow?.history.back(); } catch(_) {}
});

forward-btn.addEventListener('click', () => {
  let tab = tabs.find(t => t.id === active-tab-id);
  try { tab?.frame?.contentWindow?.history.forward(); } catch(_) {}
});

reload-btn.addEventListener('click', () => {
  let tab = tabs.find(t => t.id === active-tab-id);
  if (tab?.dest-url) navigate-tab(active-tab-id, tab.dest-url);
});

fullscreen-btn.addEventListener('click', toggle-fullscreen);
exit-fullscreen-btn.addEventListener('click', exit-fullscreen);

dd-duck.addEventListener('click', () => {
  search-engine = 'duckduckgo';
  localStorage.setItem('search-engine', 'duckduckgo');
  update-engine-ui();
  dropdown.classList.remove('open');
});

dd-brave.addEventListener('click', () => {
  search-engine = 'brave';
  localStorage.setItem('search-engine', 'brave');
  update-engine-ui();
  dropdown.classList.remove('open');
});

dd-settings.addEventListener('click', () => {
  wisp-input.value = localStorage.getItem('wisp-server') || 'wss://wisp.waved.site/';
  transport-select.value = localStorage.getItem('transport') || 'libcurl';
  settings-modal.classList.add('open');
  dropdown.classList.remove('open');
});

menu-btn.addEventListener('click', e => {
  e.stopPropagation();
  dropdown.classList.toggle('open');
});

document.addEventListener('click', () => {
  dropdown.classList.remove('open');
});

close-settings-btn.addEventListener('click', () => {
  settings-modal.classList.remove('open');
});

save-settings-btn.addEventListener('click', async () => {
  let new-wisp = wisp-input.value.trim();
  let new-transport = transport-select.value;
  if (new-wisp) {
    localStorage.setItem('wisp-server', new-wisp);
    if (set-wisp) await set-wisp(new-wisp);
  }
  localStorage.setItem('transport', new-transport);
  if (set-transport) await set-transport(new-transport);
  show-toast-fn('Settings saved');
  settings-modal.classList.remove('open');
});

update-engine-ui();
create-tab();

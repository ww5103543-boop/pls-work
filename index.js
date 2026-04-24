let proxy_module = null;
let proxy_ready = false;
let proxy_promise = null;

function show_toast(msg, dur=1800){
  let t = document.getElementById('toast-msg');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window.toast_timer);
  window.toast_timer = setTimeout(()=> t.classList.remove('show'), dur);
}

async function init_proxy(){
  if(proxy_promise) return proxy_promise;
  if(proxy_ready) return proxy_module;
  proxy_promise = (async ()=>{
    try{
      let m = await import("/ximplesc/ximple.mjs");
      proxy_module = m;
      let w = localStorage.getItem('wispServer') || "wss://wisp.waved.site/";
      let t = localStorage.getItem('transport') || "libcurl";
      if(m.setWisp) await m.setWisp(w);
      if(m.setTransport) await m.setTransport(t);
      proxy_ready = true;
      show_toast('Proxy ready');
      return m;
    }catch(e){
      console.error(e);
      show_toast('Proxy failed');
      throw e;
    }
  })();
  return proxy_promise;
}

window.proxy_ready = ()=> proxy_ready;
window.proxy_module = ()=> proxy_module;
window.init_proxy = init_proxy;
window.show_toast = show_toast;
init_proxy();

async function get_proxied(url){
  if(!window.proxy_ready()) await window.init_proxy();
  let m = window.proxy_module();
  if(!m?.getProxied) throw new Error();
  return m.getProxied(url);
}
function get_proxied_sync(url){
  let m = window.proxy_module();
  if(!window.proxy_ready() || !m?.getProxiedSync) throw new Error();
  return m.getProxiedSync(url);
}
async function set_wisp(u){
  if(!window.proxy_ready()) await window.init_proxy();
  let m = window.proxy_module();
  if(m?.setWisp) return m.setWisp(u);
}
async function set_transport(t){
  if(!window.proxy_ready()) await window.init_proxy();
  let m = window.proxy_module();
  if(m?.setTransport) return m.setTransport(t);
}

let tab_bar = document.getElementById('tab-bar');
let new_tab_btn = document.getElementById('new-tab');
let container = document.getElementById('web-container');
let url_input = document.getElementById('url-input');
let back_btn = document.getElementById('back-btn');
let forward_btn = document.getElementById('forward-btn');
let reload_btn = document.getElementById('reload-btn');
let fs_btn = document.getElementById('fs-btn');
let exit_fs_btn = document.getElementById('exit-fs-btn');
let menu_btn = document.getElementById('menu-btn');
let dropdown = document.getElementById('dropdown');
let dd_duck = document.getElementById('dd-duck');
let dd_brave = document.getElementById('dd-brave');
let duck_span = document.getElementById('duck-check');
let brave_span = document.getElementById('brave-check');
let dd_settings = document.getElementById('dd-settings');
let settings_modal = document.getElementById('settings-modal');
let wisp_input = document.getElementById('wisp-url');
let transport_select = document.getElementById('transport-select');
let close_settings = document.getElementById('close-settings');
let save_settings = document.getElementById('save-settings');
let spinner = document.getElementById('loading-spinner');

let tabs = [];
let active_id = null;
let tab_counter = 0;
let search_engine = localStorage.getItem('searchEngine') || 'duckduckgo';
let is_full = false;

function toast(msg){ window.show_toast?.(msg) || alert(msg); }

function escape_html(str){
  if(!str) return '';
  return str.replace(/[&<>]/g, function(m){
    if(m === '&') return '&amp;';
    if(m === '<') return '&lt;';
    if(m === '>') return '&gt;';
    return m;
  });
}

function get_placeholder(){
  return search_engine === 'brave' ? 'Search Brave or URL' : 'Search DuckDuckGo or URL';
}

function build_url(raw){
  let s = raw.trim();
  if(!s) return null;
  if(/^https?:\/\//i.test(s)) return s;
  if(/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(s) && !s.includes(' ')) return 'https://'+s;
  if(search_engine === 'brave') return 'https://search.brave.com/search?q='+encodeURIComponent(s);
  return 'https://duckduckgo.com/?q='+encodeURIComponent(s);
}

function get_icon_url(tab){
  let u = tab.dest_url || '';
  try{
    let host = new URL(u).hostname;
    if(host) return 'https://www.google.com/s2/favicons?sz=32&domain='+encodeURIComponent(host);
  }catch(e){}
  return '';
}

function render_tabs(){
  let existing = tab_bar.querySelectorAll('.tab');
  existing.forEach(el=>el.remove());
  for(let t of tabs){
    let div = document.createElement('div');
    div.className = 'tab' + (t.id === active_id ? ' active' : '');
    let icon_url = get_icon_url(t);
    let icon_html = icon_url ? `<img class="tab-icon" src="${escape_html(icon_url)}" onerror="this.style.opacity='0'">` : '<span class="tab-icon" style="background:#333"></span>';
    div.innerHTML = icon_html + `<span class="tab-title">${escape_html(t.title)}</span><span class="tab-close" data-id="${t.id}">✕</span>`;
    div.addEventListener('click', (e)=>{
      if(!e.target.classList.contains('tab-close')) switch_tab(t.id);
    });
    let close_span = div.querySelector('.tab-close');
    close_span.addEventListener('click', (e)=>{
      e.stopPropagation();
      close_tab(t.id);
    });
    tab_bar.insertBefore(div, new_tab_btn);
  }
}

function switch_tab(id){
  active_id = id;
  for(let t of tabs){
    let active = t.id === id;
    t.frame.classList.toggle('active', active && !!t.proxied_url);
    t.newtab_div.classList.toggle('active', active && !t.proxied_url);
  }
  let cur = tabs.find(t=>t.id === id);
  if(cur) url_input.value = cur.display_url || '';
  render_tabs();
}

function close_tab(id){
  let idx = tabs.findIndex(t=>t.id === id);
  if(idx === -1) return;
  let tab = tabs[idx];
  tab.frame.remove();
  tab.newtab_div.remove();
  tabs.splice(idx,1);
  if(tabs.length === 0){ create_tab(); return; }
  if(active_id === id){
    let next_id = tabs[Math.min(idx, tabs.length-1)].id;
    switch_tab(next_id);
  } else {
    render_tabs();
  }
}

async function navigate_tab(tab_id, raw_input){
  let input = (raw_input||'').trim();
  if(!input) return;
  let tab = tabs.find(t=>t.id === tab_id);
  if(!tab) return;
  let dest = build_url(input);
  if(!dest) return;
  spinner.classList.remove('hidden');
  tab.loading = true;
  let proxied = null;
  if(window.proxy_ready() && get_proxied_sync){
    try{ proxied = get_proxied_sync(dest); }catch(e){}
  }
  if(proxied){
    tab.proxied_url = proxied;
    tab.dest_url = dest;
    tab.frame.src = proxied;
    tab.newtab_div.classList.remove('active');
    if(active_id === tab.id) tab.frame.classList.add('active');
  } else {
    if(!window.proxy_ready()){
      toast('Initializing proxy...');
      await window.init_proxy();
    }
    if(!window.proxy_ready()){
      toast('Proxy unavailable');
      spinner.classList.add('hidden');
      return;
    }
    try{
      proxied = await get_proxied(dest);
    }catch(err){
      toast('Proxy error');
      spinner.classList.add('hidden');
      return;
    }
    if(!proxied){
      toast('Proxy failed');
      spinner.classList.add('hidden');
      return;
    }
    tab.proxied_url = proxied;
    tab.dest_url = dest;
    tab.frame.src = proxied;
    tab.newtab_div.classList.remove('active');
    if(active_id === tab.id) tab.frame.classList.add('active');
  }
  tab.display_url = dest;
  tab.title = 'Loading...';
  if(active_id === tab.id) url_input.value = dest;
  render_tabs();
  tab.frame.onload = ()=>{
    spinner.classList.add('hidden');
    tab.loading = false;
    let final_url = dest;
    try{
      let loc = tab.frame.contentWindow?.location?.href || '';
      let match = loc.match(/\/scramjet\/(.+)$/);
      if(match) final_url = decodeURIComponent(match[1]);
    }catch(e){}
    tab.display_url = final_url;
    try{
      let hostname = new URL(final_url).hostname.replace(/^www\./,'');
      tab.title = hostname || 'Page';
    }catch(e){ tab.title = 'Page'; }
    if(active_id === tab.id) url_input.value = tab.display_url;
    render_tabs();
  };
  tab.frame.onerror = ()=>{
    spinner.classList.add('hidden');
    tab.title = 'Error';
    render_tabs();
  };
}

function create_tab(initial_url){
  let id = ++tab_counter;
  let frame = document.createElement('iframe');
  frame.className = 'browser-frame';
  frame.setAttribute('allow', 'fullscreen; microphone; camera; autoplay; clipboard-read; clipboard-write');
  container.appendChild(frame);
  let new_div = document.createElement('div');
  new_div.className = 'newtab-page';
  new_div.innerHTML = `<div class="nt-greeting">Sunlit</div><div class="nt-search-area"><input class="nt-search" type="text" placeholder="${escape_html(get_placeholder())}" autocomplete="off"></div>`;
  container.appendChild(new_div);
  let nt_input = new_div.querySelector('.nt-search');
  let tab_obj = {
    id, frame, newtab_div: new_div,
    title: 'New Tab', proxied_url: null, dest_url: null, display_url: '',
    loading: false
  };
  tabs.push(tab_obj);
  nt_input.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter' && nt_input.value.trim()){
      navigate_tab(id, nt_input.value);
    }
  });
  render_tabs();
  switch_tab(id);
  if(initial_url){
    navigate_tab(id, initial_url);
  } else {
    setTimeout(()=> nt_input.focus(), 30);
  }
  return id;
}

function update_ui_engine(){
  duck_span.textContent = search_engine === 'duckduckgo' ? '✓' : '';
  brave_span.textContent = search_engine === 'brave' ? '✓' : '';
  let ph = get_placeholder();
  url_input.placeholder = ph;
  document.querySelectorAll('.nt-search').forEach(el=> el.placeholder = ph);
}

url_input.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter' && url_input.value.trim()){
    navigate_tab(active_id, url_input.value);
  }
});
new_tab_btn.addEventListener('click', ()=> create_tab());
back_btn.addEventListener('click', ()=>{
  let tab = tabs.find(t=>t.id === active_id);
  try{ tab?.frame?.contentWindow?.history.back(); }catch(e){}
});
forward_btn.addEventListener('click', ()=>{
  let tab = tabs.find(t=>t.id === active_id);
  try{ tab?.frame?.contentWindow?.history.forward(); }catch(e){}
});
reload_btn.addEventListener('click', ()=>{
  let tab = tabs.find(t=>t.id === active_id);
  if(tab?.dest_url) navigate_tab(active_id, tab.dest_url);
  else if(tab?.frame.src) tab.frame.src = tab.frame.src;
});
function toggle_full(){
  if(!is_full){
    document.body.classList.add('fullscreen');
    fs_btn.textContent = '✕';
    is_full = true;
  } else {
    document.body.classList.remove('fullscreen');
    fs_btn.textContent = '⛶';
    is_full = false;
  }
}
fs_btn.addEventListener('click', toggle_full);
exit_fs_btn.addEventListener('click', ()=>{
  if(is_full) toggle_full();
});

dd_duck.addEventListener('click',()=>{
  search_engine = 'duckduckgo';
  localStorage.setItem('searchEngine','duckduckgo');
  update_ui_engine();
  dropdown.classList.remove('open');
});
dd_brave.addEventListener('click',()=>{
  search_engine = 'brave';
  localStorage.setItem('searchEngine','brave');
  update_ui_engine();
  dropdown.classList.remove('open');
});
dd_settings.addEventListener('click',()=>{
  wisp_input.value = localStorage.getItem('wispServer') || 'wss://wisp.waved.site/';
  transport_select.value = localStorage.getItem('transport') || 'libcurl';
  settings_modal.classList.add('open');
  dropdown.classList.remove('open');
});
menu_btn.addEventListener('click', (e)=>{
  e.stopPropagation();
  dropdown.classList.toggle('open');
});
document.addEventListener('click', ()=>{
  dropdown.classList.remove('open');
});
close_settings.addEventListener('click', ()=>{
  settings_modal.classList.remove('open');
});
save_settings.addEventListener('click', async ()=>{
  let new_wisp = wisp_input.value.trim();
  let new_transport = transport_select.value;
  if(new_wisp){
    localStorage.setItem('wispServer', new_wisp);
    if(set_wisp) await set_wisp(new_wisp);
  }
  localStorage.setItem('transport', new_transport);
  if(set_transport) await set_transport(new_transport);
  show_toast('Settings saved');
  settings_modal.classList.remove('open');
});

update_ui_engine();
create_tab();

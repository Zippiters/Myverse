/* app.js - MangaDex front-end with reader, bookmarks, loader, theme toggle, login modal (mock)
    Place this file alongside index.html & style.css and open index.html locally.
*/

const API_BASE = 'https://api.mangadex.org';
const UPLOADS_BASE = 'https://uploads.mangadex.org/covers'; // /{mangaId}/{fileName}

// ==============================================================================
// 🛑 CRITICAL FIX: CORS PROXY IMPLEMENTATION (SIMPLIFIED)
// Using a simple prefix to route all external requests through the proxy.
const PROXY_URL = 'https://corsproxy.io/?'; 
// ==============================================================================

/* ---------- Helpers ---------- */
function getTitle(attrs){
  if(!attrs) return 'No Title';
  if(attrs.title){
    if(attrs.title.en) return attrs.title.en;
    return Object.values(attrs.title)[0] || 'Untitled';
  }
  return 'Untitled';
}

// 🛑 MODIFIED: coverFromRel to use simple PROXY_URL prefix for images
function coverFromRel(m){
  const rel = (m.relationships || []).find(r => r.type === 'cover_art');
  const fileName = rel?.attributes?.fileName;
  
  if (fileName) {
    // Prepend the PROXY_URL to the original uploads URL
    return `${PROXY_URL}${UPLOADS_BASE}/${m.id}/${fileName}`; 
  } else {
    return placeholder(220,320);
  }
}
function mdTitleUrl(id){ return `https://mangadex.org/title/${id}`; }
function placeholder(w,h){ return `https://via.placeholder.com/${w}x${h}.png?text=No+Cover`; }
function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }

/* ---------- UI Elements ---------- */
const heroTitle = qs('#heroTitle');
const heroSummary = qs('#heroSummary');
const heroMeta = qs('#heroMeta');
const heroCover = qs('#heroCover');
const heroRating = qs('#heroRating');

const popularList = qs('#popularList');
const popularToday = qs('#popularToday');
const latestGrid = qs('#latestGrid');
const rankList = qs('#rankList');
const carouselDots = qs('#carouselDots');

const readerModal = qs('#readerModal');
const readerPages = qs('#readerPages');
const readerLoading = qs('#readerLoading');
const prevChapBtn = qs('#prevChap');
const nextChapBtn = qs('#nextChap');
const closeReaderBtn = qs('#closeReader');

const bookmarkListNode = qs('#bookmarkList');
const bookmarkHeroBtn = qs('#bookmarkHero');

const searchInput = qs('#searchInput');
const searchBtn = qs('#searchBtn');

const themeToggle = qs('#themeToggle');
const globalLoader = qs('#globalLoader');

const loginModal = qs('#loginModal');
const openLoginBtn = qs('#openLogin');
const closeLoginBtn = qs('#closeLogin');
const loginForm = qs('#loginForm');
const loginMsg = qs('#loginMsg');

/* ---------- State ---------- */
let featuredList = [];
let currentFeaturedIndex = 0;
let currentReader = {
  mangaId: null,
  chapterIndex: null, // index in chapters array
  chapters: [],       // list of chapters for current manga
  pages: [],          // list of page file names for current chapter
  baseUrl: null       // at-home server baseURL
};

/* ---------- Utilities: API calls (MODIFIED FOR PROXY) ---------- */

// 🛑 MODIFIED: fetchManga to use simple PROXY_URL prefix
async function fetchManga(params='limit=8&order[follows]=desc'){
  const url = `${PROXY_URL}${API_BASE}/manga?${params}&includes[]=cover_art`; 
  
  const res = await fetch(url);
  if(!res.ok) throw new Error('MangaDex error');
  const json = await res.json();
  return json.data || [];
}

// 🛑 MODIFIED: fetchChapters to use simple PROXY_URL prefix
async function fetchChapters(mangaId){
  // get chapters (translated EN)
  const url = `${PROXY_URL}${API_BASE}/manga/${mangaId}/feed?limit=500&translatedLanguage[]=en&order[chapter]=desc`; 
  
  const res = await fetch(url);
  if(!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

// 🛑 MODIFIED: getAtHome to use simple PROXY_URL prefix
async function getAtHome(chapterId){
  // returns baseUrl and server data for the chapter pages
  // We MUST include the full URL here, including the protocol (https://)
  const url = `${PROXY_URL}https://api.mangadex.org/at-home/server/${chapterId}`; 
  
  const res = await fetch(url);
  if(!res.ok) throw new Error('At-home error');
  return await res.json();
}

/* ---------- Loading helper ---------- */
function showLoader(on=true){
  if(on){ globalLoader.classList.remove('hidden'); }
  else globalLoader.classList.add('hidden');
}

/* ---------- Featured carousel ---------- */
async function loadFeatured(){
  try{
    const list = await fetchManga('limit=6&order[follows]=desc');
    featuredList = list;
    if(!list.length) return;
    currentFeaturedIndex = 0;
    renderFeatured(0);
    renderDots(list.length);
    setInterval(()=>{ currentFeaturedIndex = (currentFeaturedIndex+1)%featuredList.length; renderFeatured(currentFeaturedIndex); updateDots(); }, 6000);
  }catch(e){
    console.error('featured', e);
  }
}
function renderFeatured(i){
  const m = featuredList[i];
  heroTitle.textContent = getTitle(m.attributes).toUpperCase();
  const desc = m.attributes.description?.en || Object.values(m.attributes.description || {})[0] || '';
  heroSummary.textContent = desc.length > 320 ? desc.slice(0,320)+'…' : desc;
  heroMeta.textContent = `${(m.attributes.publicationDemographic || '').toUpperCase()} • ${ (m.attributes.tags||[]).slice(0,3).map(t=>t.attributes?.name?.en || Object.values(t.attributes?.name||{})[0]).filter(Boolean).join(', ') || m.attributes.status || '—' }`;
  heroRating.textContent = '★';
  heroCover.src = coverFromRel(m);
  // buttons
  qs('#readHero').onclick = ()=> openReaderForManga(m.id);
  bookmarkHeroBtn.onclick = ()=> toggleBookmark({id: m.id, title: getTitle(m.attributes), cover: coverFromRel(m)});
}
function renderDots(n){
  carouselDots.innerHTML = '';
  for(let j=0;j<n;j++){
    const b=document.createElement('button');
    if(j===currentFeaturedIndex) b.classList.add('active');
    b.onclick = ()=>{ currentFeaturedIndex=j; renderFeatured(j); updateDots(); };
    carouselDots.appendChild(b);
  }
}
function updateDots(){
  [...carouselDots.children].forEach((el,idx)=> el.classList.toggle('active', idx===currentFeaturedIndex));
}

/* ---------- Popular list ---------- */
async function loadPopularList(){
  try{
    const list = await fetchManga('limit=8&order[follows]=desc');
    popularList.innerHTML = '';
    list.forEach(m => {
      const item = document.createElement('div');
      item.className = 'pop-item';
      item.innerHTML = `
        <img src="${coverFromRel(m)}" alt="">
        <div>
          <strong>${getTitle(m.attributes)}</strong>
          <div style="color:var(--muted);font-size:13px">${m.attributes.status || ''}</div>
        </div>
      `;
      item.onclick = ()=> openTitle(m.id);
      popularList.appendChild(item);
    });
  }catch(e){ console.error('popular list', e); }
}

/* ---------- Popular Today (latest updated) ---------- */
async function loadPopularToday(){
  try{
    const list = await fetchManga('limit=8&order[updatedAt]=desc');
    popularToday.innerHTML = '';
    list.forEach(m=>{
      const el = document.createElement('div');
      el.className = 'h-card';
      el.innerHTML = `<img src="${coverFromRel(m)}" alt=""><div style="padding:8px;font-weight:700">${getTitle(m.attributes)}</div>`;
      el.onclick = ()=> openTitle(m.id);
      popularToday.appendChild(el);
    });
  }catch(e){ console.error('popularToday', e); }
}

/* ---------- Latest grid ---------- */
async function loadLatestGrid(){
  try{
    const list = await fetchManga('limit=18&order[createdAt]=desc');
    latestGrid.innerHTML = '';
    list.forEach(m=>{
      const a = document.createElement('article');
      a.className = 'card';
      a.innerHTML = `<img src="${coverFromRel(m)}" alt=""><div class="title">${getTitle(m.attributes)} <span class="type">${(m.attributes.publicationDemographic||'MANGA').toUpperCase()}</span></div>`;
      a.onclick = ()=> openReaderForManga(m.id);
      latestGrid.appendChild(a);
    });
  }catch(e){ console.error('latest', e); }
}

/* ---------- Ranking ---------- */
async function loadRanking(){
  try{
    const list = await fetchManga('limit=10&order[follows]=desc');
    rankList.innerHTML = '';
    list.forEach((m,i)=>{
      const li = document.createElement('li');
      li.innerHTML = `<div class="rank-num">${i+1}</div><img class="rank-thumb" src="${coverFromRel(m)}"><div style="flex:1"><strong>${getTitle(m.attributes)}</strong><div style="color:var(--muted);font-size:13px">${m.attributes.status || ''}</div></div>`;
      li.onclick = ()=> openTitle(m.id);
      rankList.appendChild(li);
    });
  }catch(e){ console.error('rank', e); }
}

/* ---------- Reader logic (core) ---------- */
async function openReaderForManga(mangaId){
  showReaderModal(true);
  showReaderLoading(true);
  readerPages.innerHTML = '';
  try{
    // fetch chapters for manga (EN)
    const chapters = await fetchChapters(mangaId);
    if(!chapters.length){
      readerPages.innerHTML = '<div class="loader">No chapters available (EN)</div>';
      showReaderLoading(false);
      return;
    }
    // store chapters sorted by numeric chapter desc (we got that already)
    currentReader.mangaId = mangaId;
    currentReader.chapters = chapters;
    // choose most recent chapter (0)
    currentReader.chapterIndex = 0;
    await loadChapterByIndex(currentReader.chapterIndex);
  }catch(err){
    console.error('openReader', err);
    readerPages.innerHTML = '<div class="loader">Reader error</div>';
  } finally {
    showReaderLoading(false);
  }
}

async function loadChapterByIndex(index){
  showReaderLoading(true);
  readerPages.innerHTML = '';
  try{
    const chapter = currentReader.chapters[index];
    const chapterId = chapter.id;
    // fetch at-home server
    const at = await getAtHome(chapterId);
    const baseUrl = at.baseUrl;
    const data = at.chapter.data; // array of filenames
    const hash = at.chapter.hash; // sometimes there is hash; at-home returns {chapter: {hash, data, dataSaver?}}
    // build image urls: baseUrl + /data/{hash}/{fileName}
    // Modern: baseUrl + '/data/' + at.chapter.hash + '/' + file
    const fileHash = at.chapter.hash;
    currentReader.baseUrl = baseUrl;
    currentReader.pages = (at.chapter.data || at.chapter.dataSaver || []).slice();
    readerPages.innerHTML = '';
    if(!currentReader.pages.length){
      readerPages.innerHTML = '<div class="loader">No pages found for this chapter.</div>';
      return;
    }
    // render images (vertical scroll)
    currentReader.pages.forEach((fn, idx)=>{
      const img = document.createElement('img');
      // NOTE: Chapter images should usually load directly from the At-Home server's baseUrl
      img.src = `${baseUrl}/data/${fileHash}/${fn}`;
      img.alt = `Page ${idx+1}`;
      img.loading = 'lazy';
      img.className = 'reader-img';
      readerPages.appendChild(img);
    });
    // update prev/next chapter buttons
    prevChapBtn.disabled = index <= 0;
    nextChapBtn.disabled = index >= currentReader.chapters.length - 1;
    // scroll to top
    readerPages.scrollTop = 0;
    // save bookmark resume
    saveResume(currentReader.mangaId, currentReader.chapters[index].id, 1);
  }catch(err){
    console.error('loadChapter', err);
    readerPages.innerHTML = '<div class="loader">Failed loading chapter pages (CORS or missing data)</div>';
  } finally{
    showReaderLoading(false);
  }
}

prevChapBtn.addEventListener('click', async ()=>{
  if(currentReader.chapterIndex > 0){
    currentReader.chapterIndex--;
    await loadChapterByIndex(currentReader.chapterIndex);
  }
});
nextChapBtn.addEventListener('click', async ()=>{
  if(currentReader.chapterIndex < currentReader.chapters.length - 1){
    currentReader.chapterIndex++;
    await loadChapterByIndex(currentReader.chapterIndex);
  }
});
closeReaderBtn.addEventListener('click', ()=> showReaderModal(false));

/* keyboard navigation */
document.addEventListener('keydown', (e)=>{
  if(readerModal.classList.contains('show')){
    if(e.key === 'ArrowLeft') prevChapBtn.click();
    if(e.key === 'ArrowRight') nextChapBtn.click();
    if(e.key === 'Escape') closeReaderBtn.click();
  }
});

/* ---------- Bookmarks (localStorage) ---------- */
function loadBookmarks(){
  const raw = localStorage.getItem('mv_bookmarks') || '[]';
  let arr = [];
  try{ arr = JSON.parse(raw); }catch(e){ arr = []; }
  renderBookmarks(arr);
  return arr;
}
function renderBookmarks(list){
  bookmarkListNode.innerHTML = '';
  if(!list.length){ bookmarkListNode.innerHTML = '<small>No bookmarks yet.</small>'; return; }
  list.forEach(b=>{
    const div = document.createElement('div');
    div.className = 'bm-item';
    div.innerHTML = `<img src="${b.cover}" alt=""><div style="flex:1"><strong>${b.title}</strong><div style="color:var(--muted);font-size:13px">Last: ${b.lastChapter || '—'}</div></div><div><button class="btn small" data-id="${b.id}">Read</button></div>`;
    div.querySelector('button').onclick = ()=> openReaderForManga(b.id);
    bookmarkListNode.appendChild(div);
  });
}
function toggleBookmark(item){
  const raw = localStorage.getItem('mv_bookmarks') || '[]';
  let arr = [];
  try{ arr = JSON.parse(raw); }catch(e){ arr = []; }
  const idx = arr.findIndex(x => x.id === item.id);
  if(idx >= 0){
    arr.splice(idx,1);
  } else {
    arr.unshift({ id: item.id, title: item.title, cover: coverFromRel(item), lastChapter: null });
  }
  localStorage.setItem('mv_bookmarks', JSON.stringify(arr));
  renderBookmarks(arr);
}

/* save resume info */
function saveResume(mangaId, chapterId, pageIndex){
  const raw = localStorage.getItem('mv_resume') || '{}';
  let obj = {};
  try{ obj = JSON.parse(raw); }catch(e){ obj = {}; }
  obj[mangaId] = { chapterId, pageIndex, updatedAt: Date.now() };
  localStorage.setItem('mv_resume', JSON.stringify(obj));
}

/* ---------- Reader modal show/hide ---------- */
function showReaderModal(show){
  if(show){
    readerModal.classList.add('show');
    readerModal.setAttribute('aria-hidden','false');
  } else {
    readerModal.classList.remove('show');
    readerModal.setAttribute('aria-hidden','true');
  }
}
function showReaderLoading(on){
  readerLoading.style.display = on ? 'block' : 'none';
}

/* ---------- Title open helper ---------- */
function openTitle(mangaId){
  window.open(mdTitleUrl(mangaId),'_blank');
}
// mdTitleUrl is already defined earlier in the Helpers section

/* ---------- Search ---------- */
searchBtn.addEventListener('click', ()=> doSearch(searchInput.value.trim()));
searchInput.addEventListener('keydown', (e)=> { if(e.key === 'Enter') doSearch(searchInput.value.trim()); });

async function doSearch(q){
  if(!q) return alert('Type a title to search.');
  try{
    showLoader(true);
    // FIX: Using the already defined fetchManga instead of the undefined fetchMangaList
    const list = await fetchManga(`limit=24&title=${encodeURIComponent(q)}`);
    latestGrid.innerHTML = '';
    if(!list.length){ latestGrid.innerHTML = '<div style="padding:16px;color:var(--muted)">No results</div>'; return; }
    list.forEach(m=>{
      const card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = `<img src="${coverFromRel(m)}"><div class="title">${getTitle(m.attributes)}<span class="type">${(m.attributes.publicationDemographic || 'MANGA').toUpperCase()}</span></div>`;
      card.onclick = ()=> openReaderForManga(m.id);
      latestGrid.appendChild(card);
    });
  }catch(e){ console.error('search', e); alert('Search error'); }
  finally{ showLoader(false); }
}

/* FIX: Removed duplicate/conflicting definitions for fetchManga and fetchMangaList */

/* ---------- Theme toggle ---------- */
const root = document.documentElement;
themeToggle.addEventListener('click', ()=>{
  document.body.classList.toggle('light');
  // Simple theme behavior: flip background and accent color
  // NOTE: Ideally, set these in CSS under a .light class and remove this JS style manipulation
  if(document.body.classList.contains('light')){
    root.style.setProperty('--bg','#ffffff');
    root.style.setProperty('--panel','#f7f7fb');
    root.style.setProperty('--muted','#6b7280');
  } else {
    root.style.removeProperty('--bg');
    root.style.removeProperty('--panel');
    root.style.removeProperty('--muted');
  }
});

/* ---------- Login modal (mock) ---------- */
openLoginBtn.addEventListener('click', ()=> { loginModal.classList.add('show'); loginModal.setAttribute('aria-hidden','false'); });
closeLoginBtn.addEventListener('click', ()=> { loginModal.classList.remove('show'); loginModal.setAttribute('aria-hidden','true'); });
qs('#loginCancel').addEventListener('click', ()=> { closeLoginBtn.click(); });

loginForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  loginMsg.textContent = 'Demo login: not connected to server. This is UI-only.';
  setTimeout(()=>{ loginMsg.textContent = 'Logged in (demo)'; closeLoginBtn.click(); }, 800);
});

/* ---------- Page init ---------- */
async function init(){
  try{
    showLoader(true);
    await Promise.all([
      loadFeatured(),
      loadPopularList(),
      loadPopularToday(),
      loadLatestGrid(),
      loadRanking()
    ]);
    // bookmarks
    loadBookmarks();
  }catch(e){ console.error('init', e); }
  finally{ showLoader(false); }
}

/* FIX: Removed duplicate definition for coverFromRel */
/* FIX: Removed duplicate definitions for fetchChapters and getAtHome */

/* ---------- kick off ---------- */
init();

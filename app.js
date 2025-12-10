/* app.live.js - MangaVerse (Live MangaDex API version)
   Uses MangaDex API for real manga, chapters, and pages.
   IMPORTANT: Browsers are usually blocked by MangaDex CORS policy.
   Configure CORS_PROXY below if you need cross-origin forwarding.
*/

/* ---------- CONFIG ---------- */
// If you have a CORS proxy, put it here (include trailing slash).
// Example: 'https://your-cors-proxy.example.com/'
// Leave empty string '' to attempt direct calls (likely blocked by CORS).
const CORS_PROXY = ''; 

const API_BASE = 'https://api.mangadex.org';
const UPLOADS_BASE = 'https://uploads.mangadex.org/covers';
const BOOKMARK_KEY = 'mangaverse_bookmarks';
const THEME_KEY = 'mangaverse_theme';
const PLACEHOLDER = (w,h,text='No+Cover') => `https://via.placeholder.com/${w}x${h}.png?text=${encodeURIComponent(text)}`;

/* ---------- Helpers ---------- */
const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));
function safeFetch(url, opts) {
  // Prefix with CORS proxy if provided
  const finalUrl = (CORS_PROXY || '') + url;
  return fetch(finalUrl, opts);
}
function escapeHtml(s){ if (!s && s !== 0) return ''; return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function truncate(s,n){ if(!s) return ''; return s.length>n? s.slice(0,n-1)+'…': s; }

/* ---------- UI elements (safe fallbacks) ---------- */
const globalLoader = qs('#globalLoader') || document.createElement('div');
if(!globalLoader.id) globalLoader.id = 'globalLoader';
const heroTitle = qs('#heroTitle') || null;
const featuredWrap = qs('#featuredCarousel') || document.createElement('div');
const featuredDots = qs('#featuredDots') || document.createElement('div');

const popularList = qs('#popularList') || document.createElement('div');
const popularToday = qs('#popularToday') || document.createElement('div');
const latestGrid = qs('#latestGrid') || document.createElement('div');
const rankList = qs('#rankList') || document.createElement('div');

const searchInput = qs('#searchInput') || null;
const searchButton = qs('#searchButton') || null;
const searchResults = qs('#searchResults') || document.createElement('div');

const readerModal = qs('#readerModal') || document.createElement('div');
const readerTitle = qs('#readerTitle') || document.createElement('div');
const readerPages = qs('#readerPages') || document.createElement('div');
const readerClose = qs('#readerClose') || null;

const bookmarksList = qs('#bookmarksList') || document.createElement('div');

const themeToggle = qs('#themeToggle') || null;

/* ---------- State ---------- */
let state = {
  featuredIndex: 0,
  bookmarks: loadBookmarks(),
  chaptersCache: {}, // mangaId => chapters
  atHomeCache: {},   // chapterId => at-home data (baseUrl & pages)
};

/* ---------- Persistence ---------- */
function loadBookmarks() {
  try {
    const raw = localStorage.getItem(BOOKMARK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { console.warn('loadBookmarks error', e); return []; }
}
function saveBookmarks(){ try{ localStorage.setItem(BOOKMARK_KEY, JSON.stringify(state.bookmarks)); }catch(e){console.warn('saveBookmarks',e);} }

/* ---------- Theme ---------- */
function loadTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  } catch(e){}
}
function toggleTheme(){
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
}

/* ---------- Cover helper ---------- */
function getTitle(attrs){
  if(!attrs) return 'No Title';
  if(attrs.title){
    if(attrs.title.en) return attrs.title.en;
    return Object.values(attrs.title)[0] || 'Untitled';
  }
  return 'Untitled';
}
function coverFromRel(m){
  const rel = (m.relationships || []).find(r => r.type === 'cover_art');
  const fileName = rel?.attributes?.fileName;
  return fileName ? `${UPLOADS_BASE}/${m.id}/${fileName}` : PLACEHOLDER(220,320,getTitle(m.attributes));
}

/* ---------- MangaDex API helpers ---------- */
/*
  fetchManga(params)
   - params: string like 'limit=8&order[follows]=desc'
   - automatically filters status to ongoing/completed and includes cover_art
*/
async function fetchManga(params='limit=8&order[follows]=desc'){
  const statusFilter = '&status[]=ongoing&status[]=completed';
  const url = `${API_BASE}/manga?${params}${statusFilter}&includes[]=cover_art`;
  try {
    const res = await safeFetch(url);
    if (!res.ok) throw new Error(`MangaDex: ${res.status} ${res.statusText}`);
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    console.error('fetchManga error', err);
    throw err;
  }
}

/*
  fetchChapters(mangaId)
   - returns chapters (translated to en), ordered desc by chapter number
*/
async function fetchChapters(mangaId){
  const url = `${API_BASE}/manga/${mangaId}/feed?limit=500&translatedLanguage[]=en&order[chapter]=desc`;
  try {
    const res = await safeFetch(url);
    if (!res.ok) throw new Error(`Chapters fetch failed: ${res.status}`);
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    console.error('fetchChapters', err);
    throw err;
  }
}

/*
  getAtHome(chapterId)
   - returns at-home server info with baseUrl and chapter data
*/
async function getAtHome(chapterId){
  // MangaDex at-home endpoint
  const url = `${API_BASE}/at-home/server/${chapterId}`;
  try {
    const res = await safeFetch(url);
    if (!res.ok) throw new Error(`At-home fetch failed: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('getAtHome error', err);
    throw err;
  }
}

/* ---------- Rendering (re-uses structure from mock) ---------- */
function showLoader(on=true){ if(!globalLoader) return; if(on) globalLoader.classList.remove('hidden'); else globalLoader.classList.add('hidden'); }

function renderFeatured(list = []) {
  featuredWrap.innerHTML = '';
  featuredDots.innerHTML = '';
  if (!list.length) {
    featuredWrap.innerHTML = `<div class="featured-empty">No featured manga</div>`;
    return;
  }
  list.forEach((m, i) => {
    const el = document.createElement('div');
    el.className = `featured-slide ${i === state.featuredIndex ? 'active' : ''}`;
    el.dataset.index = i;
    el.innerHTML = `
      <img class="featured-cover" width="300" height="420" src="${coverFromRel(m)}" alt="${escapeHtml(getTitle(m.attributes))}">
      <div class="featured-meta">
        <h3 class="featured-title">${escapeHtml(getTitle(m.attributes))}</h3>
        <p class="featured-desc">${truncate(escapeHtml(m.attributes?.description || ''), 140)}</p>
        <div class="featured-actions">
          <button class="btn open-reader" data-id="${m.id}">Read</button>
          <button class="btn bookmark-btn" data-id="${m.id}">${isBookmarked(m.id) ? 'Bookmarked' : 'Bookmark'}</button>
        </div>
      </div>
    `;
    featuredWrap.appendChild(el);

    const dot = document.createElement('button');
    dot.className = `dot ${i === state.featuredIndex ? 'on' : ''}`;
    dot.dataset.index = i;
    dot.addEventListener('click', () => {
      state.featuredIndex = i;
      updateFeaturedActive();
    });
    featuredDots.appendChild(dot);
  });

  qsa('.open-reader').forEach(btn => btn.addEventListener('click', e => openReaderForManga(e.currentTarget.dataset.id)));
  qsa('.bookmark-btn').forEach(btn => btn.addEventListener('click', e => { toggleBookmark(e.currentTarget.dataset.id); btn.textContent = isBookmarked(e.currentTarget.dataset.id) ? 'Bookmarked' : 'Bookmark'; renderBookmarks(); }));
}

function updateFeaturedActive() {
  qsa('.featured-slide').forEach(s => s.classList.remove('active'));
  qsa('.dot').forEach(d => d.classList.remove('on'));
  const active = qs(`.featured-slide[data-index="${state.featuredIndex}"]`);
  const dot = qs(`.dot[data-index="${state.featuredIndex}"]`);
  if (active) active.classList.add('active');
  if (dot) dot.classList.add('on');
}

function renderListToContainer(list, container, small=false) {
  container.innerHTML = '';
  list.forEach(m => {
    const div = document.createElement('div');
    div.className = `manga-item ${small ? 'small' : ''}`;
    div.innerHTML = `
      <img src="${coverFromRel(m)}" alt="${escapeHtml(getTitle(m.attributes))}" width="${small ? 64 : 120}" height="${small ? 90 : 160}">
      <div class="manga-info">
        <h4>${escapeHtml(getTitle(m.attributes))}</h4>
        <div class="manga-meta">${escapeHtml((m.attributes.tags || []).map(t=>t).slice(0,3).join(', '))}</div>
        <div class="manga-actions">
          <button class="btn open-reader" data-id="${m.id}">Read</button>
          <button class="btn bookmark-btn" data-id="${m.id}">${isBookmarked(m.id) ? 'Bookmarked' : 'Bookmark'}</button>
        </div>
      </div>
    `;
    container.appendChild(div);
  });
  qsa('.open-reader').forEach(btn => { btn.removeEventListener('click', openReaderBtnHandler); btn.addEventListener('click', openReaderBtnHandler); });
  qsa('.bookmark-btn').forEach(btn => { btn.removeEventListener('click', bookmarkBtnHandler); btn.addEventListener('click', bookmarkBtnHandler); });
}
function openReaderBtnHandler(e){ openReaderForManga(e.currentTarget.dataset.id); }
function bookmarkBtnHandler(e){ toggleBookmark(e.currentTarget.dataset.id); e.currentTarget.textContent = isBookmarked(e.currentTarget.dataset.id) ? 'Bookmarked' : 'Bookmark'; renderBookmarks(); }

function renderPopular(list){ renderListToContainer(list, popularList, true); }
function renderPopularToday(list){ renderListToContainer(list, popularToday, true); }
function renderLatestGrid(list){
  latestGrid.innerHTML = '';
  list.forEach(m => {
    const div = document.createElement('div');
    div.className = 'grid-card';
    div.innerHTML = `
      <img src="${coverFromRel(m)}" alt="${escapeHtml(getTitle(m.attributes))}" width="140" height="200">
      <h5>${escapeHtml(getTitle(m.attributes))}</h5>
      <small>${escapeHtml(m.attributes.status || '')}</small>
      <div class="card-actions">
        <button class="btn open-reader" data-id="${m.id}">Read</button>
        <button class="btn bookmark-btn" data-id="${m.id}">${isBookmarked(m.id) ? 'Bookmarked' : 'Bookmark'}</button>
      </div>
    `;
    latestGrid.appendChild(div);
  });
  qsa('.open-reader').forEach(btn => { btn.removeEventListener('click', openReaderBtnHandler); btn.addEventListener('click', openReaderBtnHandler); });
  qsa('.bookmark-btn').forEach(btn => { btn.removeEventListener('click', bookmarkBtnHandler); btn.addEventListener('click', bookmarkBtnHandler); });
}

function renderRanking(list){
  rankList.innerHTML = '';
  list.forEach((m,i) => {
    const li = document.createElement('div');
    li.className = 'rank-row';
    li.innerHTML = `
      <span class="rank-pos">${i+1}</span>
      <img src="${coverFromRel(m)}" alt="${escapeHtml(getTitle(m.attributes))}" width="48" height="72">
      <div class="rank-info">
        <strong>${escapeHtml(getTitle(m.attributes))}</strong>
        <div class="rank-tags">${escapeHtml((m.attributes.tags||[]).slice(0,2).join(', '))}</div>
      </div>
      <button class="btn open-reader" data-id="${m.id}">Read</button>
    `;
    rankList.appendChild(li);
  });
  qsa('.open-reader').forEach(btn => { btn.removeEventListener('click', openReaderBtnHandler); btn.addEventListener('click', openReaderBtnHandler); });
}

/* ---------- Bookmarks ---------- */
function isBookmarked(mangaId){ return state.bookmarks.includes(mangaId); }
function toggleBookmark(mangaId){
  if(isBookmarked(mangaId)) state.bookmarks = state.bookmarks.filter(id => id !== mangaId);
  else state.bookmarks.push(mangaId);
  saveBookmarks();
}
function renderBookmarks(){
  // Try to render with cached metadata (we might have partial results); otherwise show IDs
  bookmarksList.innerHTML = '';
  if (!state.bookmarks.length) { bookmarksList.innerHTML = '<div class="empty">No bookmarks yet — add some!</div>'; return; }
  state.bookmarks.forEach(id => {
    // attempt to find recently fetched manga in DOM data attributes
    const cachedEl = document.querySelector(`[data-manga-id="${id}"]`);
    // fallback minimal view
    const div = document.createElement('div');
    div.className = 'bookmark-row';
    div.innerHTML = `
      <img src="${PLACEHOLDER(48,72,'Cover')}" width="48" height="72" alt="cover">
      <div class="bk-info"><strong>${escapeHtml(id)}</strong></div>
      <div class="bk-actions">
        <button class="btn open-reader" data-id="${id}">Read</button>
        <button class="btn remove-bk" data-id="${id}">Remove</button>
      </div>
    `;
    bookmarksList.appendChild(div);
  });
  qsa('.open-reader').forEach(btn => btn.addEventListener('click', e => openReaderForManga(e.currentTarget.dataset.id)));
  qsa('.remove-bk').forEach(btn => btn.addEventListener('click', e => { const id = e.currentTarget.dataset.id; state.bookmarks = state.bookmarks.filter(x => x !== id); saveBookmarks(); renderBookmarks(); }));
}

/* ---------- Search (calls MangaDex search) ---------- */
async function doSearch(query=''){
  const q = String(query || '').trim();
  if (!q) { if (searchResults) searchResults.innerHTML = '<div class="hint">Type to search by title...</div>'; return; }
  showLoader(true);
  try {
    // manga search endpoint: /manga?title=<q>&includes[]=cover_art
    const params = `limit=24&title=${encodeURIComponent(q)}&includes[]=cover_art`;
    const results = await fetchManga(params);
    if (!results.length) searchResults.innerHTML = `<div class="empty">No results for "${escapeHtml(q)}"</div>`;
    else renderListToContainer(results, searchResults, false);
  } catch (err) {
    console.error('search error', err);
    searchResults.innerHTML = `<div class="empty">Search failed — try again later.</div>`;
  } finally { showLoader(false); }
}

/* ---------- Reader: open manga -> chapters -> open chapter -> load pages from at-home server ---------- */
async function openReaderForManga(mangaId){
  showLoader(true);
  try {
    // fetch manga metadata (single manga by id) so we can display title + covers
    const mangaUrl = `${API_BASE}/manga/${mangaId}?includes[]=cover_art`;
    const res = await safeFetch(mangaUrl);
    if (!res.ok) throw new Error('Failed to fetch manga details');
    const json = await res.json();
    const manga = json.data;
    if (!manga) throw new Error('Manga not found');

    // fetch chapters (cached)
    if (!state.chaptersCache[mangaId]) {
      try {
        const ch = await fetchChapters(mangaId);
        state.chaptersCache[mangaId] = ch;
      } catch(e) {
        console.warn('Chapter fetch failed, continuing with empty chapters', e);
        state.chaptersCache[mangaId] = [];
      }
    }
    const chapters = state.chaptersCache[mangaId];
    // choose latest available chapter with a chapter number or latest by upload
    const chosen = chapters.length ? chapters[0] : null;
    if (!chosen) {
      // If no chapters, show a placeholder reader with manga info
      alert('No chapters available for this manga.');
      return;
    }
    await openChapterReader(manga, chosen);
  } catch (err) {
    console.error('openReaderForManga error', err);
    alert('Failed to open reader. See console for details.');
  } finally { showLoader(false); }
}

async function openChapterReader(manga, chapter){
  // chapter is a MangaDex chapter object
  // chapter.id will be the id used by at-home endpoint
  const chapterId = chapter.id;
  try {
    // check cache
    let ah = state.atHomeCache[chapterId];
    if (!ah) {
      ah = await getAtHome(chapterId);
      state.atHomeCache[chapterId] = ah;
    }
    // at-home payload schema: { baseUrl: '', chapter: {hash, data: [<file1.jpg>, ...] } }
    const baseUrl = ah.baseUrl;
    const chapterData = ah.chapter; // contains hash and data (array of filenames)
    const serverUrls = buildPageUrls(baseUrl, chapterData);

    // Render reader modal with pages
    renderReaderModal(getTitle(manga.attributes), chapter, serverUrls);
  } catch (err) {
    console.error('openChapterReader', err);
    alert('Failed to load chapter pages. It might be a CORS or network issue.');
  }
}

function buildPageUrls(baseUrl, chapterData) {
  // baseUrl example: https://uploads.mangadex.org
  // chapterData contains `hash` and `data` array (page filenames)
  if (!baseUrl || !chapterData) return [];
  const hash = chapterData.hash;
  const pages = chapterData.data || [];
  // pages are served as `${baseUrl}/data/${hash}/${filename}`
  return pages.map(fn => `${baseUrl}/data/${hash}/${fn}`);
}

function renderReaderModal(mangaTitle, chapter, pageUrls){
  // clear and show modal
  readerModal.innerHTML = '';
  readerModal.classList.remove('hidden');

  const titleEl = document.createElement('div');
  titleEl.className = 'reader-header';
  titleEl.innerHTML = `
    <h3 id="readerTitleText">${escapeHtml(mangaTitle)} — ${escapeHtml(chapter.attributes?.title || ('#' + chapter.attributes?.chapter || ''))}</h3>
    <button id="readerCloseBtn" class="btn">Close</button>
  `;
  readerModal.appendChild(titleEl);

  const pagesEl = document.createElement('div');
  pagesEl.className = 'reader-pages';
  pageUrls.forEach((url, idx) => {
    const p = document.createElement('div');
    p.className = 'reader-page';
    p.innerHTML = `<img src="${url}" alt="${escapeHtml(`${mangaTitle} • Page ${idx+1}`)}">`;
    pagesEl.appendChild(p);
  });
  readerModal.appendChild(pagesEl);

  const controls = document.createElement('div');
  controls.className = 'reader-controls';
  controls.innerHTML = `
    <button id="pagePrev" class="btn">Prev</button>
    <span id="pageIndicator">1 / ${pageUrls.length}</span>
    <button id="pageNext" class="btn">Next</button>
  `;
  readerModal.appendChild(controls);

  let currentPage = 1;
  const pageNodes = Array.from(pagesEl.children);
  function updatePageVisibility(){
    pageNodes.forEach((pn, idx) => pn.style.display = (idx === currentPage-1) ? 'block' : 'none');
    const indicator = qs('#pageIndicator'); if (indicator) indicator.textContent = `${currentPage} / ${pageUrls.length}`;
  }
  updatePageVisibility();

  qs('#pagePrev').addEventListener('click', () => { if (currentPage > 1) currentPage--; updatePageVisibility(); });
  qs('#pageNext').addEventListener('click', () => { if (currentPage < pageUrls.length) currentPage++; updatePageVisibility(); });
  qs('#readerCloseBtn').addEventListener('click', () => readerModal.classList.add('hidden'));
}

/* ---------- Loading sections (real data) ---------- */
async function loadFeatured(){
  showLoader(true);
  try {
    // featured: top recently updated (4)
    const list = await fetchManga('limit=8&order[updatedAt]=desc');
    const featured = list.slice(0,4);
    renderFeatured(featured);
    // rotate
    setInterval(()=>{ state.featuredIndex = (state.featuredIndex+1) % Math.max(1, featured.length); updateFeaturedActive(); }, 5000);
  } catch (err) {
    console.error('loadFeatured', err);
    // fallback UI
    featuredWrap.innerHTML = '<div class="empty">Failed to load featured - check CORS/proxy.</div>';
  } finally { showLoader(false); }
}

async function loadPopularList(){
  showLoader(true);
  try {
    const list = await fetchManga('limit=8&order[follows]=desc');
    renderPopular(list);
  } catch (err) {
    console.error('loadPopularList', err);
    popularList.innerHTML = '<div class="empty">Failed to load popular list.</div>';
  } finally { showLoader(false); }
}

async function loadPopularToday(){
  showLoader(true);
  try {
    const list = await fetchManga('limit=8&order[updatedAt]=desc');
    renderPopularToday(list);
  } catch (err) {
    console.error('loadPopularToday', err);
    popularToday.innerHTML = '<div class="empty">Failed to load popular today.</div>';
  } finally { showLoader(false); }
}

async function loadLatestGrid(){
  showLoader(true);
  try {
    const list = await fetchManga('limit=18&order[createdAt]=desc');
    renderLatestGrid(list);
  } catch (err) {
    console.error('loadLatestGrid', err);
    latestGrid.innerHTML = '<div class="empty">Failed to load latest.</div>';
  } finally { showLoader(false); }
}

async function loadRanking(){
  showLoader(true);
  try {
    const list = await fetchManga('limit=10&order[follows]=desc');
    renderRanking(list);
  } catch (err) {
    console.error('loadRanking', err);
    rankList.innerHTML = '<div class="empty">Failed to load ranking.</div>';
  } finally { showLoader(false); }
}

/* ---------- UI wiring ---------- */
function setupEventHandlers(){
  if (searchInput && searchButton) {
    searchButton.addEventListener('click', () => doSearch(searchInput.value));
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(searchInput.value); });
  }
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
  else document.body.addEventListener('dblclick', toggleTheme); // convenience
  if (readerClose) readerClose.addEventListener('click', () => readerModal.classList.add('hidden'));
}

/* ---------- Init ---------- */
async function initLiveApp(){
  loadTheme();
  setupEventHandlers();
  renderBookmarks(); // show any saved bookmarks (IDs)
  // Kick off loaders in parallel but keep UI responsive
  loadFeatured();
  loadPopularList();
  loadPopularToday();
  loadLatestGrid();
  loadRanking();
}

/* ---------- Start ---------- */
initLiveApp();

/* ---------- Minimal styles (convenience) ---------- */
(function attachMinimalStyles(){
  if (document.getElementById('live-app-styles')) return;
  const css = `
    .hidden{display:none;}
    .featured-slide{display:flex;gap:12px;align-items:center;padding:12px;border-radius:8px;}
    .featured-slide img{border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,0.12);}
    .featured-meta{max-width:520px;}
    .manga-item{display:flex;gap:12px;align-items:center;padding:8px;border-bottom:1px solid #eee;}
    .manga-item.small img{width:64px;height:90px;}
    .grid-card{display:inline-block;width:160px;margin:8px;padding:8px;text-align:center;border:1px solid #eee;border-radius:6px;}
    .rank-row{display:flex;align-items:center;gap:12px;padding:6px;border-bottom:1px solid #f0f0f0;}
    .btn{padding:6px 10px;border-radius:6px;border:0;background:#2b6cb0;color:#fff;cursor:pointer}
    .btn:hover{opacity:.95}
    .reader-pages{max-width:760px;margin:12px auto;text-align:center;}
    .reader-page img{max-width:100%;height:auto;border-radius:6px;}
    .reader-controls{display:flex;justify-content:center;gap:12px;margin:12px;}
    #readerModal{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);background:#fff;z-index:9999;padding:12px;border-radius:8px;box-shadow:0 12px 40px rgba(0,0,0,0.25);max-height:90vh;overflow:auto;}
    .dark #readerModal{background:#111;color:#eee}
    .bookmark-row,.bk-actions{display:flex;align-items:center;gap:8px}
    .hint,.empty{color:#666;padding:12px}
  `;
  const s = document.createElement('style');
  s.id = 'live-app-styles';
  s.appendChild(document.createTextNode(css));
  document.head.appendChild(s);
})();

/* ---------- Notes / Troubleshooting ----------
1) CORS: MangaDex prevents direct browser requests in many contexts. If you see CORS errors in the console,
   set CORS_PROXY to a proxy that forwards requests (self-hosted is recommended for production).
   Example small proxy: a tiny Node/Express server that forwards requests with proper headers.

2) Rate limits: MangaDex may throttle heavy requests. Avoid polling; fetch on-demand.

3) Fallback: if you want, wrap fetch errors to fallback to app.mock.js mock data for offline demo purposes.

4) Security: Be careful exposing an open CORS proxy publicly; prefer a limited/secure proxy.

----------------------------------------------- */


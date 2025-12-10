/* app.js - MangaVerse Demo (Revised for API Stability) */

const API_BASE = 'https://api.mangadex.org';
const UPLOADS_BASE = 'https://uploads.mangadex.org/covers';

/* ---------- Helpers ---------- */
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
    return fileName ? `${UPLOADS_BASE}/${m.id}/${fileName}` : placeholder(220,320);
}
function placeholder(w,h){ return `https://via.placeholder.com/${w}x${h}.png?text=No+Cover`; }
function qs(sel){ return document.querySelector(sel); }

/* (UI Elements and State declarations remain the same) */
// ... (Your UI Element and State declarations go here) ...
const heroTitle = qs('#heroTitle'); // Example of UI element from original code
// ...

/* ---------- Utilities: API calls ---------- */
// Simplified and added status filter to make requests more specific
async function fetchManga(params='limit=8&order[follows]=desc'){
    // Ensures we only fetch manga that is ongoing or completed, improving stability
    const statusFilter = '&status[]=ongoing&status[]=completed'; 
    const url = `${API_BASE}/manga?${params}${statusFilter}&includes[]=cover_art`;
    
    const res = await fetch(url);
    if(!res.ok) {
        console.error('MangaDex fetch error:', res.status, res.statusText);
        // Throw an error to be caught by the loading functions
        throw new Error(`MangaDex error: ${res.status}`);
    }
    const json = await res.json();
    return json.data || [];
}

async function fetchChapters(mangaId){
    // get chapters (translated EN)
    const url = `${API_BASE}/manga/${mangaId}/feed?limit=500&translatedLanguage[]=en&order[chapter]=desc`;
    const res = await fetch(url);
    if(!res.ok) return [];
    const json = await res.json();
    return json.data || [];
}

async function getAtHome(chapterId){
    // returns baseUrl and server data for the chapter pages
    const url = `https://api.mangadex.org/at-home/server/${chapterId}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('At-home error');
    return await res.json();
}

/* ---------- Loading helper and Featured carousel (remain the same) ---------- */
function showLoader(on=true){
    if(on){ globalLoader.classList.remove('hidden'); }
    else globalLoader.classList.add('hidden');
}

// ... (Rest of loadFeatured, renderFeatured, renderDots, updateDots remains the same) ...

/* ---------- Popular list ---------- */
async function loadPopularList(){
    try{
        // Using fetchManga with follows desc
        const list = await fetchManga('limit=8&order[follows]=desc');
        popularList.innerHTML = '';
        list.forEach(m => {
            // ... (HTML rendering remains the same) ...
        });
    }catch(e){ console.error('popular list', e); }
}

/* ---------- Popular Today (latest updated) ---------- */
async function loadPopularToday(){
    try{
        // Using fetchManga with updatedAt desc
        const list = await fetchManga('limit=8&order[updatedAt]=desc');
        popularToday.innerHTML = '';
        list.forEach(m=>{
            // ... (HTML rendering remains the same) ...
        });
    }catch(e){ console.error('popularToday', e); }
}

/* ---------- Latest grid ---------- */
async function loadLatestGrid(){
    try{
        // Using fetchManga with createdAt desc
        const list = await fetchManga('limit=18&order[createdAt]=desc');
        latestGrid.innerHTML = '';
        list.forEach(m=>{
            // ... (HTML rendering remains the same) ...
        });
    }catch(e){ console.error('latest', e); }
}

/* ---------- Ranking ---------- */
async function loadRanking(){
    try{
        // Using fetchManga with follows desc
        const list = await fetchManga('limit=10&order[follows]=desc');
        rankList.innerHTML = '';
        list.forEach((m,i)=>{
            // ... (HTML rendering remains the same) ...
        });
    }catch(e){ console.error('rank', e); }
}

/* (Reader, Bookmarks, Theme Toggle, Login, and Init functions remain the same) */
// ...

// Re-add the fetchMangaList helper for search functionality, which uses the main fetchManga helper
async function fetchMangaList(query){
    return fetchManga(query); // Now uses the updated main fetchManga logic
}


/* ---------- kick off ---------- */
// init(); 
// Ensure the rest of your original app.js content is appended here, 
// including the init() call at the very end.

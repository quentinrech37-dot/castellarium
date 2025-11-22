// =========================
// =========================
// 0. ÉTAT GLOBAL
// =========================

let castlesDB = [];

let visitedIds  = (JSON.parse(localStorage.getItem('visitedIds_v2'))  || []).map(String);
let wishlistIds = (JSON.parse(localStorage.getItem('wishlistIds_v2')) || []).map(String);

let currentCastle = null;
let chartEra = null;
let chartStyle = null;

// Utilisateur Firebase courant (si connecté)
let currentUserId = null;


// Cache des URLs d’images (clé = id de château)
const imageCache = new Map();

// =========================
// 1. CHARGEMENT DE chateaux.json
// =========================

// 1. CHARGEMENT DE chateaux.json
// =========================

async function loadCastlesFromMerimee() {
    const res = await fetch('chateaux.json');
    if (!res.ok) {
        throw new Error('Impossible de charger chateaux.json');
    }
    const data = await res.json();

    castlesDB = data.map((raw, idx) => {
        const id = raw.id || `mh-${idx}`;
        const name = raw.nom || "Château (nom inconnu)";

        const locParts = [];
        if (raw.commune) locParts.push(raw.commune);
        if (raw.departement) locParts.push(raw.departement);
        if (raw.region) locParts.push(raw.region);
        const location = locParts.join(" · ") || "Localisation inconnue";

        const era = raw.siecles || raw.datation || "Datation inconnue";
        const style = raw.region || "Région inconnue";

        const desc =
            raw.resume_historique && raw.resume_historique.trim().length > 0
                ? raw.resume_historique
                : "Aucun résumé disponible.";

        // NEW : on sort les coordonnées dans un champ simple
        let coord = null;
        if (
            raw.coordonnees &&
            typeof raw.coordonnees.lat === "number" &&
            typeof raw.coordonnees.lon === "number"
        ) {
            coord = {
                lat: raw.coordonnees.lat,
                lon: raw.coordonnees.lon
            };
        }

        // NEW : champ _search pour la recherche
        const searchParts = [
            name,
            raw.commune,
            raw.departement,
            raw.region
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        return {
            id: String(id),
            name,
            location,
            era,
            style,
            desc,
            coord,          // NEW
            _search: searchParts, // NEW
            raw
        };
    });
}


// =========================
// 2. INIT
// =========================

async function init() {
    try {
        await loadCastlesFromMerimee();
    } catch (e) {
        console.error(e);
        alert("Erreur lors du chargement de chateaux.json");
        return;
    }

    renderVisited();
    renderWishlist();
    updateStats();

    const searchInput = document.getElementById('searchInput');
    let searchTimeout = null;

    searchInput.addEventListener('input', (e) => {
        const value = e.target.value;
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            handleSearchValue(value);
        }, 200); // on attend 200 ms avant de lancer la recherche
    });
}

// =========================
// 3. ONGLET / NAVIGATION
// =========================

function switchTab(tabName) {
    // 1) onglets actifs / inactifs
    const allButtons = document.querySelectorAll('.tab-btn');
    allButtons.forEach(b => b.classList.remove('active'));

    // on remet le bouton correspondant en "actif"
    // (on utilise le texte du bouton pour rester simple)
    allButtons.forEach(b => {
        if (tabName === 'visited'  && b.textContent.includes('Mes Visites'))      b.classList.add('active');
        if (tabName === 'wishlist' && b.textContent.includes("Ma Liste d'Envie")) b.classList.add('active');
        if (tabName === 'stats'    && b.textContent.includes('Statistiques'))     b.classList.add('active');
        if (tabName === 'map'      && b.textContent.includes('Carte'))            b.classList.add('active');
        if (tabName === 'about'    && b.textContent.includes('À propos'))         b.classList.add('active');
    });

    // 2) on masque toutes les sections de contenu
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    // la section de recherche est gérée à part
    const searchSec = document.getElementById('searchSection');
    if (searchSec) searchSec.classList.remove('active');

    // 3) on affiche la bonne section + actions associées
    if (tabName === 'visited') {
        document.getElementById('visitedSection').classList.add('active');
    }

    if (tabName === 'wishlist') {
        document.getElementById('wishlistSection').classList.add('active');
    }

    if (tabName === 'stats') {
        document.getElementById('statsSection').classList.add('active');
        // on rafraîchit les graphs
        if (typeof updateStats === 'function') {
            updateStats();
        }
    }

    if (tabName === 'map') {
        document.getElementById('mapSection').classList.add('active');
        // 🔴 C’est ICI qu’on initialise/rafraîchit la carte
        if (typeof showMapTab === 'function') {
            showMapTab();
        }
    }

    if (tabName === 'about') {
        document.getElementById('aboutSection').classList.add('active');
    }
}



function saveData() {
    // Sauvegarde locale (invités + cache pour les utilisateurs)
    localStorage.setItem('visitedIds_v2', JSON.stringify(visitedIds));
    localStorage.setItem('wishlistIds_v2', JSON.stringify(wishlistIds));

    renderVisited();
    renderWishlist();

    // Si un utilisateur est connecté et Firestore dispo → sync serveur
    if (currentUserId && window.castellariumDB) {
        window.castellariumDB
            .saveUserState(currentUserId, visitedIds, wishlistIds)
            .catch(err => {
                console.error("Erreur lors de la sauvegarde Firestore :", err);
            });
    }
}


// =========================
// 4. IMAGES (Wikipedia d'abord, Commons ensuite)
// =========================

function normalizeName(name) {
    if (!name) return "";
    let n = name;
    // enlever ce qu'il y a entre parenthèses
    n = n.replace(/\(.*?\)/g, "");
    // enlever les "ou ..." ("Château X (ou Y)" → "Château X")
    n = n.replace(/\bou\b.*$/i, "");
    // espaces multiples
    n = n.replace(/\s+/g, " ").trim();
    return n;
}

function buildSearchQueries(castle) {
    const raw = castle.raw || {};
    const baseName = normalizeName(castle.name || "");
    const lcBase = baseName.toLowerCase();

    const commune = (raw.commune || "").split(/[,(]/)[0].trim();
    const departement = (raw.departement || "").split(/[,(]/)[0].trim();

    const queries = [];

    // Noms totalement génériques → on NE DOIT PAS chercher juste "Château"
    const genericNames = [
        "château", "chateau", "ancien château", "ancien chateau",
        "château ruiné", "chateau ruine", "château fort", "chateau fort"
    ];
    const isGeneric = !baseName || genericNames.includes(lcBase);

    if (isGeneric) {
        // On s'appuie au maximum sur la commune / le département
        if (commune && departement) {
            queries.push(`château de ${commune} (${departement})`);
            queries.push(`château de ${commune} ${departement} france`);
            queries.push(`château ${commune} ${departement} france`);
        } else if (commune) {
            queries.push(`château de ${commune} france`);
            queries.push(`château ${commune} france`);
        }
        if (commune && !departement) {
            queries.push(`${commune} château`);
        }
    } else {
        // Noms précis : logique enrichie
        if (baseName && commune) {
            queries.push(`${baseName} (${commune})`);
            queries.push(`${baseName} ${commune} château`);
            queries.push(`château de ${baseName} ${commune}`);
        }
        if (baseName && departement) {
            queries.push(`${baseName} (${departement})`);
            queries.push(`${baseName} ${departement} château`);
        }

        // Requêtes plus générales, mais seulement si le nom n'est pas générique
        queries.push(`château de ${baseName}`);
        queries.push(`${baseName} château`);
        queries.push(baseName);
    }

    // Suppression des doublons
    const seen = new Set();
    return queries.filter(q => {
        if (seen.has(q)) return false;
        seen.add(q);
        return true;
    });
}

// --- Wikipedia FR ---
function fetchFirstWikipediaImage(query) {
    const url = new URL("https://fr.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*"); // CORS
    url.searchParams.set("prop", "pageimages");
    url.searchParams.set("piprop", "thumbnail");
    url.searchParams.set("pithumbsize", "640");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrsearch", query);
    url.searchParams.set("gsrlimit", "1");

    return fetch(url.toString())
        .then(res => res.json())
        .then(data => {
            if (!data.query || !data.query.pages) return null;
            const pages = Object.values(data.query.pages);
            if (!pages.length) return null;
            const page = pages[0];
            if (!page.thumbnail || !page.thumbnail.source) return null;
            return page.thumbnail.source;
        })
        .catch(() => null);
}

// --- Wikimedia Commons (fallback) ---
function fetchFirstCommonsImage(query) {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*"); // CORS
    url.searchParams.set("prop", "pageimages");
    url.searchParams.set("piprop", "thumbnail");
    url.searchParams.set("pithumbsize", "640");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrsearch", query);
    url.searchParams.set("gsrlimit", "1");

    return fetch(url.toString())
        .then(res => res.json())
        .then(data => {
            if (!data.query || !data.query.pages) return null;
            const pages = Object.values(data.query.pages);
            if (!pages.length) return null;
            const page = pages[0];
            if (!page.thumbnail || !page.thumbnail.source) return null;
            return page.thumbnail.source;
        })
        .catch(() => null);
}

// --- Logique principale de chargement d'image ---
function loadImageForCastle(castle, domElement) {
    const key = String(castle.id);

    // réinitialiser le fond
    domElement.style.backgroundImage = "";

    // Si déjà en cache, on applique et on s'arrête
    if (imageCache.has(key)) {
        const url = imageCache.get(key);
        if (url) {
            domElement.style.backgroundImage = `url('${url}')`;
        }
        return;
    }

    // Première fois : on marque comme "en cours"
    imageCache.set(key, null);

    const queries = buildSearchQueries(castle);

    (async () => {
        for (const q of queries) {
            // 1) On tente Wikipedia
            let url = await fetchFirstWikipediaImage(q);
            if (!url) {
                // 2) Sinon on tente Commons
                url = await fetchFirstCommonsImage(q);
            }
            if (url) {
                imageCache.set(key, url);
                domElement.style.backgroundImage = `url('${url}')`;
                return;
            }
        }
        // Rien trouvé
        imageCache.set(key, null);
    })();
}

// =========================
// 5. CARTES / LISTES
// =========================

// withImage = true : on charge l'image (visites / envies)
// withImage = false : pas d'image (résultats de recherche pour éviter les lags)
function createCard(c, withImage = true) {
    const div = document.createElement('div');
    div.className = 'card';
    div.onclick = () => openModal(c);

    let badges = '';
    if (visitedIds.includes(String(c.id))) badges += `<span class="badge badge-visited">✓</span>`;
    if (wishlistIds.includes(String(c.id))) badges += `<span class="badge badge-wish">♥</span>`;

    div.innerHTML = `
        <div class="card-img">
            <div class="status-badges">${badges}</div>
            <span class="card-tag">${c.era}</span>
        </div>
        <div class="card-body">
            <h3 class="card-title">${c.name}</h3>
            <div class="card-loc">📍 ${c.location}</div>
        </div>
    `;

    const imgDiv = div.querySelector('.card-img');
    if (withImage) {
        loadImageForCastle(c, imgDiv);
    }

    return div;
}

function renderVisited() {
    const container = document.getElementById('visitedList');
    container.innerHTML = '';
    const list = castlesDB.filter(c => visitedIds.includes(String(c.id)));
    document.getElementById('visitedCount').innerText = list.length;

    if (list.length === 0) {
        container.innerHTML = '<p class="empty-state">Vous n\'avez pas encore marqué de château visité.</p>';
    } else {
        list.forEach(c => container.appendChild(createCard(c, true)));
    }
}

function renderWishlist() {
    const container = document.getElementById('wishlistList');
    container.innerHTML = '';
    const list = castlesDB.filter(c => wishlistIds.includes(String(c.id)));
    document.getElementById('wishCount').innerText = list.length;

    if (list.length === 0) {
        container.innerHTML = '<p class="empty-state">Votre liste d\'envie est vide.</p>';
    } else {
        list.forEach(c => container.appendChild(createCard(c, true)));
    }
}

// =========================
// 6. RECHERCHE
// =========================

function handleSearchValue(value) {
    const query = value.toLowerCase();
    const searchSec = document.getElementById('searchSection');
    const searchList = document.getElementById('searchList');

    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    searchSec.classList.add('active');

    searchList.innerHTML = '';
    if (query.length < 1) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const visitedTab = Array.from(document.querySelectorAll('.tab-btn'))
            .find(b => b.textContent.includes('Mes Visites'));
        if (visitedTab) visitedTab.classList.add('active');
        document.getElementById('visitedSection').classList.add('active');
        return;
    }

    const results = castlesDB.filter(c =>
        c._search.indexOf(query) !== -1
    );

    if (results.length === 0) {
    searchList.innerHTML = '<p class="empty-state">Aucun château trouvé.</p>';
} else {
    // On affiche au maximum 100 résultats,
    // MAIS on ne charge les images que pour les 30 premiers
    results.slice(0, 100).forEach((c, index) => {
        const withImage = index < 30;   // images pour les 30 premiers, gris pour le reste
        searchList.appendChild(createCard(c, withImage));
    });
}

}

// =========================
// 7. MODALE
// =========================

function openModal(c) {
    currentCastle = c;
    // Image d’en-tête de la fiche
    const headerDiv = document.getElementById('mImg');
    headerDiv.style.backgroundImage = '';

    // On réutilise le cache d’images (évite de refaire des requêtes)
    const cachedUrl = imageCache.get(String(c.id));
    if (cachedUrl) {
        headerDiv.style.backgroundImage = `url('${cachedUrl}')`;
    } else {
        // Si le château n’a pas encore d’image en cache, on en cherche une
        loadImageForCastle(c, headerDiv);
    }


    // Titre
    document.getElementById('mTitle').textContent = c.name;

    // Localisation : on utilise la chaîne déjà préparée
    document.getElementById('mLoc').textContent =
        `📍 ${c.location || 'Localisation inconnue'}`;

    // Tags (siècles et région)
    const tagsDiv = document.getElementById('mTags');
    tagsDiv.innerHTML = '';

    if (c.era && c.era.trim() !== '') {
        const t = document.createElement('span');
        t.className = 'tag';
        t.textContent = c.era;
        tagsDiv.appendChild(t);
    }

    if (c.style && c.style.trim() !== '') {
        const t = document.createElement('span');
        t.className = 'tag';
        t.textContent = c.style;
        tagsDiv.appendChild(t);
    }

    // Description
    document.getElementById('mDesc').textContent =
        c.desc || "Aucun résumé disponible.";

    // --- Vidéo éventuelle ---
    const videoContainer = document.getElementById('mVideoContainer');
    const videoIframe    = document.getElementById('mVideo');

    if (videoContainer && videoIframe) {
        const lien = c.raw && c.raw.lien_video;   // pris dans l’objet brut du JSON

        if (lien) {
            // Conversion éventuelle YouTube -> URL d'embed
            let embedUrl = lien;
            const match = lien.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=)([^&]+)/);
            if (match) {
                embedUrl = `https://www.youtube.com/embed/${match[1]}`;
            }

            videoIframe.src = embedUrl;
            videoContainer.style.display = 'block';
        } else {
            videoIframe.src = '';
            videoContainer.style.display = 'none';
        }
    }

    // Boutons
    updateModalButtons();

    // Afficher la modale
    document.getElementById('modalOverlay').style.display = 'flex';
}


function closeModal() {
    document.getElementById('modalOverlay').style.display = 'none';

    // Coupe la vidéo quand on ferme
    const videoIframe = document.getElementById('mVideo');
    const videoContainer = document.getElementById('mVideoContainer');
    if (videoIframe) videoIframe.src = '';
    if (videoContainer) videoContainer.style.display = 'none';

    currentCastle = null;
}


function updateModalButtons() {
    if (!currentCastle) return;

    const id = String(currentCastle.id);
    const btnVisit = document.getElementById('btnVisit');
    const btnWish = document.getElementById('btnWish');

    if (visitedIds.includes(id)) {
        btnVisit.classList.add('active');
        btnVisit.innerHTML = `<span>✓</span> Visité (Annuler)`;
    } else {
        btnVisit.classList.remove('active');
        btnVisit.innerHTML = `<span>✓</span> Marquer visité`;
    }

    if (wishlistIds.includes(id)) {
        btnWish.classList.add('active');
        btnWish.innerHTML = `<span>♥</span> Envie (Retirer)`;
    } else {
        btnWish.classList.remove('active');
        btnWish.innerHTML = `<span>♥</span> Ajouter liste d'envie`;
    }
}

function toggleVisit() {
    if (!currentCastle) return;
    const id = String(currentCastle.id);

    if (visitedIds.includes(id)) {
        visitedIds = visitedIds.filter(i => i !== id);
    } else {
        visitedIds.push(id);
        wishlistIds = wishlistIds.filter(i => i !== id);
    }
    saveData();
    updateModalButtons();
}

function toggleWish() {
    if (!currentCastle) return;
    const id = String(currentCastle.id);

    if (wishlistIds.includes(id)) {
        wishlistIds = wishlistIds.filter(i => i !== id);
    } else if (!visitedIds.includes(id)) {
        wishlistIds.push(id);
    }
    saveData();
    updateModalButtons();
}

document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
});

// =========================
// 8. STATISTIQUES
// =========================

function updateStats() {
    const visitedList = castlesDB.filter(c => visitedIds.includes(String(c.id)));
    document.getElementById('statTotal').innerText = visitedList.length;

    if (visitedList.length === 0) return;

    const eraCounts = {};
    visitedList.forEach(c => { eraCounts[c.era] = (eraCounts[c.era] || 0) + 1; });

    const styleCounts = {};
    visitedList.forEach(c => { styleCounts[c.style] = (styleCounts[c.style] || 0) + 1; });

    const ctxEra = document.getElementById('eraChart').getContext('2d');
    if (chartEra) chartEra.destroy();

    chartEra = new Chart(ctxEra, {
        type: 'bar',
        data: {
            labels: Object.keys(eraCounts),
            datasets: [{
                label: 'Nombre de châteaux',
                data: Object.values(eraCounts),
                backgroundColor: '#3498db',
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });

    const ctxStyle = document.getElementById('styleChart').getContext('2d');
    if (chartStyle) chartStyle.destroy();

    chartStyle = new Chart(ctxStyle, {
        type: 'doughnut',
        data: {
            labels: Object.keys(styleCounts),
            datasets: [{
                data: Object.values(styleCounts),
                backgroundColor: [
                    '#e74c3c', '#9b59b6', '#f1c40f', '#2ecc71', '#1abc9c', '#34495e'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

// =========================
// 9. LANCEMENT
// =========================

document.addEventListener('DOMContentLoaded', init);
// --- Synchronisation avec Firebase Auth / Firestore ---
(function attachAuthSync() {
    // Si auth pas encore prêt, on attend l'événement
    if (!window.castellariumAuth || !window.castellariumDB) {
        window.addEventListener("castellariumAuthReady", attachAuthSync, { once: true });
        return;
    }

    const { onAuthStateChanged } = window.castellariumAuth;

    onAuthStateChanged(async (user) => {
        if (!user) {
            // Déconnexion : on reste sur le contenu localStorage
            currentUserId = null;
            console.log("Utilisateur déconnecté, mode local uniquement.");
            return;
        }

        currentUserId = user.uid;
        console.log("Utilisateur connecté, chargement des listes Firestore…");

        try {
            const remote = await window.castellariumDB.loadUserState(user.uid);

            // On remplace les listes locales par celles du compte
            visitedIds  = (remote.visitedIds  || []).map(String);
            wishlistIds = (remote.wishlistIds || []).map(String);

            // On met à jour aussi le localStorage (cache)
            localStorage.setItem('visitedIds_v2', JSON.stringify(visitedIds));
            localStorage.setItem('wishlistIds_v2', JSON.stringify(wishlistIds));

            // Et on rafraîchit l’UI
            renderVisited();
            renderWishlist();
            updateStats();

            console.log("Listes chargées depuis Firestore :", remote);
        } catch (err) {
            console.error("Erreur lors du chargement Firestore :", err);
        }
    });
})();


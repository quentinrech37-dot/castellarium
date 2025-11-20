// =============================
// MAPS.JS – Carte Leaflet
// =============================

let castleMap = null;
let visitedLayer = null;
let aroundLayer = null;

// ---------- utilitaire : récupérer lat/lon d'un château ----------

function getCastleLatLon(castle) {
    if (!castle) return null;

    // cas 1 : coordonnees au niveau racine
    let coord = castle.coordonnees;

    // cas 2 : coordonnees dans raw
    if (!coord && castle.raw && castle.raw.coordonnees) {
        coord = castle.raw.coordonnees;
    }

    if (!coord) return null;
    const lat = parseFloat(coord.lat);
    const lon = parseFloat(coord.lon);

    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    return { lat, lon };
}

// ---------- initialisation de la carte ----------

function ensureMap() {
    if (castleMap) return;

    const mapDiv = document.getElementById('map');
    if (!mapDiv) {
        console.warn("Div #map introuvable");
        return;
    }

    castleMap = L.map('map', {
        zoomControl: true,
        minZoom: 4,
        maxZoom: 18
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(castleMap);

    castleMap.setView([46.8, 2.5], 6); // France

    visitedLayer = L.layerGroup().addTo(castleMap);
    aroundLayer = L.layerGroup().addTo(castleMap);
}

// Appelée par app.js quand on clique sur l’onglet Carte
function showMapTab() {
    ensureMap();
    if (!castleMap) return;

    // la carte est dans un onglet caché au chargement → forcer le recalcul
    setTimeout(() => {
        castleMap.invalidateSize();
    }, 200);
}

// ---------- châteaux visités ----------

function refreshVisitedMarkers() {
    if (!castleMap || !visitedLayer) return;
    visitedLayer.clearLayers();

    if (!Array.isArray(castlesDB) || !Array.isArray(visitedIds)) return;

    const visitedSet = new Set(visitedIds.map(String));
    const bounds = [];

    castlesDB.forEach(c => {
        if (!visitedSet.has(String(c.id))) return;

        const pos = getCastleLatLon(c);
        if (!pos) return;

        const marker = L.marker([pos.lat, pos.lon]).addTo(visitedLayer);
        marker.bindPopup(`<strong>${c.name}</strong><br>${c.location}`);
        bounds.push([pos.lat, pos.lon]);
    });

    if (bounds.length > 0) {
        const b = L.latLngBounds(bounds);
        castleMap.fitBounds(b, { padding: [40, 40] });
    }
}

// ---------- autour de moi ----------

function distanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = x => x * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function showAroundMe() {
    if (!castleMap || !aroundLayer) return;
    aroundLayer.clearLayers();

    if (!navigator.geolocation) {
        alert("La géolocalisation n'est pas supportée par votre navigateur.");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        pos => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;

            const user = L.circleMarker([lat, lon], { radius: 7 }).addTo(aroundLayer);
            user.bindPopup("Vous êtes ici");

            const R = 50_000; // 50 km
            const bounds = [[lat, lon]];

            castlesDB.forEach(c => {
                const p = getCastleLatLon(c);
                if (!p) return;

                const d = distanceMeters(lat, lon, p.lat, p.lon);
                if (d <= R) {
                    const m = L.marker([p.lat, p.lon]).addTo(aroundLayer);
                    m.bindPopup(`<strong>${c.name}</strong><br>${c.location}<br>≈ ${(d/1000).toFixed(1)} km`);
                    bounds.push([p.lat, p.lon]);
                }
            });

            if (bounds.length > 1) {
                const b = L.latLngBounds(bounds);
                castleMap.fitBounds(b, { padding: [40, 40] });
            } else {
                castleMap.setView([lat, lon], 10);
            }
        },
        err => {
            console.warn("Erreur géolocalisation", err);
            alert("Impossible de récupérer votre position.");
        }
    );
}

// ---------- gestion des boutons de la carte ----------

document.addEventListener('DOMContentLoaded', () => {
    const btnVisited = document.getElementById('btnMapVisited');
    const btnAround  = document.getElementById('btnMapAround');

    if (btnVisited) {
        btnVisited.addEventListener('click', () => {
            const active = btnVisited.classList.toggle('active');
            if (btnAround) btnAround.classList.remove('active');
            if (active) {
                refreshVisitedMarkers();
            } else if (visitedLayer) {
                visitedLayer.clearLayers();
            }
        });
    }

    if (btnAround) {
        btnAround.addEventListener('click', () => {
            const active = btnAround.classList.toggle('active');
            if (btnVisited) btnVisited.classList.remove('active');
            if (active) {
                showAroundMe();
            } else if (aroundLayer) {
                aroundLayer.clearLayers();
            }
        });
    }
});

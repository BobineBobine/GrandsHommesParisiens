// Initialiser la carte
var map = L.map('map').setView([48.8566, 2.3522], 12);

// Ajouter une couche de tuiles OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Variables globales pour stocker les données et la couche des marqueurs
let plaquesData = null;
let plaquesLayer = null;

// Fonction pour extraire les valeurs uniques d'un champ (convertit en string pour les siècles)
function getUniqueValues(data, property) {
    const values = data.features
        .map(f => f.properties[property])
        .filter(v => v !== null && v !== undefined && v !== "");
    return Array.from(new Set(values)).sort((a, b) => {
        // Pour les siècles, trier numériquement si possible
        if (!isNaN(Number(a)) && !isNaN(Number(b))) return Number(a) - Number(b);
        return String(a).localeCompare(String(b));
    });
}

// Fonction pour créer les filtres dans le DOM
function createFilters(data) {
    const filtersDiv = document.getElementById('filters');
    filtersDiv.innerHTML = '';

    // Filtre par siècle (curseur double-bout)
    const siecles = getUniqueValues(data, 'siecle').filter(s => !isNaN(Number(s)));
    const minSiecle = Math.min(...siecles.map(Number));
    const maxSiecle = Math.max(...siecles.map(Number));
    const siecleLabel = document.createElement('label');
    siecleLabel.innerHTML = `Siècle&nbsp;<span id="siecle-range-value">${minSiecle}e - ${maxSiecle}e</span>`;
    const siecleSliderDiv = document.createElement('div');
    siecleSliderDiv.id = 'siecle-slider';
    siecleLabel.appendChild(siecleSliderDiv);
    filtersDiv.appendChild(siecleLabel);

    // noUiSlider double-boutons
    window.siecleSlider = noUiSlider.create(siecleSliderDiv, {
        start: [minSiecle, maxSiecle],
        connect: true,
        step: 1,
        range: { min: minSiecle, max: maxSiecle },
        tooltips: [true, true],
        format: {
            to: v => Math.round(v),
            from: v => Math.round(v)
        }
    });
    siecleSliderDiv.noUiSlider.on('update', function (values) {
        document.getElementById('siecle-range-value').textContent = `${values[0]}e - ${values[1]}e`;
        updatePlaquesLayer();
    });

    // Filtre par arrondissement
    const arrondissements = getUniqueValues(data, 'ardt');
    const ardtSelect = document.createElement('select');
    ardtSelect.id = 'filter-ardt';
    ardtSelect.innerHTML = `<option value="">Tous les arrondissements</option>` +
        arrondissements.map(a => `<option value="${a}">${a}e</option>`).join('');
    filtersDiv.appendChild(labelWithSelect('Arrondissement', ardtSelect));

    // Filtre par type de personnalité/objet_1
    const objets = getUniqueValues(data, 'objet_1');
    const objetSelect = document.createElement('select');
    objetSelect.id = 'filter-objet';
    objetSelect.innerHTML = `<option value="">Tous les thèmes</option>` +
        objets.map(o => `<option value="${o}">${o}</option>`).join('');
    filtersDiv.appendChild(labelWithSelect('Thème', objetSelect));

    // Filtre par période historique
    const periodes = getUniqueValues(data, 'periode_1');
    const periodeSelect = document.createElement('select');
    periodeSelect.id = 'filter-periode';
    periodeSelect.innerHTML = `<option value="">Toutes les périodes</option>` +
        periodes.map(p => `<option value="${p}">${p}</option>`).join('');
    filtersDiv.appendChild(labelWithSelect('Période', periodeSelect));

    // Ajout des écouteurs d'événements
    [ardtSelect, objetSelect, periodeSelect].forEach(sel => {
        sel.addEventListener('change', updatePlaquesLayer);
    });
}

// Fonction utilitaire pour associer un label à un select
function labelWithSelect(labelText, selectEl) {
    const label = document.createElement('label');
    label.style = 'display:flex;flex-direction:column;font-size:0.95rem;';
    label.innerHTML = `<span style="margin-bottom:0.2em;">${labelText}</span>`;
    label.appendChild(selectEl);
    return label;
}

// Fonction pour filtrer et afficher les plaques
function updatePlaquesLayer() {
    if (!plaquesData) return;
    // Récupérer les valeurs des filtres
    let siecleMin = null, siecleMax = null;
    if (window.siecleSlider) {
        const values = window.siecleSlider.get();
        siecleMin = Number(values[0]);
        siecleMax = Number(values[1]);
    }
    const ardt = document.getElementById('filter-ardt')?.value;
    const objet = document.getElementById('filter-objet')?.value;
    const periode = document.getElementById('filter-periode')?.value;

    // Filtrer les données
    const filtered = {
        ...plaquesData,
        features: plaquesData.features.filter(f => {
            const p = f.properties;
            // Pour le curseur double siècle, on garde dans l'intervalle
            const siecleOk = (!siecleMin || !siecleMax || (p.siecle && !isNaN(Number(p.siecle)) && Number(p.siecle) >= siecleMin && Number(p.siecle) <= siecleMax));
            return siecleOk
                && (!ardt || String(p.ardt) === ardt)
                && (!objet || p.objet_1 === objet)
                && (!periode || p.periode_1 === periode);
        })
    };

    // Supprimer la couche précédente
    if (plaquesLayer) {
        map.removeLayer(plaquesLayer);
    }

    // Ajouter la nouvelle couche filtrée avec popup stylée
    plaquesLayer = L.geoJSON(filtered, {
        pointToLayer: function (feature, latlng) {
            const p = feature.properties;
            // Nettoyer les '/' dans la retranscription
            let retranscription = (p.retranscription || '').replace(/ ?\/ ?/g, '<br>');
            let popupHtml = `
                <div class="popup-title">${p.titre || '(Sans titre)'}</div>
                <div class="popup-adresse">${p.adresse || ''}</div>
                <div class="popup-retranscription">${retranscription}</div>
            `;
            // Ajout de tags
            let tags = [];
            if (p.siecle) tags.push(`<span title="Siècle">🕰️ ${p.siecle}e</span>`);
            if (p.ardt) tags.push(`<span title="Arrondissement">📍 ${p.ardt}e</span>`);
            if (p.objet_1) tags.push(`<span title="Thème">${p.objet_1}</span>`);
            if (p.periode_1) tags.push(`<span title="Période">${p.periode_1}</span>`);
            if (tags.length) {
                popupHtml += `<div class="popup-tags">${tags.join(' &nbsp;|&nbsp; ')}</div>`;
            }
            return L.marker(latlng).bindPopup(popupHtml);
        }
    }).addTo(map);
}

// Charger les données GeoJSON et initialiser la carte + filtres
fetch('plaques_commemoratives.geojson')
    .then(response => response.json())
    .then(data => {
        plaquesData = data;
        createFilters(data);
        updatePlaquesLayer();
    })
    .catch(error => {
        console.error('Error loading the GeoJSON file:', error);
    });

// Plein écran carte
document.addEventListener('DOMContentLoaded', function () {
    const mapDiv = document.getElementById('map');
    const btn = document.getElementById('map-fullscreen-btn');
    btn.addEventListener('click', function () {
        if (!mapDiv.classList.contains('fullscreen')) {
            mapDiv.classList.add('fullscreen');
            document.body.classList.add('fullscreen-active');
            map.invalidateSize();
            btn.title = 'Quitter le plein écran';
            btn.innerHTML = '✖';
        } else {
            mapDiv.classList.remove('fullscreen');
            document.body.classList.remove('fullscreen-active');
            map.invalidateSize();
            btn.title = 'Afficher la carte en plein écran';
            btn.innerHTML = '🗖';
        }
    });

    // Localisation utilisateur
    const locateBtn = document.getElementById('map-locate-btn');
    let userMarker = null;
    locateBtn.addEventListener('click', function () {
        if (!navigator.geolocation) {
            alert("La géolocalisation n'est pas supportée par votre navigateur.");
            return;
        }
        locateBtn.disabled = true;
        locateBtn.innerHTML = "⏳";
        navigator.geolocation.getCurrentPosition(function (pos) {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            if (userMarker) map.removeLayer(userMarker);
            userMarker = L.marker([lat, lng], {icon: L.icon({
                iconUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.7.1/dist/images/marker-icon.png',
                iconSize: [25,41], iconAnchor: [12,41], popupAnchor: [1,-34]
            })}).addTo(map).bindPopup("Vous êtes ici").openPopup();
            map.setView([lat, lng], 15);
            locateBtn.disabled = false;
            locateBtn.innerHTML = "📍";
        }, function () {
            alert("Impossible de vous localiser.");
            locateBtn.disabled = false;
            locateBtn.innerHTML = "📍";
        });
    });
});

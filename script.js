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

// Fonction utilitaire pour obtenir min/max année sur toutes les entrées connues
function getMinMaxAnnee(data) {
    let min = Infinity, max = -Infinity;
    data.features.forEach(f => {
        const p = f.properties;
        let debut = parseInt(p.annee_debut);
        let fin = parseInt(p.annee_fin);
        if (!isNaN(debut)) min = Math.min(min, debut);
        if (!isNaN(fin)) max = Math.max(max, fin);
    });
    // fallback si aucune année trouvée
    if (!isFinite(min)) min = 1700;
    if (!isFinite(max)) max = new Date().getFullYear();
    return [min, max];
}

// Fonction pour obtenir le top 100 des scores de popularité
function getTop100Popularite(data) {
    const scores = data.features
        .map(f => f.properties.score_popularite || 0)
        .filter(s => typeof s === "number" && !isNaN(s));
    scores.sort((a, b) => b - a);
    return scores.slice(0, 100);
}

// Fonction pour créer les filtres dans le DOM
function createFilters(data) {
    const filtersDiv = document.getElementById('filters');
    filtersDiv.innerHTML = '';

    // Filtre par type de personnes
    const typeDiv = document.createElement('div');
    typeDiv.style = 'display:flex;flex-direction:column;';
    typeDiv.innerHTML = `
        <label style="margin-bottom:0.2em;">Type</label>
        <select id="filter-type">
            <option value="all">Tout le monde</option>
            <option value="personnes">Personnes (champ "personnalite" non vide)</option>
            <option value="celebres">Personnes célèbres (score_popularite > 1)</option>
            <option value="celebrissimes">Célébrissimes (top 100 popularité)</option>
        </select>
    `;
    filtersDiv.appendChild(typeDiv);

    // Curseur d'années (double-bouton)
    const [minAnnee, maxAnnee] = getMinMaxAnnee(data);
    const anneeLabel = document.createElement('label');
    anneeLabel.innerHTML = `Années&nbsp;<span id="annee-range-value">${minAnnee} - ${maxAnnee}</span>`;
    const anneeSliderDiv = document.createElement('div');
    anneeSliderDiv.id = 'annee-slider';
    anneeLabel.appendChild(anneeSliderDiv);
    filtersDiv.appendChild(anneeLabel);

    window.anneeSlider = noUiSlider.create(anneeSliderDiv, {
        start: [minAnnee, maxAnnee],
        connect: true,
        step: 1,
        range: { min: minAnnee, max: maxAnnee },
        tooltips: [true, true],
        format: {
            to: v => Math.round(v),
            from: v => Math.round(v)
        }
    });
    anneeSliderDiv.noUiSlider.on('update', function (values) {
        document.getElementById('annee-range-value').textContent = `${values[0]} - ${values[1]}`;
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
    [document.getElementById('filter-type'), ardtSelect, objetSelect, periodeSelect].forEach(sel => {
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
    let anneeMin = null, anneeMax = null;
    if (window.anneeSlider) {
        const values = window.anneeSlider.get();
        anneeMin = Number(values[0]);
        anneeMax = Number(values[1]);
    }
    const ardt = document.getElementById('filter-ardt')?.value;
    const objet = document.getElementById('filter-objet')?.value;
    const periode = document.getElementById('filter-periode')?.value;
    const type = document.getElementById('filter-type')?.value || "all";
    const top100 = getTop100Popularite(plaquesData);

    // Filtrer les données
    const filtered = {
        ...plaquesData,
        features: plaquesData.features.filter(f => {
            const p = f.properties;

            // Filtre type de personnes
            if (type === "personnes" && (!p.personnalite || p.personnalite === "")) return false;
            if (type === "celebres" && (!(p.personnalite && p.score_popularite > 1))) return false;
            if (type === "celebrissimes" && (!(p.personnalite && top100.includes(p.score_popularite)))) return false;

            // Filtre années
            let debut = parseInt(p.annee_debut);
            let fin = parseInt(p.annee_fin);
            let hasAnnee = !isNaN(debut) || !isNaN(fin);
            let matchAnnee = false;
            if (!isNaN(debut) && !isNaN(fin)) {
                // période connue
                matchAnnee = (fin >= anneeMin && debut <= anneeMax);
            } else if (!isNaN(debut)) {
                matchAnnee = (debut >= anneeMin && debut <= anneeMax);
            } else if (!isNaN(fin)) {
                matchAnnee = (fin >= anneeMin && fin <= anneeMax);
            }
            // Si aucune année connue, on regarde le siècle
            if (!hasAnnee) {
                // On inclut si le siècle correspond à la période filtrée
                let siecle = p.siecle;
                if (siecle && typeof siecle === "string") {
                    // Ex: "19-20", "20", "18-19"
                    let siecles = siecle.split('-').map(s => parseInt(s));
                    for (let s of siecles) {
                        if (!isNaN(s)) {
                            // bornes du siècle
                            let sMin = (s - 1) * 100 + 1;
                            let sMax = s * 100;
                            if (sMax >= anneeMin && sMin <= anneeMax) {
                                matchAnnee = true;
                                break;
                            }
                        }
                    }
                }
            }
            // On inclut aussi les entrées sans année ni siècle (cas rare)
            if (!hasAnnee && !p.siecle) matchAnnee = true;

            if (!matchAnnee) return false;

            // Filtres classiques
            return (!ardt || String(p.ardt) === ardt)
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

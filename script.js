// Initialiser la carte
var map = L.map('map').setView([48.8566, 2.3522], 12);

// Ajouter une couche de tuiles OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Charger les données GeoJSON et les afficher sur la carte
fetch('plaques_commemoratives.geojson')
    .then(response => response.json())
    .then(data => {
        L.geoJSON(data, {
            pointToLayer: function (feature, latlng) {
                return L.marker(latlng).bindPopup(`
                    <b>${feature.properties.titre}</b><br>
                    ${feature.properties.adresse}<br>
                    ${feature.properties.retranscription}
                `);
            }
        }).addTo(map);
    })
    .catch(error => {
        console.error('Error loading the GeoJSON file:', error);
    });

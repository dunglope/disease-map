var map = L.map('map').setView([10, 0], 3);  // View toàn cầu

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// === TỰ ĐỘNG LẤY DATASET MỚI NHẤT ===
let currentDataset = 'ebola';  // fallback

// Tìm dataset mới nhất từ URL (nếu có)
// Ví dụ: /map/?dataset=covid19 → lấy "covid19"
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('dataset')) {
    currentDataset = urlParams.get('dataset');
}

// === Tải dữ liệu từ API với dataset hiện tại ===
function loadMapData() {
    const url = `/api/gis-analysis/?dataset=${currentDataset}`;
    
    fetch(url)
        .then(res => res.json())
        .then(data => {
            // Xóa layer cũ nếu có
            map.eachLayer(layer => {
                if (layer !== map._layers[Object.keys(map._layers)[0]]) {
                    map.removeLayer(layer);
                }
            });

            L.geoJSON(data, {
                style: function(feature) {
                    const cases = feature.properties.cases || 0;
                    const color = 
                        cases > 5000 ? '#8B0000' :
                        cases > 1000 ? '#FF0000' :
                        cases > 500  ? '#FF6347' :
                        cases > 100  ? '#FFA500' :
                        cases > 10   ? '#FFD700' : '#FFFF00';
                    return {
                        fillColor: color,
                        weight: 2,
                        opacity: 1,
                        color: 'black',
                        fillOpacity: 0.7
                    };
                },
                onEachFeature: function(feature, layer) {
                    const props = feature.properties;
                    layer.bindPopup(`
                        <strong>${props.country}</strong><br>
                        Year: ${props.year}<br>
                        Cases: <strong>${props.cases.toLocaleString()}</strong><br>
                        Density: ${props.density?.toFixed(4) || 'N/A'}
                    `);
                }
            }).addTo(map);

            // Fit map to data
            const bounds = L.geoJSON(data).getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds.pad(0.1));
            }
        })
        .catch(err => {
            console.error("Load map error:", err);
            map.setView([10, 0], 3);
        });
}

// === Gọi lần đầu ===
loadMapData();

// === Tự động reload khi có dataset mới (từ upload.js) ===
window.loadMapData = loadMapData;  // Cho upload.js gọi lại
// map.js – Interactive Map + Charts + Time Filter for NERGAL

let map, geojsonLayer;
let lineChart, barChart;

document.addEventListener('DOMContentLoaded', function () {
    // Get current dataset from URL
    const urlParams = new URLSearchParams(window.location.search);
    const currentDataset = urlParams.get('dataset') || 'ebola';
    document.getElementById('currentDataset').textContent = currentDataset;

    // Initialize Leaflet map
    map = L.map('map').setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Year slider control
    const slider = document.getElementById('yearSlider');
    const yearDisplay = document.getElementById('yearDisplay');

    slider.addEventListener('input', function () {
        const year = this.value;
        yearDisplay.textContent = year;
        loadEverything(year);
    });

    // Load map + stats + charts
    function loadEverything(year = slider.value) {
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;

        // Load Map Data (guarded; backend currently returns stats, not GeoJSON)
        fetch(`/api/gis-stats/?dataset=${currentDataset}&start_date=${startDate}&end_date=${endDate}`)
            .then(r => r.json())
            .then(d => {
                if (d && d.features && Array.isArray(d.features)) {
                    if (geojsonLayer) map.removeLayer(geojsonLayer);

                    geojsonLayer = L.geoJSON(d.features, {
                        style: feature => {
                            const cases = feature.properties.cases || 0;
                            const color = cases > 5000 ? '#8B0000' :
                                cases > 1000 ? '#FF0000' :
                                    cases > 500 ? '#FF6347' :
                                        cases > 100 ? '#FFA500' :
                                            cases > 10 ? '#FFD700' : '#FFFF99';
                            return {
                                fillColor: color,
                                weight: 1.5,
                                color: 'black',
                                fillOpacity: 0.8
                            };
                        },
                        onEachFeature: (feature, layer) => {
                            const p = feature.properties;
                            layer.bindPopup(`
                                <strong>${p.country}</strong><br>
                                Year: ${p.year}<br>
                                Cases: <b>${(p.cases || 0).toLocaleString()}</b><br>
                                Density: ${(p.density || 0).toFixed(4)} cases/deg²
                            `);
                        }
                    }).addTo(map);

                    if (d.features.length > 0) {
                        map.fitBounds(geojsonLayer.getBounds().pad(0.2));
                    }
                } else {
                    console.warn('No GeoJSON features in response; skipping map layer render');
                }
            })
            .catch(err => console.error('Map load error:', err));

        // Load Stats + Charts
        fetch(`/api/gis-stats/?dataset=${currentDataset}&start_date=${startDate}&end_date=${endDate}`)
            .then(r => r.json())
            .then(d => {
                // Update stats panel
                document.getElementById('statsPanel').innerHTML = `
                    <p><strong>Total Cases:</strong> ${d.stats.total_cases.toLocaleString()}</p>
                    <p><strong>Total Deaths:</strong> ${d.stats.total_deaths.toLocaleString()}</p>
                    <p><strong>CFR:</strong> ${d.stats.cfr_percent}%</p>
                    <p><strong>Avg per Country:</strong> ${d.stats.avg_cases_per_country.toLocaleString()}</p>
                    <p><strong>Countries Affected:</strong> ${d.stats.countries_affected}</p>
                `;

                // Prepare month labels and aggregate monthly totals from top10 monthly data
                const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const monthlyTotals = Array(12).fill(0);
                if (d.top10 && d.top10.monthly) {
                    Object.values(d.top10.monthly).forEach(arr => {
                        (arr || []).forEach((v, i) => { monthlyTotals[i] += (v || 0); });
                    });
                }

                // Line Chart: Cases over time (computed)
                if (lineChart) lineChart.destroy();
                lineChart = new Chart(document.getElementById('lineChart'), {
                    type: 'line',
                    data: {
                        labels: monthLabels,
                        datasets: [{
                            label: 'Monthly Cases',
                            data: monthlyTotals,
                            borderColor: '#2563eb',
                            backgroundColor: 'rgba(37, 99, 235, 0.1)',
                            tension: 0.4,
                            fill: true,
                            pointBackgroundColor: '#2563eb',
                            pointRadius: 5
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            title: {
                                display: true,
                                text: `Monthly Cases in ${document.getElementById('yearDisplay').textContent}`
                            },
                            legend: { display: false }
                        },
                        scales: {
                            y: { beginAtZero: true },
                            x: { grid: { display: false } }
                        }
                    }
                });

                // Bar/mini-line Charts for Top 10 countries
                const container = document.getElementById('top10Container');
                container.innerHTML = '';

                const countries = d.top10.countries || [];
                const totals = d.top10.totals || [];
                const monthlyData = d.top10.monthly || {};

                countries.forEach((country, idx) => {
                    const div = document.createElement('div');
                    div.className = 'border rounded p-3 mb-3 bg-light';
                    div.innerHTML = `
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <strong>${idx + 1}. ${country}</strong>
                            <span class="badge bg-primary fs-6">${(totals[idx] || 0).toLocaleString()} cases</span>
                        </div>
                        <canvas height="80"></canvas>
                    `;

                    const canvas = div.querySelector('canvas');
                    new Chart(canvas, {
                        type: 'line',
                        data: {
                            labels: monthLabels,
                            datasets: [{
                                data: monthlyData[country] || Array(12).fill(0),
                                borderColor: '#2563eb',
                                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                                tension: 0.4,
                                fill: true,
                                pointRadius: 3
                            }]
                        },
                        options: {
                            responsive: true,
                            plugins: { legend: { display: false }, tooltip: { enabled: true } },
                            scales: {
                                x: { display: false },
                                y: { display: false, beginAtZero: true }
                            }
                        }
                    });

                    container.appendChild(div);
                });
            });
    }

    // Initial load
    loadEverything();
});

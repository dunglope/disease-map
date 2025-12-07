let map, geojsonLayer;
let lineChart, deathsChart, barChart;
let currentSort = 'cases';
let currentDataset = 'ebola';
let rawMonthlyData = { cases: {}, deaths: {} };
let debugMessages = [];

// Debug console helper
function debugLog(msg) {
    const timestamp = new Date().toLocaleTimeString();
    const fullMsg = `[${timestamp}] ${msg}`;
    debugMessages.push(fullMsg);
    
    // Log to browser console always
    console.log(fullMsg);
    
    // Try to log to debug div if it exists
    try {
        const debugDiv = document.getElementById('debugConsole');
        if (debugDiv) {
            debugDiv.textContent += fullMsg + '\n';
            debugDiv.scrollTop = debugDiv.scrollHeight;
        }
    } catch (e) {
        // Silently fail if div doesn't exist yet
    }
}

// Flush buffered debug messages to the console panel
function flushDebugMessages() {
    const debugDiv = document.getElementById('debugConsole');
    if (debugDiv && debugMessages.length > 0) {
        debugDiv.textContent = debugMessages.join('\n') + '\n' + debugDiv.textContent;
        debugDiv.scrollTop = debugDiv.scrollHeight;
    }
}

document.addEventListener('DOMContentLoaded', function () {
    // Flush any buffered debug messages
    flushDebugMessages();
    debugLog('DOMContentLoaded fired - page is ready');
    
    // Get current dataset from URL
    const urlParams = new URLSearchParams(window.location.search);
    currentDataset = urlParams.get('dataset') || 'ebola';

    // Initialize Leaflet map
    map = L.map('map').setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Year slider control
    const slider = document.getElementById('yearSlider');
    const yearDisplay = document.getElementById('yearDisplay');

    // Top 10 sort buttons
    const sortCasesBtn = document.getElementById('sortCasesBtn');
    const sortDeathsBtn = document.getElementById('sortDeathsBtn');

    slider.addEventListener('input', function () {
        const year = this.value;
        yearDisplay.textContent = year;
        loadEverything(year);
    });

    if (sortCasesBtn && sortDeathsBtn) {
        sortCasesBtn.addEventListener('click', function () {
            currentSort = 'cases';
            sortCasesBtn.classList.add('btn-primary');
            sortCasesBtn.classList.remove('btn-outline-light');
            sortDeathsBtn.classList.add('btn-outline-light');
            sortDeathsBtn.classList.remove('btn-primary');
            loadEverything();
        });

        sortDeathsBtn.addEventListener('click', function () {
            currentSort = 'deaths';
            sortDeathsBtn.classList.add('btn-primary');
            sortDeathsBtn.classList.remove('btn-outline-light');
            sortCasesBtn.classList.add('btn-outline-light');
            sortCasesBtn.classList.remove('btn-primary');
            loadEverything();
        });
    }

    // Load map + stats + charts
    function loadEverything(year = slider.value) {
        console.log('loadEverything called with year =', year);
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;

        // Load Map Data
        fetch(`/api/gis-stats/?dataset=${currentDataset}&start_date=${startDate}&end_date=${endDate}&sort=${currentSort}`)
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
        fetch(`/api/gis-stats/?dataset=${currentDataset}&start_date=${startDate}&end_date=${endDate}&sort=${currentSort}`)
            .then(r => {
                console.log('Stats fetch status:', r.status);
                return r.json();
            })
            .then(d => {
                console.log('GIS stats response:', d);
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
                const monthlyDeathsTotals = Array(12).fill(0);
                const monthlyCases = (d.top10 && d.top10.monthly_cases) || {};
                const monthlyDeaths = (d.top10 && d.top10.monthly_deaths) || {};

                Object.values(monthlyCases).forEach(arr => {
                    (arr || []).forEach((v, i) => { monthlyTotals[i] += (v || 0); });
                });

                Object.values(monthlyDeaths).forEach(arr => {
                    (arr || []).forEach((v, i) => { monthlyDeathsTotals[i] += (v || 0); });
                });

                // Store raw monthly data for resolution switching
                rawMonthlyData.cases = monthlyTotals;
                rawMonthlyData.deaths = monthlyDeathsTotals;

                // Render monthly charts
                // Cases chart
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

                // Deaths chart
                if (deathsChart) deathsChart.destroy();
                deathsChart = new Chart(document.getElementById('deathsChart'), {
                    type: 'line',
                    data: {
                        labels: monthLabels,
                        datasets: [{
                            label: 'Monthly Deaths',
                            data: monthlyDeathsTotals,
                            borderColor: '#dc2626',
                            backgroundColor: 'rgba(220, 38, 38, 0.1)',
                            tension: 0.4,
                            fill: true,
                            pointBackgroundColor: '#dc2626',
                            pointRadius: 5
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            title: {
                                display: true,
                                text: `Monthly Deaths in ${document.getElementById('yearDisplay').textContent}`
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

                const top10 = d.top10 || {};
                const countries = top10.countries || [];
                const totals = top10.totals || [];
                const monthlyData = top10.monthly_cases || {};

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
                                label: 'Cases',
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
                            plugins: {
                                legend: {
                                    display: true,
                                    labels: {
                                        boxWidth: 12,
                                        boxHeight: 12,
                                        usePointStyle: true
                                    }
                                },
                                tooltip: { enabled: true }
                            },
                            scales: {
                                x: {
                                    display: true,
                                    grid: { display: false },
                                    ticks: { display: false },
                                    title: {
                                        display: true,
                                        text: 'Months (Jan–Dec)',
                                        font: { size: 10 }
                                    }
                                },
                                y: {
                                    display: true,
                                    beginAtZero: true,
                                    grid: { display: false },
                                    ticks: { display: false },
                                    title: {
                                        display: true,
                                        text: 'Cases',
                                        font: { size: 10 }
                                    }
                                }
                            }
                        }
                    });

                    container.appendChild(div);
                });
            })
            .catch(err => {
                console.error('Stats load error:', err);
            });
    }

    function loadDatasetList() {
        fetch('/api/datasets/')
            .then(r => r.json())
            .then(data => {
                const select = document.getElementById('datasetSelector');
                if (!select) {
                    console.warn('datasetSelector element not found');
                    return;
                }
                
                select.innerHTML = '';
                data.datasets.forEach(ds => {
                    const opt = document.createElement('option');
                    opt.value = ds;
                    opt.textContent = ds;
                    if (ds === currentDataset) opt.selected = true;
                    select.appendChild(opt);
                });

                // Update URL + reload data when dataset changes
                select.addEventListener('change', function() {
                    currentDataset = this.value;
                    const newUrl = new URL(window.location);
                    newUrl.searchParams.set('dataset', currentDataset);
                    window.history.replaceState({}, '', newUrl);
                    loadEverything();
                });

                // Discuss
                const discussBtn = document.getElementById('discussBtn');
                if (discussBtn) {
                    discussBtn.disabled = false;
                    discussBtn.onclick = () => {
                        window.open(`/discussion/?dataset=${encodeURIComponent(currentDataset)}`, '_blank');
                    };
                }
            })
            .catch(err => console.error('Error loading datasets:', err));
    }

    // Initial load
    loadEverything();
    loadDatasetList();

    debugLog('✓ Page initialization complete');
});
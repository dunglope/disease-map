// function initUploadForm() {
//     const form = document.getElementById('uploadForm');
//     const statusDiv = document.getElementById('uploadStatus');

//     if (!form || !statusDiv) return;

//     form.addEventListener('submit', async function(e) {
//         e.preventDefault();

//         const file = document.getElementById('csv_file').files[0];
//         const name = document.getElementById('dataset_name').value.trim();

//         if (!file || !name) {
//             statusDiv.innerHTML = '<div class="alert alert-danger">Please fill all fields</div>';
//             return;
//         }

//         const datasetName = name.toLowerCase().replace(/\s+/g, '_');

//         statusDiv.innerHTML = `
//             <div class="alert alert-info text-center p-5">
//                 <div class="spinner-border text-primary mb-4" style="width: 4rem; height: 4rem;"></div>
//                 <h4>Processing ${file.name}...</h4>
//                 <p>Large files may take 1-3 minutes. <strong>Please do not close this tab.</strong></p>
//             </div>`;

//         const formData = new FormData();
//         formData.append('csv_file', file);
//         formData.append('dataset_name', datasetName);

//         try {
//             const controller = new AbortController();
//             const timeoutId = setTimeout(() => controller.abort(), 15 * 60 * 1000); // 15 phút

//             const response = await fetch('/api/upload/', {
//                 method: 'POST',
//                 body: formData,
//                 headers: {
//                     'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value
//                 },
//                 signal: controller.signal,
//                 keepalive: true   // ← Đây là thứ fix 2k → 17k+
//             });

//             clearTimeout(timeoutId);

//             const result = await response.json();

//             if (response.ok && result.status === 'success') {
//                 statusDiv.innerHTML = `
//                     <div class="alert alert-success text-center p-5">
//                         <h3>Upload Complete!</h3>
//                         <p class="lead">Successfully imported <strong>${result.imported.toLocaleString()}</strong> rows</p>
//                         <p>Dataset: <strong>${result.dataset}</strong></p>
//                         <a href="/map/?dataset=${result.dataset}" class="btn btn-primary btn-lg">
//                             View on Map
//                         </a>
//                     </div>`;
//                 if (typeof loadMapData === 'function') loadMapData();
//             } else {
//                 statusDiv.innerHTML = `<div class="alert alert-danger"><strong>Error:</strong> ${result.error || 'Upload failed'}</div>`;
//             }
//         } catch (err) {
//             statusDiv.innerHTML = '<div class="alert alert-warning">Upload timed out. Try again or use Postman for very large files.</div>';
//         }
//     });
// }

// document.addEventListener('DOMContentLoaded', initUploadForm);

//=================== Debugging Upload Issues =========================
function initUploadForm() {
    const form = document.getElementById('uploadForm');
    const statusDiv = document.getElementById('uploadStatus');
    const csvFileInput = document.getElementById('csv_file');
    const columnMappingSection = document.getElementById('columnMappingSection');
    const columnError = document.getElementById('columnError');

    if (!form || !statusDiv) return;

    // Handle CSV file selection - detect columns automatically
    csvFileInput.addEventListener('change', async function() {
        const file = this.files[0];
        if (!file) {
            columnMappingSection.style.display = 'none';
            return;
        }

        try {
            // Send file to backend to detect columns
            const formData = new FormData();
            formData.append('csv_file', file);

            const response = await fetch('/api/detect-columns/', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value
                }
            });

            const result = await response.json();

            if (response.ok && result.columns) {
                // Populate all column dropdowns
                populateColumnDropdowns(result.columns);
                
                // Show sample data
                if (result.sample_data) {
                    showSampleData(result.columns, result.sample_data);
                }
                
                // Show mapping section
                columnMappingSection.style.display = 'block';
                columnError.style.display = 'none';

                // Try to auto-detect common column names
                autoDetectColumns(result.columns);
            } else {
                columnError.textContent = result.error || 'Failed to detect columns';
                columnError.style.display = 'block';
                columnMappingSection.style.display = 'none';
            }
        } catch (err) {
            console.error('Column detection failed:', err);
            columnError.textContent = 'Error reading CSV file: ' + err.message;
            columnError.style.display = 'block';
            columnMappingSection.style.display = 'none';
        }
    });

    // Populate column dropdowns with available columns
    function populateColumnDropdowns(columns) {
        const dropdowns = ['date_col', 'country_col', 'cases_col', 'deaths_col'];
        
        dropdowns.forEach(dropdownId => {
            const select = document.getElementById(dropdownId);
            // Keep the default option
            const defaultOption = select.querySelector('option');
            select.innerHTML = defaultOption.outerHTML;
            
            // Add all detected columns
            columns.forEach(col => {
                const option = document.createElement('option');
                option.value = col;
                option.textContent = col;
                select.appendChild(option);
            });
        });
    }

    // Auto-detect columns based on common naming patterns
    function autoDetectColumns(columns) {
        const datePatterns = ['date', 'time', 'datetime', 'timestamp', 'day', 'year', 'month'];
        const countryPatterns = ['country', 'nation', 'region', 'location', 'area', 'province', 'state'];
        const casesPatterns = ['case', 'cases', 'confirmed', 'total', 'count', 'incidents'];
        const deathsPatterns = ['death', 'deaths', 'died', 'mortality', 'fatal'];

        function findBestMatch(patterns) {
            const lowerColumns = columns.map(c => c.toLowerCase());
            for (let pattern of patterns) {
                const match = lowerColumns.find(col => col.includes(pattern));
                if (match) return columns[lowerColumns.indexOf(match)];
            }
            return '';
        }

        document.getElementById('date_col').value = findBestMatch(datePatterns);
        document.getElementById('country_col').value = findBestMatch(countryPatterns);
        document.getElementById('cases_col').value = findBestMatch(casesPatterns);
        document.getElementById('deaths_col').value = findBestMatch(deathsPatterns);
    }

    // Show sample data for selected columns
    function showSampleData(columns, sampleData) {
        const fields = ['date_col', 'country_col', 'cases_col', 'deaths_col'];
        
        fields.forEach(fieldId => {
            const select = document.getElementById(fieldId);
            const sampleDiv = document.getElementById(fieldId.replace('_col', '_sample'));
            
            select.addEventListener('change', function() {
                if (this.value && sampleData[this.value]) {
                    const values = sampleData[this.value];
                    if (Array.isArray(values) && values.length > 0) {
                        sampleDiv.innerHTML = `<strong>Sample:</strong> ${values.join(' | ')}`;
                    } else if (Array.isArray(values) && values.length === 0) {
                        sampleDiv.innerHTML = `<small class="text-muted">No sample data (all nulls)</small>`;
                    } else {
                        sampleDiv.innerHTML = '';
                    }
                } else {
                    sampleDiv.innerHTML = '';
                }
            });

            // Show initial sample
            if (select.value && sampleData[select.value]) {
                const values = sampleData[select.value];
                if (Array.isArray(values) && values.length > 0) {
                    sampleDiv.innerHTML = `<strong>Sample:</strong> ${values.join(' | ')}`;
                } else if (Array.isArray(values) && values.length === 0) {
                    sampleDiv.innerHTML = `<small class="text-muted">No sample data (all nulls)</small>`;
                }
            }
        });
    }

    // Form submission
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        const fileInput = document.getElementById('csv_file');
        const nameInput = document.getElementById('dataset_name');

        if (!fileInput.files[0]) {
            statusDiv.innerHTML = '<div class="alert alert-danger">Please select a CSV file</div>';
            return;
        }
        if (!nameInput.value.trim()) {
            statusDiv.innerHTML = '<div class="alert alert-danger">Please enter dataset name</div>';
            return;
        }

        // Check if column mapping is required but not selected
        if (columnMappingSection.style.display !== 'none') {
            const dateCol = document.getElementById('date_col').value;
            const countryCol = document.getElementById('country_col').value;
            const casesCol = document.getElementById('cases_col').value;

            if (!dateCol || !countryCol || !casesCol) {
                statusDiv.innerHTML = '<div class="alert alert-danger">Please select all required columns (Date, Country, Cases)</div>';
                return;
            }
        }

        const file = fileInput.files[0];
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
        
        // Show upload starting
        statusDiv.innerHTML = `
            <div class="alert alert-info">
                <strong>📤 Uploading: ${file.name}</strong><br>
                Size: ${fileSizeMB} MB<br>
                <div class="progress mt-3" style="height: 32px;">
                    <div class="progress-bar progress-bar-striped progress-bar-animated bg-success" style="width: 100%">
                        Uploading to server...
                    </div>
                </div>
            </div>`;

        const formData = new FormData();
        formData.append('csv_file', file);
        formData.append('dataset_name', nameInput.value.trim().toLowerCase().replace(/\s+/g, '_'));
        
        // Add column mappings
        formData.append('date_col', document.getElementById('date_col').value);
        formData.append('country_col', document.getElementById('country_col').value);
        formData.append('cases_col', document.getElementById('cases_col').value);
        const deathsCol = document.getElementById('deaths_col').value;
        if (deathsCol) formData.append('deaths_col', deathsCol);

        const uploadStartTime = Date.now();

        try {
            // ⚡ Send to optimized endpoint with keepalive for large files
            const response = await fetch('/api/upload/', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value
                },
                keepalive: true  // Prevents connection drops on large uploads
            });

            const result = await response.json();
            const uploadTime = ((Date.now() - uploadStartTime) / 1000).toFixed(2);

            if (response.ok && result.status === 'success') {
                const rowsPerSec = (result.imported / uploadTime).toFixed(0);
                
                statusDiv.innerHTML = `
                    <div class="alert alert-success">
                        <h5>✅ Upload Complete!</h5>
                        <strong>${result.imported.toLocaleString()}</strong> rows imported<br>
                        <small>${result.skipped || 0} rows skipped</small><br>
                        <strong>Time:</strong> ${uploadTime}s (${rowsPerSec} rows/sec)<br>
                        <strong>Dataset:</strong> ${result.dataset}<br><br>
                        <a href="/map/?dataset=${result.dataset}" class="btn btn-primary">
                            📍 View on Interactive Map
                        </a>
                    </div>`;
                
                fileInput.value = '';
                nameInput.value = '';
                columnMappingSection.style.display = 'none';
                if (typeof loadMapData === 'function') loadMapData();
            } else {
                const errorMsg = result.error || 'Unknown error';
                statusDiv.innerHTML = `<div class="alert alert-danger">❌ Error: ${errorMsg}</div>`;
            }
        } catch (err) {
            console.error("Upload failed:", err);
            statusDiv.innerHTML = `<div class="alert alert-danger">❌ Connection failed: ${err.message}</div>`;
        }
    });
}

document.addEventListener('DOMContentLoaded', initUploadForm);
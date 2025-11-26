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

    if (!form || !statusDiv) return;

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

        const file = fileInput.files[0];
        
        // === CRITICAL DEBUG: Check file in browser ===
        console.log('=== BROWSER FILE DEBUG ===');
        console.log('File name:', file.name);
        console.log('File size:', file.size, 'bytes');
        console.log('File type:', file.type);
        console.log('Last modified:', file.lastModified);
        
        // Read the ENTIRE file content in browser to count rows
        const fileContent = await file.text();
        const lines = fileContent.split('\n');
        const rowCount = lines.filter(line => line.trim()).length;
        
        console.log('Browser read FULL file:');
        console.log('- Total lines:', lines.length);
        console.log('- Non-empty lines:', rowCount);
        console.log('- First line:', lines[0]);
        console.log('- Last line:', lines[lines.length - 2]); // -2 because last might be empty
        console.log('- File ends with:', fileContent.slice(-100));
        console.log('==========================');
        
        // Show this info to user
        statusDiv.innerHTML = `
            <div class="alert alert-info">
                <strong>File detected in browser:</strong><br>
                Name: ${file.name}<br>
                Size: ${file.size} bytes (${(file.size / 1024).toFixed(2)} KB)<br>
                Rows detected: <strong>${rowCount}</strong><br>
                <small>Now uploading to server...</small>
            </div>`;
        
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 sec

        const formData = new FormData();
        formData.append('csv_file', file); // Using original file object
        formData.append('dataset_name', nameInput.value.trim().toLowerCase().replace(/\s+/g, '_'));

        statusDiv.innerHTML = `
            <div class="alert alert-info">
                <strong>Uploading ${rowCount} rows...</strong><br>
                <div class="progress mt-3" style="height: 32px;">
                    <div class="progress-bar progress-bar-striped progress-bar-animated bg-success" style="width: 100%">
                        Please wait...
                    </div>
                </div>
            </div>`;

        try {
            const response = await fetch('/api/upload/', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value
                }
            });

            let result;
            try {
                result = await response.json();
            } catch (parseErr) {
                console.error("JSON parse error:", parseErr);
                statusDiv.innerHTML = '<div class="alert alert-danger">Server returned invalid response</div>';
                return;
            }

            console.log('Server response:', result);

            if (response.ok && result.status === 'success') {
                const serverRows = result.imported || result.total_rows || 'unknown';
                const mismatch = serverRows !== rowCount;
                
                statusDiv.innerHTML = `
                    <div class="alert ${mismatch ? 'alert-warning' : 'alert-success'} text-center">
                        <h5>Upload Complete!</h5>
                        Browser detected: <strong>${rowCount}</strong> rows<br>
                        Server imported: <strong>${serverRows}</strong> rows<br>
                        ${mismatch ? '<span style="color: red;">⚠️ MISMATCH DETECTED!</span><br>' : ''}
                        Dataset: <strong>${result.dataset}</strong><br><br>
                        <a href="/map/?dataset=${result.dataset}" class="btn btn-primary btn-lg">View Interactive Map</a>
                    </div>`;
                fileInput.value = '';
                nameInput.value = '';
                if (typeof loadMapData === 'function') loadMapData();
            } else {
                const errorMsg = result.error || 'Unknown error';
                statusDiv.innerHTML = `<div class="alert alert-danger">Error: ${errorMsg}</div>`;
            }
        } catch (err) {
            console.error("Upload failed:", err);
            statusDiv.innerHTML = '<div class="alert alert-danger">Connection failed. Please try again.</div>';
        }
    });
}

document.addEventListener('DOMContentLoaded', initUploadForm);
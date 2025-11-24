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

        const formData = new FormData();
        formData.append('csv_file', fileInput.files[0]);
        formData.append('dataset_name', nameInput.value.trim().toLowerCase().replace(/\s+/g, '_'));

        statusDiv.innerHTML = `
            <div class="alert alert-info">
                <strong>Uploading and processing...</strong><br>
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

            // BƯỚC QUAN TRỌNG: Luôn kiểm tra response.ok trước khi parse JSON
            let result;
            try {
                result = await response.json();
            } catch (parseErr) {
                console.error("JSON parse error:", parseErr);
                statusDiv.innerHTML = '<div class="alert alert-danger">Server returned invalid response</div>';
                return;
            }

            if (response.ok && result.status === 'success') {
                statusDiv.innerHTML = `
                    <div class="alert alert-success text-center">
                        <h5>Upload Complete!</h5>
                        Successfully imported <strong>${result.imported?.toLocaleString() || 'many'}</strong> records<br>
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
let imageData = null;

function getHashedIdFromUrl() {
    const pathParts = window.location.pathname.split('/');
    return pathParts[pathParts.length - 1];
}

async function loadImageData() {
    try {
        const hashedId = getHashedIdFromUrl();
        if (!hashedId) {
            throw new Error('No image ID provided');
        }
        
        const response = await fetch(`/api/image-data/${hashedId}`);
        if (!response.ok) {
            throw new Error('Image not found');
        }
        
        imageData = await response.json();
        displayImage();
    } catch (error) {
        showError('Failed to load image: ' + error.message);
    }
}

function displayImage() {
    const container = document.querySelector('.image-container');
    const img = document.createElement('img');
    img.className = 'main-image';
    img.alt = imageData.title;
    
    img.onload = function() {
        container.innerHTML = '';
        container.appendChild(img);
        
        // Add zoom functionality
        addZoomFunctionality(img);
        
        // Enable buttons
        document.getElementById('downloadBtn').disabled = false;
        document.getElementById('websiteBtn').disabled = false;
        
        // Show image info with actual dimensions
        showImageInfo();
    };
    
    img.onerror = function() {
        // Fallback to proxied version if full resolution fails
        console.warn('Full resolution failed, falling back to proxied version');
        img.src = imageData.url;
        img.onerror = function() {
            showError('Failed to load image');
        };
    };
    
    // Use the full resolution downloadUrl instead of the proxied url
    img.src = imageData.downloadUrl;
}

// Add zoom functionality for full resolution viewing
function addZoomFunctionality(img) {
    let isZoomed = false;
    
    img.addEventListener('click', function() {
        const container = document.querySelector('.image-container');
        
        if (!isZoomed) {
            // Zoom in
            img.classList.add('zoomed');
            container.classList.add('zoomed');
            isZoomed = true;
            
            // Add drag functionality for zoomed image
            let isDragging = false;
            let startX, startY, scrollLeft, scrollTop;
            
            container.addEventListener('mousedown', function(e) {
                isDragging = true;
                startX = e.pageX - container.offsetLeft;
                startY = e.pageY - container.offsetTop;
                scrollLeft = container.scrollLeft;
                scrollTop = container.scrollTop;
                e.preventDefault();
            });
            
            container.addEventListener('mousemove', function(e) {
                if (!isDragging) return;
                e.preventDefault();
                const x = e.pageX - container.offsetLeft;
                const y = e.pageY - container.offsetTop;
                const walkX = (x - startX) * 2;
                const walkY = (y - startY) * 2;
                container.scrollLeft = scrollLeft - walkX;
                container.scrollTop = scrollTop - walkY;
            });
            
            container.addEventListener('mouseup', function() {
                isDragging = false;
            });
            
        } else {
            // Zoom out
            img.classList.remove('zoomed');
            container.classList.remove('zoomed');
            isZoomed = false;
        }
    });
}

function showImageInfo() {
    const infoDiv = document.getElementById('imageInfo');
    const img = document.querySelector('.main-image');
    
    // Show actual loaded dimensions vs metadata dimensions
    const actualWidth = img.naturalWidth || img.width;
    const actualHeight = img.naturalHeight || img.height;
    
    document.getElementById('imageTitle').textContent = `Title: ${imageData.title}`;
    document.getElementById('imageSource').textContent = `Source: ${imageData.source}`;
    document.getElementById('imageDimensions').innerHTML = 
        `Dimensions: ${actualWidth} × ${actualHeight} pixels<br>` +
        `<small style="color: #888;">Click image to zoom • Drag to pan when zoomed</small>`;
    
    infoDiv.style.display = 'block';
}

function showError(message) {
    const container = document.querySelector('.image-container');
    container.innerHTML = `<div class="error">${message}</div>`;
}

function downloadImage() {
    if (imageData) {
        const link = document.createElement('a');
        link.href = `/api/download/${imageData.id}?url=${encodeURIComponent(imageData.downloadUrl)}`;
        link.download = `${imageData.id}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

function goToWebsite() {
    if (imageData && imageData.sourcePageUrl) {
        window.open(imageData.sourcePageUrl, '_blank');
    } else if (imageData && imageData.downloadUrl) {
        // Fallback to image URL if no source page available
        window.open(imageData.downloadUrl, '_blank');
    }
}

// Load image data when page loads and add event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Add event listeners for buttons
    document.getElementById('downloadBtn').addEventListener('click', downloadImage);
    document.getElementById('websiteBtn').addEventListener('click', goToWebsite);
    
    // Load image data
    loadImageData();
});

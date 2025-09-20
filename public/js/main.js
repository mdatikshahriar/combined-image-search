document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const imageCountSelect = document.getElementById('imageCount');
    const loadingDiv = document.getElementById('loadingDiv');
    const resultsInfo = document.getElementById('resultsInfo');
    const imageGrid = document.getElementById('imageGrid');
    const errorDiv = document.getElementById('errorDiv');

    // Filter variables - store all results for filtering
    let allSearchResults = [];
    let currentFilters = {
        source: [],
        resolution: '',
        orientation: '',
        copyright: ''
    };

    // Get filter elements
    const sourceFilterHeader = document.getElementById('sourceFilterHeader');
    const sourceFilterDropdown = document.getElementById('sourceFilterDropdown');
    const sourceCheckboxes = sourceFilterDropdown ? sourceFilterDropdown.querySelectorAll('input[type="checkbox"]') : [];
    const resolutionFilter = document.getElementById('resolutionFilter');
    const orientationFilter = document.getElementById('orientationFilter');
    const copyrightFilter = document.getElementById('copyrightFilter');
    const clearFiltersBtn = document.getElementById('clearFilters');

    // Search functionality
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });

    // Multi-select source filter setup
    if (sourceFilterHeader && sourceFilterDropdown) {
        sourceFilterHeader.addEventListener('click', function(e) {
            e.stopPropagation();
            const isActive = sourceFilterDropdown.classList.contains('show');
            
            // Close all other dropdowns first
            document.querySelectorAll('.multi-select-dropdown').forEach(dropdown => {
                dropdown.classList.remove('show');
            });
            document.querySelectorAll('.multi-select-header').forEach(header => {
                header.classList.remove('active');
            });
            
            if (!isActive) {
                sourceFilterDropdown.classList.add('show');
                sourceFilterHeader.classList.add('active');
            }
        });

        // Add event listeners to checkboxes
        sourceCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                updateSourceFilterDisplay();
                applyFilters();
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', function() {
            sourceFilterDropdown.classList.remove('show');
            sourceFilterHeader.classList.remove('active');
        });

        // Prevent dropdown from closing when clicking inside it
        sourceFilterDropdown.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }

    // Other filter event listeners
    if (resolutionFilter) resolutionFilter.addEventListener('change', applyFilters);
    if (orientationFilter) orientationFilter.addEventListener('change', applyFilters);
    if (copyrightFilter) copyrightFilter.addEventListener('change', applyFilters);
    if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', clearAllFilters);

    function updateSourceFilterDisplay() {
        const checkedBoxes = Array.from(sourceCheckboxes).filter(cb => cb.checked);
        const sourceFilterText = document.querySelector('.multi-select-text');
        
        if (!sourceFilterText) return;
        
        if (checkedBoxes.length === 0) {
            sourceFilterText.textContent = 'All Sources';
        } else if (checkedBoxes.length === 1) {
            sourceFilterText.textContent = checkedBoxes[0].value;
        } else {
            sourceFilterText.textContent = `${checkedBoxes.length} sources selected`;
        }
    }

    async function performSearch() {
        const query = searchInput.value.trim();
        const limit = imageCountSelect.value;

        if (!query) {
            showError('Please enter a search query');
            return;
        }

        // Show loading state
        showLoading(true);
        hideError();
        hideResults();

        try {
            const response = await fetch(`/api/search?query=${encodeURIComponent(query)}&limit=${limit}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Search failed');
            }

            showResults(data.results, data.summary);
        } catch (error) {
            console.error('Search error:', error);
            showError(`Search failed: ${error.message}`);
        } finally {
            showLoading(false);
        }
    }

    function showLoading(show) {
        loadingDiv.style.display = show ? 'block' : 'none';
        searchBtn.disabled = show;
        searchBtn.textContent = show ? 'Searching...' : 'Search Images';
    }

    function showError(message) {
        errorDiv.style.display = 'block';
        document.getElementById('errorText').textContent = message;
    }

    function hideError() {
        errorDiv.style.display = 'none';
    }

    function hideResults() {
        resultsInfo.style.display = 'none';
        imageGrid.innerHTML = '';
    }

    function showResults(results, summary) {
        if (!results || results.length === 0) {
            showError('No images found. Try a different search term.');
            return;
        }

        // Store all results for filtering
        allSearchResults = results;

        // Show results info
        resultsInfo.style.display = 'block';
        document.getElementById('resultsText').textContent = 
            `Found ${summary.total} images for "${summary.query}"`;
        
        // Update total images display
        updateImageCounts(results.length, summary.total);
        
        // Count free images from current results
        const freeImages = results.filter(img => 
            img.copyright.canUseCommercially && img.copyright.status === 'free'
        ).length;
        document.getElementById('freeImages').textContent = freeImages;
        
        // Count sources used
        const sourcesUsed = Object.keys(summary.sources).filter(source => 
            summary.sources[source] > 0
        ).length;
        document.getElementById('sourcesUsed').textContent = sourcesUsed;

        // Show source breakdown
        const sourceBreakdown = document.getElementById('sourceBreakdown');
        sourceBreakdown.innerHTML = '';
        Object.entries(summary.sources).forEach(([source, count]) => {
            if (count > 0) {
                const span = document.createElement('span');
                span.className = 'source-count';
                span.textContent = `${source}: ${count}`;
                sourceBreakdown.appendChild(span);
            }
        });

        // Apply current filters and display images
        applyFilters();
    }

    function updateImageCounts(filteredCount, totalCount) {
        const totalImagesElement = document.getElementById('totalImages');
        
        if (!totalImagesElement) return;
        
        if (filteredCount !== totalCount) {
            totalImagesElement.innerHTML = `${filteredCount}<span style="color: #7f8c8d; font-size: 0.8em;">/${totalCount}</span>`;
        } else {
            totalImagesElement.textContent = totalCount;
        }
    }

    function applyFilters() {
        if (!allSearchResults.length) return;

        // Update current filters
        currentFilters.source = Array.from(sourceCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
        currentFilters.resolution = resolutionFilter ? resolutionFilter.value : '';
        currentFilters.orientation = orientationFilter ? orientationFilter.value : '';
        currentFilters.copyright = copyrightFilter ? copyrightFilter.value : '';

        // Filter results
        let filteredResults = allSearchResults.filter(image => {
            // Source filter - check if any of the image's sources match the filter
            if (currentFilters.source.length > 0) {
                const imageSources = image.sources || [image.source];
                const hasMatchingSource = imageSources.some(source => currentFilters.source.includes(source));
                if (!hasMatchingSource) {
                    return false;
                }
            }

            // Resolution filter
            if (currentFilters.resolution) {
                const maxDimension = Math.max(image.width, image.height);
                switch (currentFilters.resolution) {
                    case 'small':
                        if (maxDimension >= 800) return false;
                        break;
                    case 'medium':
                        if (maxDimension < 800 || maxDimension > 1920) return false;
                        break;
                    case 'large':
                        if (maxDimension < 1920 || maxDimension > 4000) return false;
                        break;
                    case 'extra-large':
                        if (maxDimension <= 4000) return false;
                        break;
                }
            }

            // Orientation filter
            if (currentFilters.orientation) {
                const aspectRatio = image.width / image.height;
                switch (currentFilters.orientation) {
                    case 'landscape':
                        if (aspectRatio <= 1.1) return false;
                        break;
                    case 'portrait':
                        if (aspectRatio >= 0.9) return false;
                        break;
                    case 'square':
                        if (aspectRatio < 0.9 || aspectRatio > 1.1) return false;
                        break;
                }
            }

            // Copyright filter
            if (currentFilters.copyright) {
                switch (currentFilters.copyright) {
                    case 'free':
                        if (image.copyright.status !== 'free' || !image.copyright.canUseCommercially) return false;
                        break;
                    case 'attribution':
                        if (!image.copyright.requiresAttribution) return false;
                        break;
                    case 'commercial':
                        if (!image.copyright.canUseCommercially) return false;
                        break;
                }
            }

            return true;
        });

        // Update displays
        displayImages(filteredResults);
        updateActiveFilters();
        updateImageCounts(filteredResults.length, allSearchResults.length);
        
        // Update free images count based on filtered results
        const freeImages = filteredResults.filter(img => 
            img.copyright.canUseCommercially && img.copyright.status === 'free'
        ).length;
        const freeImagesElement = document.getElementById('freeImages');
        if (freeImagesElement) {
            freeImagesElement.textContent = freeImages;
        }
    }

    function clearAllFilters() {
        // Clear source checkboxes
        sourceCheckboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        updateSourceFilterDisplay();
        
        if (resolutionFilter) resolutionFilter.selectedIndex = 0;
        if (orientationFilter) orientationFilter.selectedIndex = 0;
        if (copyrightFilter) copyrightFilter.selectedIndex = 0;
        
        currentFilters = {
            source: [],
            resolution: '',
            orientation: '',
            copyright: ''
        };

        if (allSearchResults.length > 0) {
            displayImages(allSearchResults);
            updateActiveFilters();
            updateImageCounts(allSearchResults.length, allSearchResults.length);
            
            // Reset free images count
            const freeImages = allSearchResults.filter(img => 
                img.copyright.canUseCommercially && img.copyright.status === 'free'
            ).length;
            const freeImagesElement = document.getElementById('freeImages');
            if (freeImagesElement) {
                freeImagesElement.textContent = freeImages;
            }
        }
    }

    function updateActiveFilters() {
        const activeFiltersDiv = document.getElementById('activeFilters');
        const filterTagsDiv = document.getElementById('filterTags');
        
        if (!activeFiltersDiv || !filterTagsDiv) return;
        
        const activeTags = [];
        
        // Add source tags
        currentFilters.source.forEach(source => {
            activeTags.push({ type: 'source', value: source, label: `Source: ${source}` });
        });
        
        // Add resolution tag
        if (currentFilters.resolution) {
            const resolutionLabels = {
                'small': 'Small (< 800px)',
                'medium': 'Medium (800-1920px)',
                'large': 'Large (1920-4000px)',
                'extra-large': 'Extra Large (> 4000px)'
            };
            activeTags.push({ 
                type: 'resolution', 
                value: currentFilters.resolution, 
                label: `Resolution: ${resolutionLabels[currentFilters.resolution]}` 
            });
        }
        
        // Add orientation tag
        if (currentFilters.orientation) {
            activeTags.push({ 
                type: 'orientation', 
                value: currentFilters.orientation, 
                label: `Orientation: ${currentFilters.orientation}` 
            });
        }
        
        // Add copyright tag
        if (currentFilters.copyright) {
            const copyrightLabels = {
                'free': 'Free to Use',
                'attribution': 'Requires Attribution',
                'commercial': 'Commercial Use OK'
            };
            activeTags.push({ 
                type: 'copyright', 
                value: currentFilters.copyright, 
                label: `Rights: ${copyrightLabels[currentFilters.copyright]}` 
            });
        }
        
        if (activeTags.length > 0) {
            activeFiltersDiv.style.display = 'block';
            filterTagsDiv.innerHTML = '';
            
            activeTags.forEach(tag => {
                const tagElement = document.createElement('span');
                tagElement.className = 'filter-tag';
                tagElement.innerHTML = `${tag.label}`;
                
                // Create and add remove button with proper event listener
                const removeBtn = document.createElement('button');
                removeBtn.className = 'filter-tag-remove';
                removeBtn.innerHTML = '×';
                removeBtn.addEventListener('click', () => removeFilter(tag.type, tag.value));
                
                tagElement.appendChild(removeBtn);
                filterTagsDiv.appendChild(tagElement);
            });
        } else {
            activeFiltersDiv.style.display = 'none';
        }
    }

    function removeFilter(type, value) {
        switch (type) {
            case 'source':
                const checkbox = Array.from(sourceCheckboxes).find(cb => cb.value === value);
                if (checkbox) {
                    checkbox.checked = false;
                    updateSourceFilterDisplay();
                }
                break;
            case 'resolution':
                if (resolutionFilter) resolutionFilter.selectedIndex = 0;
                break;
            case 'orientation':
                if (orientationFilter) orientationFilter.selectedIndex = 0;
                break;
            case 'copyright':
                if (copyrightFilter) copyrightFilter.selectedIndex = 0;
                break;
        }
        applyFilters();
    }

    function displayImages(images) {
        imageGrid.innerHTML = '';
        
        images.forEach(image => {
            const card = createImageCard(image);
            imageGrid.appendChild(card);
        });
    }

    function createImageCard(image) {
        const card = document.createElement('div');
        card.className = 'image-card';
        
        // Get copyright badge class
        const getCopyrightBadgeClass = () => {
            if (image.copyright.status === 'free' && image.copyright.canUseCommercially) {
                return image.copyright.requiresAttribution ? 'copyright-attribution' : 'copyright-free';
            }
            if (image.copyright.status === 'unknown') return 'copyright-unknown';
            return 'copyright-restricted';
        };

        // Get copyright badge text
        const getCopyrightBadgeText = () => {
            if (image.copyright.status === 'free' && image.copyright.canUseCommercially) {
                return image.copyright.requiresAttribution ? 'Free + Attribution' : 'Free to Use';
            }
            if (image.copyright.status === 'unknown') return 'Check License';
            return 'Restricted';
        };

        card.innerHTML = `
            <div class="image-container">
                <img src="${image.url}" alt="${image.title}" loading="lazy" 
                    onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjIyMCIgdmlld0JveD0iMCAwIDMyMCAyMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMjAiIGhlaWdodD0iMjIwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xNjAgMTEwTDE0MCA5MEwxMjAgMTEwTDE0MCA5MEwxNjAgMTEwWiIgZmlsbD0iIzlDQTNBRiIvPgo8dGV4dCB4PSIxNjAiIHk9IjE0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzlDQTNBRiIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIj5JbWFnZSBub3QgYXZhaWxhYmxlPC90ZXh0Pgo8L3N2Zz4K'" />
                ${image.sourceCount > 1 ? 
                    `<div class="multiple-sources-badge">${image.sourceCount} sources</div>` : 
                    `<div class="source-badge">${image.source}</div>`
                }
                <div class="copyright-badge ${getCopyrightBadgeClass()}">${getCopyrightBadgeText()}</div>
            </div>
            <div class="image-info">
                <div class="image-title">${image.originalTitle || image.title}</div>
                ${image.sourceCount > 1 ? 
                    `<div class="sources-list"><strong>Found on:</strong> ${image.sources.join(', ')}</div>` : 
                    ``
                }
                <div class="image-details">
                    <strong>Photographer:</strong> ${image.photographer}<br>
                    <strong>Size:</strong> ${image.width} × ${image.height} (${image.size})
                </div>
                <div class="copyright-info">
                    <div class="copyright-status">${image.copyright.license}</div>
                    <div class="copyright-desc">${image.copyright.description}</div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="download-btn" data-action="download" data-id="${image.id}" data-url="${encodeURIComponent(image.downloadUrl)}">
                        📥 Download
                    </button>
                    <a href="/view/${image.hashedId}" target="_blank" class="download-btn view-btn">
                        👁️ View Image
                    </a>
                </div>
            </div>
        `;
        
        // Add event listener for the download button only (View is now a link)
        const downloadBtn = card.querySelector('[data-action="download"]');
        
        downloadBtn.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            const url = this.getAttribute('data-url');
            downloadImage(id, url);
        });
        
        return card;
    }

    // Download and view functions
    async function downloadImage(id, url) {
        try {
            const decodedUrl = decodeURIComponent(url);
            
            // Show download progress
            const button = document.querySelector(`[data-id="${id}"]`);
            const originalText = button.textContent;
            button.textContent = 'Downloading...';
            button.disabled = true;
            
            const response = await fetch(`/api/download/${id}?url=${encodeURIComponent(decodedUrl)}`);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Download failed' }));
                throw new Error(errorData.error || 'Download failed');
            }
            
            const blob = await response.blob();
            
            // Determine file extension from content type or URL
            const contentType = response.headers.get('content-type');
            let extension = 'jpg';
            if (contentType) {
                if (contentType.includes('png')) extension = 'png';
                else if (contentType.includes('gif')) extension = 'gif';
                else if (contentType.includes('webp')) extension = 'webp';
            } else {
                const urlMatch = decodedUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i);
                if (urlMatch) extension = urlMatch[1];
            }
            
            const downloadUrl = window.URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `${id}.${extension}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            window.URL.revokeObjectURL(downloadUrl);
            
            // Reset button
            button.textContent = originalText;
            button.disabled = false;
            
        } catch (error) {
            console.error('Download error:', error);
            
            // Reset button on error
            const button = document.querySelector(`[data-id="${id}"]`);
            if (button) {
                button.textContent = '📥 Download';
                button.disabled = false;
            }
            
            // Show user-friendly error message
            alert(`Download failed: ${error.message}. Please try again or check your connection.`);
        }
    }

    // Make functions available globally for any remaining inline handlers
    window.downloadImage = downloadImage;
    window.removeFilter = removeFilter;
});

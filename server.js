// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Enhanced logging
const log = {
    info: (msg, data = null) => {
        console.log(`[INFO] ${new Date().toISOString()} - ${msg}`);
        if (data) console.log(JSON.stringify(data, null, 2));
    },
    error: (msg, error = null) => {
        console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`);
        if (error) {
            console.error('Error details:', error.message);
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
            }
            if (error.stack) console.error('Stack trace:', error.stack);
        }
    },
    warn: (msg, data = null) => {
        console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`);
        if (data) console.warn(JSON.stringify(data, null, 2));
    },
    debug: (msg, data = null) => {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`);
            if (data) console.log(JSON.stringify(data, null, 2));
        }
    }
};

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "*"],
            connectSrc: ["'self'"],
        },
    },
}));
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200
});
app.use(limiter);

// API Keys - with validation
const API_KEYS = {
    UNSPLASH_ACCESS_KEY: process.env.UNSPLASH_ACCESS_KEY || 'demo_key',
    PIXABAY_KEY: process.env.PIXABAY_KEY || 'demo_key',
    PEXELS_KEY: process.env.PEXELS_KEY || 'demo_key'
};

// Log API key status at startup
log.info('API Keys Status:', {
    unsplash: API_KEYS.UNSPLASH_ACCESS_KEY !== 'demo_key' ? 'Configured' : 'Missing',
    pixabay: API_KEYS.PIXABAY_KEY !== 'demo_key' ? 'Configured' : 'Missing',
    pexels: API_KEYS.PEXELS_KEY !== 'demo_key' ? 'Configured' : 'Missing'
});

// Utility functions
const formatFileSize = (bytes) => {
    if (bytes < 1024) return Math.round(bytes) + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (Math.round(bytes / (1024 * 1024) * 10) / 10) + ' MB';
};

const estimateFileSize = (width, height) => {
    const pixels = width * height;
    const bytes = pixels * 3 * 0.7;
    return formatFileSize(bytes);
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Enhanced user agent rotation
const getRandomUserAgent = () => {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
};

// Image proxy endpoint
app.get('/api/proxy-image', async (req, res) => {
    try {
        const { url } = req.query;
        
        if (!url) {
            return res.status(400).json({ error: 'URL parameter is required' });
        }

        log.debug('Proxying image:', { url });

        const response = await axios.get(url, {
            responseType: 'stream',
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Referer': 'https://www.google.com/'
            },
            timeout: 15000,
            maxRedirects: 5
        });

        res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        response.data.pipe(res);
    } catch (error) {
        log.error('Image proxy error:', error);
        
        const placeholderSvg = `
            <svg width="320" height="220" viewBox="0 0 320 220" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="320" height="220" fill="#F3F4F6"/>
                <circle cx="160" cy="85" r="20" fill="#9CA3AF"/>
                <path d="M130 130L160 100L190 130H130Z" fill="#9CA3AF"/>
                <text x="160" y="160" text-anchor="middle" fill="#9CA3AF" font-family="Arial" font-size="12">Image not available</text>
            </svg>
        `;
        
        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(placeholderSvg);
    }
});

// Wikimedia Commons API
const searchWikimedia = async (query, limit = 50) => {
    try {
        log.info(`Searching Wikimedia Commons for: ${query} (limit: ${limit})`);

        const response = await axios.get('https://commons.wikimedia.org/w/api.php', {
            params: {
                action: 'query',
                format: 'json',
                generator: 'search',
                gsrnamespace: 6,
                gsrsearch: query,
                gsrlimit: limit,
                prop: 'imageinfo',
                iiprop: 'url|size|mime',
                iiurlwidth: 300
            },
            headers: {
                'User-Agent': 'ImageSearchApp/1.0'
            },
            timeout: 10000
        });

        if (!response.data.query || !response.data.query.pages) {
            log.warn('Wikimedia returned no results', { query });
            return [];
        }

        const results = Object.values(response.data.query.pages)
            .filter(page => page.imageinfo && page.imageinfo[0])
            .map((page, index) => {
                const img = page.imageinfo[0];
                return {
                    id: `wikimedia_${page.pageid}`,
                    title: page.title.replace('File:', ''),
                    url: `/api/proxy-image?url=${encodeURIComponent(img.thumburl || img.url)}`,
                    downloadUrl: img.url,
                    source: 'Wikimedia Commons',
                    width: img.width || 800,
                    height: img.height || 600,
                    size: img.size ? formatFileSize(img.size) : estimateFileSize(img.width || 800, img.height || 600),
                    copyright: {
                        status: 'free',
                        license: 'Creative Commons / Public Domain',
                        description: 'Free to use, modify, and distribute.',
                        canUseCommercially: true,
                        requiresAttribution: true
                    },
                    photographer: 'Wikimedia Contributors',
                    tags: [query]
                };
            });

        log.info(`Wikimedia search completed: ${results.length} results`);
        return results;
    } catch (error) {
        log.error('Wikimedia search error:', error);
        return [];
    }
};

// Utility function to handle delays across different Puppeteer versions
const waitForTimeout = async (page, ms) => {
    try {
        // Try new method first (Puppeteer v13+)
        if (typeof page.waitForTimeout === 'function') {
            await page.waitForTimeout(ms);
        } else if (typeof page.waitFor === 'function') {
            // Fallback for older versions (Puppeteer v1-12)
            await page.waitFor(ms);
        } else {
            // Manual timeout using Promise
            await new Promise(resolve => setTimeout(resolve, ms));
        }
    } catch (error) {
        // Fallback to manual timeout
        await new Promise(resolve => setTimeout(resolve, ms));
    }
};

// Updated Google Images scraper - Based on current HTML structure
const searchGoogleImages = async (query, limit = 80) => {
    let browser;
    try {
        log.info(`Searching Google Images for: ${query} (limit: ${limit})`);
        const images = [];
        
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&hl=en&safe=off`;
        
        try {
            log.info(`Navigating to: ${searchUrl}`);
            await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            
            // Wait for images to load
            try {
                await page.waitForSelector('img', { timeout: 10000 });
            } catch (selectorError) {
                log.warn('Could not wait for img selector, continuing...');
            }
            
            await waitForTimeout(page, 3000);
            
            // Scroll more aggressively to load more images
            for (let i = 0; i < 5; i++) {
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
                await waitForTimeout(page, 2000);
                
                // Try clicking "Show more results" if available
                try {
                    const showMoreButton = await page.$('input[value*="Show more"], input[value*="more results"], .mye4qd, .YstHxe');
                    if (showMoreButton) {
                        await showMoreButton.click();
                        await waitForTimeout(page, 2000);
                    }
                } catch (e) {
                    // Button not found or not clickable, continue
                }
            }

            // Debug current structure
            const debugInfo = await page.evaluate(() => {
                return {
                    totalImages: document.querySelectorAll('img').length,
                    httpImages: document.querySelectorAll('img[src*="http"]').length,
                    imgresLinks: document.querySelectorAll('a[href*="imgres"]').length,
                    containers: {
                        'div[jsname="dTDiAc"]': document.querySelectorAll('div[jsname="dTDiAc"]').length,
                        'div[jscontroller="Um3BXb"]': document.querySelectorAll('div[jscontroller="Um3BXb"]').length,
                        'a[href*="imgres"]': document.querySelectorAll('a[href*="imgres"]').length,
                        'g-img': document.querySelectorAll('g-img').length,
                        '.F0uyec': document.querySelectorAll('.F0uyec').length,
                        '.eA0Zlc': document.querySelectorAll('.eA0Zlc').length
                    }
                };
            });
            
            log.info(`Current structure debug: ${JSON.stringify(debugInfo, null, 2)}`);

            // Extract images using the current Google structure
            const imageData = await page.evaluate((limit) => {
                const results = [];
                const seenUrls = new Set();
                
                console.log('Starting extraction with current Google structure...');
                
                // Method 1: Look for imgres links in the new structure
                const imgresLinks = document.querySelectorAll('a[href*="/imgres"]');
                console.log(`Found ${imgresLinks.length} imgres links`);
                
                imgresLinks.forEach((link, index) => {
                    if (results.length >= limit) return;
                    
                    try {
                        const href = link.href;
                        const urlMatch = href.match(/imgurl=([^&]+)/);
                        const widthMatch = href.match(/w=(\d+)/);
                        const heightMatch = href.match(/h=(\d+)/);
                        
                        if (urlMatch) {
                            const imageUrl = decodeURIComponent(urlMatch[1]);
                            
                            if (!seenUrls.has(imageUrl) && imageUrl.startsWith('http') && 
                                !imageUrl.includes('data:image')) {
                                
                                seenUrls.add(imageUrl);
                                
                                // Get title from the link or nearby elements
                                let title = `Google Image ${results.length + 1}`;
                                const img = link.querySelector('img');
                                if (img && img.alt) {
                                    title = img.alt;
                                }
                                
                                const width = widthMatch ? parseInt(widthMatch[1]) : 800;
                                const height = heightMatch ? parseInt(heightMatch[1]) : 600;
                                
                                results.push({
                                    url: imageUrl,
                                    title: title,
                                    width: width,
                                    height: height,
                                    source: 'google_imgres_new'
                                });
                                console.log(`Added imgres image: ${imageUrl.substring(0, 50)}... (${width}x${height})`);
                            }
                        }
                    } catch (e) {
                        console.log('Error processing imgres link:', e);
                    }
                });
                
                // Method 2: Look for image containers with jsname="dTDiAc"
                if (results.length < limit) {
                    console.log('Looking for containers with jsname="dTDiAc"...');
                    const containers = document.querySelectorAll('div[jsname="dTDiAc"]');
                    console.log(`Found ${containers.length} dTDiAc containers`);
                    
                    containers.forEach((container, index) => {
                        if (results.length >= limit) return;
                        
                        try {
                            const imgresLink = container.querySelector('a[href*="/imgres"]');
                            if (imgresLink) {
                                const href = imgresLink.href;
                                const urlMatch = href.match(/imgurl=([^&]+)/);
                                
                                if (urlMatch) {
                                    const imageUrl = decodeURIComponent(urlMatch[1]);
                                    
                                    if (!seenUrls.has(imageUrl) && imageUrl.startsWith('http')) {
                                        seenUrls.add(imageUrl);
                                        
                                        const img = container.querySelector('img');
                                        const title = img ? (img.alt || `Container Image ${results.length + 1}`) : `Container Image ${results.length + 1}`;
                                        
                                        results.push({
                                            url: imageUrl,
                                            title: title,
                                            width: 800,
                                            height: 600,
                                            source: 'google_container_new'
                                        });
                                        console.log(`Added container image: ${imageUrl.substring(0, 50)}...`);
                                    }
                                }
                            }
                        } catch (e) {
                            console.log('Error processing container:', e);
                        }
                    });
                }
                
                // Method 3: Look for g-img elements
                if (results.length < limit) {
                    console.log('Looking for g-img elements...');
                    const gImgs = document.querySelectorAll('g-img img');
                    console.log(`Found ${gImgs.length} g-img images`);
                    
                    gImgs.forEach((img, index) => {
                        if (results.length >= limit) return;
                        
                        // Skip base64 images
                        if (!img.src || img.src.startsWith('data:')) return;
                        
                        // Find parent container with imgres link
                        let parent = img.closest('div[jsname="dTDiAc"]');
                        if (parent) {
                            const imgresLink = parent.querySelector('a[href*="/imgres"]');
                            if (imgresLink) {
                                const href = imgresLink.href;
                                const urlMatch = href.match(/imgurl=([^&]+)/);
                                
                                if (urlMatch) {
                                    const imageUrl = decodeURIComponent(urlMatch[1]);
                                    
                                    if (!seenUrls.has(imageUrl) && imageUrl.startsWith('http')) {
                                        seenUrls.add(imageUrl);
                                        
                                        results.push({
                                            url: imageUrl,
                                            title: img.alt || `G-img Image ${results.length + 1}`,
                                            width: img.width || 800,
                                            height: img.height || 600,
                                            source: 'google_gimg_new'
                                        });
                                        console.log(`Added g-img image: ${imageUrl.substring(0, 50)}...`);
                                    }
                                }
                            }
                        }
                    });
                }
                
                // Method 4: Extract from actual visible images (most reliable fallback)
                if (results.length === 0) {
                    console.log('Final fallback: extracting from visible images...');
                    
                    const validImages = [];
                    
                    // Get all images and filter for content images
                    const allImages = document.querySelectorAll('img[src*="http"]');
                    console.log(`Found ${allImages.length} images with http src`);
                    
                    allImages.forEach((img, index) => {
                        const src = img.src;
                        const width = img.naturalWidth || img.width || 0;
                        const height = img.naturalHeight || img.height || 0;
                        
                        // Filter for actual content images
                        const isContentImage = width >= 100 && height >= 100 &&
                                             !src.includes('gstatic.com/images/branding') &&
                                             !src.includes('logo') &&
                                             !src.includes('1x1') &&
                                             !src.includes('data:image') &&
                                             !src.includes('spacer') &&
                                             !src.includes('pixel');
                        
                        // Check if it's in a content container
                        const isInContainer = img.closest('div[jsname="dTDiAc"]') !== null;
                        
                        if (isContentImage && isInContainer) {
                            validImages.push({
                                img: img,
                                src: src,
                                width: width,
                                height: height,
                                area: width * height
                            });
                        }
                    });
                    
                    // Sort by size (larger first) and take the best ones
                    validImages.sort((a, b) => b.area - a.area);
                    console.log(`Found ${validImages.length} valid content images`);
                    
                    validImages.forEach((imgData, index) => {
                        if (results.length >= limit) return;
                        
                        const { img, src, width, height } = imgData;
                        
                        if (!seenUrls.has(src)) {
                            seenUrls.add(src);
                            
                            // Try to get higher resolution version
                            let finalUrl = src;
                            
                            // For Google hosted images, try to get higher resolution
                            if (src.includes('googleusercontent.com') || src.includes('ggpht.com')) {
                                // Remove size restrictions
                                finalUrl = src.replace(/=s\d+/, '=s1000')
                                            .replace(/=w\d+-h\d+/, '=w1000')
                                            .replace(/=w\d+/, '=w1000')
                                            .replace(/=h\d+/, '=h1000');
                            }
                            
                            results.push({
                                url: finalUrl,
                                title: img.alt || img.title || `Image ${results.length + 1}`,
                                width: width,
                                height: height,
                                source: 'google_visible_image'
                            });
                            
                            console.log(`Added visible image ${results.length}: ${finalUrl.substring(0, 60)}... (${width}x${height})`);
                        }
                    });
                    
                    console.log(`After visible image extraction: ${results.length} results`);
                }
                
                console.log(`Total extracted: ${results.length} images`);
                return results;
            }, limit);

            log.info(`Successfully extracted ${imageData.length} image URLs from Google`);

            // Process the extracted data
            imageData.forEach((item, index) => {
                const imageId = `google_${item.source}_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`;
                images.push({
                    id: imageId,
                    title: `${item.title} - ${query}`,
                    url: `/api/proxy-image?url=${encodeURIComponent(item.url)}`,
                    downloadUrl: item.url,
                    source: 'Google Images',
                    width: item.width || 800,
                    height: item.height || 600,
                    size: estimateFileSize(item.width || 800, item.height || 600),
                    copyright: {
                        status: 'unknown',
                        license: 'Various',
                        description: 'Copyright varies. Check source.',
                        canUseCommercially: false,
                        requiresAttribution: true
                    },
                    photographer: 'Various',
                    tags: [query]
                });
            });

        } catch (error) {
            log.error(`Google search navigation failed:`, error);
        }

        log.info(`Google Images search completed: ${images.length} results`);
        return images.slice(0, limit);
        
    } catch (error) {
        log.error('Google Images search error:', error);
        return [];
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

// Improved Bing Images scraper
const searchBingImages = async (query, limit = 80) => {
    let browser;
    try {
        log.info(`Searching Bing Images for: ${query} (limit: ${limit})`);
        const images = [];
        
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--disable-gpu',
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ]
        });

        const page = await browser.newPage();
        
        // Set realistic viewport and user agent
        await page.setViewport({ width: 1366, height: 768 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Add extra headers
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        });
        
        const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1&count=150`;
        
        try {
            await page.goto(searchUrl, { 
                waitUntil: 'networkidle2', 
                timeout: 30000 
            });

            // Wait for images to load - try multiple selectors
            let imagesLoaded = false;
            const selectors = ['.iusc', '.img_cont', '.imgpt', 'img[class*="img"]'];
            
            for (const selector of selectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 5000 });
                    imagesLoaded = true;
                    log.info(`Bing images loaded with selector: ${selector}`);
                    break;
                } catch (e) {
                    log.info(`Bing selector ${selector} not found, trying next...`);
                }
            }
            
            if (!imagesLoaded) {
                throw new Error('No Bing images found with any selector');
            }
            
            // Scroll to load more images
            for (let i = 0; i < 4; i++) {
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
                await delay(800 + Math.random() * 400);
            }

            // Extract image data with improved method
            const imageData = await page.evaluate(async (limit) => {
                const results = [];
                const seenUrls = new Set();
                
                console.log('Starting improved Bing image extraction...');
                
                // Method 1: Extract from .iusc elements with metadata
                const iuscElements = document.querySelectorAll('.iusc');
                console.log(`Found ${iuscElements.length} .iusc elements`);
                
                iuscElements.forEach((element, index) => {
                    if (results.length >= limit) return;
                    
                    try {
                        // Try to get metadata from various attributes
                        const madData = element.getAttribute('mad');
                        const m = element.getAttribute('m');
                        const dataM = element.getAttribute('data-m');
                        
                        let data = null;
                        
                        // Try parsing different metadata attributes
                        for (const attr of [madData, m, dataM]) {
                            if (attr && !data) {
                                try {
                                    data = JSON.parse(attr);
                                    break;
                                } catch (e) {
                                    // Continue to next attribute
                                }
                            }
                        }
                        
                        if (data && (data.murl || data.turl || data.mediaurl)) {
                            const imageUrl = data.murl || data.mediaurl || data.turl;
                            
                            if (imageUrl && !seenUrls.has(imageUrl) && imageUrl.startsWith('http')) {
                                seenUrls.add(imageUrl);
                                results.push({
                                    url: imageUrl,
                                    title: data.t || data.alt || data.desc || `Bing Image ${results.length + 1}`,
                                    width: parseInt(data.w) || parseInt(data.width) || 800,
                                    height: parseInt(data.h) || parseInt(data.height) || 600,
                                    source: 'bing_metadata'
                                });
                                console.log(`Added metadata image: ${imageUrl.substring(0, 50)}...`);
                            }
                        }
                        
                        // Fallback: look for img elements within the container
                        if (!data) {
                            const img = element.querySelector('img');
                            if (img && img.src) {
                                const src = img.src;
                                if (!seenUrls.has(src) && src.startsWith('http') && !src.includes('data:image')) {
                                    seenUrls.add(src);
                                    results.push({
                                        url: src,
                                        title: img.alt || `Bing Container Image ${results.length + 1}`,
                                        width: img.naturalWidth || 800,
                                        height: img.naturalHeight || 600,
                                        source: 'bing_container'
                                    });
                                    console.log(`Added container image: ${src.substring(0, 50)}...`);
                                }
                            }
                        }
                    } catch (e) {
                        console.log('Error processing iusc element:', e);
                    }
                });

                // Method 2: Look for all images with reasonable sizes
                const allImages = document.querySelectorAll('img[src*="http"]');
                console.log(`Found ${allImages.length} total images`);
                
                allImages.forEach((img, index) => {
                    if (results.length >= limit) return;
                    
                    const src = img.src;
                    const width = img.naturalWidth || parseInt(img.getAttribute('width')) || 0;
                    const height = img.naturalHeight || parseInt(img.getAttribute('height')) || 0;
                    
                    // Skip small images and already seen URLs
                    if (!src || seenUrls.has(src) || width < 150 || height < 150 || 
                        src.includes('static.') || src.includes('logo') || src.includes('data:image')) {
                        return;
                    }
                    
                    seenUrls.add(src);
                    results.push({
                        url: src,
                        title: img.alt || `Bing Direct Image ${results.length + 1}`,
                        width: width,
                        height: height,
                        source: 'bing_direct'
                    });
                    console.log(`Added direct image: ${src.substring(0, 50)}...`);
                });

                console.log(`Total Bing results found: ${results.length}`);
                return results;
            }, limit);

            // Process the extracted data
            imageData.forEach((item, index) => {
                const imageId = `bing_${item.source}_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`;
                images.push({
                    id: imageId,
                    title: `${item.title} - ${query}`,
                    url: `/api/proxy-image?url=${encodeURIComponent(item.url)}`,
                    downloadUrl: item.url,
                    source: 'Bing Images',
                    width: item.width || 800,
                    height: item.height || 600,
                    size: estimateFileSize(item.width || 800, item.height || 600),
                    copyright: {
                        status: 'unknown',
                        license: 'Various',
                        description: 'Copyright varies. Check source.',
                        canUseCommercially: false,
                        requiresAttribution: true
                    },
                    photographer: 'Various',
                    tags: [query]
                });
            });

        } catch (error) {
            log.error(`Bing search navigation failed:`, error);
        }

        log.info(`Bing Images search completed: ${images.length} results`);
        return images.slice(0, limit);
        
    } catch (error) {
        log.error('Bing Images search error:', error);
        return [];
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

// Pexels API with detailed logging
const searchPexels = async (query, limit = 50) => {
    try {
        if (API_KEYS.PEXELS_KEY === 'demo_key') {
            log.warn('Pexels API key not configured, skipping');
            return [];
        }

        log.info(`Searching Pexels for: ${query} (limit: ${limit})`);

        const response = await axios.get('https://api.pexels.com/v1/search', {
            params: {
                query,
                per_page: Math.min(limit, 80),
                page: 1
            },
            headers: {
                'Authorization': API_KEYS.PEXELS_KEY
            },
            timeout: 10000
        });

        const results = response.data.photos.map(photo => ({
            id: `pexels_${photo.id}`,
            title: photo.alt || `Photo by ${photo.photographer}`,
            url: `/api/proxy-image?url=${encodeURIComponent(photo.src.medium)}`,
            downloadUrl: photo.src.original,
            source: 'Pexels',
            width: photo.width,
            height: photo.height,
            size: estimateFileSize(photo.width, photo.height),
            copyright: {
                status: 'free',
                license: 'Pexels License',
                description: 'Free for commercial use. No attribution required.',
                canUseCommercially: true,
                requiresAttribution: false
            },
            photographer: photo.photographer,
            tags: [query]
        }));

        log.info(`Pexels search completed: ${results.length} results`);
        return results;
    } catch (error) {
        log.error('Pexels search error:', error);
        return [];
    }
};

// Pixabay API with detailed logging
const searchPixabay = async (query, limit = 50) => {
    try {
        if (API_KEYS.PIXABAY_KEY === 'demo_key') {
            log.warn('Pixabay API key not configured, skipping');
            return [];
        }

        log.info(`Searching Pixabay for: ${query} (limit: ${limit})`);

        const response = await axios.get('https://pixabay.com/api/', {
            params: {
                key: API_KEYS.PIXABAY_KEY,
                q: query,
                image_type: 'photo',
                per_page: Math.min(limit, 200),
                safesearch: 'true',
                page: 1
            },
            timeout: 10000
        });

        const results = response.data.hits.map(image => ({
            id: `pixabay_${image.id}`,
            title: image.tags || `Pixabay image by ${image.user}`,
            url: `/api/proxy-image?url=${encodeURIComponent(image.webformatURL)}`,
            downloadUrl: image.fullHDURL || image.largeImageURL,
            source: 'Pixabay',
            width: image.imageWidth,
            height: image.imageHeight,
            size: estimateFileSize(image.imageWidth, image.imageHeight),
            copyright: {
                status: 'free',
                license: 'Pixabay License',
                description: 'Free for commercial use. No attribution required.',
                canUseCommercially: true,
                requiresAttribution: false
            },
            photographer: image.user,
            tags: image.tags ? image.tags.split(', ') : [query]
        }));

        log.info(`Pixabay search completed: ${results.length} results`);
        return results;
    } catch (error) {
        log.error('Pixabay search error:', error);
        return [];
    }
};

// Enhanced DuckDuckGo Images scraper with anti-detection measures
const searchDuckDuckGoImages = async (query, limit = 50) => {
    const MAX_RETRIES = 3;
    const BASE_DELAY = 1000; // 1 second base delay
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            log.info(`Searching DuckDuckGo Images for: ${query} (limit: ${limit}) - Attempt ${attempt}`);
            
            // Add random delay between requests
            if (attempt > 1) {
                const delay = BASE_DELAY * attempt + Math.random() * 1000;
                log.info(`Waiting ${Math.round(delay)}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            // Enhanced headers to appear more like a real browser
            const headers = {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'max-age=0'
            };

            // First, get the vqd token with enhanced session simulation
            const tokenResponse = await axios.get(`https://duckduckgo.com/`, {
                params: { q: query },
                headers,
                timeout: 15000,
                maxRedirects: 5,
                validateStatus: status => status < 500 // Accept 4xx as valid for parsing
            });

            // Handle potential redirects or different response formats
            if (tokenResponse.status === 403) {
                log.warn(`Attempt ${attempt}: Received 403 on token request`);
                if (attempt === MAX_RETRIES) {
                    throw new Error('Persistent 403 error on token request');
                }
                continue;
            }

            // Extract vqd token with multiple fallback patterns
            let vqd = null;
            const vqdPatterns = [
                /vqd=['"]([^'"]*)['"]/,
                /vqd=([a-zA-Z0-9-_]+)/,
                /"vqd":"([^"]*?)"/,
                /vqd:\s*['"]([^'"]*)['"]/
            ];

            for (const pattern of vqdPatterns) {
                const match = tokenResponse.data.match(pattern);
                if (match) {
                    vqd = match[1];
                    break;
                }
            }

            if (!vqd) {
                log.warn(`Attempt ${attempt}: Could not extract vqd token`);
                if (attempt === MAX_RETRIES) {
                    log.error('Failed to extract vqd token after all attempts');
                    return [];
                }
                continue;
            }

            log.info(`Retrieved vqd token: ${vqd.substring(0, 10)}...`);
            
            // Add a small delay between token request and image search
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));
            
            // Enhanced headers for image search
            const imageSearchHeaders = {
                ...headers,
                'Referer': 'https://duckduckgo.com/',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'X-Requested-With': 'XMLHttpRequest'
            };

            // Now search for images with enhanced parameters
            const searchResponse = await axios.get('https://duckduckgo.com/i.js', {
                params: {
                    l: 'us-en',
                    o: 'json',
                    q: query,
                    vqd: vqd,
                    f: ',,,',
                    p: '1',
                    v7exp: 'a',
                    s: '0', // Start index
                    u: 'bing', // Additional parameter sometimes required
                    bing_market: 'us-EN'
                },
                headers: imageSearchHeaders,
                timeout: 15000,
                validateStatus: status => status < 500
            });

            if (searchResponse.status === 403) {
                log.warn(`Attempt ${attempt}: Received 403 on image search`);
                if (attempt === MAX_RETRIES) {
                    throw new Error('Persistent 403 error on image search');
                }
                continue;
            }

            // Validate response structure
            if (!searchResponse.data || !searchResponse.data.results) {
                log.warn(`Attempt ${attempt}: Invalid response structure`);
                if (attempt === MAX_RETRIES) {
                    log.error('Invalid response structure after all attempts');
                    return [];
                }
                continue;
            }

            const results = searchResponse.data.results.slice(0, limit).map((image, index) => ({
                id: `duckduckgo_${Date.now()}_${index}`,
                title: image.title || `${query} - DuckDuckGo Images`,
                url: `/api/proxy-image?url=${encodeURIComponent(image.thumbnail)}`,
                downloadUrl: image.image,
                source: 'DuckDuckGo Images',
                width: parseInt(image.width) || 800,
                height: parseInt(image.height) || 600,
                size: estimateFileSize(parseInt(image.width) || 800, parseInt(image.height) || 600),
                copyright: {
                    status: 'unknown',
                    license: 'Various',
                    description: 'Copyright varies. Check source.',
                    canUseCommercially: false,
                    requiresAttribution: true
                },
                photographer: 'Various',
                tags: [query]
            }));

            log.info(`DuckDuckGo Images search completed: ${results.length} results`);
            return results;

        } catch (error) {
            log.warn(`Attempt ${attempt} failed:`, error.message);
            
            if (attempt === MAX_RETRIES) {
                log.error('DuckDuckGo Images search error after all attempts:', error);
                return [];
            }
            
            // Progressive backoff for retries
            const retryDelay = BASE_DELAY * Math.pow(2, attempt - 1) + Math.random() * 1000;
            log.info(`Retrying in ${Math.round(retryDelay)}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }
    
    return [];
};

// Lorem Picsum placeholder images
const searchLoremPicsum = async (query, limit = 30) => {
    try {
        log.info(`Generating Lorem Picsum placeholders for: ${query} (limit: ${limit})`);
        
        const results = [];
        const dimensions = [
            [800, 600], [1024, 768], [1200, 800], [640, 480], [1920, 1080],
            [500, 500], [600, 400], [900, 600], [1000, 667], [750, 500]
        ];

        for (let i = 0; i < limit; i++) {
            const [width, height] = dimensions[i % dimensions.length];
            const seed = Math.floor(Math.random() * 1000) + i;
            
            results.push({
                id: `lorem_picsum_${seed}_${i}`,
                title: `${query} - Lorem Picsum Placeholder`,
                url: `/api/proxy-image?url=${encodeURIComponent(`https://picsum.photos/seed/${seed}/${width}/${height}`)}`,
                downloadUrl: `https://picsum.photos/seed/${seed}/${width}/${height}`,
                source: 'Lorem Picsum',
                width: width,
                height: height,
                size: estimateFileSize(width, height),
                copyright: {
                    status: 'free',
                    license: 'Lorem Picsum License',
                    description: 'Free placeholder images for development and testing.',
                    canUseCommercially: true,
                    requiresAttribution: false
                },
                photographer: 'Lorem Picsum',
                tags: [query, 'placeholder']
            });
        }

        log.info(`Lorem Picsum search completed: ${results.length} results`);
        return results;
    } catch (error) {
        log.error('Lorem Picsum search error:', error);
        return [];
    }
};

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Unsplash API proxy
app.get('/api/unsplash/search', async (req, res) => {
    try {
        const { query, per_page = 50 } = req.query;
        
        if (!query) {
            return res.status(400).json({ error: 'Query parameter is required' });
        }

        if (API_KEYS.UNSPLASH_ACCESS_KEY === 'demo_key') {
            log.warn('Unsplash API key not configured');
            return res.json({ results: [] });
        }

        log.info(`Searching Unsplash for: ${query}`);

        const response = await axios.get('https://api.unsplash.com/search/photos', {
            params: {
                query,
                per_page: Math.min(per_page, 50),
                orientation: 'all'
            },
            headers: {
                'Authorization': `Client-ID ${API_KEYS.UNSPLASH_ACCESS_KEY}`
            }
        });

        const formattedResults = response.data.results.map(photo => ({
            id: `unsplash_${photo.id}`,
            title: photo.description || photo.alt_description || `Photo by ${photo.user.name}`,
            url: `/api/proxy-image?url=${encodeURIComponent(photo.urls.small)}`,
            downloadUrl: photo.urls.full,
            source: 'Unsplash',
            width: photo.width,
            height: photo.height,
            size: estimateFileSize(photo.width, photo.height),
            copyright: {
                status: 'free',
                license: 'Unsplash License',
                description: 'Free for commercial use. No attribution required.',
                canUseCommercially: true,
                requiresAttribution: false
            },
            photographer: photo.user.name,
            tags: photo.tags ? photo.tags.map(tag => tag.title) : []
        }));

        log.info(`Unsplash search completed: ${formattedResults.length} results`);

        res.json({ results: formattedResults });
    } catch (error) {
        log.error('Unsplash API error:', error);
        res.status(500).json({ error: 'Failed to fetch images from Unsplash' });
    }
});

// Enhanced combined search endpoint with guaranteed results
app.get('/api/search', async (req, res) => {
    try {
        const { query, limit = 100 } = req.query;
        
        if (!query) {
            return res.status(400).json({ error: 'Query parameter is required' });
        }

        const totalSources = 7;
        const perSourceLimit = Math.ceil(limit / totalSources);
        log.info(`Starting equal-priority search for "${query}" with ${perSourceLimit} limit per source`);

        // Define all sources with per-source allocation
        const allSources = [
            { name: 'Pexels', fn: searchPexels, limit: perSourceLimit },
            { name: 'Pixabay', fn: searchPixabay, limit: perSourceLimit },
            { name: 'Wikimedia', fn: searchWikimedia, limit: perSourceLimit },
            { name: 'Google', fn: searchGoogleImages, limit: limit },
            { name: 'Bing', fn: searchBingImages, limit: limit },
            { name: 'DuckDuckGo', fn: searchDuckDuckGoImages, limit: limit },
            { name: 'LoremPicsum', fn: searchLoremPicsum, limit: limit }
        ];

        log.info(`Running concurrent search across ${totalSources} sources with ${perSourceLimit} results each (max ${perSourceLimit * totalSources} total)`);

        // Run all sources concurrently with equal priority
        const searchPromises = allSources.map(async source => {
            const startTime = Date.now();
            try {
                log.info(`Starting ${source.name} search...`);
                const results = await source.fn(query, source.limit);
                const duration = Date.now() - startTime;
                log.info(`${source.name} completed in ${duration}ms: ${results.length} results`);
                return {
                    source: source.name,
                    results: results,
                    duration: duration,
                    success: true,
                    error: null
                };
            } catch (error) {
                const duration = Date.now() - startTime;
                log.error(`${source.name} search failed after ${duration}ms:`, error);
                return {
                    source: source.name,
                    results: [],
                    duration: duration,
                    success: false,
                    error: error.message
                };
            }
        });

        // Wait for all searches to complete
        const searchResults = await Promise.all(searchPromises);

        // Combine all results without any limit checks
        let allResults = [];
        const sourceStats = {};
        const performanceStats = {};

        searchResults.forEach(result => {
            allResults.push(...result.results);
            sourceStats[result.source] = result.results.length;
            performanceStats[result.source] = {
                duration: result.duration,
                success: result.success,
                resultCount: result.results.length,
                error: result.error
            };
        });

        log.info(`All searches completed. Total raw results: ${allResults.length}`);

        // Enhanced deduplication with NO limit checks - process ALL results
        log.info('Starting comprehensive deduplication process...');

        // Helper function to normalize URLs for comparison
        const normalizeUrl = (url) => {
            if (!url) return '';
            try {
                return url.toLowerCase()
                    .replace(/^https?:\/\//, '')
                    .replace(/^www\./, '')
                    .replace(/\?.*$/, '')
                    .replace(/&.*$/, '')
                    .replace(/_\d+x\d+\.(jpg|jpeg|png|webp|gif)$/, '.$1')
                    .replace(/\/thumb\/.*?\//, '/')
                    .trim();
            } catch (e) {
                return url.toLowerCase();
            }
        };

        // Helper function to calculate similarity between strings
        const calculateSimilarity = (str1, str2) => {
            if (!str1 || !str2) return 0;
            
            const s1 = str1.toLowerCase();
            const s2 = str2.toLowerCase();
            
            if (s1 === s2) return 1;
            
            const len1 = s1.length;
            const len2 = s2.length;
            const maxLen = Math.max(len1, len2);
            
            if (maxLen === 0) return 1;
            
            // Simple similarity check for performance
            let matches = 0;
            const minLen = Math.min(len1, len2);
            
            for (let i = 0; i < minLen; i++) {
                if (s1[i] === s2[i]) matches++;
            }
            
            return matches / maxLen;
        };

        const uniqueResults = [];
        const processedItems = new Map();

        // Process ALL results without any limit during deduplication
        for (const result of allResults) {
            const normalizedUrl = normalizeUrl(result.downloadUrl);
            const normalizedTitle = result.title?.toLowerCase().trim().substring(0, 100) || '';
            
            // Skip if URL is invalid
            if (!normalizedUrl || normalizedUrl.length < 5) {
                continue;
            }
            
            let isDuplicate = false;
            
            // Check for exact URL matches first (fastest)
            if (processedItems.has(normalizedUrl)) {
                isDuplicate = true;
            } else {
                // Check for similar URLs and titles
                for (const [existingUrl, existingData] of processedItems) {
                    if (isDuplicate) break;
                    
                    // Check URL similarity
                    const urlSimilarity = calculateSimilarity(normalizedUrl, existingUrl);
                    if (urlSimilarity > 0.85) {
                        isDuplicate = true;
                        break;
                    }
                    
                    // Check title similarity for same source
                    if (result.source === existingData.source && normalizedTitle && existingData.title) {
                        const titleSimilarity = calculateSimilarity(normalizedTitle, existingData.title);
                        if (titleSimilarity > 0.90) {
                            isDuplicate = true;
                            break;
                        }
                    }
                    
                    // Check for same dimensions and source
                    if (result.source === existingData.source && 
                        result.width === existingData.width && 
                        result.height === existingData.height &&
                        result.width && result.height) {
                        
                        const titleSimilarity = calculateSimilarity(normalizedTitle, existingData.title);
                        if (titleSimilarity > 0.7) {
                            isDuplicate = true;
                            break;
                        }
                    }
                }
            }
            
            if (!isDuplicate) {
                processedItems.set(normalizedUrl, {
                    title: normalizedTitle,
                    source: result.source,
                    width: result.width,
                    height: result.height
                });
                uniqueResults.push(result);
            }
        }

        log.info(`Deduplication completed. ${allResults.length} -> ${uniqueResults.length} unique results`);

        // Shuffle results to ensure fair mixing of sources
        for (let i = uniqueResults.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [uniqueResults[i], uniqueResults[j]] = [uniqueResults[j], uniqueResults[i]];
        }

        // Return ALL unique results (no final limit applied)
        const finalResults = uniqueResults;

        // Calculate final statistics
        const finalStats = {};
        finalResults.forEach(result => {
            finalStats[result.source] = (finalStats[result.source] || 0) + 1;
        });

        // Calculate total search time
        const totalSearchTime = Math.max(...Object.values(performanceStats).map(s => s.duration));
        const avgSearchTime = Object.values(performanceStats).reduce((sum, s) => sum + s.duration, 0) / totalSources;

        const summary = {
            total: finalResults.length,
            perSourceLimit: perSourceLimit,
            maxPossible: perSourceLimit * totalSources,
            sources: finalStats,
            searchStrategy: 'Concurrent equal-priority search with per-source limits',
            performance: {
                totalTime: `${totalSearchTime}ms`,
                averageTime: `${Math.round(avgSearchTime)}ms`,
                concurrentSources: totalSources,
                perSourceLimit: perSourceLimit
            },
            sourceDetails: performanceStats,
            deduplication: {
                beforeDedup: allResults.length,
                afterDedup: uniqueResults.length,
                duplicatesRemoved: allResults.length - uniqueResults.length,
                finalCount: finalResults.length
            },
            query: query
        };

        log.info('Equal-priority search completed successfully:', {
            query,
            totalResults: finalResults.length,
            totalTime: totalSearchTime,
            sourcesUsed: Object.keys(finalStats).length,
            duplicatesRemoved: allResults.length - uniqueResults.length,
            perSourceLimit: perSourceLimit
        });

        res.json({
            results: finalResults,
            summary: summary
        });

    } catch (error) {
        log.error('Search error:', error);
        res.status(500).json({ 
            error: 'Failed to search images',
            details: error.message 
        });
    }
});

// Download proxy endpoint
app.get('/api/download/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { url } = req.query;
        
        if (!url) {
            return res.status(400).json({ error: 'URL parameter is required' });
        }

        log.info('Download request:', { id, url });

        const response = await axios.get(url, {
            responseType: 'stream',
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Referer': 'https://www.google.com/'
            },
            timeout: 30000
        });

        const extension = url.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i)?.[1] || 'jpg';
        res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${id}.${extension}"`);
        
        response.data.pipe(res);
        
        log.info('Download completed:', { id });
    } catch (error) {
        log.error('Download error:', error);
        res.status(500).json({ error: 'Failed to download image' });
    }
});

// Health check endpoint with detailed status
app.get('/health', (req, res) => {
    const apiStatus = {
        pexels: API_KEYS.PEXELS_KEY !== 'demo_key' ? 'configured' : 'missing',
        pixabay: API_KEYS.PIXABAY_KEY !== 'demo_key' ? 'configured' : 'missing',
        unsplash: API_KEYS.UNSPLASH_ACCESS_KEY !== 'demo_key' ? 'configured' : 'missing'
    };

    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        sources: {
            'API-based': ['Pexels', 'Pixabay', 'Unsplash', 'Wikimedia Commons'],
            'Web Scraping': ['Google Images', 'Bing Images', 'DuckDuckGo Images'],
            'Placeholders': ['Lorem Picsum']
        },
        apiKeys: apiStatus,
        version: '3.0 - Enhanced',
        features: [
            'Progressive multi-phase search',
            'Guaranteed result count',
            'Comprehensive error logging',
            'Multiple source redundancy',
            'Advanced deduplication',
            'Automatic fallback strategies'
        ]
    });
});

// Test endpoint for individual sources
app.get('/api/test/:source', async (req, res) => {
    try {
        const { source } = req.params;
        const { query = 'cats', limit = 10 } = req.query;
        
        log.info(`Testing ${source} with query: ${query}`);
        
        let results = [];
        
        switch (source.toLowerCase()) {
            case 'pexels':
                results = await searchPexels(query, limit);
                break;
            case 'pixabay':
                results = await searchPixabay(query, limit);
                break;
            case 'wikimedia':
                results = await searchWikimedia(query, limit);
                break;
            case 'google':
                results = await searchGoogleImages(query, limit);
                break;
            case 'bing':
                results = await searchBingImages(query, limit);
                break;
            case 'duckduckgo':
                results = await searchDuckDuckGoImages(query, limit);
                break;
            case 'lorempicsum':
                results = await searchLoremPicsum(query, limit);
                break;
            default:
                return res.status(400).json({ error: 'Unknown source. Available: pexels, pixabay, wikimedia, google, bing, duckduckgo, lorempicsum' });
        }
        
        res.json({
            source: source,
            query: query,
            requested: limit,
            found: results.length,
            results: results
        });
        
    } catch (error) {
        log.error(`Test error for ${req.params.source}:`, error);
        res.status(500).json({ 
            error: `Failed to test ${req.params.source}`,
            details: error.message 
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    log.error('Unhandled error:', error);
    res.status(500).json({ 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    log.warn(`404 - Endpoint not found: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
    log.info(`🚀 Enhanced Image Search API Server v3.0 running on port ${PORT}`);
    log.info(`📊 Health check: http://localhost:${PORT}/health`);
    log.info(`🔍 Main search: http://localhost:${PORT}/api/search?query=cats&limit=100`);
    log.info(`🧪 Test sources: http://localhost:${PORT}/api/test/pexels?query=dogs&limit=5`);
    log.info(`📷 Sources: Google Images, Bing Images, DuckDuckGo Images, Wikimedia Commons, Pexels, Pixabay, Lorem Picsum`);
    log.info(`🔄 Features: Progressive search, Guaranteed results, Comprehensive logging`);
    
    // Log API status
    const configuredApis = Object.entries(API_KEYS)
        .filter(([key, value]) => value !== 'demo_key')
        .map(([key]) => key);
    
    if (configuredApis.length > 0) {
        log.info(`✅ Configured APIs: ${configuredApis.join(', ')}`);
    } else {
        log.warn('⚠️  No API keys configured. Only web scraping and placeholders will work.');
    }
});

module.exports = app;

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const puppeteer = require('puppeteer');
const path = require('path');
const crypto = require('crypto');

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
            scriptSrc: ["'self'", "'unsafe-inline'"],
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

// Configure axios defaults for better connection handling
axios.defaults.timeout = 15000;
axios.defaults.maxRedirects = 3;
axios.defaults.headers.common['Connection'] = 'keep-alive';

// Handle SSL certificate issues for problematic sites
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Only for development - not recommended for production

// Create axios instance with connection pooling and SSL handling
const httpAgent = require('http').Agent({ keepAlive: true, maxSockets: 10 });
const httpsAgent = require('https').Agent({
    keepAlive: true,
    maxSockets: 10,
    rejectUnauthorized: false // Handle self-signed certificates
});

axios.defaults.httpAgent = httpAgent;
axios.defaults.httpsAgent = httpsAgent;

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

// Enhanced URL validation and cleanup
const validateAndCleanUrl = (url) => {
    if (!url || typeof url !== 'string') {
        return null;
    }

    try {
        // Basic URL validation
        if (!url.match(/^https?:\/\/.+/)) {
            return null;
        }

        // Parse URL to validate structure
        const parsedUrl = new URL(url);

        // Block potentially problematic domains/patterns
        const blockedPatterns = [
            'localhost',
            '127.0.0.1',
            '0.0.0.0',
            '10.',
            '192.168.',
            '172.16.',
            'data:',
            'javascript:',
            'file:'
        ];

        for (const pattern of blockedPatterns) {
            if (parsedUrl.hostname.includes(pattern) || url.toLowerCase().startsWith(pattern)) {
                return null;
            }
        }

        return url;
    } catch (error) {
        return null;
    }
};

// Create a custom axios instance for problematic SSL sites
const createAxiosWithSSLFallback = (url) => {
    const isProblematicDomain = url.includes('museum.') ||
        url.includes('edu') ||
        url.includes('gov') ||
        url.includes('academic');

    if (isProblematicDomain) {
        return axios.create({
            httpsAgent: new (require('https').Agent)({
                rejectUnauthorized: false
            })
        });
    }

    return axios;
};

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

// Simple encryption/decryption for image IDs using AES-256-CBC
const ENCRYPTION_KEY = process.env.IMAGE_ENCRYPTION_KEY || 'default-key-change-in-production-12345678901234567890';

function encryptImageData(imageData) {
    try {
        // Create a 32-byte key from the encryption key
        const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
        const iv = crypto.randomBytes(16);

        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

        let encrypted = cipher.update(JSON.stringify(imageData), 'utf8', 'hex');
        encrypted += cipher.final('hex');

        // Combine iv and encrypted data
        const combined = iv.toString('hex') + ':' + encrypted;
        const hashedId = Buffer.from(combined).toString('base64url');

        return hashedId;
    } catch (error) {
        log.error('Encryption error:', error);
        return null;
    }
}

function decryptImageId(hashedId) {
    try {
        // Create a 32-byte key from the encryption key
        const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();

        const combined = Buffer.from(hashedId, 'base64url').toString('utf8');
        const [ivHex, encrypted] = combined.split(':');

        if (!ivHex || !encrypted) {
            throw new Error('Invalid hash format');
        }

        const iv = Buffer.from(ivHex, 'hex');

        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return JSON.parse(decrypted);
    } catch (error) {
        log.error('Decryption error:', error);
        return null;
    }
}

// Image proxy endpoint
app.get('/api/proxy-image', async (req, res) => {
    const MAX_RETRIES = 3;
    const TIMEOUT_MS = 20000;

    try {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({ error: 'URL parameter is required' });
        }

        if (!url.match(/^https?:\/\/.+/)) {
            log.warn('Invalid URL format:', url);
            return sendPlaceholderImage(res, 'Invalid URL format');
        }

        log.debug('Proxying image:', { url });

        // Retry logic with exponential backoff
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

                const axiosInstance = createAxiosWithSSLFallback(url);
                const response = await axiosInstance.get(url, {
                    responseType: 'stream',
                    headers: {
                        'User-Agent': getRandomUserAgent(),
                        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache',
                        'Referer': 'https://www.google.com/',
                        'Connection': 'keep-alive'
                    },
                    timeout: TIMEOUT_MS,
                    maxRedirects: 3,
                    validateStatus: (status) => status < 400,
                    signal: controller.signal,
                    httpsAgent: new (require('https').Agent)({
                        rejectUnauthorized: false // Handle SSL certificate issues
                    })
                });

                clearTimeout(timeoutId);

                // Validate content type
                const contentType = response.headers['content-type'];
                if (!contentType || !contentType.startsWith('image/')) {
                    log.warn('Invalid content type:', { url, contentType });
                    if (attempt === MAX_RETRIES) {
                        return sendPlaceholderImage(res, 'Invalid content type');
                    }
                    continue;
                }

                // Set response headers
                res.setHeader('Content-Type', contentType);
                res.setHeader('Cache-Control', 'public, max-age=3600');
                res.setHeader('Access-Control-Allow-Origin', '*');

                // Handle stream errors
                response.data.on('error', (streamError) => {
                    log.error('Stream error:', streamError);
                    if (!res.headersSent) {
                        sendPlaceholderImage(res, 'Stream error');
                    }
                });

                response.data.pipe(res);
                return; // Success, exit retry loop

            } catch (axiosError) {
                log.warn(`Attempt ${attempt} failed:`, {
                    url: url.substring(0, 100),
                    error: axiosError.message,
                    status: axiosError.response?.status,
                    code: axiosError.code
                });

                // Don't retry on certain errors
                if (axiosError.response?.status === 404 ||
                    axiosError.response?.status === 403 ||
                    axiosError.code === 'ERR_INVALID_URL') {
                    break;
                }

                // Handle SSL certificate errors - try once more with relaxed SSL
                if (axiosError.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
                    axiosError.code === 'CERT_UNTRUSTED' ||
                    axiosError.code === 'SELF_SIGNED_CERT_IN_CHAIN') {
                    log.warn(`SSL certificate error, will retry with relaxed verification: ${axiosError.code}`);
                }

                // Wait before retry (exponential backoff)
                if (attempt < MAX_RETRIES) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // All retries failed
        log.error('All retry attempts failed for image proxy:', url.substring(0, 100));
        sendPlaceholderImage(res, 'Image not available');

    } catch (error) {
        log.error('Image proxy error:', error);
        sendPlaceholderImage(res, 'Proxy error');
    }
});

// Helper function to send placeholder image
function sendPlaceholderImage(res, message = 'Image not available') {
    if (res.headersSent) return;

    const placeholderSvg = `
        <svg width="320" height="220" viewBox="0 0 320 220" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="320" height="220" fill="#F3F4F6" stroke="#E5E7EB" stroke-width="2"/>
            <circle cx="160" cy="85" r="20" fill="#9CA3AF"/>
            <path d="M130 130L160 100L190 130H130Z" fill="#9CA3AF"/>
            <text x="160" y="160" text-anchor="middle" fill="#6B7280" font-family="Arial" font-size="12">${message}</text>
            <text x="160" y="180" text-anchor="middle" fill="#9CA3AF" font-family="Arial" font-size="10">Placeholder Image</text>
        </svg>
    `;

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(placeholderSvg);
}

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
                    sourcePageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`, // Wikimedia page
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

// Fixed Google Images scraper with improved image URL extraction
const searchGoogleImages = async (query, limit = 80) => {
    let browser;
    try {
        log.info(`🔍 Starting Google Images search: "${query}" (limit: ${limit})`);
        const images = [];

        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--no-first-run',
                '--window-size=1920,1080'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // Basic stealth
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&hl=en&safe=off`;
        
        log.info(`🌐 Loading: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 20000 });

        // Enhanced block detection
        const pageContent = await page.content();
        if (pageContent.toLowerCase().includes('unusual traffic') || 
            pageContent.toLowerCase().includes('captcha') ||
            pageContent.toLowerCase().includes('blocked')) {
            throw new Error('Google blocked the request');
        }

        // Handle cookies
        try {
            await page.waitForSelector('button[id*="accept"], .VfPpkd-LgbsSe, [aria-label*="Accept"]', { timeout: 3000 });
            const cookieButton = await page.$('button[id*="accept"], .VfPpkd-LgbsSe, [aria-label*="Accept"]');
            if (cookieButton) {
                await cookieButton.click();
                await waitForTimeout(page, 1000);
                log.info(`🍪 Accepted cookies`);
            }
        } catch (e) {
            log.info(`🍪 No cookie banner found`);
        }

        // Wait for image grid to load
        await page.waitForSelector('div[jsname="dTDiAc"], .isv-r, img[src*="gstatic"]', { timeout: 15000 });
        log.info(`✅ Image grid loaded`);

        // Scroll to load more images
        log.info(`📜 Loading more images...`);
        for (let scroll = 0; scroll < 4; scroll++) {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await waitForTimeout(page, 800);
            
            // Try show more button
            if (scroll === 2) {
                try {
                    const showMoreSelectors = [
                        'input[value*="Show more"]',
                        '.mye4qd',
                        '.YstHxe input',
                        'input[type="button"][value*="more"]'
                    ];
                    
                    for (const selector of showMoreSelectors) {
                        const button = await page.$(selector);
                        if (button) {
                            const isVisible = await button.isIntersectingViewport();
                            if (isVisible) {
                                log.info(`🔄 Clicking show more: ${selector}`);
                                await button.click();
                                await waitForTimeout(page, 2000);
                                break;
                            }
                        }
                    }
                } catch (e) {}
            }
        }

        // Get containers with better selector strategy
        const containers = await page.$$('div[jsname="dTDiAc"], .isv-r');
        const targetCount = Math.min(containers.length, limit);
        
        log.info(`🎯 Found ${containers.length} clickable containers, processing ${targetCount}`);

        if (containers.length === 0) {
            throw new Error('No image containers found on page');
        }

        // Process each container with improved click handling
        let successCount = 0;
        
        for (let i = 0; i < targetCount; i++) {
            try {
                log.info(`🖱️ Processing image ${i + 1}/${targetCount}`);

                const container = containers[i];
                
                // Scroll container into view
                await container.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
                await waitForTimeout(page, 200);

                // Click the container
                await container.click();
                await waitForTimeout(page, 1000);

                // Wait for the sidebar/modal to load with multiple possible selectors
                let sidebarFound = false;
                const sidebarSelectors = [
                    'div[data-vab] img[src*="http"]',  // New Google Images interface
                    '.YsLeY img[src*="http"]',         // Main sidebar container
                    '.c7cjWc img[src*="http"]',        // Alternative container
                    'img[jsname="kn3ccd"]',            // Main image element
                    '.sFlh5c.FyHeAf.iPVvYb',          // Image container
                    '.r48jcc.pT0Scc img',             // Another possible selector
                    'div[role="dialog"] img[src*="http"]' // Modal dialog images
                ];

                // Try each selector
                for (const selector of sidebarSelectors) {
                    try {
                        await page.waitForSelector(selector, { timeout: 1500 });
                        sidebarFound = true;
                        log.info(`✅ Found sidebar with selector: ${selector}`);
                        break;
                    } catch (e) {
                        continue;
                    }
                }

                if (!sidebarFound) {
                    log.warn(`❌ Skip ${i + 1}: No sidebar found after click`);
                    continue;
                }

                // FIXED: Extract image data with improved URL extraction
                const imageData = await page.evaluate(() => {
                    // Function to check if URL is a high-quality image URL
                    const isHighQualityUrl = (url) => {
                        if (!url || !url.startsWith('http')) return false;
                        
                        // Avoid thumbnail and low-quality URLs
                        const lowQualityPatterns = [
                            'encrypted-tbn',
                            'gstatic.com/images?q=tbn',
                            'fonts.gstatic.com',
                            'ssl.gstatic.com/ui'
                        ];
                        
                        return !lowQualityPatterns.some(pattern => url.includes(pattern));
                    };

                    let imageUrl = null;
                    let sourceUrl = null;
                    let title = '';
                    let width = 800;
                    let height = 600;

                    // Priority order for finding the best image URL
                    const imageSelectors = [
                        // High priority - direct high quality images in the new interface
                        'div[data-vab] img[src*="http"]',
                        '.YsLeY img[src*="http"]',
                        '.c7cjWc img[src*="http"]',
                        'img[jsname="kn3ccd"][src*="http"]',
                        '.sFlh5c.FyHeAf.iPVvYb[src*="http"]',
                        '.r48jcc.pT0Scc img[src*="http"]',
                        'div[role="dialog"] img[src*="http"]',
                        // Fallback - any large image in the sidebar area
                        'div[jsaction*="click"] img[src*="http"]',
                        'img[src*="http"]'
                    ];

                    // Find the highest quality image available
                    for (const selector of imageSelectors) {
                        const imgs = document.querySelectorAll(selector);
                        
                        for (const img of imgs) {
                            if (!img.src || !img.src.startsWith('http')) continue;
                            
                            // Check if this is a high-quality URL
                            if (isHighQualityUrl(img.src)) {
                                // Prefer larger images
                                const imgWidth = img.naturalWidth || img.width || 0;
                                const imgHeight = img.naturalHeight || img.height || 0;
                                
                                if (imgWidth >= 200 && imgHeight >= 200) {
                                    imageUrl = img.src;
                                    width = imgWidth;
                                    height = imgHeight;
                                    title = img.alt || img.title || '';
                                    
                                    console.log(`Found high-quality image: ${imageUrl.substring(0, 60)}... (${width}x${height})`);
                                    break;
                                }
                            }
                        }
                        
                        if (imageUrl) break; // Found good URL, stop looking
                    }

                    // If no high-quality URL found, use any available URL as fallback
                    if (!imageUrl) {
                        const allImgs = document.querySelectorAll('img[src*="http"]');
                        for (const img of allImgs) {
                            if (img.src && img.src.startsWith('http') && img.src.length > 50) {
                                const imgWidth = img.naturalWidth || img.width || 0;
                                const imgHeight = img.naturalHeight || img.height || 0;
                                
                                if (imgWidth >= 150 && imgHeight >= 150) {
                                    imageUrl = img.src;
                                    width = imgWidth;
                                    height = imgHeight;
                                    title = img.alt || img.title || '';
                                    
                                    console.log(`Fallback image found: ${imageUrl.substring(0, 60)}... (${width}x${height})`);
                                    break;
                                }
                            }
                        }
                    }

                    // Find source page URL
                    const sourceSelectors = [
                        'a[href*="http"]:not([href*="google.com"]):not([href*="javascript"])',
                        '.YsLeY[href*="http"]',
                        'a[data-ved][href*="http"]:not([href*="google.com"])',
                        'div[data-vab] a[href*="http"]:not([href*="google.com"])'
                    ];

                    for (const selector of sourceSelectors) {
                        const link = document.querySelector(selector);
                        if (link && link.href && !link.href.includes('google.com') && !link.href.includes('javascript:')) {
                            sourceUrl = link.href;
                            break;
                        }
                    }

                    // Get title from various sources
                    if (!title) {
                        const titleSelectors = [
                            'h1',
                            '.Hnk30e',
                            '.tE7R7',
                            '.MMgsKf',
                            'div[data-vab] div[role="button"]',
                            '[data-attrid="title"] h3'
                        ];

                        for (const selector of titleSelectors) {
                            const titleEl = document.querySelector(selector);
                            if (titleEl && titleEl.textContent && titleEl.textContent.trim()) {
                                title = titleEl.textContent.trim();
                                break;
                            }
                        }
                    }

                    console.log(`Final extraction result:`, {
                        hasImageUrl: !!imageUrl,
                        imageUrlPreview: imageUrl ? imageUrl.substring(0, 80) + '...' : 'null',
                        sourceUrl: sourceUrl || 'Not found',
                        title: title || 'No title',
                        dimensions: `${width}x${height}`,
                        isHighQuality: imageUrl ? isHighQualityUrl(imageUrl) : false
                    });

                    return imageUrl ? {
                        imageUrl,
                        sourceUrl: sourceUrl || imageUrl,
                        title: title || 'Google Image',
                        width,
                        height,
                        isHighQuality: isHighQualityUrl(imageUrl)
                    } : null;
                });

                if (imageData && imageData.imageUrl) {
                    const imageId = `google_fixed_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 6)}`;

                    images.push({
                        id: imageId,
                        title: `${imageData.title} - ${query}`,
                        url: `/api/proxy-image?url=${encodeURIComponent(imageData.imageUrl)}`,
                        downloadUrl: imageData.imageUrl,
                        sourcePageUrl: imageData.sourceUrl,
                        source: 'Google Images',
                        width: imageData.width,
                        height: imageData.height,
                        size: estimateFileSize(imageData.width, imageData.height),
                        copyright: {
                            status: 'unknown',
                            license: 'Various',
                            description: 'Copyright varies. Check source.',
                            canUseCommercially: false,
                            requiresAttribution: true
                        },
                        photographer: 'Various',
                        tags: [query],
                        extractionMethod: 'fixed_sidebar_click',
                        debugInfo: {
                            isHighQuality: imageData.isHighQuality,
                            originalUrl: imageData.imageUrl,
                            hasSourcePage: imageData.imageUrl !== imageData.sourceUrl,
                            processingIndex: i,
                            urlLength: imageData.imageUrl.length
                        }
                    });

                    successCount++;
                    log.info(`✅ Success ${successCount}: ${imageData.isHighQuality ? 'HQ' : 'Standard'} - ${imageData.title.substring(0, 40)}... - URL: ${imageData.imageUrl.substring(0, 60)}...`);

                } else {
                    log.warn(`❌ No valid image data extracted for ${i + 1}`);
                }

                // Small delay between processing
                await waitForTimeout(page, 300);

                // Stop if we've reached limit
                if (images.length >= limit) {
                    log.info(`🎯 Reached target limit of ${limit} images`);
                    break;
                }

            } catch (error) {
                log.warn(`⚠️ Error processing image ${i + 1}: ${error.message}`);
                continue;
            }
        }

        const highQualityCount = images.filter(img => img.debugInfo?.isHighQuality).length;
        const standardCount = images.length - highQualityCount;

        log.info(`🏆 Google Images extraction completed:`);
        log.info(`   📊 Total: ${images.length}/${targetCount} (${((images.length/targetCount)*100).toFixed(1)}% success)`);
        log.info(`   ✨ High quality URLs: ${highQualityCount}`);
        log.info(`   📷 Standard URLs: ${standardCount}`);

        return images.slice(0, limit);

    } catch (error) {
        log.error('🚨 Google Images search error:', {
            message: error.message,
            query,
            limit
        });
        return [];
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (e) {}
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
                            const sourcePageUrl = data.purl || data.hostPageUrl || imageUrl; // Bing provides purl for source page

                            if (imageUrl && !seenUrls.has(imageUrl) && imageUrl.startsWith('http')) {
                                seenUrls.add(imageUrl);
                                results.push({
                                    url: imageUrl,
                                    sourcePageUrl: sourcePageUrl, // Add source page URL
                                    title: data.t || data.alt || data.desc || `Bing Image ${results.length + 1}`,
                                    width: parseInt(data.w) || parseInt(data.width) || 800,
                                    height: parseInt(data.h) || parseInt(data.height) || 600,
                                    source: 'bing_metadata'
                                });
                                console.log(`Added metadata image: ${imageUrl.substring(0, 50)}... from page: ${sourcePageUrl.substring(0, 50)}...`);
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
                                        sourcePageUrl: src, // For fallback, use image URL
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
                        sourcePageUrl: src,
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
                    sourcePageUrl: item.sourcePageUrl || item.url, // Add source page URL
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
            sourcePageUrl: `https://www.pexels.com/photo/${photo.id}/`, // Pexels photo page
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

        // Add URL validation to all search results
        const validatedResults = results.filter(result => {
            const cleanUrl = validateAndCleanUrl(result.downloadUrl);
            if (cleanUrl) {
                result.downloadUrl = cleanUrl;
                return true;
            }
            return false;
        });

        log.info(`Pexels search completed: ${validatedResults.length} valid results (${results.length - validatedResults.length} filtered out)`);
        return validatedResults;
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
            sourcePageUrl: image.pageURL || `https://pixabay.com/photos/id-${image.id}/`, // Pixabay photo page
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

        // Add URL validation to all search results
        const validatedResults = results.filter(result => {
            const cleanUrl = validateAndCleanUrl(result.downloadUrl);
            if (cleanUrl) {
                result.downloadUrl = cleanUrl;
                return true;
            }
            return false;
        });

        log.info(`Pixabay search completed: ${validatedResults.length} valid results (${results.length - validatedResults.length} filtered out)`);
        return validatedResults;
    } catch (error) {
        log.error('Pixabay search error:', error);
        return [];
    }
};

// Unsplash API with detailed logging and validation
const searchUnsplash = async (query, limit = 50) => {
    try {
        if (API_KEYS.UNSPLASH_ACCESS_KEY === 'demo_key') {
            log.warn('Unsplash API key not configured, skipping');
            return [];
        }

        log.info(`Searching Unsplash for: ${query} (limit: ${limit})`);

        const response = await axios.get('https://api.unsplash.com/search/photos', {
            params: {
                query,
                per_page: Math.min(limit, 50)
            },
            headers: {
                'Authorization': `Client-ID ${API_KEYS.UNSPLASH_ACCESS_KEY}`
            },
            timeout: 10000
        });

        const results = response.data.results.map(photo => ({
            id: `unsplash_${photo.id}`,
            title: photo.description || photo.alt_description || `Photo by ${photo.user.name}`,
            url: `/api/proxy-image?url=${encodeURIComponent(photo.urls.small)}`,
            downloadUrl: photo.urls.full,
            sourcePageUrl: photo.links.html, // Unsplash provides direct photo page URL
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
            tags: photo.tags ? photo.tags.map(tag => tag.title) : [query]
        }));

        // Add URL validation to all search results
        const validatedResults = results.filter(result => {
            const cleanUrl = validateAndCleanUrl(result.downloadUrl);
            if (cleanUrl) {
                result.downloadUrl = cleanUrl;
                return true;
            }
            return false;
        });

        log.info(`Unsplash search completed: ${validatedResults.length} valid results (${results.length - validatedResults.length} filtered out)`);
        return validatedResults;
    } catch (error) {
        log.error('Unsplash search error:', error);
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
                sourcePageUrl: image.url || image.image, // DuckDuckGo provides source URL
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

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Helper function to normalize URLs for comparison
const normalizeUrlForComparison = (url) => {
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
const calculateStringSimilarity = (str1, str2) => {
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

// Function to execute concurrent searches across all sources
const executeMultiSourceSearch = async (query, limit) => {
    const totalSources = 8;
    const perSourceLimit = Math.ceil(limit / 6);

    log.info(`Starting equal-priority search for "${query}" with ${perSourceLimit} limit per source`);

    // Define all sources with per-source allocation
    const allSources = [
        { name: 'Pexels', fn: searchPexels, limit: perSourceLimit },
        { name: 'Pixabay', fn: searchPixabay, limit: perSourceLimit },
        { name: 'Unsplash', fn: searchUnsplash, limit: perSourceLimit },
        { name: 'Wikimedia', fn: searchWikimedia, limit: perSourceLimit },
        { name: 'Google', fn: searchGoogleImages, limit: Math.ceil(limit * 0.3) },
        { name: 'Bing', fn: searchBingImages, limit: Math.ceil(limit * 0.3) },
        { name: 'DuckDuckGo', fn: searchDuckDuckGoImages, limit: perSourceLimit }
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
    return { searchResults, perSourceLimit, totalSources };
};

// Function to combine and validate search results
const combineSearchResults = (searchResults) => {
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
    log.info('Per-source results:', sourceStats);

    return { allResults, sourceStats, performanceStats };
};

// Enhanced deduplication function with fixed logic
const deduplicateWithSourceMerging = (allResults) => {
    log.info('Starting deduplication with source merging...');

    const mergedResults = new Map();
    const urlToKeyMap = new Map(); // Maps normalized URLs to their Map keys

    // Process ALL results and merge duplicates
    for (const result of allResults) {
        const originalUrl = result.downloadUrl;
        const normalizedUrl = normalizeUrlForComparison(originalUrl);
        const normalizedTitle = result.title?.toLowerCase().trim().substring(0, 100) || '';

        // Skip if URL is invalid
        if (!normalizedUrl || normalizedUrl.length < 5) {
            log.debug(`Skipping invalid URL: ${originalUrl}`);
            continue;
        }

        if (result.source == 'Google Images') {
            log.info(`Processing Google Images result: originalUrl = ${originalUrl}, title = ${result.title}, normalizedUrl = ${normalizedUrl}`);
        }

        let foundDuplicate = false;
        let existingMapKey = null;

        // Check for exact URL matches first (fastest and most reliable)
        if (urlToKeyMap.has(normalizedUrl)) {
            foundDuplicate = true;
            existingMapKey = urlToKeyMap.get(normalizedUrl);
            if (result.source == 'Google Images') {
                log.info(`URL duplicate for Google Image, title: ${result.title}`);
            }
            log.debug(`Found exact URL duplicate: ${normalizedUrl.substring(0, 50)}...`);
        } else {
            // Check for similar URLs and titles - ONLY for very high similarity
            for (const [existingNormalizedUrl, existingMapKey_] of urlToKeyMap) {
                if (foundDuplicate) break;

                const existingResult = mergedResults.get(existingMapKey_);
                if (!existingResult) continue;

                // Only check URL similarity if URLs are very similar (high threshold)
                const urlSimilarity = calculateStringSimilarity(normalizedUrl, existingNormalizedUrl);
                if (urlSimilarity > 0.95) {
                    foundDuplicate = true;
                    existingMapKey = existingMapKey_;

                    if (result.source == 'Google Images') {
                        log.info(`URL similarity for Google Image, title: ${result.title}`);
                    }
                    log.debug(`Found URL similarity duplicate: ${urlSimilarity.toFixed(3)} similarity`);
                    break;
                }

                // Check title similarity ONLY for same source with very high similarity
                if (result.source === existingResult.originalSource &&
                    normalizedTitle && existingResult.title &&
                    normalizedTitle.length > 15 && existingResult.title.length > 15) {

                    const existingNormalizedTitle = existingResult.title.toLowerCase().trim().substring(0, 100);
                    const titleSimilarity = calculateStringSimilarity(normalizedTitle, existingNormalizedTitle);
                    if (titleSimilarity > 0.95) {
                        if (result.source == 'Google Images') {
                            log.info(`Title similarity for Google Image, title: "${result.title}" ~ "${existingResult.title}" (${titleSimilarity.toFixed(3)})`);
                        }

                        foundDuplicate = true;
                        existingMapKey = existingMapKey_;
                        log.debug(`Found title similarity duplicate: ${titleSimilarity.toFixed(3)} similarity`);
                        break;
                    }
                }
            }
        }

        if (foundDuplicate && existingMapKey) {
            // Verify the existing result actually exists
            const existingResult = mergedResults.get(existingMapKey);

            if (existingResult) {
                // SUCCESSFUL MERGE - Add source if not already present
                if (!existingResult.sources.includes(result.source)) {
                    existingResult.sources.push(result.source);
                    existingResult.sourceCount = existingResult.sources.length;

                    // Update title to reflect multiple sources
                    existingResult.title = `${existingResult.originalTitle} (${existingResult.sources.join(', ')})`;

                    // Keep the best quality image URL
                    const currentSize = existingResult.width * existingResult.height;
                    const newSize = result.width * result.height;

                    if (newSize > currentSize ||
                        (result.source.includes('Pexels') || result.source.includes('Unsplash') || result.source.includes('Pixabay'))) {
                        existingResult.downloadUrl = originalUrl;
                        existingResult.url = result.url;
                        existingResult.width = result.width;
                        existingResult.height = result.height;
                        existingResult.size = result.size;
                    }

                    // Merge copyright info (prefer free licenses)
                    if (result.copyright.status === 'free' && existingResult.copyright.status !== 'free') {
                        existingResult.copyright = result.copyright;
                    }

                    // Update photographer info
                    if (result.photographer && result.photographer !== 'Various' && existingResult.photographer === 'Various') {
                        existingResult.photographer = result.photographer;
                    }

                    log.debug(`✓ MERGED: ${result.source} into existing result. New sources: [${existingResult.sources.join(', ')}]`);
                } else {
                    log.debug(`⚠ Duplicate from same source ${result.source} - skipping`);
                }
            } else {
                log.warn(`⚠ Found duplicate but existingMapKey ${existingMapKey} not in Map - adding as new result`);
                foundDuplicate = false;
            }
        }

        if (!foundDuplicate) {
            // Add as new result
            const newMapKey = `${result.source}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Map the normalized URL to this key
            urlToKeyMap.set(normalizedUrl, newMapKey);

            // Create enhanced result with source tracking
            const enhancedResult = {
                ...result,
                originalTitle: result.title,
                sources: [result.source],
                sourceCount: 1,
                originalSource: result.source
            };

            mergedResults.set(newMapKey, enhancedResult);
            log.debug(`✓ ADDED: New result from ${result.source} (${normalizedUrl.substring(0, 40)}...)`);
        }
    }

    const uniqueResults = Array.from(mergedResults.values());

    // Log detailed statistics
    const sourceCount = {};
    uniqueResults.forEach(result => {
        result.sources.forEach(source => {
            sourceCount[source] = (sourceCount[source] || 0) + 1;
        });
    });

    log.info(`Deduplication completed. ${allResults.length} -> ${uniqueResults.length} unique results`);
    log.info('Final source distribution:', sourceCount);
    log.info(`Multi-source images: ${uniqueResults.filter(r => r.sourceCount > 1).length}`);

    return uniqueResults;
};

// Function to add encrypted IDs and final processing
const finalizeResults = (results) => {
    results.forEach(result => {
        // Add hashed ID for viewer
        result.hashedId = encryptImageData({
            id: result.id,
            title: result.title,
            url: result.url,
            downloadUrl: result.downloadUrl,
            sourcePageUrl: result.sourcePageUrl || result.downloadUrl,
            source: result.source,
            width: result.width,
            height: result.height,
            photographer: result.photographer
        });
    });

    // Shuffle results to ensure fair mixing of sources
    for (let i = results.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [results[i], results[j]] = [results[j], results[i]];
    }

    return results;
};

// Function to generate search summary and statistics
const generateSearchSummary = (query, finalResults, allResults, uniqueResults, performanceStats, perSourceLimit, totalSources) => {
    // Calculate final statistics
    const finalStats = {};
    finalResults.forEach(result => {
        finalStats[result.source] = (finalStats[result.source] || 0) + 1;
    });

    // Calculate total search time
    const totalSearchTime = Math.max(...Object.values(performanceStats).map(s => s.duration));
    const avgSearchTime = Object.values(performanceStats).reduce((sum, s) => sum + s.duration, 0) / totalSources;

    return {
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
};

// Main search endpoint
app.get('/api/search', async (req, res) => {
    try {
        const { query, limit = 100 } = req.query;

        if (!query) {
            return res.status(400).json({ error: 'Query parameter is required' });
        }

        // Execute multi-source search
        const { searchResults, perSourceLimit, totalSources } = await executeMultiSourceSearch(query, limit);

        // Combine all results
        const { allResults, sourceStats, performanceStats } = combineSearchResults(searchResults);

        // Deduplicate with source merging
        const uniqueResults = deduplicateWithSourceMerging(allResults);

        // Finalize results
        const finalResults = finalizeResults(uniqueResults);

        // Generate summary
        const summary = generateSearchSummary(query, finalResults, allResults, uniqueResults, performanceStats, perSourceLimit, totalSources);

        log.info('Equal-priority search completed successfully:', {
            query,
            totalResults: finalResults.length,
            totalTime: summary.performance.totalTime,
            sourcesUsed: Object.keys(summary.sources).length,
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
    const MAX_RETRIES = 2;
    const TIMEOUT_MS = 45000; // Longer timeout for downloads

    try {
        const { id } = req.params;
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({ error: 'URL parameter is required' });
        }

        if (!url.match(/^https?:\/\/.+/)) {
            return res.status(400).json({ error: 'Invalid URL format' });
        }

        log.info('Download request:', { id, url: url.substring(0, 100) + '...' });

        // Retry logic for downloads
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

                const response = await axios.get(url, {
                    responseType: 'stream',
                    headers: {
                        'User-Agent': getRandomUserAgent(),
                        'Accept': 'image/*,*/*',
                        'Referer': 'https://www.google.com/',
                        'Connection': 'keep-alive'
                    },
                    timeout: TIMEOUT_MS,
                    maxRedirects: 5,
                    signal: controller.signal,
                    validateStatus: (status) => status < 400
                });

                clearTimeout(timeoutId);

                // Validate content type
                const contentType = response.headers['content-type'];
                if (!contentType || !contentType.startsWith('image/')) {
                    if (attempt === MAX_RETRIES) {
                        return res.status(400).json({ error: 'Invalid file type' });
                    }
                    continue;
                }

                // Determine file extension
                const extension = contentType.split('/')[1]?.split(';')[0] ||
                    url.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i)?.[1] ||
                    'jpg';

                // Set download headers
                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(id)}.${extension}"`);
                res.setHeader('Cache-Control', 'no-cache');

                // Handle stream errors
                let downloadStarted = false;

                response.data.on('data', () => {
                    downloadStarted = true;
                });

                response.data.on('error', (streamError) => {
                    log.error('Download stream error:', streamError);
                    if (!res.headersSent && !downloadStarted) {
                        res.status(500).json({ error: 'Download stream failed' });
                    }
                });

                response.data.on('end', () => {
                    log.info('Download completed:', { id });
                });

                response.data.pipe(res);
                return; // Success, exit retry loop

            } catch (axiosError) {
                log.warn(`Download attempt ${attempt} failed:`, {
                    id,
                    error: axiosError.message,
                    status: axiosError.response?.status,
                    code: axiosError.code
                });

                // Don't retry on certain errors
                if (axiosError.response?.status === 404 ||
                    axiosError.response?.status === 403 ||
                    axiosError.code === 'ERR_INVALID_URL') {
                    break;
                }

                // Wait before retry
                if (attempt < MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }

        // All retries failed
        log.error('All download retry attempts failed:', { id });
        res.status(500).json({ error: 'Failed to download image after retries' });

    } catch (error) {
        log.error('Download error:', error);
        res.status(500).json({ error: 'Failed to download image' });
    }
});

// Image viewer endpoint - serves static HTML file
app.get('/view/:hashedId', (req, res) => {
    try {
        const { hashedId } = req.params;

        if (!hashedId || hashedId.length < 10) {
            return res.status(400).send('Invalid image ID');
        }

        log.info('Image viewer request:', { hashedId });

        // Serve the static HTML file
        res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
    } catch (error) {
        log.error('Image viewer error:', error);
        res.status(500).send('Internal server error');
    }
});

// API endpoint to get image data by hashed ID (keep this the same)
app.get('/api/image-data/:hashedId', async (req, res) => {
    try {
        const { hashedId } = req.params;

        if (!hashedId) {
            return res.status(400).json({ error: 'Hashed ID is required' });
        }

        // Decrypt the hashed ID to get the original image data
        const imageData = decryptImageId(hashedId);

        if (!imageData) {
            return res.status(404).json({ error: 'Image not found' });
        }

        log.info('Image data requested:', { hashedId, title: imageData.title });

        res.json(imageData);
    } catch (error) {
        log.error('Image data API error:', error);
        res.status(500).json({ error: 'Failed to retrieve image data' });
    }
});

// Helper function to sanitize filename
function sanitizeFilename(filename) {
    return filename.replace(/[^a-zA-Z0-9-_\.]/g, '_').substring(0, 100);
}

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
            'Web Scraping': ['Google Images', 'Bing Images', 'DuckDuckGo Images']
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
            case 'unsplash':
                results = await searchUnsplash(query, limit);
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
            default:
                return res.status(400).json({ error: 'Unknown source. Available: pexels, pixabay, unsplash, wikimedia, google, bing, duckduckgo' });
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
    log.info(`Enhanced Image Search API Server v3.0 running on port ${PORT}. URL: http://localhost:${PORT}`);
    log.info(`Health check: http://localhost:${PORT}/health`);
    log.info(`Main search: http://localhost:${PORT}/api/search?query=cats&limit=100`);
    log.info(`Test sources: http://localhost:${PORT}/api/test/pexels?query=dogs&limit=5`);
    log.info(`Sources: Google Images, Bing Images, DuckDuckGo Images, Wikimedia Commons, Pexels, Pixabay, Unsplash`);
    log.info(`Features: Progressive search, Guaranteed results, Comprehensive logging`);

    // Log API status
    const configuredApis = Object.entries(API_KEYS)
        .filter(([key, value]) => value !== 'demo_key')
        .map(([key]) => key);

    if (configuredApis.length > 0) {
        log.info(`Configured APIs: ${configuredApis.join(', ')}`);
    } else {
        log.warn('No API keys configured. Only web scraping and placeholders will work.');
    }
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    log.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    log.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception:', error);
    process.exit(1);
});

module.exports = app;

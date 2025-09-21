# Universal Image Search App - Complete Setup Guide

A comprehensive image search application that fetches high-quality images from multiple sources with detailed copyright information, advanced filtering, and intelligent deduplication.

## 🌟 Key Features

### **Multi-Source Search**
- **7 Different Sources**: Google Images, Bing Images, DuckDuckGo Images, Wikimedia Commons, Pexels, Pixabay, and Unsplash
- **Concurrent Processing**: All sources searched simultaneously for maximum speed
- **Intelligent Fallbacks**: Automatic fallback strategies ensure consistent results

### **Advanced Image Management**
- **Smart Deduplication**: Removes duplicate images while preserving the best quality versions
- **Source Merging**: Tracks when the same image appears across multiple sources
- **Copyright Information**: Detailed licensing info for every image
- **High-Quality Downloads**: Full resolution images with proper file naming

### **Powerful Filtering System**
- **Source Filtering**: Filter by specific image sources
- **Resolution Filtering**: Small, Medium, Large, Extra Large categories
- **Orientation Filtering**: Landscape, Portrait, Square options  
- **Usage Rights Filtering**: Free to use, Attribution required, Commercial use
- **Real-time Filter Application**: Instant results without re-searching

### **Enhanced User Experience**
- **Responsive Design**: Works perfectly on desktop and mobile
- **Image Viewer**: Dedicated viewer with download and source links
- **Progress Tracking**: Real-time search progress and statistics
- **Error Handling**: Comprehensive error handling with user-friendly messages
- **Performance Metrics**: Detailed search performance statistics

### **Developer Features**
- **Rate Limiting**: Built-in protection against abuse
- **Comprehensive Logging**: Detailed logs for debugging and monitoring
- **Health Monitoring**: System health checks and API status monitoring
- **Test Endpoints**: Individual source testing capabilities
- **CORS Handling**: Proper cross-origin request handling

## 📋 Prerequisites

- **Node.js 18+** installed on your system
- **NPM** package manager (comes with Node.js)
- API keys from image providers (free tiers available)
- Basic knowledge of running Node.js applications

## 🚀 Complete Setup Instructions

### 1. Project Structure Setup

Create your project directory and files:

```bash
mkdir image-search-app
cd image-search-app

# Create the required directory structure
mkdir public
mkdir public/css
mkdir public/js
```

Your final structure should look like this:
```
image-search-app/
├── index.js           (Main server file)
├── package.json       (Dependencies and scripts)
├── .env              (Environment variables)
├── README.md         (This file)
├── public/
│   ├── index.html    (Main web interface)
│   ├── viewer.html   (Image viewer page)
│   ├── css/
│   │   ├── main.css
│   │   └── viewer.css
│   └── js/
│       ├── main.js
│       └── viewer.js
```

### 2. Install Dependencies

```bash
# Initialize NPM project
npm init -y

# Install production dependencies
npm install express cors axios express-rate-limit helmet puppeteer dotenv

# Install development dependencies  
npm install -D nodemon
```

### 3. Get Free API Keys

#### **Unsplash API** (50 requests/hour free)
1. Go to https://unsplash.com/developers
2. Create an account and new application
3. Copy your **Access Key**
4. Note: Provides high-quality professional photos

#### **Pixabay API** (5,000 requests/month free) 
1. Go to https://pixabay.com/api/docs/
2. Create account and get API key
3. Copy your **API key**
4. Note: Large collection with various image types

#### **Pexels API** (200 requests/hour free)
1. Go to https://www.pexels.com/api/
2. Create account and generate API key  
3. Copy your **API key**
4. Note: High-quality stock photos

**Note**: Web scraping sources (Google Images, Bing Images, DuckDuckGo Images, Wikimedia Commons) don't require API keys.

### 4. Environment Configuration

Create a `.env` file in your project root:

```env
# API Keys (replace with your actual keys)
UNSPLASH_ACCESS_KEY=your_unsplash_access_key_here
PIXABAY_KEY=your_pixabay_key_here  
PEXELS_KEY=your_pexels_key_here

# Server Configuration
PORT=3001
NODE_ENV=development

# Security (change in production)
IMAGE_ENCRYPTION_KEY=your-secure-encryption-key-change-in-production-32chars
```

### 5. Add Package.json Scripts

Update your `package.json` to include:

```json
{
  "name": "image-search-app",
  "version": "1.0.0",
  "description": "Universal Image Search with Multiple Sources",
  "main": "index.js",
  "scripts": {
    "dev": "nodemon index.js",
    "start": "node index.js",
    "test": "node test.js"
  },
  "dependencies": {
    "axios": "^1.12.2",
    "cors": "^2.8.5", 
    "dotenv": "^17.2.2",
    "express": "^5.1.0",
    "express-rate-limit": "^8.1.0",
    "helmet": "^8.1.0",
    "puppeteer": "^24.22.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.10"
  }
}
```

### 6. Copy Application Files

You'll need to copy these files from the project (provided in the documents):
- `index.js` (main server file)
- `public/index.html` (main web interface)
- `public/viewer.html` (image viewer)

Create the CSS and JavaScript files for the frontend (you'll need to create these based on the HTML structure shown).

### 7. Start the Application

```bash
# Development mode (auto-restarts on file changes)
npm run dev

# Production mode
npm start
```

The server will start on http://localhost:3001

### 8. Access the Application

- **Main Search Interface**: http://localhost:3001
- **Health Check**: http://localhost:3001/health
- **API Documentation**: http://localhost:3001/api/search?query=cats&limit=50

## 🔧 API Reference

### Main Search Endpoint

```http
GET /api/search?query={search_term}&limit={number}
```

**Parameters:**
- `query` (required): Search term (e.g., "nature", "technology")
- `limit` (optional): Number of results (default: 100, max: 200)

**Example Response:**
```json
{
  "results": [
    {
      "id": "unsplash_abc123",
      "hashedId": "encrypted_viewer_id",
      "title": "Beautiful mountain landscape",
      "url": "/api/proxy-image?url=...",
      "downloadUrl": "https://images.unsplash.com/photo-123/original",
      "sourcePageUrl": "https://unsplash.com/photos/abc123",
      "source": "Unsplash", 
      "sources": ["Unsplash", "Google Images"],
      "sourceCount": 2,
      "width": 4000,
      "height": 3000,
      "size": "2.5 MB",
      "copyright": {
        "status": "free",
        "license": "Unsplash License", 
        "description": "Free to use for any purpose",
        "canUseCommercially": true,
        "requiresAttribution": false
      },
      "photographer": "John Doe",
      "tags": ["nature", "mountain", "landscape"]
    }
  ],
  "summary": {
    "total": 89,
    "sources": {
      "Google Images": 25,
      "Pexels": 18,
      "Unsplash": 15,
      "Pixabay": 12,
      "Bing Images": 10,
      "Wikimedia Commons": 6,
      "DuckDuckGo Images": 3
    },
    "performance": {
      "totalTime": "3247ms",
      "averageTime": "1856ms",
      "concurrentSources": 7
    },
    "deduplication": {
      "beforeDedup": 156,
      "afterDedup": 89,
      "duplicatesRemoved": 67
    }
  }
}
```

### Other Endpoints

- `GET /health` - Server health check and API key status
- `GET /api/test/{source}?query={term}` - Test individual sources
- `GET /api/download/{id}?url={image_url}` - Download proxy
- `GET /view/{hashedId}` - Image viewer page
- `GET /api/proxy-image?url={image_url}` - Image proxy for CORS

## 🎨 Frontend Features

### Search Interface
- **Multi-source concurrent search** with real-time progress
- **Advanced filtering system** with source, resolution, orientation, and usage rights filters
- **Active filter management** with clear visual indicators
- **Results statistics** showing total images, free images, and source breakdown

### Image Grid
- **Responsive masonry layout** that adapts to screen size
- **Lazy loading** for optimal performance
- **Copyright status indicators** with color-coded badges
- **Quick actions** for view, download, and source links
- **Hover effects** with image details overlay

### Image Viewer
- **Full-screen image display** with proper aspect ratio handling
- **Direct download functionality** with proper file naming
- **Source page links** to original image locations
- **Image metadata display** including dimensions and photographer info

## 🛡️ Security & Performance

### Security Features
- **Rate Limiting**: 200 requests per 15 minutes per IP address
- **Input Validation**: Query parameter sanitization and validation
- **CORS Protection**: Configurable cross-origin policies
- **Security Headers**: Helmet.js integration for security headers
- **URL Validation**: Comprehensive URL validation and cleanup
- **Error Handling**: Graceful error handling without information leakage

### Performance Optimizations
- **Concurrent API Calls**: All sources searched simultaneously
- **Connection Pooling**: HTTP agent with keep-alive connections
- **Smart Retry Logic**: Exponential backoff for failed requests  
- **Image Proxy Caching**: Efficient image serving with caching headers
- **Memory Management**: Proper cleanup of browser instances and streams
- **Request Deduplication**: Intelligent duplicate removal

## 📊 Search Algorithm

### Multi-Phase Search Strategy
1. **Concurrent Execution**: All 7 sources searched simultaneously
2. **Equal Priority**: Each source gets equal allocation (e.g., ~14 images each for 100 total)
3. **Results Combination**: All results merged into a single collection
4. **Smart Deduplication**: Removes duplicates while preserving best quality
5. **Source Tracking**: Tracks which sources provided each image
6. **Final Shuffling**: Results shuffled to ensure fair source mixing

### Deduplication Logic
- **URL Normalization**: Standardizes URLs for comparison
- **Similarity Detection**: Finds near-duplicate images using URL and title similarity
- **Quality Preservation**: Keeps the highest quality version of duplicates
- **Source Merging**: Tracks all sources that provided the same image
- **Metadata Merging**: Combines copyright info, preferring free licenses

## 🚀 Deployment Options

### Using Heroku

```bash
# Install Heroku CLI and login
heroku create your-image-search-app

# Set environment variables
heroku config:set UNSPLASH_ACCESS_KEY=your_key_here
heroku config:set PIXABAY_KEY=your_key_here
heroku config:set PEXELS_KEY=your_key_here
heroku config:set IMAGE_ENCRYPTION_KEY=your_secure_key_here

# Add Puppeteer buildpack
heroku buildpacks:add jontewks/puppeteer

# Deploy
git push heroku main
```

### Using Local Production Server

For production deployment on your own server:

```bash
# Install PM2 for process management
npm install -g pm2

# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'image-search-app',
    script: 'index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save
pm2 startup
```

### Using Render

1. Connect your GitHub repository to Render
2. Create a new Web Service
3. Set build command: `npm install`
4. Set start command: `npm start`  
5. Add environment variables in Render dashboard:
   - `UNSPLASH_ACCESS_KEY`
   - `PIXABAY_KEY`
   - `PEXELS_KEY`
   - `IMAGE_ENCRYPTION_KEY`

## 🔍 Troubleshooting

### Common Issues

**"Module not found" errors**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

**"Backend API unavailable"**
- Verify server is running on port 3001
- Check console for detailed error messages
- Ensure all dependencies are installed

**Puppeteer installation issues**
```bash
# On Linux/Ubuntu
sudo apt-get install -y gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2

# On macOS (if using M1/M2 Mac)
npm install puppeteer --platform=darwin --arch=arm64

# Alternative: Use system Chrome
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
```

**"No images found" or low results**
- Try different search terms
- Check if API keys are valid and have remaining quota
- Verify internet connection and firewall settings
- Check server logs for specific error messages

**Memory issues with large searches**
```bash
# Increase Node.js memory limit
node --max-old-space-size=4096 index.js
```

### Testing Individual Sources

```bash
# Test each source individually
curl "http://localhost:3001/api/test/pexels?query=cats&limit=5"
curl "http://localhost:3001/api/test/google?query=dogs&limit=10"
curl "http://localhost:3001/api/test/wikimedia?query=nature&limit=8"

# Check overall health
curl "http://localhost:3001/health"
```

### Performance Monitoring

The application provides detailed performance metrics:
- **Search timing** for each source
- **Success/failure rates** per source
- **Deduplication statistics**
- **Memory usage** (in development mode)
- **Rate limiting status**

## 📝 Copyright & Usage Guidelines

### Using Search Results

**Always follow these guidelines:**

1. **Check Copyright Status**: Each image shows a copyright status badge
   - 🟢 **FREE USE**: Can be used for any purpose including commercial
   - 🟡 **ATTRIBUTION**: Free to use but requires crediting the author  
   - 🔴 **RESTRICTED**: Limited usage rights, check individual license
   - ⚪ **CHECK LICENSE**: Unknown status, verify before using

2. **Read License Requirements**: Click "Go to Website" to see full licensing terms

3. **Respect Attribution Requirements**: When required, credit the photographer and source

4. **Commercial Use**: Verify commercial usage rights for business applications

5. **Bulk Usage**: For large-scale usage, consider contacting the source platform

### License Types Explained

- **Unsplash License**: Free for any use, no attribution required
- **Pixabay License**: Free for commercial use, attribution appreciated but not required
- **Pexels License**: Free to use, attribution to photographer appreciated
- **Creative Commons (Wikimedia)**: Various CC licenses, usually requires attribution
- **Various (Scraped Sources)**: Copyright varies by individual image, always verify

## 🤝 Contributing

### Development Setup

```bash
# Fork the repository and clone
git clone https://github.com/yourusername/image-search-app.git
cd image-search-app

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env with your API keys

# Start in development mode
npm run dev
```

### Adding New Sources

1. **Create search function** in `index.js`
2. **Add to source list** in the concurrent search function
3. **Update frontend filters** in `public/index.html` and JavaScript
4. **Add test endpoint** support
5. **Update documentation**

### Code Style Guidelines

- Use **ES6+ features** where appropriate
- **Comprehensive error handling** for all async operations
- **Detailed logging** with structured log messages
- **Input validation** for all user inputs
- **Security best practices** for all external requests

## 📞 Support & Resources

### Getting Help

1. **Check the troubleshooting section** above
2. **Review server logs** for detailed error messages
3. **Test individual API endpoints** using curl or Postman
4. **Check browser console** for frontend errors
5. **Verify API key validity** using provider documentation

### Useful Resources

- **Unsplash API Docs**: https://unsplash.com/documentation
- **Pixabay API Docs**: https://pixabay.com/api/docs/
- **Pexels API Docs**: https://www.pexels.com/api/documentation/
- **Puppeteer Documentation**: https://pptr.dev/
- **Express.js Documentation**: https://expressjs.com/

### Performance Tuning

For high-traffic deployments:
- **Implement Redis caching** for API responses
- **Use CDN** for static assets
- **Add load balancing** for multiple instances
- **Monitor memory usage** and adjust limits
- **Implement request queuing** for rate limit management

---

**Happy Searching! 🔍📸**

*This application aggregates images from multiple sources with respect for copyright and attribution requirements. Always verify usage rights before using images in commercial applications.*
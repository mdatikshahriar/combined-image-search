# Universal Image Search App - Complete Setup Guide

This is a complete image search application that fetches high-quality images from multiple sources with detailed copyright information.

## 🌟 Features

- **Multiple Sources**: Unsplash, Pixabay, Pexels, Wikimedia Commons
- **Copyright Information**: Detailed licensing info for each image
- **High Quality**: Full resolution downloads
- **CORS Bypass**: Backend proxy handles API restrictions
- **Rate Limiting**: Built-in protection against abuse
- **Responsive Design**: Works on desktop and mobile
- **Free to Use**: No paid APIs required (free tiers available)

## 📋 Prerequisites

- Node.js 16+ installed
- API keys (free) from image providers
- Basic knowledge of running Node.js applications

## 🚀 Quick Start

### 1. Project Structure
Create the following folder structure:
```
image-search-app/
├── server.js          (Backend proxy server)
├── package.json       (Dependencies)
├── .env              (Environment variables)
├── public/
│   └── index.html    (Frontend application)
└── README.md
```

### 2. Backend Setup

#### Install Dependencies
```bash
npm install express cors axios express-rate-limit helmet puppeteer dotenv
npm install -D nodemon
```

#### Get Free API Keys

**Unsplash API** (30,000 requests/month free)
1. Go to https://unsplash.com/developers
2. Create an account and new application
3. Copy your Access Key

**Pixabay API** (Unlimited free requests)
1. Go to https://pixabay.com/api/docs/
2. Create account and get API key
3. Copy your API key

**Pexels API** (200 requests/hour free)
1. Go to https://www.pexels.com/api/
2. Create account and generate API key
3. Copy your API key

#### Environment Variables
Create `.env` file:
```env
# API Keys (replace with your actual keys)
UNSPLASH_ACCESS_KEY=your_unsplash_access_key_here
PIXABAY_KEY=your_pixabay_key_here  
PEXELS_KEY=your_pexels_key_here

# Server Configuration
PORT=3001
NODE_ENV=production
```

#### Start Backend Server
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

Server will run on http://localhost:3001

### 3. Frontend Setup

Save the HTML file as `public/index.html` and open it in a browser, or serve it using:

```bash
# Using Python (if you have it)
cd public
python -m http.server 8000

# Using Node.js http-server
npx http-server public -p 8000
```

Frontend will be available at http://localhost:8000

## 🔧 API Endpoints

### Backend Endpoints

- `GET /api/health` - Server health check
- `GET /api/unsplash/search?query=nature&per_page=20` - Unsplash images
- `GET /api/pixabay/search?query=nature&per_page=20` - Pixabay images  
- `GET /api/pexels/search?query=nature&per_page=20` - Pexels images
- `GET /api/wikimedia/search?query=nature&per_page=10` - Wikimedia images
- `GET /api/search/all?query=nature&per_page=100` - Combined search

### Example API Response
```json
{
  "query": "nature",
  "total": 50,
  "stats": {
    "freeImages": 45,
    "sources": 4,
    "bySource": {
      "Unsplash": 18,
      "Pixabay": 15,
      "Pexels": 12,
      "Wikimedia Commons": 5
    }
  },
  "results": [
    {
      "id": "unsplash_abc123",
      "title": "Beautiful mountain landscape",
      "url": "https://images.unsplash.com/photo-123/400x300",
      "downloadUrl": "https://images.unsplash.com/photo-123/original",
      "source": "Unsplash",
      "width": 4000,
      "height": 3000,
      "size": "2.5 MB",
      "copyright": {
        "status": "free",
        "license": "Unsplash License",
        "description": "Free to use for any purpose, including commercial use. No attribution required.",
        "canUseCommercially": true,
        "requiresAttribution": false
      },
      "photographer": "John Doe",
      "tags": ["nature", "mountain", "landscape"]
    }
  ]
}
```

## 📊 Copyright Information

The app provides detailed copyright information for each image:

### Copyright Statuses
- **🟢 FREE USE**: Can be used for any purpose including commercial
- **🟡 ATTRIBUTION**: Free to use but requires crediting the author
- **🔴 RESTRICTED**: Limited usage rights, check individual license
- **⚪ CHECK LICENSE**: Unknown status, verify before using

### License Types
- **Unsplash License**: Free for any use, no attribution required
- **Pixabay License**: Free for commercial use, attribution appreciated
- **Pexels License**: Free to use, attribution to photographer appreciated  
- **Creative Commons**: Various CC licenses, attribution usually required

## 🛡️ Security Features

- **Rate Limiting**: 100 requests per 15 minutes per IP
- **CORS Protection**: Configurable cross-origin policies
- **Input Validation**: Query parameter sanitization
- **Error Handling**: Graceful fallbacks for API failures
- **Helmet.js**: Security headers and protections

## 🚀 Deployment

### Using Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

### Using Heroku
```bash
# Install Heroku CLI and login
heroku create your-image-search-app
heroku config:set UNSPLASH_ACCESS_KEY=your_key_here
heroku config:set PIXABAY_KEY=your_key_here  
heroku config:set PEXELS_KEY=your_key_here
git push heroku main
```

### Using Vercel/Netlify
Deploy the frontend as static files and backend as serverless functions.

## 🔍 Troubleshooting

### Common Issues

**"Backend API unavailable"**
- Check if server is running on port 3001
- Verify API keys are set correctly
- Check console for detailed error messages

**"No images found"**  
- Try different search terms
- Check if API keys are valid and not expired
- Verify internet connection

**CORS Errors**
- Ensure backend server is running
- Check if frontend is trying to access correct backend URL
- Verify CORS is properly configured

### Testing API Keys
```bash
# Test Unsplash
curl "http://localhost:3001/api/unsplash/search?query=test&per_page=5"

# Test combined search  
curl "http://localhost:3001/api/search/all?query=nature&per_page=10"

# Health check
curl "http://localhost:3001/api/health"
```

## 📈 Performance Optimization

- **Image Lazy Loading**: Images load as user scrolls
- **Request Caching**: Backend can cache responses  
- **Image Optimization**: Thumbnails for grid, full size for download
- **Parallel API Calls**: Multiple sources fetched simultaneously
- **Error Resilience**: Fallback sources if primary APIs fail

## 🎨 Customization

### Adding New Sources
1. Add API integration in backend server
2. Update frontend source list
3. Add copyright information mapping
4. Test thoroughly

### UI Customization
- Modify CSS variables for colors and spacing
- Adjust grid layouts for different screen sizes  
- Add new UI components as needed
- Implement additional filters or sorting

## 📝 License & Usage

This application is provided as-is for educational and personal use. When using images from the search results:

1. **Always check the copyright information** provided with each image
2. **Follow the license requirements** (attribution, commercial use restrictions, etc.)
3. **Verify licensing** for critical commercial projects
4. **Respect photographers' rights** and platform terms of service

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📞 Support

For issues and questions:
- Check the troubleshooting section
- Review API documentation for each service
- Test with minimal examples
- Check browser console for errors

---

**Happy Searching! 🔍📸**

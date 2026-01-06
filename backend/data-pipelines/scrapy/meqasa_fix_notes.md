# Meqasa Spider Fix - JavaScript Rendering Required

## Problem
Meqasa website now uses JavaScript to load property listings dynamically. The current spider finds 0 properties because it's looking for static HTML content that doesn't exist.

## Root Cause Analysis
1. **Website migrated to SPA**: Meqasa now uses JavaScript to load property data
2. **Empty content container**: `<div id="listview">___</div>` is empty in static HTML
3. **Dynamic AJAX loading**: Properties are fetched via JavaScript after page load
4. **CSS selectors don't match**: Static selectors find no dynamic content

## Verified Evidence
- Database query shows 0 properties with PM-MEQASA- pattern
- Spider logs show "Found 0 properties on page X" for all pages
- HTML analysis shows empty `listview` container
- CSS classes exist in stylesheets but no actual property cards in HTML

## Solution Options

### Option 1: Scrapy-Splash (Recommended)
Install and configure Scrapy-Splash to render JavaScript:

```bash
# Install splash
docker run -p 8050:8050 scrapinghub/splash

# Add to settings.py
SPLASH_URL = 'http://localhost:8050'
DOWNLOADER_MIDDLEWARES = {
    'scrapy_splash.SplashCookiesMiddleware': 723,
    'scrapy_splash.SplashMiddleware': 725,
}
```

Update spider to use SplashRequest:
```python
from scrapy_splash import SplashRequest

def start_requests(self):
    for url in self.start_urls:
        yield SplashRequest(
            url=url,
            self.parse_listing,
            args={'wait': 3, 'html': 1}
        )
```

### Option 2: Find API Endpoints
Reverse engineer the AJAX endpoints that load property data:
1. Use browser dev tools to find XHR/Fetch requests
2. Call APIs directly without rendering JavaScript
3. Faster but requires maintenance when APIs change

### Option 3: Playwright/Selenium
Use browser automation to render JavaScript:
- More resource intensive than Splash
- Useful if Splash doesn't work properly

## Next Steps
1. **Immediate fix**: Implement Scrapy-Splash solution
2. **Test thoroughly**: Verify property data extraction works
3. **Update selectors**: May need to adjust CSS selectors for rendered content
4. **Monitor performance**: Splash adds overhead but enables dynamic scraping

## Status
- Current spider: BROKEN (0 properties extracted)
- Database impact: Missing 1000+ Meqasa properties 
- Data completeness: Only 3/4 sources working (GPC, Housemaster, Realtor International)
- Priority: HIGH - Major data source offline
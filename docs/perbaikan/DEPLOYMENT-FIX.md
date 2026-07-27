# ============================================
# DEPLOYMENT TROUBLESHOOTING GUIDE
# ============================================

ISSUE: Browser trying to load .tsx files directly (500 errors)
ROOT CAUSE: Production server serving old build or development index.html

SOLUTION STEPS:
--------------

1. Rebuild your Docker container on the production server:
   cd /path/to/soundpub-dashboard
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d

2. Verify the container is running:
   docker ps | grep soundpub-dashboard

3. Check logs for errors:
   docker logs soundpub-dashboard

4. Test the deployment:
   curl https://web.maskhar.com | grep "index-BPAlkDH8.js"
   
   Should see: <script type="module" crossorigin src="/assets/index-BPAlkDH8.js"></script>

VERIFICATION CHECKLIST:
-----------------------
✓ Dockerfile copies /app/dist to /usr/share/nginx/html
✓ nginx.conf serves from /usr/share/nginx/html
✓ dist/index.html contains bundled JS reference
✓ Build args passed in docker-compose.yml

COMMON MISTAKES:
----------------
× Not rebuilding after code changes
× Docker serving cached old build
× Missing environment variables during build
× Wrong nginx root directory


# Quick Reference - Media Library Fix

## 🚀 Quick Deploy Commands

### 1. Apply Database Migration
Login to Supabase Dashboard → SQL Editor → Run:
```sql
UPDATE storage.buckets SET public = false WHERE id = 'release-covers';
```

### 2. Deploy Code
```bash
npm run build
# Then deploy using your method (vercel/netlify/etc)
```

## 🔍 Quick Verification

### Check if working:
1. Open Media Library → Cover Images tab
2. Should see images with thumbnails
3. No "URL tidak tersedia" badges
4. Click "Scan Orphan Files" → Should show results

### Debug in Browser Console:
```
Total files found: X
Referenced URLs: Y
Orphan found: bucket:filename (if any)
```

## 🐛 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| "URL tidak tersedia" badge | Check console error, verify RLS policies |
| No files showing | Check auth, verify bucket permissions |
| Scan not working | Check console logs, verify database access |
| Signed URL error | Check bucket configuration in Supabase |

## 📞 Key Changes Made

**src/pages/MediaLibrary.tsx**:
- ✅ Added try-catch for signed URL generation
- ✅ Recursive file listing
- ✅ Null checks for URLs
- ✅ Console logging for debugging
- ✅ Improved orphan detection

**Database**:
- ✅ Migration to set release-covers as private

## 📚 Full Documentation

- **MEDIA_LIBRARY_FIX.md** - Complete technical details
- **TESTING_CHECKLIST.md** - Full testing guide

---
Fixed: July 26, 2026
Build: ✅ Success (29.04s)
Status: Ready for deployment

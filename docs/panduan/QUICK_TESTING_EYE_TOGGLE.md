# Quick Testing Guide - Royalty Eye Toggle

## 🧪 How to Test

### Step 1: Navigate to Page
1. Login to dashboard
2. Go to `/dashboard/royalty-summary`
3. Look at top right corner of page header

### Step 2: Verify Default State (Hidden)
✅ Should see button: **"👁️ Tampilkan Data"**
✅ All revenue values show: **"Rp ******"**
✅ All stream counts show: **"***"**
✅ Stats cards are masked
✅ All tables show masked values

### Step 3: Click to Show Data
1. Click the "👁️ Tampilkan Data" button
2. Button changes to: **"👁️‍🗨️ Sembunyikan Data"**

✅ All revenue values now show real numbers (e.g., "Rp 1.69Jt")
✅ All stream counts show real numbers (e.g., "1.44M")
✅ Stats cards show real values
✅ All tables show real values
✅ Chart tooltips show real values

### Step 4: Click to Hide Data Again
1. Click the "👁️‍🗨️ Sembunyikan Data" button
2. Button changes back to: **"👁️ Tampilkan Data"**

✅ All values are masked again
✅ Shows "Rp ******" and "***"

### Step 5: Test All Tabs
1. Go to "Per Platform" tab → Values should be masked
2. Click eye button → Values reveal
3. Go to "Per Label" tab → Values should stay revealed
4. Go to "Per Artist" tab → Values should stay revealed
5. Go to "Per Lagu" tab → Values should stay revealed
6. Click eye button again → All values masked

### Step 6: Chart Tooltip Test
1. Hover over revenue chart (if data exists)
2. When hidden: Tooltip shows "Rp ******"
3. Click eye button to show
4. Hover again: Tooltip shows real value

## 📸 Visual Checklist

### Hidden State (Default)
```
┌─────────────────────────────────────┐
│ Ringkasan Royalti                   │
│                            [👁️ Tampilkan Data] │
└─────────────────────────────────────┘

┌──────────────────┬──────────────────┐
│ Total Revenue    │ Total Streams    │
│ Rp ******        │ ***              │
└──────────────────┴──────────────────┘
```

### Shown State
```
┌─────────────────────────────────────┐
│ Ringkasan Royalti                   │
│                      [👁️‍🗨️ Sembunyikan Data] │
└─────────────────────────────────────┘

┌──────────────────┬──────────────────┐
│ Total Revenue    │ Total Streams    │
│ Rp 1.69Jt        │ 1.44M            │
└──────────────────┴──────────────────┘
```

## ⚠️ Expected Behaviors

### ✅ What Should Work
- Button toggles instantly (no loading)
- State persists across tab changes
- All tables update simultaneously
- Chart tooltips update
- Button text and icon change

### ❌ What Should NOT Happen
- No page reload
- No API calls when toggling
- State does NOT persist after page refresh
- Export CSV still exports real data (not masked)

## 🐛 Troubleshooting

| Issue | Check |
|-------|-------|
| Button not visible | Check if you're on `/dashboard/royalty-summary` |
| Values not masking | Check browser console for errors |
| Button not responding | Try hard refresh (Ctrl+F5) |
| Some values still shown | Check if they're using formatNumber() directly |

## 📱 Mobile Testing
- Button should be visible on mobile
- May wrap to second row on small screens
- Touch interaction should work
- All functionality same as desktop

## ✅ Testing Complete When:
- [x] Button visible in header
- [x] Default state is hidden (masked)
- [x] Click reveals all data
- [x] Click again hides all data
- [x] Works across all tabs
- [x] Chart tooltips respond to toggle
- [x] No console errors
- [x] Mobile responsive

---
**Pro Tip**: Test dengan layar yang bisa dilihat orang lain untuk memverifikasi privacy feature bekerja dengan baik! 👀

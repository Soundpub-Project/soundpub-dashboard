# Royalty Summary - Eye Toggle Feature

## 🎯 Feature Added

Added **Eye Toggle Button** to show/hide real royalty data on the Royalty Summary page.

## ✨ What's New

### Toggle Button
- **Location**: Top right corner of the page header
- **Icons**: 
  - 👁️ Eye icon = Show real data
  - 👁️‍🗨️ EyeOff icon = Hide data (masked)
- **Default State**: Data is hidden (masked) by default

### Data Masking
When data is hidden (eye closed):
- **Currency values**: Display as `Rp ******`
- **Number values**: Display as `***`

When data is shown (eye open):
- All real values are displayed normally

## 📊 Areas Protected

The following data is masked/unmasked:

### 1. Stats Cards (Top Summary)
- ✅ Total Revenue
- ✅ Total Streams
- ✅ Unique Tracks count (not masked)
- ✅ Unique Artists count (not masked)

### 2. Revenue Trend Chart
- ✅ Chart tooltip revenue values

### 3. Platform Breakdown (Per Platform Tab)
- ✅ Revenue column
- ✅ Streams column

### 4. Label Breakdown (Per Label Tab)
- ✅ Total Revenue
- ✅ Streams
- ✅ Artist Share
- ✅ Label Share
- ✅ Admin Share

### 5. Artist Breakdown (Per Artist Tab)
- ✅ Revenue
- ✅ Streams
- ✅ Artist Revenue
- ✅ Label Revenue
- ✅ Admin Revenue

### 6. Track Breakdown (Per Lagu Tab)
- ✅ Total Revenue
- ✅ Streams
- ✅ Artist Share
- ✅ Label Share
- ✅ Admin Share

## 🔧 Technical Implementation

### Files Modified
- `src/pages/RoyaltySummary.tsx`

### Key Changes

1. **Added Icons Import**
```typescript
import { Eye, EyeOff } from 'lucide-react';
```

2. **Added State Management**
```typescript
const [showRealData, setShowRealData] = useState(false);
```

3. **Added Masking Functions**
```typescript
const maskCurrency = (value: number) => {
  if (!showRealData) {
    return 'Rp ******';
  }
  return formatCurrency(value);
};

const maskNumber = (value: number) => {
  if (!showRealData) {
    return '***';
  }
  return formatNumber(value);
};
```

4. **Added Toggle Button**
```typescript
<Button
  variant="outline"
  size="sm"
  onClick={() => setShowRealData(!showRealData)}
  className="gap-2"
>
  {showRealData ? (
    <>
      <EyeOff className="h-4 w-4" />
      Sembunyikan Data
    </>
  ) : (
    <>
      <Eye className="h-4 w-4" />
      Tampilkan Data
    </>
  )}
</Button>
```

5. **Updated All Display Functions**
- Replaced `formatCurrency()` with `maskCurrency()` for revenue values
- Replaced `formatNumber()` with `maskNumber()` for stream counts

## 🎨 UI/UX

### Button States
- **Hidden State**: Shows "👁️ Tampilkan Data" with Eye icon
- **Visible State**: Shows "👁️‍🗨️ Sembunyikan Data" with EyeOff icon
- **Style**: Outline variant, small size, with icon and text

### Visual Feedback
- Masked values show as asterisks: `Rp ******` or `***`
- Real values display with proper formatting when revealed
- Instant toggle - no loading state needed

## 📱 Responsive Design
- Button is responsive and works on mobile/tablet/desktop
- Positioned in header with proper spacing

## 🔒 Security Notes
- State is client-side only (resets on page refresh)
- Data is still fetched from server (not a security feature)
- This is a **privacy feature** to prevent shoulder surfing
- Not intended as a security/access control mechanism

## 🚀 Usage

1. Open Royalty Summary page
2. Click eye button in top right
3. Toggle between hidden/shown states
4. All tables, charts, and stats update instantly

## ✅ Testing Checklist

- [x] Toggle button appears in header
- [x] Default state hides data (masked)
- [x] Clicking button reveals real data
- [x] Clicking again hides data
- [x] All stat cards use masking
- [x] All tables use masking
- [x] Chart tooltips use masking
- [x] Build successful
- [x] No TypeScript errors

## 📝 Future Enhancements (Optional)

- [ ] Save preference to localStorage
- [ ] Add blur effect to masked values
- [ ] Add transition animation when toggling
- [ ] Admin-only toggle (role-based)
- [ ] Export CSV respects masked state

---
**Feature Added**: 2026-07-26
**Build Status**: ✅ Success (11.73s)
**Ready for Deployment**: Yes

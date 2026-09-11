# Responsive trading dashboard

## Goal
Make the live contract-comparison dashboard centered, balanced, and usable from 320px phones through wide desktop screens, while keeping the CLOB grid as the primary view.

## Build
- Apply the selected Carbon + Emerald palette and Sora/Manrope typography through shared design tokens.
- Rebalance the top status bar and price tape so they stay centered, readable, and contained at every width.
- Rebuild the comparison area on one consistent column grid, with equal-height controls, centered values, stronger row rhythm, and no horizontal page scrolling.
- Keep both comparison modes: all timeframes for one coin and all coins for one timeframe.
- Make the active SMA direction visually clear and spotlight the cheapest aligned ask; give especially underpriced aligned asks below 25¢ a stronger “deal” treatment without inventing data.
- Preserve dedicated Grid, Chart, and Markets views on mobile; use the available width for the grid and supporting views on desktop.
- Tune chart and supporting panel sizing so each view fills available space without crowding or empty dead zones.

## Technical details
- Update semantic theme/font tokens rather than hardcoding colors in page components.
- Use stable responsive grid tracks and minimum touch heights to prevent shifting, clipping, and off-center labels.
- Keep current Coinbase and Polymarket data flows unchanged; this work only changes presentation and deterministic highlighting of existing live values.
- Verify at 320px, 393px, tablet, and desktop widths, including tab switching and overflow checks.

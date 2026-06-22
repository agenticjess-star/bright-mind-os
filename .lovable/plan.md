
## Goal

Strip everything that doesn't actually compute or display real data. Rebuild the main view around three real, linked panels driven by the same `(asset, timeframe)` selection: live coin chart (Coinbase WS), live contract bid/ask (existing CLOB WS), and a real SMA-crossover signal for Up/Down.

## What gets deleted (no replacements, no placeholders)

- `src/components/MonteCarloGrid.tsx` — fake heatmap
- `src/lib/monteCarloEngine.ts` — not driving anything real
- `src/lib/particleFilter.ts` + `src/hooks/useParticleFilter.ts` + `src/components/ParticleCanvas.tsx` — synthetic
- `src/lib/brierScore.ts` + `src/components/BrierScoreDisplay.tsx` — score is computed against the same number that feeds it (meaningless)
- `src/components/ProbabilityEngine.tsx`, `src/components/ConfidenceStrip.tsx`, `src/components/DecisionEngineDisplay.tsx`, `src/lib/decisionEngine.ts`, `src/components/RulesEngine.tsx` — wrappers around the above
- `src/components/GovernancePanel.tsx` — right sidebar (fake weekly target / decision log)
- `src/hooks/useTradingEngine.ts` — orchestrates the above
- `src/hooks/useMarkets.ts` + `src/components/MarketsPanel.tsx` — generic Polymarket list, not used by the new layout

## What gets built

### 1. Real Coinbase WS hook
`src/hooks/useCoinbasePrice.ts` — single persistent `wss://advanced-trade-ws.coinbase.com` connection, dynamic subscribe/unsubscribe, batched updates, rolling 300-point buffer per product. Maps internal asset (`btc`/`eth`/`sol`/`xrp`) → product (`BTC-USD` etc.).

### 2. Smooth live price chart
`src/components/LivePriceChart.tsx` — recharts `<LineChart>` fed from the rolling buffer, animated, with current price + % change since first point in window. Styled with existing tokens (no hardcoded colors).

### 3. SMA crossover signal (real logic)
`src/lib/smaSignal.ts`: compute fast (e.g. 10-pt) and slow (e.g. 30-pt) SMAs over the Coinbase buffer; detect the most recent crossover and direction. Map timeframe → window sizes (5m uses tighter windows than Daily).
`src/components/SmaSignalCard.tsx` — shows fast SMA, slow SMA, current spread, last cross direction + time, and the resulting flag: **LEAN UP**, **LEAN DOWN**, or **NEUTRAL**. Compares the lean against the live CLOB Up price to show whether the contract agrees or disagrees (real edge signal, no fabricated probabilities).

### 4. Embedded Polymarket contract chart
`src/components/PolymarketEmbed.tsx` — iframe pointed at `https://embed.polymarket.com/market.html?market={slug}&features=volume` (their public embed) using the active market's `eventSlug`. Falls back to a clean link card if the iframe is blocked. Slug is fully dynamic from `useUpDownMarkets`.

### 5. New main layout (`src/pages/Index.tsx` rewrite)
```
+------- TopBar (asset+timeframe drive everything) ---------+
| Left: existing UP/DOWN list (kept as-is — it works)        |
| Center top:    LivePriceChart (Coinbase)                   |
| Center mid:    SmaSignalCard  +  Live CLOB Up/Down prices  |
| Center bottom: PolymarketEmbed (contract chart)            |
+------------------------------------------------------------+
```
No right sidebar. TopBar loses the BrierScore/particle count chips; keeps live spot + connection status.

### 6. Wiring
`(selectedAsset, selectedTimeframe)` from `useUpDownMarkets` is the single source of truth. It:
- drives `useCoinbasePrice` subscription (asset → product id)
- drives `useUpDownMarkets` filtering → `activeMarket.eventSlug` → `PolymarketEmbed` src
- drives `smaSignal` window sizing per timeframe

### 7. Style audit
Pass through all surviving components and replace any hardcoded color (`text-white`, `bg-black`, hex literals) with semantic tokens from `index.css`. Unify button/badge/text sizing with existing `UpDownDisplay` patterns.

### 8. README rewrite
Replace current README with an accurate product + tech + signal overview:
- **Product**: real-time decision aid for Polymarket crypto Up/Down contracts; surfaces SMA-crossover lean vs. live contract pricing so the user can spot disagreements between spot momentum and market consensus.
- **Tech**: Vite/React/TS, Tailwind w/ design tokens, Coinbase Advanced Trade WS (spot), Polymarket CLOB WS (contract bid/ask), Polymarket Gamma REST via Supabase Edge Function proxy (market discovery, deterministic epoch slugs for 5m/15m/4h, search for 1h/Daily), embedded Polymarket chart.
- **Signal logic**: documented SMA windows per timeframe, crossover detection, lean classification, and how lean is compared to live Up price to produce an "agree / disagree / neutral" flag. No Monte Carlo, no particle filter, no Brier — explicitly noted as removed because they weren't grounded in real outcomes.
- **Financial framing**: the contract price is the market's implied probability; the SMA lean is a momentum prior; the displayed edge = `lean_prob − implied_prob`. No PnL fabrication.

## Out of scope

- Persisting trade history / PnL (would require real fills)
- Auth, Supabase tables for telemetry (not needed for current view)
- New backend functions (existing discovery edge function is reused unchanged)

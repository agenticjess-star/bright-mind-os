# Alpha Gemini — Up/Down Decision Aid

A focused, real-time decision aid for **Polymarket crypto "Up/Down"** contracts. The product answers one question, fast: **does live spot-price momentum agree or disagree with how the market is priced right now?**

No Monte Carlo. No particle filter. No simulated Brier score. Every number on screen comes from a live feed or is computed from live ticks the user can verify.

---

## 1. Product

### Who it's for
Discretionary scalpers and analysts trading Polymarket's recurring crypto **Up/Down** markets (BTC, ETH, SOL, XRP across 5m / 15m / 1h / 4h / Daily windows). These contracts settle on whether spot closes above or below a target by an exact wall-clock time.

### What it does
For the **active contract** in the selected asset + timeframe, it shows three things side-by-side:

1. **Live spot price chart** (Coinbase Advanced Trade WebSocket) with the contract's target price overlaid as a reference line.
2. **SMA crossover signal** computed on the live tick buffer, classified as **LEAN UP / LEAN DOWN / NEUTRAL**, with a derived `leanProb` and an **edge vs. market** (`leanProb − implied_up_price`).
3. **Embedded Polymarket contract page** (or one-click open) showing the official order-book chart and the live Up / Down bid/ask.

The left sidebar lists discovered Up/Down markets per (asset, timeframe), auto-rotates when one expires, and lets the user switch context — that single selection re-subscribes the Coinbase feed, re-filters market discovery, and reloads the contract embed.

### What was removed (and why)
The earlier build shipped a particle filter, a 5,000-path Monte Carlo, a Brier "calibration" score, a decision engine, a rules engine, and a governance panel. They were removed because:

- The particle filter was being fed the same price it was supposed to filter, so its "estimate" was tautological.
- The Monte Carlo had no real volatility prior and rendered a decorative heatmap.
- The Brier score scored predictions against their own input — guaranteed to look "EXCELLENT" regardless of reality.
- The decision/rules engines were thresholds over those fake numbers.
- The governance panel tracked a hardcoded weekly target with no fills.

A confident-looking metric that isn't grounded in a real outcome is worse than no metric. They are gone.

---

## 2. Architecture

```
+-------------------------+      +-----------------------------+
| Coinbase Advanced Trade |◄─ws─►| useCoinbasePrice            |
| ticker channel          |      |  - rolling 600-pt buffer    |
+-------------------------+      |  - 100ms batched flush      |
                                 |  - dynamic sub/unsub        |
                                 +--------------+--------------+
                                                │
+-------------------------+                     ▼
| Polymarket Gamma REST   |      +-----------------------------+      +----------------------+
| (via Supabase edge fn)  │─────►│ useUpDownMarkets            │─────►│ computeSmaSignal     │
| crypto-updown-discovery |      |  - epoch slugs (5m/15m/4h)  │      │  (windows by tf)     │
+-------------------------+      |  - search (1h/Daily)        │      +----------+-----------+
                                 |  - auto-rotate on expiry    │                 │
+-------------------------+      +--------------+--------------+                 │
| Polymarket CLOB WS      │◄─ws──┤ useClobWebSocket            │                 │
| ws-subscriptions-clob   │      │  - best_bid_ask only        │                 │
+-------------------------+      │  - 10s PING, filter ≤1¢     │                 │
                                 +--------------+--------------+                 │
                                                │                                │
                                                ▼                                ▼
                              +---------------------------------------------------------+
                              | UI: LivePriceChart · SmaSignalCard · PolymarketEmbed    │
                              | one (asset, timeframe) selection drives all three       │
                              +---------------------------------------------------------+
```

### Stack
- **Vite + React 18 + TypeScript**, Tailwind with semantic HSL design tokens (`src/index.css`).
- **recharts** for the spot chart, **framer-motion** for value transitions.
- **Supabase Edge Function** `crypto-updown-discovery` proxies the Polymarket Gamma REST API to bypass CORS and merges deterministic + search-based discovery into a single response.
- **Three independent live streams**, each with its own reconnection + heartbeat policy:
  - **Coinbase Advanced Trade WS** (`wss://advanced-trade-ws.coinbase.com`) — spot ticks.
  - **Polymarket CLOB WS** (`wss://ws-subscriptions-clob.polymarket.com/ws/market`) — contract bid/ask. 10s `PING` heartbeat. Only `best_bid_ask` events accepted; prices ≤ 1¢ discarded to suppress low-liquidity glitches.
  - **Polymarket Gamma REST** (polled every 20s via the edge function) — market discovery and metadata.

### Wiring rule
`(selectedAsset, selectedTimeframe)` is the single source of truth. It drives:
- `useCoinbasePrice` subscription (asset → `BTC-USD` / `ETH-USD` / `SOL-USD` / `XRP-USD`).
- Filter on `useUpDownMarkets` to pick the active event.
- `eventSlug` passed to `PolymarketEmbed`.
- SMA window sizing in `computeSmaSignal`.

---

## 3. Signal logic

The only model in the product is **dual-SMA crossover** on the live Coinbase tick stream.

### Windows by timeframe (`src/lib/smaSignal.ts`)

| Timeframe | Fast SMA | Slow SMA |
|-----------|---------:|---------:|
| 5m        | 8        | 24       |
| 15m       | 12       | 36       |
| 1h        | 20       | 60       |
| 4h        | 30       | 90       |
| Daily     | 40       | 120      |

Shorter contracts get tighter windows so the crossover responds to ticks that will actually resolve the market.

### Lean classification
```
spread       = fast - slow
spread_pct   = spread / slow
lean         = UP    if spread_pct >  5 bps
               DOWN  if spread_pct < -5 bps
               NEUTRAL otherwise
```
The 5 bps threshold keeps the signal from flipping on noise.

### Lean probability (prior)
A bounded logistic maps `spread_pct` to a `[0, 1]` probability prior:
```
lean_prob = 1 / (1 + exp(-k * spread_pct))    where k = 80
```
Calibration intent: ~0.5% spread → ~62%, ~2% spread → ~88%. This is **not** a forecast — it is a momentum prior the user compares against the market.

### Edge and agreement
Polymarket's Up price is the market's implied probability of the **Up** outcome. The card shows:
```
edge      = lean_prob - up_price
agreement = AGREE     if sign(lean) == sign(market_lean)
            DISAGREE  if signs differ
            NEUTRAL   otherwise
```
A persistent **DISAGREE with large edge** is what the operator looks for: spot momentum is pointing one way, the order book is priced the other.

### Crossover history
The card also surfaces the **most recent fast/slow crossover** in the buffer (direction + age) so the user can see how fresh the current lean is.

---

## 4. Financial framing

- **Contract price = implied probability.** A 73¢ Up contract means the market thinks Up resolves with 73% probability (minus a small spread).
- **`lean_prob`** is a momentum prior derived from live spot, not a calibrated forecast.
- **`edge = lean_prob − up_price`** is what the operator acts on. Positive edge means the SMA prior thinks Up is cheap; negative means it thinks Up is expensive (i.e., Down is cheap).
- **No PnL tracking is shown.** PnL without real fills is fiction; until brokerage hooks are added, the product only surfaces the decision inputs.

---

## 5. Run

```bash
bun install
bun dev
```

Environment (auto-provisioned by Lovable Cloud):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` — used by the discovery edge function.

No private API keys are required: Coinbase Advanced Trade ticker is a public channel, the Polymarket CLOB market channel is public, and Gamma REST is proxied for CORS only.

---

## 6. File map (active surface)

```
src/
├─ pages/Index.tsx              # the entire app
├─ components/
│  ├─ TopBar.tsx                # asset, feeds, clock
│  ├─ CryptoQuickSelect.tsx     # asset + timeframe selector
│  ├─ UpDownDisplay.tsx         # active market card (spot vs target, up/down bids)
│  ├─ EventHistory.tsx          # discovered markets list
│  ├─ LivePriceChart.tsx        # Coinbase tick chart w/ target reference line
│  ├─ SmaSignalCard.tsx         # lean, leanProb, spread, last cross, edge
│  └─ PolymarketEmbed.tsx       # contract chart iframe + fallback
├─ hooks/
│  ├─ useCoinbasePrice.ts       # single persistent Coinbase WS
│  ├─ useClobWebSocket.ts       # Polymarket CLOB WS
│  └─ useUpDownMarkets.ts       # discovery + auto-rotation + price merge
└─ lib/
   ├─ smaSignal.ts              # SMA crossover + edge + agreement
   └─ updownTypes.ts            # asset/timeframe types
```

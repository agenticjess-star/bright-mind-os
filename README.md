# Alpha Gemini — Predictive Opportunity Discovery Engine

> A real-time trading intelligence platform that identifies mispriced contracts in Polymarket's crypto Up/Down markets by synthesizing sub-second WebSocket price feeds with proprietary "Steal Score" analytics. Built for PMs, strategists, and quantitative traders who need zero-lag visibility into rotating binary markets.

![Stack](https://img.shields.io/badge/React_18-Vite-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue) ![WebSocket](https://img.shields.io/badge/WebSocket-Dual_Stream-green) ![License](https://img.shields.io/badge/License-Proprietary-red)

---

## Table of Contents

1. [Business Case & Problem Statement](#business-case--problem-statement)
2. [Solution Architecture](#solution-architecture)
3. [Core Value Propositions](#core-value-propositions)
4. [Strategic Decision Log](#strategic-decision-log)
5. [Technical Stack & Rationale](#technical-stack--rationale)
6. [Data Pipeline Deep Dive](#data-pipeline-deep-dive)
7. [The Steal Score Algorithm](#the-steal-score-algorithm)
8. [Quantitative Analysis Pipeline](#quantitative-analysis-pipeline)
9. [Market Discovery Engine](#market-discovery-engine)
10. [System Architecture Diagram](#system-architecture-diagram)
11. [Key Files & Module Map](#key-files--module-map)
12. [API & Protocol Reference](#api--protocol-reference)
13. [Quick Start](#quick-start)

---

## Business Case & Problem Statement

### The Market Inefficiency

Polymarket operates high-frequency crypto prediction markets (BTC, ETH, SOL, XRP) across five timeframes: 5-minute, 15-minute, 1-hour, 4-hour, and daily. These "Up/Down" contracts ask a simple binary question: *"Will the price of BTC be above $87,500 at 4:05 PM ET?"*

The contracts reprice continuously, but **pricing frequently lags spot price movements**. When BTC moves sharply toward a target price, correlated contracts on SOL and XRP often fail to reprice proportionally. This creates a measurable arbitrage window.

### The Problem

1. **Fragmented visibility**: Traders lack a unified view comparing "Distance to Target" and "% Move Required" across all assets and timeframes simultaneously.
2. **Manual discovery**: Markets rotate every 5 minutes. Without automation, traders miss the first 30–60 seconds of each new window — the highest-alpha period.
3. **Pricing lag**: REST polling introduces 10–30s of latency. In a 5-minute market, that's 10% of the total window spent blind.
4. **No actionable scoring**: Raw contract prices don't communicate *opportunity magnitude*. A contract priced at $0.40 tells you the market's implied probability, not whether that price is justified relative to current momentum.

### The Solution

Alpha Gemini provides:

- **Zero-lag price streaming** via dual WebSocket connections (CLOB for contract prices, RTDS for spot prices)
- **Deterministic market discovery** that pre-computes market slugs rather than searching — eliminating discovery latency entirely for 5m/15m/4h windows
- **Steal Score ranking** that quantifies the gap between contract pricing and spot proximity, surfacing the highest-edge opportunities first
- **Automatic market rotation** that detects expiring windows and seamlessly transitions to the next active contract

---

## Solution Architecture

Alpha Gemini operates as a **three-layer system**:

| Layer | Function | Latency |
|-------|----------|---------|
| **Discovery** | Edge Function generates deterministic slugs, queries Gamma API, fetches initial CLOB prices | ~500ms per asset-timeframe pair |
| **Streaming** | Dual WebSocket connections push sub-second updates for both contract prices and spot prices | <100ms |
| **Analysis** | Steal Score engine, Particle Filter, Monte Carlo simulation, Brier scoring, and Decision Engine process each price tick | <5ms per tick |

The frontend orchestrates all three layers without a traditional backend database — the data is ephemeral by design, reflecting the transient nature of 5-minute prediction markets.

---

## Core Value Propositions

### For Portfolio Managers & Strategists
- **Cross-asset comparison**: See all BTC, ETH, SOL, XRP markets side-by-side, sorted by edge magnitude
- **Cross-timeframe comparison**: Compare 5m vs 15m vs 1h vs 4h vs daily for a single asset to identify timeframe-specific mispricings
- **Decision audit trail**: Every BUY/HOLD/EXIT signal is logged with the specific conditions that triggered it

### For Quantitative Traders
- **Bayesian state estimation**: 5,000-particle Sequential Monte Carlo filter provides real-time probability refinement
- **Calibration tracking**: Brier Score measures prediction accuracy over time — a degrading score signals model drift
- **Hard rule enforcement**: Position limits, stop losses, and daily loss caps are evaluated on every tick

### For Product & Strategy Roles (Portfolio Piece Value)
- **Complex real-time integration**: Demonstrates mastery of WebSocket protocols, heartbeat management, and reconnection strategies
- **Algorithmic scoring**: The Steal Score is a custom metric designed from first principles, not a library import
- **Event-driven architecture**: Market rotation, dynamic subscription management, and state reconciliation across multiple data sources

---

## Strategic Decision Log

| Decision | Alternative Considered | Rationale |
|----------|----------------------|-----------|
| **Dual WebSocket** (CLOB + RTDS) over REST polling | Polling every 5s | Polling introduces up to 30s of lag, unacceptable for 5-minute scalp windows. WebSockets provide sub-100ms updates. |
| **Deterministic slug generation** over search API | `GET /events?title=...` for all timeframes | Search-based discovery adds 200–500ms and returns noisy results. Epoch-based slugs (`btc-updown-5m-{epoch}`) can be computed client-side and fetched directly. |
| **"Distance to Target"** metric over raw "Price to Beat" | Displaying static target price | A static number lacks context. "Distance" is an actionable metric tied to current momentum and volatility. |
| **`best_bid_ask` only** for CLOB price extraction | Using `price_change` or `last_trade_price` events | `price_change` and `last_trade_price` frequently carry misleading 1¢ values from micro-trades on thin order books. `best_bid_ask` is the cleanest source. |
| **Edge Function proxy** for Gamma API | Direct browser-to-API calls | CORS restrictions block direct Gamma API access from the browser. The Edge Function also batches concurrent discoveries across all asset-timeframe combinations. |
| **Framer Motion spring animations** for price updates | CSS transitions or raw DOM updates | Spring physics (`stiffness: 120, damping: 20`) prevents visual jitter when prices update at sub-second intervals. CSS transitions create jarring snapping. |
| **Steal Score** as primary sort metric | Sort by implied probability or volume | Neither probability nor volume captures *opportunity*. Steal Score synthesizes proximity-to-target with contract underpricing into a single actionable rank. |

---

## Technical Stack & Rationale

| Technology | Role | Why This Choice |
|------------|------|-----------------|
| **React 18** | UI framework | Concurrent rendering handles high-frequency state updates from dual WebSockets without frame drops |
| **Vite** | Build tool | Sub-second HMR during development; optimized production bundles |
| **TypeScript (strict)** | Type safety | 25+ interfaces across `types.ts`, `updownTypes.ts`, and `stealScore.ts` ensure contract correctness |
| **Tailwind CSS** | Styling | Semantic token system (`--primary`, `--chart-up`, `--destructive`) enables consistent dark-mode-first design |
| **Framer Motion** | Animation | `useSpring` / `useTransform` provide physics-based interpolation for live price displays |
| **Lovable Cloud** | Backend | Edge Functions for CORS-proxied API discovery; serverless, auto-scaling |
| **Recharts** | Charting | Lightweight SVG charts for sparklines and probability visualizations |
| **React Router v6** | Navigation | Two-view architecture: Engine (deep analysis) and Discovery (opportunity scanning) |

---

## Data Pipeline Deep Dive

### 1. Market Discovery (Edge Function)

**File**: `supabase/functions/crypto-updown-discovery/index.ts`

The discovery engine uses **two distinct strategies** based on Polymarket's slug conventions:

#### Strategy A: Deterministic Epoch-Based Slugs (5m, 15m, 4h)

```
Pattern: {asset}-updown-{timeframe}-{epoch_timestamp}
Epoch:   floor(unix_seconds / interval) * interval

Examples:
  btc-updown-5m-1772959800    → 5min window starting at that epoch
  eth-updown-15m-1772959500   → 15min window
  btc-updown-4h-1772946000    → 4hour window
```

The Edge Function computes the current window epoch, generates look-ahead slugs, fetches them all in parallel via `Promise.all`, and selects the one with `endDate > now && !closed`.

**Why this matters**: Zero search latency. The slug is mathematically deterministic — no API search required.

#### Strategy B: Search-Based Discovery (1h, Daily)

```
1h:    "bitcoin-up-or-down-march-8-4am-et"
Daily: "bitcoin-up-or-down-on-march-8"
```

These slugs are human-readable and unpredictable. The Edge Function searches `GET /events?title={query}&active=true` and classifies results by parsing time ranges in the title:
- 1-hour range ("4AM-5AM") → `1h`
- 4-hour range ("4AM-8AM") → `4h`
- "on {date}" pattern → `daily`

### 2. Live Contract Prices (CLOB WebSocket)

**File**: `src/hooks/useClobWebSocket.ts`

```
URL: wss://ws-subscriptions-clob.polymarket.com/ws/market
Heartbeat: "PING" every 10 seconds (mandatory)
```

Key implementation details:
- **`custom_feature_enabled: true`** unlocks `best_bid_ask`, `price_change`, `new_market` events
- **Only `best_bid_ask` is used** for pricing (see Decision Log above)
- **Dynamic subscribe/unsubscribe**: When markets rotate, new token IDs are sent without reconnecting
- **`new_market` event**: Triggers immediate re-discovery when Polymarket creates a new window on-chain
- **Exponential backoff reconnection**: `min(1000 * 2^n, 30000ms)`

### 3. Live Spot Prices (RTDS WebSocket)

**File**: `src/hooks/useCryptoPrice.ts`

```
URL: wss://ws-live-data.polymarket.com
Heartbeat: "PING" every 5 seconds (mandatory)
Symbols: btcusdt, ethusdt, solusdt, xrpusdt
```

Streams the underlying crypto spot price (e.g., BTC $87,500) used for "Distance to Target" calculations.

### 4. Price Merging & State Reconciliation

**File**: `src/hooks/useUpDownMarkets.ts`

The orchestrator hook merges three data sources:
1. **REST discovery** (initial load + 15s polling) → baseline market data
2. **CLOB WebSocket** → live contract prices overlaid via `useMemo`
3. **Staleness protection** → cached WS prices are preserved when REST returns stale data (prices ≤ $0.02 are discarded)

### 5. Auto-Rotation

When an active market's `endDate` passes:
1. A `setTimeout` fires 2 seconds after expiry
2. `fetchAll()` re-runs discovery with new epoch slugs
3. New token IDs propagate to the CLOB WebSocket via dynamic subscribe
4. The UI transitions seamlessly — no page reload, no reconnection

---

## The Steal Score Algorithm

**File**: `src/lib/stealScore.ts`

The Steal Score is a proprietary metric that quantifies the divergence between a contract's implied probability and the spot price's proximity to the target.

### Formula

```
steal_score = max(up_steal, down_steal)

up_steal   = (1 - implied_up_prob) × proximity_factor × 100
down_steal = (1 - implied_down_prob) × (1 - proximity_factor) × 100

proximity_factor = spot ≥ target ? 1.0 : e^(-8 × |pct_distance| / 100)
```

### Interpretation

| Score | Label | Meaning |
|-------|-------|---------|
| ≥ 60 | **STEAL** | Contract is significantly underpriced relative to momentum |
| 35–59 | **VALUE** | Moderate edge; worth monitoring |
| 15–34 | **FAIR** | Priced approximately correctly |
| < 15 | **AVOID** | Overpriced or momentum is diverging from target |

### Example

> BTC spot: $87,450. Target: $87,500. UP contract: $0.35.
>
> - Distance: -$50 (0.057% below target)
> - Proximity factor: e^(-8 × 0.057/100) = 0.955
> - Steal score: (1 - 0.35) × 0.955 × 100 = **62.1 → STEAL**
>
> The contract implies only 35% chance of UP, but spot is $50 away from the target with the proximity decay barely reducing the score. This is a high-conviction opportunity.

---

## Quantitative Analysis Pipeline

The Engine view (`/`) provides deep analysis through five modules:

### 1. Particle Filter (Sequential Monte Carlo)

**File**: `src/lib/particleFilter.ts` — 219 lines

- **5,000 particles** performing Bayesian state estimation in logit space
- Process model: Random walk with configurable volatility
- Observation model: Gaussian likelihood centered on market price
- **Systematic resampling** when ESS (Effective Sample Size) drops below threshold
- Outputs: filtered probability estimate, 95% credible interval, ESS health metric

### 2. Monte Carlo Simulation

**File**: `src/lib/monteCarloEngine.ts` — 128 lines

- **Variance-reduced** path generation using antithetic variates and stratified sampling
- Beasley-Springer-Moro inverse normal CDF approximation
- Forward-simulates price paths from filtered probability to compute terminal distribution
- Outputs: probability estimate, standard error, 95% CI, individual path outcomes (visualized in Monte Carlo grid)

### 3. Brier Score Tracker

**File**: `src/lib/brierScore.ts`

- Tracks calibration accuracy: `Brier = (1/N) Σ(prediction - outcome)²`
- Labels: EXCELLENT (< 0.1), GOOD (< 0.2), FAIR (< 0.3), POOR (≥ 0.3)
- Displayed in TopBar for at-a-glance model health monitoring

### 4. Decision Engine

**File**: `src/lib/decisionEngine.ts` — 167 lines

- Rule-based action logic evaluating five conditions per tick:
  1. Edge ≥ 5% (minimum edge to justify entry)
  2. ESS > 500 (particle filter hasn't collapsed)
  3. CI width < 15% (estimate is sufficiently precise)
  4. Position count < 5 (max simultaneous contracts)
  5. Daily loss < $100 (risk limit)
- Outputs: **BUY** / **HOLD** / **EXIT** with human-readable reasoning

### 5. Hard Rules Engine

- Position size limits ($500 max)
- Stop loss evaluation (15%)
- Daily loss cap enforcement
- Contract count limits
- Filter health monitoring
- **Rules cannot be overridden** — they fire regardless of edge magnitude

---

## System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                    Alpha Gemini — Frontend (React)                │
│                                                                   │
│  ┌─────────────┐   ┌──────────────┐   ┌────────────────────────┐ │
│  │ useCrypto   │   │ useClobWS    │   │ useUpDownMarkets       │ │
│  │ Price       │   │              │   │ (orchestrator)         │ │
│  │ (RTDS WS)   │   │ (CLOB WS)   │   │                        │ │
│  └──────┬──────┘   └──────┬───────┘   └──────────┬─────────────┘ │
│         │                 │                      │               │
│         ▼                 ▼                      ▼               │
│    Spot prices       Contract prices       REST Discovery        │
│    (5s PING)         (10s PING)            (15s interval)        │
│         │                 │                      │               │
│         └────────┬────────┘                      │               │
│                  ▼                               │               │
│          ┌──────────────┐                        │               │
│          │ Steal Score  │◄───────────────────────┘               │
│          │ Engine       │                                        │
│          └──────┬───────┘                                        │
│                 ▼                                                │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                    Discovery View (/markets)                 ││
│  │  STEALS (ranked) │ BY TIME (cross-asset) │ BY COIN (all TFs) ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                    Engine View (/)                            ││
│  │  Particle Filter │ Monte Carlo │ Brier │ Decision │ Rules    ││
│  └──────────────────────────────────────────────────────────────┘│
└───────────┬──────────────────┬──────────────────┬────────────────┘
            │                  │                  │
            ▼                  ▼                  ▼
       RTDS WebSocket    CLOB WebSocket     Edge Function
       (Polymarket)      (Polymarket)       (Lovable Cloud)
                                                  │
                                                  ▼
                                           Gamma API + CLOB REST
                                           (Polymarket)
```

---

## Key Files & Module Map

| File | Lines | Purpose |
|------|-------|---------|
| `supabase/functions/crypto-updown-discovery/index.ts` | 422 | Edge Function: deterministic slug generation, Gamma API querying, CLOB batch pricing, timeframe classification |
| `src/hooks/useClobWebSocket.ts` | 173 | CLOB WebSocket client: 10s PING heartbeat, `best_bid_ask` extraction, `new_market` detection, exponential backoff reconnection |
| `src/hooks/useCryptoPrice.ts` | 132 | RTDS WebSocket client: 5s PING heartbeat, spot price streaming for BTC/ETH/SOL/XRP |
| `src/hooks/useUpDownMarkets.ts` | 180 | Orchestrator: REST polling + WS price merging + staleness protection + auto-rotation scheduling |
| `src/lib/stealScore.ts` | 117 | Steal Score engine: proximity decay, bilateral (UP/DOWN) scoring, label classification |
| `src/lib/particleFilter.ts` | 219 | Sequential Monte Carlo: 5000-particle Bayesian filter in logit space with systematic resampling |
| `src/lib/monteCarloEngine.ts` | 128 | Variance-reduced Monte Carlo: antithetic variates, stratified sampling, Beasley-Springer-Moro inverse CDF |
| `src/lib/decisionEngine.ts` | 167 | Rule-based decision engine: 5-condition evaluation, BUY/HOLD/EXIT logic, hard rule enforcement |
| `src/components/OpportunityCard.tsx` | 152 | Market opportunity card: live countdown, distance metrics, probability bar, steal badge |
| `src/pages/MarketsView.tsx` | 269 | Discovery dashboard: STEALS/BY TIME/BY COIN views with real-time sorting |
| `src/pages/Index.tsx` | 145 | Engine dashboard: particle filter, Monte Carlo grid, rules engine, governance panel |
| `src/components/TopBar.tsx` | 103 | Navigation + live spot ticker + Brier score display + connectivity LED |

---

## API & Protocol Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `gamma-api.polymarket.com/events/slug/{slug}` | GET | Fetch event by deterministic slug |
| `gamma-api.polymarket.com/events?title={q}&active=true` | GET | Search events by title (1h, daily) |
| `clob.polymarket.com/price?token_id={id}&side=BUY` | GET | Single token price |
| `clob.polymarket.com/prices` | POST | Batch token prices (body: `{token_ids: [...]}`, up to 500) |
| `wss://ws-subscriptions-clob.polymarket.com/ws/market` | WS | Contract price streaming — 10s `PING` heartbeat |
| `wss://ws-live-data.polymarket.com` | WS | Spot price streaming — 5s `PING` heartbeat |

### WebSocket Subscribe Payload (CLOB)

```json
{
  "assets_ids": ["<token_id_up>", "<token_id_down>"],
  "type": "market",
  "custom_feature_enabled": true
}
```

### WebSocket Subscribe Payload (RTDS)

```json
{
  "action": "subscribe",
  "subscriptions": [{
    "topic": "crypto_prices",
    "type": "update",
    "filters": "btcusdt"
  }]
}
```

---

## Quick Start

```bash
npm install
npm run dev
```

The app automatically:
1. Discovers active markets across all 4 assets × 5 timeframes
2. Connects dual WebSockets with proper heartbeats
3. Streams live contract and spot prices
4. Calculates Steal Scores and ranks opportunities
5. Rotates to new markets as windows expire

No API keys required. No configuration. No database setup.

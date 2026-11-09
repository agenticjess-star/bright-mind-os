import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { discoverUpDownMarkets } from "../../polymarket";
import type { CryptoAsset } from "../../updownTypes";

const ASSETS = ["btc", "eth", "sol", "xrp"] as const;
const TIMEFRAMES = ["5m", "15m", "1h", "4h", "daily"] as const;

export default defineTool({
  name: "list_updown_markets",
  title: "List live Up/Down markets",
  description:
    "List live Polymarket crypto Up/Down contracts with real CLOB best bid/ask for Up and Down, optionally filtered by coin and timeframe.",
  inputSchema: {
    asset: z.enum(ASSETS).optional().describe("Coin: btc, eth, sol or xrp. Omit for all."),
    timeframe: z.enum(TIMEFRAMES).optional().describe("Window: 5m, 15m, 1h, 4h or daily. Omit for all."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ asset, timeframe }, ctx) => {
    const assets: CryptoAsset[] = asset ? [asset] : [...ASSETS];
    const all = await discoverUpDownMarkets(assets, ctx.signal);
    const live = all.filter((m) => !m.resolved && (!timeframe || m.timeframe === timeframe));
    if (live.length === 0) throw new ToolError("No live markets found for that selection right now.");
    const markets = live.map((m) => ({
      asset: m.asset,
      timeframe: m.timeframe,
      slug: m.eventSlug,
      title: m.eventTitle,
      windowStart: m.windowStart ?? null,
      endDate: m.endDate,
      upAsk: m.upPrice,
      upBid: m.upBid,
      downAsk: m.downPrice,
      downBid: m.downBid,
    }));
    const fmt = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}¢`);
    const text = markets
      .map((m) => `${m.asset.toUpperCase()} ${m.timeframe} · UP ask ${fmt(m.upAsk)} / DOWN ask ${fmt(m.downAsk)} · ends ${m.endDate} · ${m.slug}`)
      .join("\n");
    return { content: [{ type: "text", text }], structuredContent: { markets } };
  },
});

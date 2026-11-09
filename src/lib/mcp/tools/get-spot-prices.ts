import { defineTool, ToolError } from "@lovable.dev/mcp-js";

const PRODUCTS = ["BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD"];

export default defineTool({
  name: "get_spot_prices",
  title: "Get crypto spot prices",
  description: "Get the latest Coinbase spot prices for BTC, ETH, SOL and XRP in USD.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async (_args, ctx) => {
    const prices = await Promise.all(
      PRODUCTS.map(async (product) => {
        const res = await fetch(`https://api.exchange.coinbase.com/products/${product}/ticker`, { signal: ctx.signal });
        if (!res.ok) return { product, price: null as number | null, time: null as string | null };
        const j = await res.json();
        const price = Number(j?.price);
        return { product, price: Number.isFinite(price) ? price : null, time: typeof j?.time === "string" ? j.time : null };
      }),
    );
    if (prices.every((p) => p.price == null)) throw new ToolError("Coinbase prices are unavailable right now.");
    const text = prices.map((p) => `${p.product}: ${p.price ?? "unavailable"}`).join("\n");
    return { content: [{ type: "text", text }], structuredContent: { prices } };
  },
});

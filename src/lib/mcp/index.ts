import { defineMcp } from "@lovable.dev/mcp-js";
import listUpdownMarkets from "./tools/list-updown-markets";
import getSpotPrices from "./tools/get-spot-prices";

export default defineMcp({
  name: "alpha-gemini",
  title: "Alpha Gemini",
  version: "0.1.0",
  instructions:
    "Public, read-only market data for Polymarket crypto Up/Down contracts (BTC, ETH, SOL, XRP). List live contracts with CLOB bid/ask and read Coinbase spot prices.",
  tools: [listUpdownMarkets, getSpotPrices],
});

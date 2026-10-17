import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Candidate {
  id: string; // eventId
  asset: string;
  timeframe: string;
  spotPrice: number;
  strikePrice: number | null;
  pctToBeatUp: number | null; // % move needed for UP to win
  pctToBeatDown: number | null;
  minutesLeft: number;
  upAsk: number | null;
  downAsk: number | null;
  smaSignal: "up" | "down" | "neutral";
  smaSpreadPct: number | null; // (fast-slow)/slow * 100
  lastCrossAgoMin: number | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "AI gateway key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { candidates } = (await req.json()) as { candidates: Candidate[] };
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return new Response(JSON.stringify({ decisions: {} }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const state = {
      context:
        "Crypto up/down prediction markets. Each market resolves UP if the asset's price at window close is above the strike (price to beat), DOWN otherwise. Asks are in dollars per share; a winning share pays $1.00.",
      markets: candidates,
    };

    const questions: Record<string, unknown> = {};
    for (const c of candidates) {
      questions[`dir_${c.id}`] = {
        type: "choice",
        instructions: {
          question: `For the ${c.asset.toUpperCase()} ${c.timeframe} market in state.markets, which side (if any) is worth buying right now?`,
          guidance: [
            "Weigh the SMA trend signal against the percent move still required to beat the strike and the minutes remaining.",
            "A cheap ask on the side that aligns with the trend and needs only a small move is attractive.",
            "Choose skip when the required move is large relative to time left, the trend fights the cheap side, or asks are near $1 with little edge.",
          ],
        },
        criteria: {
          up: "Buy UP: trend or price position favors finishing above the strike and the UP ask offers value.",
          down: "Buy DOWN: trend or price position favors finishing below the strike and the DOWN ask offers value.",
          skip: "No clear edge; do not open a position in this market.",
        },
      };
      questions[`conf_${c.id}`] = {
        type: "score",
        instructions:
          "Rate your conviction in the chosen direction for this market, based on trend alignment, required move vs time left, and ask price value.",
        criteria: [
          { description: "No edge at all; pure coin flip or worse." },
          { description: "Slight lean, but price or time works against it." },
          { description: "Moderate edge; trend and required move roughly agree." },
          { description: "Strong edge; trend, distance to strike, and ask price all align." },
          { description: "Exceptional setup; nearly locked-in outcome at a discounted ask." },
        ],
      };
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/systemone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({ model: "typesafe/jev-latest", state, questions }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return new Response(
        JSON.stringify({ error: `Jev gateway error ${resp.status}`, detail: text.slice(0, 500) }),
        { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await resp.json();
    const answers = data?.answers ?? {};
    const decisions: Record<string, { direction: string; conviction: number; probabilities?: Record<string, number> }> = {};
    for (const c of candidates) {
      const dir = answers[`dir_${c.id}`];
      const conf = answers[`conf_${c.id}`];
      if (!dir?.choice) continue;
      decisions[c.id] = {
        direction: dir.choice,
        conviction: typeof conf?.score === "number" ? conf.score : 0,
        probabilities: dir.probabilities,
      };
    }

    return new Response(JSON.stringify({ decisions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

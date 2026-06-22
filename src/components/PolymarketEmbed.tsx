import { useState, useEffect } from 'react';

interface PolymarketEmbedProps {
  eventSlug: string | null;
  height?: number;
}

/**
 * Embeds the official Polymarket event page in an iframe.
 * Polymarket sets X-Frame-Options/CSP, so we render a clear fallback
 * link if the embed is blocked (detected via load timeout / error).
 */
export function PolymarketEmbed({ eventSlug, height = 460 }: PolymarketEmbedProps) {
  const [blocked, setBlocked] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setBlocked(false);
    setLoaded(false);
    if (!eventSlug) return;
    const t = setTimeout(() => {
      if (!loaded) setBlocked(true);
    }, 4500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventSlug]);

  if (!eventSlug) {
    return (
      <div
        className="bg-card border border-border rounded-lg flex items-center justify-center"
        style={{ height }}
      >
        <span className="text-[10px] font-mono text-muted-foreground tracking-[1px]">
          NO ACTIVE MARKET
        </span>
      </div>
    );
  }

  const url = `https://polymarket.com/event/${eventSlug}`;

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-[9px] font-mono text-muted-foreground tracking-[1.5px]">
          POLYMARKET CONTRACT CHART
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[9px] font-mono text-primary/80 hover:text-primary transition-colors"
        >
          OPEN ↗
        </a>
      </div>
      {blocked ? (
        <div
          className="flex flex-col items-center justify-center gap-2 px-4 py-6"
          style={{ height }}
        >
          <span className="text-[10px] font-mono text-muted-foreground tracking-[1px] text-center">
            POLYMARKET BLOCKS EMBEDDING IN THIS BROWSER.
          </span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-mono px-3 py-1.5 rounded-md bg-primary/10 border border-primary/30 text-primary hover:bg-primary/15 transition-colors"
          >
            VIEW CONTRACT ON POLYMARKET ↗
          </a>
          <span className="text-[8px] font-mono text-muted-foreground/60 break-all px-4 text-center">
            {url}
          </span>
        </div>
      ) : (
        <iframe
          key={eventSlug}
          src={url}
          title={`Polymarket ${eventSlug}`}
          onLoad={() => setLoaded(true)}
          onError={() => setBlocked(true)}
          style={{ height, width: '100%', border: 0, background: 'transparent' }}
          sandbox="allow-scripts allow-same-origin allow-popups"
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
}

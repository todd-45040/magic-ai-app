import { useEffect, useState } from "react";

type WireItem = {
  category: string;
  headline: string;
  summary: string;
  body: string;
  source: string;
  sourceUrl: string | null;
  publishedAt?: string;
};

function domainFromUrl(url: string | null | undefined) {
  if (!url) return "Source";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

function timeAgo(isoLike?: string) {
  if (!isoLike) return "";
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return "";

  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (day >= 7) return d.toLocaleDateString();
  if (day >= 1) return `${day}d ago`;
  if (hr >= 1) return `${hr}h ago`;
  if (min >= 1) return `${min}m ago`;
  return "Just now";
}

export default function MagicWire() {
  const [items, setItems] = useState<WireItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load(refresh = false) {
    setLoading(true);
    const url = refresh
      ? "/api/magicWire?count=9&refresh=1"
      : "/api/magicWire?count=9";

    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    setItems(Array.isArray(data) ? data : data.items || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="magic-wire">
      <div className="magic-wire-grid">
        {loading &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="wire-card placeholder" />
          ))}

        {!loading &&
          items.map((item, idx) => (
            <div key={idx} className="wire-card">
              {/* Top: publisher/domain */}
              <div className="card-kicker">
                {domainFromUrl(item.sourceUrl)}
              </div>

              <h3 className="card-title">{item.headline}</h3>

              <p className="card-summary">{item.summary}</p>

              {/* Bottom meta */}
              <div className="card-footer">
                <span className="card-time">
                  {timeAgo(item.publishedAt)}
                </span>

                {item.sourceUrl && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="card-link"
                  >
                    Read original ↗
                  </a>
                )}
              </div>
            </div>
          ))}
      </div>

      <button className="refresh-btn" onClick={() => load(true)}>
        Refresh Feed
      </button>
    </div>
  );
}

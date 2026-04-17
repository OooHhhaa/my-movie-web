const HOME_URL = "https://www.iyf.tv/";

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
};

async function fetchText(url) {
  const res = await fetch(url, {
    headers: REQUEST_HEADERS,
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status}: ${url}`);
  }
  return await res.text();
}

function extractInjectJson(html) {
  const match = html.match(/var\s+injectJson\s*=\s*(\{[\s\S]*?\});/);
  if (!match) {
    throw new Error("injectJson not found");
  }
  return JSON.parse(match[1]);
}

function collectMovies(injectData) {
  const results = [];
  const seen = new Set();

  for (const [key, value] of Object.entries(injectData)) {
    if (!Array.isArray(value)) continue;

    for (const item of value) {
      if (!item || typeof item !== "object") continue;

      const title = String(item.title || "").trim();
      const poster = String(item.img || item.image || "").trim();
      const rawUrl = String(item.url || "").trim();
      const subTitle = String(item.subTitle || "").trim();

      if (!title || !poster || !rawUrl) continue;

      const playUrl = new URL(rawUrl, HOME_URL).toString();
      const isPlayPage = playUrl.includes("/play/");
      const isMovie = subTitle.includes("电影") || key.toLowerCase().includes("movie");
      if (!isPlayPage || !isMovie) continue;
      if (seen.has(playUrl)) continue;

      seen.add(playUrl);
      results.push({
        title,
        poster,
        play_url: playUrl,
        m3u8: "",
      });
    }
  }

  return results;
}

function extractM3u8(playHtml) {
  const patterns = [
    /"url"\s*:\s*"(https?:\\\/\\\/[^"]+\.m3u8[^"]*)"/i,
    /"m3u8"\s*:\s*"(https?:\\\/\\\/[^"]+\.m3u8[^"]*)"/i,
    /(https?:\/\/[^"'\\\s]+\.m3u8(?:\?[^"'\\\s]*)?)/i,
  ];

  for (const pattern of patterns) {
    const match = playHtml.match(pattern);
    if (match) {
      return match[1].replaceAll("\\/", "/");
    }
  }
  return "";
}

export default async function handler(req, res) {
  try {
    const limitRaw = Number.parseInt(String(req.query.limit || "24"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 60) : 24;

    const homeHtml = await fetchText(HOME_URL);
    const injectData = extractInjectJson(homeHtml);
    const movies = collectMovies(injectData).slice(0, limit);

    await Promise.all(
      movies.map(async (item) => {
        try {
          const playHtml = await fetchText(item.play_url);
          item.m3u8 = extractM3u8(playHtml);
        } catch {
          item.m3u8 = "";
        }
      })
    );

    const filtered = movies.filter((item) => item.m3u8);
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json(filtered);
  } catch (err) {
    res.status(500).json({
      error: "realtime scrape failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

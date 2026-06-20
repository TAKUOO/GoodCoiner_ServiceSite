import type { APIRoute } from "astro";

export type MarketEventCategory =
  | "macro"
  | "crypto"
  | "exchange"
  | "regulation"
  | "upgrade";

export type MarketEventImportance = "high" | "medium" | "low";

export type MarketEvent = {
  id: string;
  date: string;
  time?: string;
  title: string;
  source: string;
  category: MarketEventCategory;
  importance: MarketEventImportance;
  symbols?: string[];
  url?: string;
};

const CACHE_TTL_SECONDS = 3600; // 外部API取得結果を1時間キャッシュ
const STALE_TTL_SECONDS = 60 * 60 * 24 * 7; // 取得失敗時のフォールバック用に最大7日保持
const CACHE_KEY = "https://goodcoiner.com/__cache/market-events/macro";

// macro イベントの無料ソース。ForexFactory の経済指標カレンダーを
// 公式配信元 faireconomy.media が API キー不要の JSON で提供している。
// 制限: 取得できるのは「今週分」のみ（数日先まで）。
const MACRO_FEED_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const MACRO_SOURCE = "ForexFactory";

const RESPONSE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=3600",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const isYmd = (value: string | null): value is string =>
  Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

// ---- ForexFactory (faireconomy) 連携: macro ----

type ForexFactoryRow = {
  title?: string;
  country?: string;
  date?: string; // ISO8601 + オフセット 例: "2026-06-17T14:00:00-04:00"
  impact?: string; // "High" | "Medium" | "Low" | "Holiday"
};

// BTC/ETH に影響しやすい主要イベントの許可リスト。
// High インパクトのものは別途すべて拾うので、ここは「中インパクトでも含めたい」もの中心。
const PRIORITY_PATTERNS: RegExp[] = [
  /federal funds rate/i,
  /interest rate/i,
  /fomc/i,
  /\bcpi\b/i,
  /consumer price/i,
  /non.?farm/i,
  /unemployment rate/i,
  /pce price/i,
  /powell/i,
  /retail sales/i,
  /\bgdp\b/i,
  /producer price/i,
  /\bppi\b/i,
];

function mapImportance(impact: string | undefined): MarketEventImportance | null {
  switch ((impact ?? "").toLowerCase()) {
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
      return "low";
    default:
      return null; // Holiday など対象外
  }
}

// ISO 文字列を JST(Asia/Tokyo) の date / time に変換する。
// オフセット付き("...-04:00")はそのまま、無指定はGMT扱いで解釈する。
function toJst(value: string | undefined): { date: string; time: string } | null {
  if (!value) return null;
  const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  const ms = Date.parse(hasTz ? value : `${value}Z`);
  if (Number.isNaN(ms)) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  let hour = get("hour");
  if (hour === "24") hour = "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${hour}:${get("minute")}`,
  };
}

function jpTitle(title: string): string {
  const e = title.toLowerCase();
  if (/fomc minutes/.test(e)) return "FOMC 議事要旨";
  if (/fomc economic projections/.test(e)) return "FOMC 経済見通し";
  if (/fomc press conference/.test(e)) return "FOMC 記者会見";
  if (/fomc statement/.test(e)) return "FOMC 声明";
  if (/federal funds rate|interest rate decision/.test(e))
    return "FOMC 政策金利発表";
  if (/core cpi|core consumer price/.test(e))
    return "米 コアCPI（消費者物価指数）";
  if (/\bcpi\b|consumer price/.test(e)) return "米 CPI（消費者物価指数）";
  if (/non.?farm/.test(e)) return "米 雇用統計（非農業部門雇用者数）";
  if (/unemployment rate/.test(e)) return "米 失業率";
  if (/core pce/.test(e)) return "米 コアPCE（個人消費支出物価指数）";
  if (/pce price/.test(e)) return "米 PCE（個人消費支出物価指数）";
  if (/powell/.test(e)) return "パウエルFRB議長 発言";
  if (/core retail sales/.test(e)) return "米 コア小売売上高";
  if (/retail sales/.test(e)) return "米 小売売上高";
  if (/\bgdp\b/.test(e)) return "米 GDP（国内総生産）";
  if (/producer price|\bppi\b/.test(e)) return "米 PPI（生産者物価指数）";
  return title;
}

function isPriority(title: string): boolean {
  return PRIORITY_PATTERNS.some((re) => re.test(title));
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function mapMacroFeed(rows: ForexFactoryRow[]): MarketEvent[] {
  const events: MarketEvent[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    // 米国(USD)の指標のみ対象
    if (row.country !== "USD") continue;

    const title = (row.title ?? "").trim();
    if (!title) continue;

    const importance = mapImportance(row.impact);
    if (importance === null) continue; // Holiday 等は除外
    // High はすべて、それ以外は優先リストに一致するものだけ採用
    if (importance !== "high" && !isPriority(title)) continue;

    const jst = toJst(row.date);
    if (!jst) continue;

    const id = `ff-${jst.date}-${slug(title)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    events.push({
      id,
      date: jst.date,
      time: jst.time,
      title: jpTitle(title),
      source: MACRO_SOURCE,
      category: "macro",
      importance,
      symbols: ["BTC", "ETH"],
    });
  }

  events.sort((a, b) =>
    `${a.date} ${a.time ?? ""}`.localeCompare(`${b.date} ${b.time ?? ""}`)
  );
  return events;
}

async function fetchMacroEvents(): Promise<MarketEvent[]> {
  const res = await fetch(MACRO_FEED_URL, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Macro feed responded ${res.status}`);
  }

  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error("Macro feed returned a non-array payload");
  }
  return mapMacroFeed(data as ForexFactoryRow[]);
}

// ---- Cache API (1時間キャッシュ + 失敗時の stale フォールバック) ----

function getEdgeCache(): Cache | null {
  const store = (globalThis as { caches?: { default?: Cache } }).caches;
  return store?.default ?? null;
}

async function loadEvents(): Promise<MarketEvent[]> {
  const cache = getEdgeCache();
  const cacheRequest = new Request(CACHE_KEY);

  const cached = cache ? await cache.match(cacheRequest) : undefined;
  if (cached) {
    const cachedAt = Number(cached.headers.get("x-cached-at") ?? 0);
    if (Date.now() - cachedAt < CACHE_TTL_SECONDS * 1000) {
      return (await cached.json()) as MarketEvent[];
    }
  }

  try {
    const fresh = await fetchMacroEvents();
    if (cache) {
      const stored = new Response(JSON.stringify(fresh), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `max-age=${STALE_TTL_SECONDS}`,
          "x-cached-at": String(Date.now()),
        },
      });
      await cache.put(cacheRequest, stored);
    }
    return fresh;
  } catch {
    // 取得失敗時は stale キャッシュを返す。無ければ空配列。
    return cached ? ((await cached.json()) as MarketEvent[]) : [];
  }
}

// ---- ルートハンドラ ----

export const optionsMarketEvents: APIRoute = () =>
  new Response(null, { status: 204, headers: RESPONSE_HEADERS });

export const getMarketEvents: APIRoute = async ({ url }) => {
  try {
    const events = await loadEvents();

    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const filtered = events.filter((event) => {
      if (isYmd(from) && event.date < from) return false;
      if (isYmd(to) && event.date > to) return false;
      return true;
    });

    return new Response(JSON.stringify(filtered), {
      status: 200,
      headers: RESPONSE_HEADERS,
    });
  } catch {
    // どんな例外でもアプリ側が壊れないよう 200 + 空配列を返す。
    return new Response("[]", { status: 200, headers: RESPONSE_HEADERS });
  }
};

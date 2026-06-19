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
const FETCH_PAST_DAYS = 7; // 直近の確定イベントも少しだけ含める
const FETCH_FUTURE_DAYS = 120; // カレンダー表示に十分な先の範囲を取得
const TE_CACHE_KEY = "https://goodcoiner.com/__cache/market-events/trading-economics";

const RESPONSE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=3600",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const isYmd = (value: string | null): value is string =>
  Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

// ---- Trading Economics 連携 (macro) ----

type TradingEconomicsRow = {
  CalendarId?: string | number;
  Date?: string;
  Country?: string;
  Category?: string;
  Event?: string;
  Importance?: number | string;
  URL?: string;
};

// BTC/ETH に影響しやすい主要イベントの許可リスト。
// importance が high のものは下の判定で別途拾うので、ここは「中程度でも必ず含めたい」ものを中心に。
const PRIORITY_PATTERNS: RegExp[] = [
  /interest rate decision/i,
  /fed interest rate/i,
  /fomc/i,
  /inflation rate/i,
  /consumer price/i,
  /\bcpi\b/i,
  /non.?farm payrolls/i,
  /\bnfp\b/i,
  /unemployment rate/i,
  /pce price/i,
  /powell/i,
  /fed chair/i,
  /fed press conference/i,
  /jackson hole/i,
  /\bgdp\b/i,
  /producer price/i,
  /\bppi\b/i,
  /retail sales/i,
];

function mapImportance(value: number | string | undefined): MarketEventImportance {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === 3) return "high";
  if (n === 2) return "medium";
  return "low";
}

// TE の Date は GMT。アプリは JST 表記を期待しているため Asia/Tokyo に変換する。
function toJst(teDate: string | undefined): { date: string; time?: string } | null {
  if (!teDate) return null;
  const ms = Date.parse(teDate.endsWith("Z") ? teDate : `${teDate}Z`);
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
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  let hour = get("hour");
  if (hour === "24") hour = "00";
  const time = `${hour}:${get("minute")}`;

  // GMT 00:00:00 は「時刻未定」を表すことが多いため time は省略する。
  const gmtMidnight = (teDate.endsWith("Z") ? teDate : `${teDate}Z`).includes(
    "T00:00:00"
  );
  return gmtMidnight ? { date } : { date, time };
}

function jpTitle(event: string): string {
  const e = event.toLowerCase();
  if (/fomc minutes/.test(e)) return "FOMC 議事要旨";
  if (/fomc economic projections|economic projections/.test(e))
    return "FOMC 経済見通し";
  if (/interest rate decision|fed interest rate/.test(e))
    return "FOMC 政策金利発表";
  if (/core inflation rate|core cpi/.test(e))
    return "米 コアCPI（消費者物価指数）";
  if (/inflation rate|consumer price|\bcpi\b/.test(e))
    return "米 CPI（消費者物価指数）";
  if (/non.?farm payrolls|\bnfp\b/.test(e))
    return "米 雇用統計（非農業部門雇用者数）";
  if (/unemployment rate/.test(e)) return "米 失業率";
  if (/core pce/.test(e)) return "米 コアPCE（個人消費支出物価指数）";
  if (/pce price/.test(e)) return "米 PCE（個人消費支出物価指数）";
  if (/jackson hole/.test(e)) return "ジャクソンホール会議";
  if (/fed press conference/.test(e)) return "FRB 記者会見";
  if (/powell|fed chair/.test(e)) return "パウエルFRB議長 発言";
  if (/\bgdp\b/.test(e)) return "米 GDP（国内総生産）";
  if (/producer price|\bppi\b/.test(e)) return "米 PPI（生産者物価指数）";
  if (/retail sales/.test(e)) return "米 小売売上高";
  return event;
}

function isPriority(event: string, category: string): boolean {
  const text = `${event} ${category}`;
  return PRIORITY_PATTERNS.some((re) => re.test(text));
}

function ymd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function mapTradingEconomics(rows: TradingEconomicsRow[]): MarketEvent[] {
  const events: MarketEvent[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const event = (row.Event ?? "").trim();
    const category = (row.Category ?? "").trim();
    if (!event) continue;

    const importance = mapImportance(row.Importance);
    if (importance !== "high" && !isPriority(event, category)) continue;

    const jst = toJst(row.Date);
    if (!jst) continue;

    const id = row.CalendarId
      ? `te-${row.CalendarId}`
      : `te-${jst.date}-${event.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const url = row.URL
      ? `https://tradingeconomics.com${row.URL.startsWith("/") ? "" : "/"}${row.URL}`
      : undefined;

    events.push({
      id,
      date: jst.date,
      ...(jst.time ? { time: jst.time } : {}),
      title: jpTitle(event),
      source: "Trading Economics",
      category: "macro",
      importance,
      symbols: ["BTC", "ETH"],
      ...(url ? { url } : {}),
    });
  }

  events.sort((a, b) =>
    `${a.date} ${a.time ?? ""}`.localeCompare(`${b.date} ${b.time ?? ""}`)
  );
  return events;
}

async function fetchTradingEconomics(apiKey: string): Promise<MarketEvent[]> {
  const now = Date.now();
  const d1 = ymd(new Date(now - FETCH_PAST_DAYS * 86400_000));
  const d2 = ymd(new Date(now + FETCH_FUTURE_DAYS * 86400_000));

  const endpoint =
    `https://api.tradingeconomics.com/calendar/country/united%20states/${d1}/${d2}` +
    `?c=${encodeURIComponent(apiKey)}&format=json`;

  const res = await fetch(endpoint, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Trading Economics responded ${res.status}`);
  }

  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error("Trading Economics returned a non-array payload");
  }
  return mapTradingEconomics(data as TradingEconomicsRow[]);
}

// ---- Cache API (取得結果の1時間キャッシュ + 失敗時の stale フォールバック) ----

function getEdgeCache(): Cache | null {
  const store = (globalThis as { caches?: { default?: Cache } }).caches;
  return store?.default ?? null;
}

async function loadEvents(env: Env): Promise<MarketEvent[]> {
  const apiKey = env.TRADING_ECONOMICS_API_KEY;
  const cache = getEdgeCache();
  const cacheRequest = new Request(TE_CACHE_KEY);

  const cached = cache ? await cache.match(cacheRequest) : undefined;
  if (cached) {
    const cachedAt = Number(cached.headers.get("x-cached-at") ?? 0);
    if (Date.now() - cachedAt < CACHE_TTL_SECONDS * 1000) {
      return (await cached.json()) as MarketEvent[];
    }
  }

  // キーが無ければ外部取得できない。stale があればそれを、無ければ空配列を返す。
  if (!apiKey) {
    return cached ? ((await cached.json()) as MarketEvent[]) : [];
  }

  try {
    const fresh = await fetchTradingEconomics(apiKey);
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

export const getMarketEvents: APIRoute = async ({ url, locals }) => {
  try {
    const events = await loadEvents(locals.runtime.env);

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

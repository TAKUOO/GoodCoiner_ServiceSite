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

const CACHE_TTL_SECONDS = 3600; // 取得結果を1時間キャッシュ
const STALE_TTL_SECONDS = 60 * 60 * 24 * 7; // 失敗時フォールバック用に最大7日保持
// バージョンを含める: データソース/スキーマ変更時に旧キャッシュを読まないため。
const CACHE_KEY = "https://goodcoiner.com/__cache/market-events/macro-fred-v1";
const FETCH_FUTURE_DAYS = 60; // 先読み期間（2週間要件に十分なマージン）

const RESPONSE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=3600",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const isYmd = (value: string | null | undefined): value is string =>
  Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

const SYMBOLS = ["BTC", "ETH"];

// ---- 時刻変換 (米東部時間 → JST) ----

// 指定日が米国東部の夏時間(EDT)かどうか。DSTは3月第2日曜〜11月第1日曜。
function isUsEasternDst(y: number, m: number, d: number): boolean {
  if (m < 3 || m > 11) return false;
  if (m > 3 && m < 11) return true;
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const firstSunday = 1 + ((7 - firstDow) % 7);
  if (m === 3) return d >= firstSunday + 7; // 第2日曜以降
  return d < firstSunday; // 11月: 第1日曜より前
}

function formatJst(ms: number): { date: string; time: string } {
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

// 米東部の壁時計時刻(etHour:etMin)を JST の date/time に変換する。
function etToJst(
  dateYmd: string,
  etHour: number,
  etMin: number
): { date: string; time: string } {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const offset = isUsEasternDst(y, m, d) ? 4 : 5; // ET = UTC - offset
  return formatJst(Date.UTC(y, m - 1, d, etHour + offset, etMin));
}

function ymdUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// ---- FRED 経済指標カレンダー (発表予定日) ----

type FredRelease = {
  id: number;
  title: string;
  importance: MarketEventImportance;
};

// 取得対象の FRED リリース。米指標の発表は原則 08:30 ET。
const FRED_RELEASES: FredRelease[] = [
  { id: 10, title: "米 CPI（消費者物価指数）", importance: "high" },
  { id: 50, title: "米 雇用統計（非農業部門雇用者数）", importance: "high" },
  { id: 54, title: "米 PCE（個人消費支出物価指数）", importance: "medium" },
  { id: 53, title: "米 GDP（国内総生産）", importance: "medium" },
  { id: 46, title: "米 PPI（生産者物価指数）", importance: "medium" },
  { id: 9, title: "米 小売売上高", importance: "medium" },
];
const FRED_RELEASE_HOUR = 8;
const FRED_RELEASE_MIN = 30;

type FredResponse = { release_dates?: { date?: string }[] };

async function fetchReleaseDates(
  release: FredRelease,
  apiKey: string,
  start: string,
  end: string
): Promise<MarketEvent[]> {
  const url =
    `https://api.stlouisfed.org/fred/release/dates?release_id=${release.id}` +
    `&api_key=${encodeURIComponent(apiKey)}&file_type=json` +
    `&include_release_dates_with_no_data=true` +
    `&realtime_start=${start}&realtime_end=${end}&sort_order=asc`;

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`FRED ${release.id} responded ${res.status}`);

  const data = (await res.json()) as FredResponse;
  const dates = data.release_dates ?? [];

  return dates
    .map((row) => row.date)
    .filter((d): d is string => isYmd(d))
    .map((etDate) => {
      const jst = etToJst(etDate, FRED_RELEASE_HOUR, FRED_RELEASE_MIN);
      return {
        id: `fred-${release.id}-${etDate}`,
        date: jst.date,
        time: jst.time,
        title: release.title,
        source: "FRED",
        category: "macro" as const,
        importance: release.importance,
        symbols: SYMBOLS,
        url: `https://fred.stlouisfed.org/release?rid=${release.id}`,
      };
    });
}

// ---- FOMC (公式日程をハードコード。発表は決定日 14:00 ET) ----

// 2026年 FOMC 決定日（federalreserve.gov 公表の2日目）
const FOMC_DECISION_DATES = [
  "2026-01-28",
  "2026-03-18",
  "2026-04-29",
  "2026-06-17",
  "2026-07-29",
  "2026-09-16",
  "2026-10-28",
  "2026-12-09",
];
const FOMC_HOUR = 14;
const FOMC_MIN = 0;

function fomcEvents(): MarketEvent[] {
  return FOMC_DECISION_DATES.map((etDate) => {
    const jst = etToJst(etDate, FOMC_HOUR, FOMC_MIN);
    return {
      id: `fomc-${etDate}`,
      date: jst.date,
      time: jst.time,
      title: "FOMC 政策金利発表",
      source: "Federal Reserve",
      category: "macro" as const,
      importance: "high" as const,
      symbols: SYMBOLS,
      url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
    };
  });
}

// ---- 集約 ----

function sortEvents(events: MarketEvent[]): MarketEvent[] {
  return events.sort((a, b) =>
    `${a.date} ${a.time ?? ""}`.localeCompare(`${b.date} ${b.time ?? ""}`)
  );
}

// FRED + FOMC を集約。FOMC は常に静的に入るため、FRED が落ちても最低限返る。
async function buildEvents(env: Env): Promise<MarketEvent[]> {
  const events: MarketEvent[] = [...fomcEvents()];

  const apiKey = env.FRED_API_KEY;
  if (apiKey) {
    const now = Date.now();
    const start = ymdUtc(now);
    const end = ymdUtc(now + FETCH_FUTURE_DAYS * 86_400_000);

    const results = await Promise.allSettled(
      FRED_RELEASES.map((r) => fetchReleaseDates(r, apiKey, start, end))
    );
    for (const result of results) {
      if (result.status === "fulfilled") events.push(...result.value);
    }
  }

  return sortEvents(events);
}

// ---- Cache API (1時間キャッシュ + 失敗時 stale フォールバック) ----

function getEdgeCache(): Cache | null {
  const store = (globalThis as { caches?: { default?: Cache } }).caches;
  return store?.default ?? null;
}

function countFred(events: MarketEvent[]): number {
  return events.filter((e) => e.source === "FRED").length;
}

async function loadEvents(env: Env): Promise<MarketEvent[]> {
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
    const fresh = await buildEvents(env);

    // FRED が一時的に取れなかった場合、FRED入りの stale があればそちらを優先。
    if (countFred(fresh) === 0 && cached) {
      const stale = (await cached.json()) as MarketEvent[];
      if (countFred(stale) > 0) return stale;
    }

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

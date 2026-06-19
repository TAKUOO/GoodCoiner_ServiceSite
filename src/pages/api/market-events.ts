import type { APIRoute } from "astro";

export const prerender = false;

type MarketEventCategory =
  | "macro"
  | "crypto"
  | "exchange"
  | "regulation"
  | "upgrade";

type MarketEventImportance = "high" | "medium" | "low";

type MarketEvent = {
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

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=3600",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const EVENTS: MarketEvent[] = [
  {
    id: "fomc-2026-06",
    date: "2026-06-19",
    time: "03:00",
    title: "FOMC 政策金利発表",
    source: "GoodCoiner",
    category: "macro",
    importance: "high",
    symbols: ["BTC", "ETH"],
  },
  {
    id: "cpi-2026-06",
    date: "2026-06-21",
    time: "21:30",
    title: "米 CPI（消費者物価指数）",
    source: "GoodCoiner",
    category: "macro",
    importance: "high",
    symbols: ["BTC", "ETH"],
  },
];

const isYmd = (value: string | null): value is string =>
  Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

export const OPTIONS: APIRoute = () => {
  return new Response(null, { status: 204, headers });
};

export const GET: APIRoute = ({ url }) => {
  try {
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const filteredEvents = EVENTS.filter((event) => {
      if (isYmd(from) && event.date < from) return false;
      if (isYmd(to) && event.date > to) return false;
      return true;
    });

    return new Response(JSON.stringify(filteredEvents), {
      status: 200,
      headers,
    });
  } catch {
    return new Response("[]", { status: 200, headers });
  }
};

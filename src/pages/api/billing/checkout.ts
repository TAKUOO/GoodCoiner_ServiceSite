import type { APIRoute } from "astro";
import { createCheckoutSession } from "@/lib/billing";

export const prerender = false;

export const POST: APIRoute = ({ request, locals }) =>
  createCheckoutSession(request, locals);

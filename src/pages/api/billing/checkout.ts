import type { APIRoute } from "astro";
import { createCheckoutSession, handleCheckoutOptions } from "@/lib/billing";

export const prerender = false;

export const OPTIONS: APIRoute = ({ locals }) => handleCheckoutOptions(locals);

export const POST: APIRoute = ({ request, locals }) =>
  createCheckoutSession(request, locals);

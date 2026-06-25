/**
 * # Lemon Squeezy — hosted checkout + webhook verification (graceful-optional)
 *
 * Two products, two plan ids:
 *   - 'trial-launch'  → fixed $5 = 10 lessons    (LEMONSQUEEZY_TRIAL_VARIANT_ID)
 *   - 'lessons-payg'  → $0.99 × quantity lessons (LEMONSQUEEZY_PAYG_VARIANT_ID)
 *
 * The SERVER creates the checkout (so price/quantity can't be tampered with) and
 * stamps `custom_data = { user_id, plan_id }`; the front-end opens the returned URL
 * in the Lemon.js overlay. On payment, Lemon Squeezy POSTs a signed webhook — we
 * verify the HMAC over the RAW body, then credit the buyer's account (idempotent
 * on the order id). Credits granted = trial→10, payg→the order line-item quantity;
 * we never trust the client for the amount.
 *
 * Until the LEMONSQUEEZY_* env vars are set, `billingConfigured()` is false and the
 * checkout route returns a friendly "billing not set up yet" — the rest of the app
 * (free grant, gate, deduction) works regardless.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.lemonsqueezy.com/v1";

export type PlanId = "trial-launch" | "lessons-payg";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** Variant id for a plan, from env. */
function variantFor(planId: PlanId): string {
  return planId === "trial-launch" ? env("LEMONSQUEEZY_TRIAL_VARIANT_ID") : env("LEMONSQUEEZY_PAYG_VARIANT_ID");
}

/** True when checkout can be created (API key + store + both variants present). */
export function billingConfigured(): boolean {
  return !!(env("LEMONSQUEEZY_API_KEY") && env("LEMONSQUEEZY_STORE_ID") && env("LEMONSQUEEZY_TRIAL_VARIANT_ID") && env("LEMONSQUEEZY_PAYG_VARIANT_ID"));
}

/** True when the webhook signing secret is set (gates the webhook route). */
export function webhookConfigured(): boolean {
  return !!env("LEMONSQUEEZY_WEBHOOK_SECRET");
}

/** Lessons to credit for a paid order — server-computed, never from the client. */
export function lessonsForOrder(planId: string, quantity: number): number {
  if (planId === "trial-launch") return 10;
  if (planId === "lessons-payg") return Math.max(1, Math.round(quantity || 1));
  return 0;
}

/**
 * Create a hosted checkout and return its URL (for the Lemon.js overlay). For PAYG
 * we preset the quantity to the slider value; the trial is a fixed single item.
 */
export async function createCheckout(args: {
  planId: PlanId;
  quantity: number;
  userId: string;
  userEmail?: string;
  redirectUrl: string;
}): Promise<string> {
  if (!billingConfigured()) throw new Error("billing-not-configured");
  const variantId = variantFor(args.planId);
  const storeId = env("LEMONSQUEEZY_STORE_ID");
  const qty = args.planId === "lessons-payg" ? Math.max(1, Math.round(args.quantity || 1)) : 1;

  const body = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_data: {
          email: args.userEmail || undefined,
          custom: { user_id: args.userId, plan_id: args.planId },
          variant_quantities: [{ variant_id: Number(variantId), quantity: qty }],
        },
        product_options: { redirect_url: args.redirectUrl },
        checkout_options: { embed: true },
      },
      relationships: {
        store: { data: { type: "stores", id: String(storeId) } },
        variant: { data: { type: "variants", id: String(variantId) } },
      },
    },
  };

  const res = await fetch(`${API}/checkouts`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${env("LEMONSQUEEZY_API_KEY")}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`lemonsqueezy checkout ${res.status}: ${txt.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: { attributes?: { url?: string } } };
  const url = json.data?.attributes?.url;
  if (!url) throw new Error("lemonsqueezy: no checkout url in response");
  return url;
}

/**
 * Verify the `X-Signature` header against an HMAC-SHA256 of the RAW request body
 * using the signing secret. Constant-time compare; false on any shape mismatch.
 */
export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = env("LEMONSQUEEZY_WEBHOOK_SECRET");
  if (!secret || !signature) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(digest, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface ParsedOrder {
  eventName: string;
  orderId: string;        // LS order id → idempotency key
  userId: string;         // from checkout custom_data
  planId: string;         // from checkout custom_data
  quantity: number;       // order line-item quantity
  amountUsd: number;      // order total, dollars
}

/**
 * Pull the fields we need out of an `order_created` / `order_paid` webhook payload.
 * `user_id` / `plan_id` ride in `meta.custom_data` (set at checkout). Returns null
 * if it isn't an order event we can act on.
 */
export function parseOrder(payload: unknown): ParsedOrder | null {
  const p = payload as {
    meta?: { event_name?: string; custom_data?: { user_id?: string; plan_id?: string } };
    data?: { id?: string; attributes?: { total?: number; first_order_item?: { quantity?: number } } };
  };
  const eventName = p.meta?.event_name ?? "";
  if (!eventName.startsWith("order_")) return null;
  const orderId = p.data?.id ? String(p.data.id) : "";
  if (!orderId) return null;
  const custom = p.meta?.custom_data ?? {};
  const attrs = p.data?.attributes ?? {};
  return {
    eventName,
    orderId,
    userId: custom.user_id ?? "",
    planId: custom.plan_id ?? "",
    quantity: Number(attrs.first_order_item?.quantity ?? 1),
    amountUsd: Number(attrs.total ?? 0) / 100,
  };
}

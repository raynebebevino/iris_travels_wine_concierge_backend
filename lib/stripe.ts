// ──────────────────────────────────────────────────────────────────────────────
// lib/stripe.ts — Stripe SDK singleton + price/tier utilities
// ──────────────────────────────────────────────────────────────────────────────

import Stripe from "stripe";
import { MembershipTier, BillingInterval } from "../types";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

// Singleton — reuse across requests
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
  typescript: true,
});

// ── Price ID lookup ────────────────────────────────────────────────────────────
type PriceKey = `${MembershipTier}_${BillingInterval}`;

const PRICE_MAP: Record<PriceKey, string | undefined> = {
  rose_monthly:        process.env.STRIPE_PRICE_ROSE_MONTHLY,
  rose_annual:         process.env.STRIPE_PRICE_ROSE_ANNUAL,
  grand_cru_monthly:   process.env.STRIPE_PRICE_GRAND_CRU_MONTHLY,
  grand_cru_annual:    process.env.STRIPE_PRICE_GRAND_CRU_ANNUAL,
  premier_cru_monthly: process.env.STRIPE_PRICE_PREMIER_CRU_MONTHLY,
  premier_cru_annual:  process.env.STRIPE_PRICE_PREMIER_CRU_ANNUAL,
};

export function getPriceId(tier: MembershipTier, interval: BillingInterval): string {
  const key: PriceKey = `${tier}_${interval}`;
  const priceId = PRICE_MAP[key];
  if (!priceId) {
    throw new Error(`No Stripe price configured for tier=${tier} interval=${interval}. Check .env.local`);
  }
  return priceId;
}

// ── Tier metadata ──────────────────────────────────────────────────────────────
export const TIER_LABELS: Record<MembershipTier, string> = {
  rose:        "Rosé",
  grand_cru:   "Grand Cru",
  premier_cru: "Premier Cru",
};

export const TIER_MONTHLY_PRICES: Record<MembershipTier, number> = {
  rose:        12,
  grand_cru:   29,
  premier_cru: 69,
};

// ── Retrieve active subscription for a Stripe customer ─────────────────────────
export async function getActiveSubscription(
  stripeCustomerId: string
): Promise<Stripe.Subscription | null> {
  const subs = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "all",
    limit: 5,
    expand: ["data.default_payment_method"],
  });

  const active = subs.data.find((s) =>
    ["active", "trialing", "past_due"].includes(s.status)
  );
  return active ?? null;
}

// ── Extract tier from a Stripe subscription's metadata ──────────────────────────
export function getTierFromSubscription(
  sub: Stripe.Subscription
): MembershipTier | null {
  const tier = sub.metadata?.tier as MembershipTier | undefined;
  if (tier && ["rose", "grand_cru", "premier_cru"].includes(tier)) {
    return tier;
  }
  return null;
}

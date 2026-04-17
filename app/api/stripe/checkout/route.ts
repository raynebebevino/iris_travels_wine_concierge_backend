// ──────────────────────────────────────────────────────────────────────────────
// app/api/stripe/checkout/route.ts
//
// Creates a Stripe Checkout Session for Iris Travels membership subscriptions.
//
// Flow:
//   Client calls POST /api/stripe/checkout → receives { url }
//   Client redirects to url (Stripe-hosted checkout page)
//   On success: Stripe redirects to successUrl
//   Stripe fires webhook → /api/stripe/webhook → membership activated
// ──────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";
import { stripe, getPriceId, TIER_LABELS } from "../../../../lib/stripe";
import type { MembershipTier, BillingInterval, ApiError } from "../../../../types";

const RequestSchema = z.object({
  tier: z.enum(["rose", "grand_cru", "premier_cru"]),
  interval: z.enum(["monthly", "annual"]),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  // 1. Auth
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json<ApiError>({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await currentUser();
  if (!user) {
    return NextResponse.json<ApiError>({ error: "User not found" }, { status: 404 });
  }

  // 2. Validate body
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json<ApiError>({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiError>(
      { error: "Invalid request", details: parsed.error.message },
      { status: 400 }
    );
  }

  const { tier, interval, successUrl, cancelUrl } = parsed.data;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // 3. Resolve Stripe price ID
  let priceId: string;
  try {
    priceId = getPriceId(tier as MembershipTier, interval as BillingInterval);
  } catch (err: unknown) {
    console.error("[Checkout] Price ID error:", err);
    return NextResponse.json<ApiError>(
      { error: "Selected membership plan is not currently available." },
      { status: 400 }
    );
  }

  // 4. Look up or create Stripe customer
  let stripeCustomerId: string | undefined;

  // In production: look up from your DB by userId
  // For MVP: create a new customer each time (Stripe deduplicates by email)
  const primaryEmail = user.emailAddresses[0]?.emailAddress;
  if (!primaryEmail) {
    return NextResponse.json<ApiError>({ error: "Account email not found" }, { status: 400 });
  }

  const existingCustomers = await stripe.customers.list({ email: primaryEmail, limit: 1 });
  if (existingCustomers.data.length > 0) {
    stripeCustomerId = existingCustomers.data[0].id;
  } else {
    const newCustomer = await stripe.customers.create({
      email: primaryEmail,
      name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
      metadata: { clerkUserId: userId },
    });
    stripeCustomerId = newCustomer.id;
  }

  // 5. Create Checkout Session
  try {
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],

      // 30-day free trial on all new subscriptions
      subscription_data: {
        trial_period_days: 30,
        metadata: {
          clerkUserId: userId,
          tier,
          interval,
        },
      },

      // Collect billing address for EU VAT compliance
      billing_address_collection: "required",

      // Allow promo codes (useful for launch campaign)
      allow_promotion_codes: true,

      // Success / cancel redirect URLs
      success_url: successUrl ?? `${appUrl}/dashboard?checkout=success&tier=${tier}`,
      cancel_url: cancelUrl ?? `${appUrl}/membership?checkout=canceled`,

      // Pass metadata for webhook processing
      metadata: {
        clerkUserId: userId,
        tier,
        interval,
        tierLabel: TIER_LABELS[tier as MembershipTier],
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (err: unknown) {
    console.error("[Checkout] Stripe error:", err);
    return NextResponse.json<ApiError>(
      { error: "Unable to create checkout session. Please try again." },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

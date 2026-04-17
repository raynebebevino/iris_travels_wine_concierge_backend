// ──────────────────────────────────────────────────────────────────────────────
// app/api/member/route.ts
//
// Returns the authenticated member's profile + live subscription status.
// Used by the frontend to show membership tier, pass validity, and perks.
// ──────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { stripe, getActiveSubscription, getTierFromSubscription, TIER_LABELS } from "../../../lib/stripe";
import type { SubscriptionStatusResponse, ApiError } from "../../../types";

export async function GET(req: NextRequest) {
  // 1. Auth
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json<ApiError>({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await currentUser();
  if (!user) {
    return NextResponse.json<ApiError>({ error: "User not found" }, { status: 404 });
  }

  // 2. In production: load member record from DB (includes stripeCustomerId)
  // const member = await db.member.findUnique({ where: { clerkUserId: userId } });
  // For MVP: look up Stripe customer by email
  const primaryEmail = user.emailAddresses[0]?.emailAddress;
  if (!primaryEmail) {
    return NextResponse.json<ApiError>({ error: "No email on account" }, { status: 400 });
  }

  const customers = await stripe.customers.list({ email: primaryEmail, limit: 1 });
  if (customers.data.length === 0) {
    // No Stripe customer = no subscription = free user
    return NextResponse.json<SubscriptionStatusResponse>({
      active: false,
      tier: null,
      interval: null,
      status: "none",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
  }

  const customer = customers.data[0];

  // 3. Get active subscription
  const subscription = await getActiveSubscription(customer.id);
  if (!subscription) {
    return NextResponse.json<SubscriptionStatusResponse>({
      active: false,
      tier: null,
      interval: null,
      status: "none",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
  }

  // 4. Determine tier + interval
  const tier = getTierFromSubscription(subscription);
  const interval = (subscription.items.data[0]?.plan?.interval === "year")
    ? "annual" : "monthly";

  const isActive = ["active", "trialing"].includes(subscription.status);

  return NextResponse.json<SubscriptionStatusResponse>({
    active: isActive,
    tier,
    interval,
    status: subscription.status,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}

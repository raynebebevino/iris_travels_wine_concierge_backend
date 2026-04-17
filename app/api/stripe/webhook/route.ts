// ──────────────────────────────────────────────────────────────────────────────
// app/api/stripe/webhook/route.ts
//
// Handles Stripe webhook events to keep membership status in sync.
//
// IMPORTANT: This route must be excluded from Clerk auth middleware
// (raw body required for signature verification). See middleware.ts.
//
// Events handled:
//   checkout.session.completed      → provision new membership
//   customer.subscription.updated   → tier change / renewal
//   customer.subscription.deleted   → cancellation / expiry
//   invoice.payment_failed          → flag member as past_due
// ──────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, getTierFromSubscription } from "../../../../lib/stripe";
import type { MembershipTier } from "../../../../types";

// In production: import your DB client here
// import { db } from "../../../../lib/db";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// ── Helper: update member in DB ────────────────────────────────────────────────
// Replace these stubs with your actual database calls
async function provisionMembership(opts: {
  clerkUserId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  tier: MembershipTier;
  status: string;
  currentPeriodEnd: number;
}) {
  console.log("[Webhook] Provisioning membership:", opts);
  // TODO: upsert member record in your DB
  // Example with Prisma:
  // await db.member.upsert({
  //   where: { clerkUserId: opts.clerkUserId },
  //   create: { ...opts, memberSince: new Date() },
  //   update: { ...opts },
  // });
}

async function updateSubscriptionStatus(opts: {
  stripeSubscriptionId: string;
  status: string;
  tier?: MembershipTier;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
}) {
  console.log("[Webhook] Updating subscription status:", opts);
  // TODO: update subscription status in your DB
}

async function deactivateMembership(stripeSubscriptionId: string) {
  console.log("[Webhook] Deactivating membership:", stripeSubscriptionId);
  // TODO: mark member as canceled in your DB, revoke pass
}

// ── Route handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!WEBHOOK_SECRET) {
    console.error("[Webhook] Missing STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Stripe requires the raw body for signature verification
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  // 1. Verify webhook signature (prevents spoofed events)
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Webhook] Signature verification failed:", msg);
    return NextResponse.json({ error: `Webhook signature invalid: ${msg}` }, { status: 400 });
  }

  console.log(`[Webhook] Received event: ${event.type} (id: ${event.id})`);

  // 2. Handle events
  try {
    switch (event.type) {

      // ── New subscription created (after free trial or first payment) ─────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const clerkUserId = session.metadata?.clerkUserId;
        const tier = session.metadata?.tier as MembershipTier;
        const stripeCustomerId = session.customer as string;
        const stripeSubscriptionId = session.subscription as string;

        if (!clerkUserId || !tier) {
          console.error("[Webhook] Missing metadata on checkout session:", session.id);
          break;
        }

        // Fetch the subscription to get period end
        const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);

        await provisionMembership({
          clerkUserId,
          stripeCustomerId,
          stripeSubscriptionId,
          tier,
          status: sub.status,
          currentPeriodEnd: sub.current_period_end,
        });
        break;
      }

      // ── Subscription updated (upgrade, downgrade, renewal) ──────────────────
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const tier = getTierFromSubscription(sub);

        await updateSubscriptionStatus({
          stripeSubscriptionId: sub.id,
          status: sub.status,
          tier: tier ?? undefined,
          currentPeriodEnd: sub.current_period_end,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        });
        break;
      }

      // ── Subscription canceled or expired ─────────────────────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await deactivateMembership(sub.id);
        break;
      }

      // ── Payment failed (card declined, expired, etc.) ─────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (subId) {
          await updateSubscriptionStatus({
            stripeSubscriptionId: subId,
            status: "past_due",
          });
          // TODO: trigger email to member asking them to update payment method
        }
        break;
      }

      // ── Trial ending reminder (3 days before) ────────────────────────────────
      case "customer.subscription.trial_will_end": {
        const sub = event.data.object as Stripe.Subscription;
        const clerkUserId = sub.metadata?.clerkUserId;
        console.log(`[Webhook] Trial ending soon for user: ${clerkUserId}`);
        // TODO: send "trial ending" email via your email provider (Resend, SendGrid)
        break;
      }

      default:
        // Unhandled event types are fine — Stripe sends many event types
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true, eventId: event.id });
  } catch (err: unknown) {
    console.error("[Webhook] Handler error:", err);
    // Return 200 to prevent Stripe from retrying — log to error tracking (Sentry)
    return NextResponse.json({ received: true, error: "Handler error logged" });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

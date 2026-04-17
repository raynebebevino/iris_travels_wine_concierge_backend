// ──────────────────────────────────────────────────────────────────────────────
// Iris Travels Wine Concierge Service — Shared Types
// ──────────────────────────────────────────────────────────────────────────────

export type MembershipTier = "rose" | "grand_cru" | "premier_cru";
export type BillingInterval = "monthly" | "annual";

export interface MemberProfile {
  clerkUserId: string;
  email: string;
  name: string;
  tier: MembershipTier;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  subscriptionStatus: "active" | "trialing" | "past_due" | "canceled" | "paused";
  trialEndsAt?: string;        // ISO date — 30-day free trial
  memberSince: string;         // ISO date
  digitalPassId: string;       // UUID for QR code generation
  cellars: CellarEntry[];
  bacchusChatTokensUsed: number; // running monthly total
}

export interface CellarEntry {
  id: string;
  wineName: string;
  vintage: number;
  region: string;
  quantity: number;
  purchasePrice?: number;
  drinkFrom?: number;
  drinkBy?: number;
  notes?: string;
  addedAt: string;
}

export interface BacchusMessage {
  role: "user" | "assistant";
  content: string;
}

export interface BacchusRequest {
  messages: BacchusMessage[];
  memberId?: string;            // optional — for token tracking
}

export interface BacchusResponse {
  reply: string;
  tokensUsed: number;
  monthlyBudgetRemaining: number;
}

export interface StripeCheckoutRequest {
  priceId: string;
  tier: MembershipTier;
  interval: BillingInterval;
  successUrl?: string;
  cancelUrl?: string;
}

export interface StripeCheckoutResponse {
  sessionId: string;
  url: string;
}

export interface SubscriptionStatusResponse {
  active: boolean;
  tier: MembershipTier | null;
  interval: BillingInterval | null;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface DigitalPassResponse {
  passId: string;
  memberName: string;
  tier: MembershipTier;
  validUntil: string;           // ISO date — end of current billing period
  qrCodeData: string;           // Base64 QR code PNG
}

// API Error shape
export interface ApiError {
  error: string;
  code?: string;
  details?: string;
}

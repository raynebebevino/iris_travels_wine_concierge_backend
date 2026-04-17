# Iris Travels Wine Concierge — Backend API

Next.js 14 App Router backend serving the Iris Travels Wine Concierge web and iOS apps.

## Stack

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Next.js 14 (App Router) | API routes |
| Auth | Clerk | Member login, session management |
| Payments | Stripe | Subscriptions + marketplace |
| AI | Anthropic Claude API | Bacchus sommelier proxy |
| Types | TypeScript + Zod | Request validation |
| Deploy | Vercel | Hosting + edge functions |

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/iris-travels/backend
cd iris-travels-backend
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in all values in .env.local (see Configuration section)

# 3. Run development server
npm run dev
# Backend runs on http://localhost:3001

# 4. Listen for Stripe webhooks (in a separate terminal)
stripe listen --forward-to localhost:3001/api/stripe/webhook
```

---

## Configuration

### Step 1 — Anthropic (Bacchus AI)
1. Go to [console.anthropic.com](https://console.anthropic.com/account/keys)
2. Create an API key
3. Add to `.env.local`: `ANTHROPIC_API_KEY=sk-ant-...`

### Step 2 — Clerk (Authentication)
1. Create a new app at [dashboard.clerk.com](https://dashboard.clerk.com)
2. Choose "Email + Password" sign-in method
3. Copy **Publishable Key** and **Secret Key** to `.env.local`

### Step 3 — Stripe (Subscriptions)
1. Create account at [stripe.com](https://stripe.com)
2. Create 3 products with 6 prices (monthly + annual for each tier):

| Product | Monthly Price | Annual Price |
|---|---|---|
| Iris Travels Rosé | $12.00/mo | $115.00/yr |
| Iris Travels Grand Cru | $29.00/mo | $278.00/yr |
| Iris Travels Premier Cru | $69.00/mo | $662.00/yr |

3. Copy each Price ID to `.env.local`
4. Add metadata `{ "tier": "rose" | "grand_cru" | "premier_cru" }` to each **Subscription** (not the Price)
5. Set up webhook endpoint:
   - Endpoint URL: `https://your-domain.com/api/stripe/webhook`
   - Events to send:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
     - `customer.subscription.trial_will_end`
6. Copy **Webhook signing secret** to `STRIPE_WEBHOOK_SECRET`

---

## API Routes

### `POST /api/bacchus`
Secure proxy for Bacchus AI sommelier. Requires Clerk session.

**Request:**
```json
{
  "messages": [
    { "role": "user", "content": "What pairs with a Wagyu ribeye?" }
  ]
}
```

**Response:**
```json
{
  "reply": "For a Wagyu ribeye of that intensity...",
  "tokensUsed": 420,
  "monthlyBudgetRemaining": 49580
}
```

**Error codes:**
- `401` — Not authenticated
- `429` — Monthly token budget exhausted (`BUDGET_EXHAUSTED`)
- `429` — Anthropic rate limited (`RATE_LIMITED`)

---

### `POST /api/stripe/checkout`
Creates a Stripe Checkout session. Requires Clerk session.

**Request:**
```json
{
  "tier": "grand_cru",
  "interval": "monthly"
}
```

**Response:**
```json
{
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/pay/cs_test_..."
}
```

Redirect the user to `url` to complete payment.

---

### `POST /api/stripe/webhook`
Receives Stripe events. **No auth required** — secured via `Stripe-Signature` header.
Must be in `publicRoutes` in `middleware.ts`.

---

### `GET /api/member`
Returns authenticated member's subscription status. Requires Clerk session.

**Response:**
```json
{
  "active": true,
  "tier": "grand_cru",
  "interval": "monthly",
  "status": "active",
  "currentPeriodEnd": "2025-05-16T00:00:00.000Z",
  "cancelAtPeriodEnd": false
}
```

---

## Frontend Integration

Update the frontend `BacchusAI.tsx` to call your backend proxy instead of the Anthropic API directly:

```typescript
// Before (INSECURE — exposes API key):
const res = await fetch("https://api.anthropic.com/v1/messages", { ... });

// After (SECURE — goes through your backend):
const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bacchus`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ messages }),
  credentials: "include", // sends Clerk session cookie
});
```

---

## Deployment (Vercel)

```bash
# Deploy to Vercel
npx vercel --prod

# Add all .env.local variables to Vercel:
# vercel.com → Your Project → Settings → Environment Variables
```

**Important:** Add `STRIPE_WEBHOOK_SECRET` in Vercel environment variables after adding your production webhook endpoint in the Stripe Dashboard.

---

## Security Checklist Before Going Live

- [ ] `ANTHROPIC_API_KEY` is ONLY in `.env.local` / Vercel env — never in client code
- [ ] `STRIPE_WEBHOOK_SECRET` is set and webhook signature verification is active
- [ ] Clerk publishable key is the ONLY Clerk key in client-side code
- [ ] All `/api/*` routes (except webhook) protected by Clerk middleware
- [ ] Stripe test mode replaced with live mode keys in production
- [ ] Token budget is stored in Redis/DB (not in-memory) for production scale
- [ ] Error tracking (Sentry) added to webhook handler

---

## TODO (Production Additions)

- [ ] **Database** — Add PostgreSQL via Prisma (`npm install prisma @prisma/client`)
- [ ] **Redis** — Replace in-memory token tracker with Redis (Upstash recommended on Vercel)
- [ ] **Digital Pass** — Generate QR codes with `qrcode` npm package, store pass UUID in DB
- [ ] **Email** — Add Resend (`npm install resend`) for trial-ending and receipt emails
- [ ] **Cellar Manager** — CRUD routes for member wine cellar entries
- [ ] **Admin Dashboard** — Internal routes for managing partner estates and member data
- [ ] **GDPR** — Data deletion endpoint + cookie consent banner

---

*Iris Travels Wine Concierge Service · iristravelsuncorked.substack.com*

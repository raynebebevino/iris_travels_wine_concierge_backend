// ──────────────────────────────────────────────────────────────────────────────
// middleware.ts  (Next.js root middleware)
//
// Clerk authentication middleware:
//   • Protects all /api/* routes (requires valid Clerk session)
//   • Exempts /api/stripe/webhook (Stripe must POST without auth)
//   • Exempts static assets and Next.js internals
//
// IMPORTANT: The Stripe webhook route MUST be in the publicRoutes list —
// Stripe cannot send a Clerk session cookie, so auth verification would fail.
// The webhook is secured instead via Stripe-Signature header verification
// inside the route handler itself.
// ──────────────────────────────────────────────────────────────────────────────

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routes that do NOT require authentication
const isPublicRoute = createRouteMatcher([
  "/",                            // landing page (if SSR)
  "/api/stripe/webhook",          // Stripe webhooks — auth via stripe-signature
  "/api/health",                  // healthcheck endpoint
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/membership(.*)",              // membership page is public for marketing
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    // Protect the route — redirects unauthenticated users to /sign-in
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Run middleware on all routes except Next.js internals + static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

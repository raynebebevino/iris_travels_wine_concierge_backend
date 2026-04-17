/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required: don't parse body on webhook route (Stripe needs raw body)
  // This is handled per-route with req.text() in the webhook handler
};

module.exports = nextConfig;

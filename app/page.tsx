export default function Home() {
  return (
    <main style={{ fontFamily: "monospace", padding: "40px", background: "#0f2318", color: "#c9a84c", minHeight: "100vh" }}>
      <h1>🍷 Iris Travels Wine Concierge — API</h1>
      <p style={{ color: "#f5f0e8" }}>Backend is running.</p>
      <hr style={{ borderColor: "#1a3a2a", margin: "24px 0" }} />
      <h2>Available Endpoints</h2>
      <ul style={{ color: "#f5f0e8", lineHeight: 2 }}>
        <li>POST /api/bacchus — Bacchus AI Sommelier (auth required)</li>
        <li>POST /api/stripe/checkout — Create checkout session (auth required)</li>
        <li>POST /api/stripe/webhook — Stripe event handler (Stripe-Signature required)</li>
        <li>GET  /api/member — Membership status (auth required)</li>
      </ul>
    </main>
  );
}

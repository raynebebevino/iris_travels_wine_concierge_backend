import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "Iris Travels Wine Concierge API",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// app/api/bacchus/route.ts
//
// Secure server-side proxy for Bacchus AI (Anthropic Claude).
// This keeps the ANTHROPIC_API_KEY on the server — never exposed to the client.
//
// Security:
//   • Requires valid Clerk session (auth middleware enforces this)
//   • Per-member monthly token budget enforced
//   • Request body validated with Zod
//   • Rate limiting via token budget (add Redis for IP-level limiting in prod)
// ──────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";
import { anthropic, BACCHUS_SYSTEM_PROMPT, BACCHUS_MONTHLY_TOKEN_BUDGET } from "../../../lib/anthropic";
import type { ApiError } from "../../../types";

// ── Request schema ─────────────────────────────────────────────────────────────
const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

const RequestSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(40),
});

// ── In-memory token tracker (replace with Redis/DB in production) ──────────────
// Key: userId, Value: { count, resetAt (first-of-month ISO) }
const tokenUsage = new Map<string, { count: number; resetAt: string }>();

function getMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function getTokensUsed(userId: string): number {
  const entry = tokenUsage.get(userId);
  if (!entry || entry.resetAt !== getMonthKey()) return 0;
  return entry.count;
}

function addTokensUsed(userId: string, tokens: number): void {
  const monthKey = getMonthKey();
  const entry = tokenUsage.get(userId);
  if (!entry || entry.resetAt !== monthKey) {
    tokenUsage.set(userId, { count: tokens, resetAt: monthKey });
  } else {
    tokenUsage.set(userId, { count: entry.count + tokens, resetAt: monthKey });
  }
}

// ── Handler ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // 1. Authenticate via Clerk
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json<ApiError>(
      { error: "Unauthorized. A valid Iris Travels membership is required to use Bacchus." },
      { status: 401 }
    );
  }

  // 2. Check monthly token budget
  const tokensUsed = getTokensUsed(userId);
  if (tokensUsed >= BACCHUS_MONTHLY_TOKEN_BUDGET) {
    return NextResponse.json<ApiError>(
      {
        error: "Monthly Bacchus AI budget reached. Your allowance resets at the start of next month.",
        code: "BUDGET_EXHAUSTED",
        details: `Used: ${tokensUsed} / ${BACCHUS_MONTHLY_TOKEN_BUDGET} tokens this month.`,
      },
      { status: 429 }
    );
  }

  // 3. Parse + validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<ApiError>({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiError>(
      { error: "Invalid request", details: parsed.error.message },
      { status: 400 }
    );
  }

  const { messages } = parsed.data;

  // 4. Call Anthropic API
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: BACCHUS_SYSTEM_PROMPT,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const totalTokens = inputTokens + outputTokens;

    // 5. Track token usage
    addTokensUsed(userId, totalTokens);
    const newTotal = getTokensUsed(userId);

    const replyBlock = response.content[0];
    const reply = replyBlock.type === "text" ? replyBlock.text : "";

    return NextResponse.json({
      reply,
      tokensUsed: totalTokens,
      monthlyBudgetRemaining: Math.max(0, BACCHUS_MONTHLY_TOKEN_BUDGET - newTotal),
    });
  } catch (err: unknown) {
    console.error("[Bacchus API] Anthropic error:", err);

    // Surface Anthropic-specific errors gracefully
    if (err instanceof Error && err.message.includes("rate_limit")) {
      return NextResponse.json<ApiError>(
        { error: "Bacchus is momentarily resting. Please try again in a few seconds.", code: "RATE_LIMITED" },
        { status: 429 }
      );
    }

    return NextResponse.json<ApiError>(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}

// Reject non-POST requests
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

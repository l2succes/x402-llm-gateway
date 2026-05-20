#!/usr/bin/env node
/**
 * Test script for the x402 LLM Gateway.
 *
 * Usage:
 *   # Tier 1 — smoke tests only (no payment, no wallet needed)
 *   node scripts/test-gateway.mjs
 *
 *   # Tier 2 — provider tests (temporarily disable x402 in src/index.ts)
 *   SKIP_PAYMENT=1 node scripts/test-gateway.mjs
 *
 *   # Tier 3 — full x402 payment test (requires funded wallet on Base Sepolia or mainnet)
 *   PRIVATE_KEY=0x... node scripts/test-gateway.mjs
 *
 * Environment:
 *   GATEWAY_URL   Base URL of the gateway (default: http://localhost:3000)
 *   PRIVATE_KEY   EVM private key for making paid requests (Tier 3 only)
 *   USE_MAINNET   Set to "1" to use Base mainnet instead of Base Sepolia
 */

import { createWalletClient, http, parseUnits, formatUnits } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { base, baseSepolia } from "viem/chains"

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:3000"
const PRIVATE_KEY = process.env.PRIVATE_KEY
const USE_MAINNET = process.env.USE_MAINNET === "1"
const SKIP_PAYMENT = process.env.SKIP_PAYMENT === "1"

const chain = USE_MAINNET ? base : baseSepolia

let passed = 0
let failed = 0

function ok(label) {
  console.log(`  ✅ ${label}`)
  passed++
}

function fail(label, detail) {
  console.error(`  ❌ ${label}`)
  if (detail) console.error(`     ${detail}`)
  failed++
}

async function run(label, fn) {
  process.stdout.write(`\n▶ ${label}\n`)
  try {
    await fn()
  } catch (err) {
    fail(label, err.message)
  }
}

// ─── Tier 1: Smoke Tests ─────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`)
console.log(`  x402 LLM Gateway Test Suite`)
console.log(`  Target: ${GATEWAY_URL}`)
console.log(`  Network: ${USE_MAINNET ? "Base mainnet" : "Base Sepolia (testnet)"}`)
console.log(`${"─".repeat(50)}`)

console.log("\n── Tier 1: Smoke Tests ──────────────────────────────")

await run("GET /health", async () => {
  const res = await fetch(`${GATEWAY_URL}/health`)
  if (!res.ok) return fail("health check", `HTTP ${res.status}`)
  const body = await res.json()
  if (body.status !== "ok") return fail("status field", JSON.stringify(body))
  if (typeof body.models !== "number" || body.models < 1) return fail("models count", JSON.stringify(body))
  ok(`status=ok, ${body.models} models registered`)
})

await run("GET /api/v1/models (free endpoint)", async () => {
  const res = await fetch(`${GATEWAY_URL}/api/v1/models`)
  if (!res.ok) return fail("models endpoint", `HTTP ${res.status}`)
  const body = await res.json()
  if (body.object !== "list") return fail("response shape", JSON.stringify(body))
  const ids = body.data.map((m) => m.id)
  ok(`${ids.length} models: ${ids.join(", ")}`)
})

await run("GET /llms.txt (discovery file)", async () => {
  const res = await fetch(`${GATEWAY_URL}/llms.txt`)
  if (!res.ok) return fail("llms.txt", `HTTP ${res.status}`)
  const text = await res.text()
  if (!text.includes("x402")) return fail("content", "missing x402 reference")
  ok(`${text.length} chars, contains x402 payment info`)
})

await run("POST /api/v1/chat/completions → 402 (no payment)", async () => {
  const res = await fetch(`${GATEWAY_URL}/api/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "anthropic/claude-haiku-4-5", messages: [{ role: "user", content: "hi" }] }),
  })
  if (res.status !== 402) return fail("expected 402", `got HTTP ${res.status}`)
  const paymentRequired = res.headers.get("x-payment-required") ?? res.headers.get("payment-required")
  if (!paymentRequired) return fail("missing PAYMENT-REQUIRED header", "x402 middleware not working")
  ok(`HTTP 402 with PAYMENT-REQUIRED header ✓`)
})

await run("POST with unknown model → 402 (x402 fires before routing)", async () => {
  const res = await fetch(`${GATEWAY_URL}/api/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "fake/model", messages: [{ role: "user", content: "hi" }] }),
  })
  // x402 fires first — should still 402, not 404
  if (res.status !== 402) return fail("expected 402 before routing", `got HTTP ${res.status}`)
  ok(`HTTP 402 (x402 fires before model routing as expected)`)
})

// ─── Tier 2: Provider Tests (SKIP_PAYMENT=1) ─────────────────────────────────

if (SKIP_PAYMENT) {
  console.log("\n── Tier 2: Provider Tests (x402 bypassed) ──────────────")
  console.log("  ⚠️  SKIP_PAYMENT=1 — make sure paymentMiddleware is commented out in src/index.ts")

  const testModel = async (slug, expectedContent = null) => {
    const res = await fetch(`${GATEWAY_URL}/api/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: slug,
        messages: [{ role: "user", content: 'Reply with exactly the word "PONG" and nothing else.' }],
        max_tokens: 10,
      }),
    })
    if (!res.ok) return fail(slug, `HTTP ${res.status}: ${await res.text()}`)
    const body = await res.json()
    const content = body.choices?.[0]?.message?.content ?? ""
    ok(`${slug} → "${content.trim()}"`)
  }

  await run("Anthropic claude-haiku-4-5", () => testModel("anthropic/claude-haiku-4-5"))
  await run("Anthropic claude-sonnet-4-6", () => testModel("anthropic/claude-sonnet-4-6"))
  await run("OpenAI gpt-4o-mini", () => testModel("openai/gpt-4o-mini"))
  await run("OpenAI gpt-5.5", () => testModel("openai/gpt-5.5"))
  await run("Google gemini-2.5-flash", () => testModel("google/gemini-2.5-flash"))
  await run("Google gemini-3.5-flash", () => testModel("google/gemini-3.5-flash"))

  await run("Streaming (anthropic/claude-haiku-4-5)", async () => {
    const res = await fetch(`${GATEWAY_URL}/api/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "anthropic/claude-haiku-4-5",
        messages: [{ role: "user", content: "Count to 3." }],
        stream: true,
      }),
    })
    if (!res.ok) return fail("streaming", `HTTP ${res.status}`)
    const text = await res.text()
    if (!text.includes("data:")) return fail("SSE format", "no 'data:' lines found")
    if (!text.includes("[DONE]")) return fail("SSE termination", "missing [DONE]")
    const chunks = text.split("\n").filter((l) => l.startsWith("data:") && !l.includes("[DONE]"))
    ok(`${chunks.length} SSE chunks received, [DONE] present`)
  })
}

// ─── Tier 3: Full X402 Payment Test ──────────────────────────────────────────

if (PRIVATE_KEY) {
  console.log(`\n── Tier 3: X402 Payment Test (${USE_MAINNET ? "mainnet" : "Sepolia"}) ─────────────`)

  let wrapFetch
  try {
    const x402Module = await import("@x402/fetch")
    wrapFetch = x402Module.wrapFetchWithPayment ?? x402Module.default?.wrapFetchWithPayment
    if (!wrapFetch) throw new Error("wrapFetchWithPayment not found in @x402/fetch")
  } catch (err) {
    console.error(`  ⚠️  Could not load @x402/fetch: ${err.message}`)
    console.error("  Install it: npm install @x402/fetch")
    process.exit(1)
  }

  const account = privateKeyToAccount(PRIVATE_KEY)
  const walletClient = createWalletClient({ account, chain, transport: http() })

  console.log(`  Payer wallet: ${account.address}`)

  const payingFetch = wrapFetch(fetch, walletClient)

  await run("Full x402 payment → anthropic/claude-haiku-4-5", async () => {
    const res = await payingFetch(`${GATEWAY_URL}/api/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "anthropic/claude-haiku-4-5",
        messages: [{ role: "user", content: 'Reply with exactly "PAID" and nothing else.' }],
        max_tokens: 10,
      }),
    })

    if (res.status === 402) return fail("payment failed", "Still getting 402 — check wallet has USDC on correct network")
    if (!res.ok) return fail("request failed", `HTTP ${res.status}: ${await res.text()}`)

    const paymentResponse = res.headers.get("payment-response") ?? res.headers.get("x-payment-response")
    if (!paymentResponse) return fail("missing PAYMENT-RESPONSE header", "settlement may have failed")

    let settlement
    try {
      settlement = JSON.parse(Buffer.from(paymentResponse, "base64").toString())
    } catch {
      return fail("PAYMENT-RESPONSE decode", paymentResponse)
    }

    if (!settlement.success) return fail("settlement failed", JSON.stringify(settlement))

    const body = await res.json()
    const content = body.choices?.[0]?.message?.content ?? ""
    ok(`Paid! tx=${settlement.transaction?.slice(0, 18)}... content="${content.trim()}"`)
  })

  await run("Full x402 payment → streaming (openai/gpt-4o-mini)", async () => {
    const res = await payingFetch(`${GATEWAY_URL}/api/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "Say hello." }],
        stream: true,
      }),
    })

    if (res.status === 402) return fail("payment failed", "Still getting 402")
    if (!res.ok) return fail("request failed", `HTTP ${res.status}`)

    const text = await res.text()
    if (!text.includes("data:")) return fail("SSE format", "no 'data:' lines")
    if (!text.includes("[DONE]")) return fail("SSE termination", "missing [DONE]")
    const chunks = text.split("\n").filter((l) => l.startsWith("data:") && !l.includes("[DONE]"))
    ok(`Paid streaming! ${chunks.length} SSE chunks received`)
  })
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`)
console.log(`  Results: ${passed} passed, ${failed} failed`)
console.log(`${"─".repeat(50)}\n`)

if (!SKIP_PAYMENT && !PRIVATE_KEY) {
  console.log("To run provider tests (no payment):  SKIP_PAYMENT=1 node scripts/test-gateway.mjs")
  console.log("To run full x402 payment test:        PRIVATE_KEY=0x... node scripts/test-gateway.mjs\n")
}

process.exit(failed > 0 ? 1 : 0)

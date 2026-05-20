# X402 LLM Gateway — Testing Plan

## Overview

Three tiers of tests to validate the gateway before listing on X402 marketplaces.

---

## Tier 1: Local Smoke Tests (No Payment Required)

Run these before any X402 wiring to confirm the core routing and provider adapters work.

### Setup

```bash
cp .env.example .env
# fill in ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_AI_API_KEY
# set TREASURY_WALLET to any valid EVM address for now
npm install
npm run dev
```

### Test 1.1 — Health Check

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","models":6}
```

### Test 1.2 — Model Catalog (free endpoint)

```bash
curl http://localhost:3000/api/v1/models | jq '.data[].id'
# Expected: 6 model slugs printed
```

### Test 1.3 — Discovery File

```bash
curl http://localhost:3000/llms.txt
# Expected: markdown text with model list and payment info
```

### Test 1.4 — Payment Required (no signature)

```bash
curl -X POST http://localhost:3000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'
# Expected: HTTP 402 with PAYMENT-REQUIRED header
```

### Test 1.5 — Unknown Model 404

```bash
curl -X POST http://localhost:3000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"fake/model","messages":[{"role":"user","content":"hi"}]}'
# Expected: HTTP 404 with {"error":{"code":"model_not_found",...}}
# NOTE: This only fires after x402 payment clears — 402 comes first
```

---

## Tier 2: Provider Integration Tests (Bypass X402)

Temporarily comment out the `paymentMiddleware` line in `src/index.ts` to test provider adapters directly.

> **Important:** Re-enable x402 before deploying.

### Test 2.1 — Anthropic (non-streaming)

```bash
curl -X POST http://localhost:3000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-3-5-haiku",
    "messages": [{"role": "user", "content": "Reply with just the word PONG"}]
  }' | jq '.choices[0].message.content'
# Expected: "PONG"
```

### Test 2.2 — OpenAI (non-streaming)

```bash
curl -X POST http://localhost:3000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [{"role": "user", "content": "Reply with just the word PONG"}]
  }' | jq '.choices[0].message.content'
# Expected: "PONG"
```

### Test 2.3 — Google Gemini (non-streaming)

```bash
curl -X POST http://localhost:3000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemini-2.0-flash",
    "messages": [{"role": "user", "content": "Reply with just the word PONG"}]
  }' | jq '.choices[0].message.content'
# Expected: "PONG"
```

### Test 2.4 — Streaming (SSE)

```bash
curl -X POST http://localhost:3000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "model": "anthropic/claude-3-5-haiku",
    "messages": [{"role": "user", "content": "Count to 5 slowly"}],
    "stream": true
  }'
# Expected: series of SSE events like:
# data: {"object":"chat.completion.chunk","choices":[{"delta":{"content":"1"}},...]}
# ...
# data: [DONE]
```

### Test 2.5 — System Prompt

```bash
curl -X POST http://localhost:3000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [
      {"role": "system", "content": "You always respond in ALL CAPS."},
      {"role": "user", "content": "say hello"}
    ]
  }' | jq '.choices[0].message.content'
# Expected: something like "HELLO!"
```

### Test 2.6 — OpenAI SDK as Client

```typescript
import OpenAI from "openai"

const client = new OpenAI({
  baseURL: "http://localhost:3000/api/v1",
  apiKey: "not-needed", // x402 is the auth
})

const res = await client.chat.completions.create({
  model: "google/gemini-2.0-flash",
  messages: [{ role: "user", content: "What is 2+2?" }],
})
console.log(res.choices[0].message.content)
// Expected: "4" or similar
```

---

## Tier 3: X402 End-to-End Tests (Real Payment on Base Sepolia Testnet)

Use Base Sepolia testnet first. Get testnet USDC from [Coinbase faucet](https://faucet.coinbase.com/).

### Setup

1. Set `config.network = "eip155:84532"` (Base Sepolia) temporarily
2. Get a testnet USDC-funded wallet
3. Use `@x402/fetch` or the x402 playground at x402.org/playground

### Test 3.1 — Full X402 Payment Flow

```typescript
import { wrapFetchWithPayment } from "@x402/fetch"
import { createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { baseSepolia } from "viem/chains"

const account = privateKeyToAccount(process.env.TEST_PRIVATE_KEY as `0x${string}`)
const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http() })

const paymentFetch = wrapFetchWithPayment(fetch, walletClient)

const response = await paymentFetch("http://localhost:3000/api/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "anthropic/claude-3-5-haiku",
    messages: [{ role: "user", content: "Hello from x402!" }],
  }),
})

console.log("Status:", response.status) // Expected: 200
console.log("Payment response:", response.headers.get("PAYMENT-RESPONSE"))
const data = await response.json()
console.log("Content:", data.choices[0].message.content)
```

### Test 3.2 — Verify PAYMENT-RESPONSE Header

Check that the response includes settlement confirmation:

```typescript
const paymentResponseHeader = response.headers.get("PAYMENT-RESPONSE")
const settlement = JSON.parse(atob(paymentResponseHeader!))
console.log("Settlement:", settlement)
// Expected: { success: true, transaction: "0x...", network: "eip155:84532", ... }
```

### Test 3.3 — Streaming with Payment

```typescript
const response = await paymentFetch("http://localhost:3000/api/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "Count to 3" }],
    stream: true,
  }),
})

const reader = response.body!.getReader()
const decoder = new TextDecoder()
let text = ""
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  text += decoder.decode(value)
}
console.log("Stream output:", text)
// Expected: SSE events with content chunks and [DONE]
```

### Test 3.4 — Rate Limiting

```bash
# Send 61 rapid requests from the same IP — 61st should get 429
for i in $(seq 1 61); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    http://localhost:3000/api/v1/models
done | sort | uniq -c
# Expected: 60x 200, 1x 429
```

---

## Tier 4: Pre-Launch Checklist

Before listing on X402 marketplaces:

- [ ] All Tier 1 smoke tests pass
- [ ] All Tier 2 provider tests pass (Anthropic, OpenAI, Google)
- [ ] Streaming works for at least one provider
- [ ] X402 payment flow tested on Base Sepolia
- [ ] `PAYMENT-RESPONSE` header present on 200 responses
- [ ] `TREASURY_WALLET` set to a real Base mainnet address
- [ ] `network` config set to `eip155:8453` (Base mainnet)
- [ ] All provider API keys set as Fly.io secrets
- [ ] `/health` returns 200 on deployed URL
- [ ] `/api/v1/models` returns correct catalog on deployed URL
- [ ] Rate limiting confirmed (IP-based)
- [ ] `/llms.txt` accessible and contains correct treasury address

---

## X402 Marketplace Listing (Post-Deploy)

Once deployed and tested:

1. **X402 Bazaar** — Submit via the Bazaar extension metadata in route config (auto-registered on first payment)
2. **x402.org playground** — Test your endpoint manually
3. **Share the deployed URL** so clients can point `baseURL` at it

### Client quick-start snippet to include in listing:

```typescript
import OpenAI from "openai"
import { wrapFetchWithPayment } from "@x402/fetch"

const payingFetch = wrapFetchWithPayment(fetch, myWalletClient)

const client = new OpenAI({
  baseURL: "https://x402-llm-gateway.fly.dev/api/v1",
  apiKey: "x402", // placeholder — auth is via x402 payment
  fetch: payingFetch,
})

const res = await client.chat.completions.create({
  model: "anthropic/claude-3-5-haiku",
  messages: [{ role: "user", content: "Hello!" }],
})
```

# X402 LLM Gateway — OpenRouter-Compatible API with Crypto Micropayments

## Context

We have free API credits from Anthropic, OpenAI, and Google (Gemini). The goal is to build a simple, self-hosted API gateway that:
1. Follows the OpenRouter / OpenAI `chat/completions` API spec so any existing client works with zero code changes
2. Gates access via [X402](https://www.x402.org/) — the HTTP 402 payment protocol using USDC on Base mainnet
3. Can be listed on X402 Bazaar marketplaces so AI agents discover and pay for it autonomously
4. Runs as a single Node.js service on Fly.io

This is a side project / experiment, not a production Blaze system. It lives in its own repo.

---

## Architecture Overview

```
AI Agent / Client (OpenAI SDK, curl)
        │
        ▼
POST /api/v1/chat/completions
        │
  ┌─────▼──────────────────────┐
  │   x402 Payment Middleware   │  ← @x402/hono
  │   Issues HTTP 402           │
  │   Verifies PAYMENT-SIGNATURE│
  │   Settles via x402.org      │
  └─────┬──────────────────────┘
        │ verified + settled
  ┌─────▼──────────────────────┐
  │   Model Router              │  ← resolves "anthropic/claude-3-5-haiku" → Anthropic SDK
  └─────┬──────────┬───────────┘
        │          │          │
  Anthropic    OpenAI    Google AI
   (Claude)    (GPT)    (Gemini)
```

**X402 Payment Flow:**
1. Client sends request → server returns `HTTP 402` with `PAYMENT-REQUIRED` header
2. Client signs USDC payment authorization (EIP-3009 on Base)
3. Client retries with `PAYMENT-SIGNATURE` header
4. Server calls x402.org facilitator to verify + settle on-chain
5. Server proxies to LLM provider, returns response + `PAYMENT-RESPONSE` header

**Key properties:**
- Server never holds a private key — the `exact` scheme settles to a static treasury address
- `GET /api/v1/models` is free (no payment gate)
- `POST /api/v1/chat/completions` requires $0.01 USDC per call
- Streaming (SSE) is supported — payment is collected upfront before the stream starts

---

## Tech Stack

**Hono** (not NestJS or Express):
- `@x402/hono` is a first-party package — zero glue code
- Runs on Node.js/Bun/Cloudflare Workers
- Native SSE streaming via `streamSSE()`
- Minimal boilerplate — entire MVP fits in ~500 LOC

**No database, no Redis** — payment verification is stateless (facilitator handles idempotency). Rate limiting uses in-memory Maps.

---

## Project Structure

```
x402-llm-gateway/
├── src/
│   ├── index.ts              # Hono app, x402 middleware mount, server start
│   ├── config.ts             # Env vars, pricing, treasury wallet
│   ├── models.ts             # MODEL_REGISTRY + GET /api/v1/models handler
│   ├── router.ts             # Model slug → provider resolution
│   ├── completions.ts        # POST /api/v1/chat/completions handler
│   ├── providers/
│   │   ├── anthropic.ts      # Claude (streaming + non-streaming)
│   │   ├── openai.ts         # GPT (streaming + non-streaming)
│   │   └── google.ts         # Gemini → OpenAI format normalization
│   └── ratelimit.ts          # In-memory IP sliding window
├── Dockerfile
├── fly.toml
├── package.json
├── tsconfig.json
└── llms.txt                  # Static discovery file for AI agents
```

---

## Key Implementation Details

### Model Catalog (`config.ts` / `models.ts`)

6 models at MVP. Each has a provider, native model ID, and context window:

| Slug | Provider | Native ID |
|------|----------|-----------|
| `anthropic/claude-sonnet-4-5` | Anthropic | `claude-sonnet-4-5-20251022` |
| `anthropic/claude-3-5-haiku` | Anthropic | `claude-haiku-3-5-20251022` |
| `openai/gpt-4o` | OpenAI | `gpt-4o` |
| `openai/gpt-4o-mini` | OpenAI | `gpt-4o-mini` |
| `google/gemini-2.0-flash` | Google | `gemini-2.0-flash` |
| `google/gemini-2.5-pro` | Google | `gemini-2.5-pro` |

Unknown model slugs → `404` with OpenAI error format.

### X402 Config

- **Scheme:** `exact` (flat $0.01 per call) — simplest, no token counting
- **Network:** `eip155:8453` (Base mainnet)
- **Token:** USDC
- **Facilitator:** Coinbase CDP (`https://api.cdp.coinbase.com/platform/v2/x402`)
- **Bazaar extension:** Included so the endpoint auto-appears in X402 discovery marketplaces

### Streaming

Payment is collected before streaming starts (upfront with `exact` scheme). The `streamSSE()` helper from Hono pipes provider SSE chunks → client in real-time after payment clears. All three providers support streaming.

### Rate Limiting

In-memory sliding window, 60 req/min per IP (pre-payment). Applied as a Hono middleware before x402. No Redis needed for single-instance MVP.

### Environment Variables

```
ANTHROPIC_API_KEY
OPENAI_API_KEY
GOOGLE_AI_API_KEY
TREASURY_WALLET        # EVM address to receive USDC
PORT (default: 3000)
```

---

## Deployment

**Fly.io** — `fly.toml` with `auto_stop_machines = "stop"` (free when idle). Secrets set via `fly secrets set`.

**Custom domain** (optional) — configure after first deploy for a clean URL to list on X402 marketplaces.

---

## X402 Marketplace Listing

The endpoint auto-lists in the X402 Bazaar when the `discovery` extension metadata is included in the route config:

- `serviceName`: "x402 LLM Gateway"
- `tags`: `["llm", "openai-compatible", "claude", "gpt", "gemini", "ai"]`
- `inputSchema`: OpenAI chat completions body
- `/llms.txt` endpoint for AI agent discovery

---

## MVP Scope

**Must have:**
- [ ] `POST /api/v1/chat/completions` with x402 `exact` gate at $0.01
- [ ] `GET /api/v1/models` (free)
- [ ] Anthropic, OpenAI, Google provider adapters (streaming + non-streaming)
- [ ] Model slug router for 6 models
- [ ] IP rate limiting (in-memory)
- [ ] Bazaar discovery extension + `/llms.txt`
- [ ] Fly.io deploy

**Deferred:**
- Token-based `upto` pricing
- Redis rate limiting
- Usage analytics dashboard
- API key auth layer (x402 IS the auth at MVP)

---

## GitHub Gist

After plan approval, I'll create a public GitHub Gist with:
1. Full annotated `src/index.ts` (Hono + x402 setup)
2. `src/config.ts` + `src/models.ts` (model catalog)
3. `src/providers/anthropic.ts` (reference provider adapter)
4. `src/completions.ts` (streaming handler)
5. `package.json` + `fly.toml` + `Dockerfile`
6. `llms.txt`

This gives your team everything they need to fork and deploy.

---

## Verification

After deploy, test with:

```bash
# Should return 402 with PAYMENT-REQUIRED header
curl -X POST https://your-gateway.fly.dev/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"anthropic/claude-3-5-haiku","messages":[{"role":"user","content":"hi"}]}'

# Should return model list (free)
curl https://your-gateway.fly.dev/api/v1/models
```

With an x402-compatible client (e.g., `@x402/fetch` + Base wallet):
```typescript
const client = createX402Client({ signer: wallet })
const res = await client.fetch("https://your-gateway.fly.dev/api/v1/chat/completions", {
  method: "POST",
  body: JSON.stringify({ model: "openai/gpt-4o-mini", messages: [{ role: "user", content: "Hello!" }] })
})
// → HTTP 200 with LLM response + PAYMENT-RESPONSE header
```

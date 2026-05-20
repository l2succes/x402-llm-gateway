# X402 LLM Gateway — OpenRouter-Compatible API with Crypto Micropayments

An OpenRouter-compatible LLM API gateway gated by [X402](https://www.x402.org/) micropayments (USDC on Base mainnet). Supports Claude, GPT-4o, and Gemini via the standard OpenAI `chat/completions` API format.

**GitHub Gist:** https://gist.github.com/l2succes/0ed51f6527940aed9f683564aa11a2e0

---

## Why

We have free API credits from Anthropic, OpenAI, and Google (Gemini). The goal is to expose these as a single pay-per-call API that:

1. Follows the OpenRouter / OpenAI `chat/completions` spec so any existing client works with zero code changes
2. Gates access via [X402](https://www.x402.org/) — the HTTP 402 payment protocol using USDC on Base mainnet
3. Can be listed on X402 Bazaar marketplaces so AI agents discover and pay for it autonomously
4. Runs as a single Node.js service on Fly.io

---

## Quick Start

```bash
cp .env.example .env
# Fill in ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_AI_API_KEY, TREASURY_WALLET
npm install
npm run dev
```

Test without payment (expect 402):

```bash
curl -X POST http://localhost:3000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"anthropic/claude-3-5-haiku","messages":[{"role":"user","content":"hi"}]}'
# → HTTP 402 with PAYMENT-REQUIRED header

curl http://localhost:3000/api/v1/models
# → Free — returns model catalog
```

Test with payment (x402-compatible client):

```typescript
import OpenAI from "openai"
import { wrapFetchWithPayment } from "@x402/fetch"

const payingFetch = wrapFetchWithPayment(fetch, myWalletClient) // Base-compatible wallet

const client = new OpenAI({
  baseURL: "https://your-gateway.fly.dev/api/v1",
  apiKey: "x402", // placeholder — auth is via x402 payment
  fetch: payingFetch,
})

const res = await client.chat.completions.create({
  model: "anthropic/claude-3-5-haiku",
  messages: [{ role: "user", content: "Hello!" }],
})
```

---

## Architecture

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
  │   Settles via Coinbase CDP  │
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
4. Server calls Coinbase CDP facilitator to verify + settle on-chain
5. Server proxies to LLM provider, returns response + `PAYMENT-RESPONSE` header

**Key properties:**
- Server never holds a private key — the `exact` scheme settles to a static treasury address
- `GET /api/v1/models` is free (no payment gate)
- `POST /api/v1/chat/completions` requires $0.01 USDC per call
- Streaming (SSE) is supported — payment is collected upfront before the stream starts

---

## Environment Variables

```bash
# Required: EVM wallet address to receive USDC payments on Base mainnet
TREASURY_WALLET=0x

# Required: Provider API keys
ANTHROPIC_API_KEY=sk-ant-
OPENAI_API_KEY=sk-
GOOGLE_AI_API_KEY=AIza

# Optional
PORT=3000
```

---

## Supported Models

| Slug | Provider | Context | Notes |
|------|----------|---------|-------|
| `anthropic/claude-opus-4-7` | Anthropic | 1M | Most capable |
| `anthropic/claude-sonnet-4-6` | Anthropic | 1M | Best speed/intelligence balance |
| `anthropic/claude-haiku-4-5` | Anthropic | 200k | Fastest |
| `openai/gpt-5.5` | OpenAI | 128k | Latest flagship (API since Apr 24, 2026) |
| `openai/gpt-5.5-pro` | OpenAI | 128k | Highest capability variant |
| `openai/gpt-4o` | OpenAI | 128k | Proven multimodal model |
| `openai/gpt-4o-mini` | OpenAI | 128k | Fast and affordable |
| `google/gemini-3.5-flash` | Google | 1M | Latest Gemini, GA as of May 19, 2026 |
| `google/gemini-2.5-pro` | Google | 2M | Most advanced stable model |
| `google/gemini-2.5-flash` | Google | 1M | Best price-performance |

Unknown model slugs return `404` with OpenAI error format.

---

## Tech Stack

**[Hono](https://hono.dev/)** — chosen over NestJS/Express because:
- `@x402/hono` is a first-party package (zero glue code)
- Native SSE streaming via `streamSSE()`
- Runs on Node.js, Bun, Cloudflare Workers
- Entire MVP fits in ~500 LOC

**No database, no Redis** — payment verification is stateless (facilitator handles idempotency). Rate limiting uses in-memory Maps.

---

## Project Structure

```
src/
├── index.ts              # Hono app, x402 middleware mount, server start
├── config.ts             # Env vars, pricing, treasury wallet
├── models.ts             # MODEL_REGISTRY + GET /api/v1/models handler
├── completions.ts        # POST /api/v1/chat/completions handler
├── ratelimit.ts          # In-memory IP sliding window (60 req/min)
├── types.ts              # Shared TypeScript interfaces
└── providers/
    ├── anthropic.ts      # Claude (streaming + non-streaming)
    ├── openai.ts         # GPT (streaming + non-streaming)
    └── google.ts         # Gemini → OpenAI format normalization
docs/
├── implementation-plan.md  # Full design and architecture decisions
└── testing-plan.md         # 4-tier testing guide
```

---

## X402 Config

| Setting | Value |
|---------|-------|
| Scheme | `exact` (flat per-call) |
| Price | $0.01 USDC per request |
| Network | `eip155:8453` (Base mainnet) |
| Facilitator | Coinbase CDP |

The `exact` scheme was chosen for MVP — no token counting required. Upgrade path to `upto` (token-based billing) is documented in `docs/implementation-plan.md`.

---

## Rate Limiting

In-memory sliding window, 60 req/min per IP, applied before x402 verification. Replace with Redis for multi-instance deployments.

---

## Deployment

### Fly.io

```bash
fly launch
fly secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  OPENAI_API_KEY=sk-... \
  GOOGLE_AI_API_KEY=AIza... \
  TREASURY_WALLET=0x...
fly deploy
```

The `fly.toml` uses `auto_stop_machines = "stop"` — free when idle.

### Docker

```bash
docker build -t x402-llm-gateway .
docker run -p 3000:3000 --env-file .env x402-llm-gateway
```

---

## X402 Marketplace Listing

The endpoint auto-registers in the X402 Bazaar on first payment via the discovery extension metadata in the route config. Also exposes `/llms.txt` for AI agent discovery.

---

## Testing

See `docs/testing-plan.md` for the full 4-tier testing guide:

1. **Tier 1** — Local smoke tests (health, model catalog, 402 response)
2. **Tier 2** — Provider integration tests (bypass x402, test Anthropic/OpenAI/Google directly)
3. **Tier 3** — X402 end-to-end on Base Sepolia testnet
4. **Tier 4** — Pre-launch checklist before listing on X402 marketplaces

---

## Roadmap

**MVP (shipped):**
- [x] `POST /api/v1/chat/completions` with x402 `exact` gate at $0.01
- [x] `GET /api/v1/models` (free)
- [x] Anthropic, OpenAI, Google provider adapters (streaming + non-streaming)
- [x] Model slug router for 6 models
- [x] IP rate limiting (in-memory)
- [x] `/llms.txt` for AI agent discovery
- [x] Fly.io deploy config

**Future:**
- [ ] Token-based `upto` pricing (charge per token instead of flat rate)
- [ ] Redis-backed rate limiting (multi-instance support)
- [ ] Usage analytics dashboard
- [ ] Per-model pricing tiers

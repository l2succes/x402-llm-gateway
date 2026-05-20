import { Hono } from "hono"
import { serve } from "@hono/node-server"
import { paymentMiddleware, Resource } from "@x402/hono"
import { config, validateConfig } from "./config.js"
import { modelsHandler, MODEL_REGISTRY } from "./models.js"
import { completionsHandler } from "./completions.js"
import { ipRateLimiter } from "./ratelimit.js"

validateConfig()

const app = new Hono()

// Rate limiting (pre-payment, all routes)
app.use("*", ipRateLimiter)

// X402 payment gate on the completions endpoint
app.use(
  "/api/v1/chat/completions",
  paymentMiddleware(config.treasuryWallet, config.gatewayPriceUsd, {
    facilitatorUrl: config.facilitatorUrl,
    resource: {
      description:
        "OpenRouter-compatible LLM completions. Supports anthropic/*, openai/*, google/* model slugs. $0.01 USDC per call on Base mainnet.",
      mimeType: "application/json",
    } as Resource,
  }),
)

// Routes
app.get("/api/v1/models", modelsHandler)
app.post("/api/v1/chat/completions", completionsHandler)

// Health check (free)
app.get("/health", (c) => c.json({ status: "ok", models: Object.keys(MODEL_REGISTRY).length }))

// Discovery files (free)
app.get("/llms.txt", (c) => {
  const modelList = Object.entries(MODEL_REGISTRY)
    .map(([slug, r]) => `- ${slug} (${r.description})`)
    .join("\n")

  return c.text(`# x402 LLM Gateway

> OpenRouter-compatible LLM API with per-call USDC payment on Base mainnet.

## Payment
This API requires x402 payment. Price: $0.01 per request (USDC on Base).
Network: ${config.network}. Receiving address: ${config.treasuryWallet || "<TREASURY_WALLET>"}.

## Endpoints
- POST /api/v1/chat/completions — OpenAI-compatible chat completions (requires payment)
- GET  /api/v1/models           — List available models (free)

## Supported Models
${modelList}

## Usage
Send requests using the OpenAI SDK or any OpenAI-compatible client pointed at this gateway.
Clients must support x402 payment (e.g. @x402/fetch with a Base-compatible wallet).

\`\`\`json
{
  "model": "anthropic/claude-3-5-haiku",
  "messages": [{"role": "user", "content": "Hello!"}]
}
\`\`\`
`)
})

const port = config.port
console.log(`🚀 x402 LLM Gateway listening on port ${port}`)
console.log(`💰 Price: ${config.gatewayPriceUsd} USDC per call (${config.network})`)
console.log(`🔑 Treasury: ${config.treasuryWallet || "(not set)"}`)
console.log(`📋 Models: ${Object.keys(MODEL_REGISTRY).join(", ")}`)

serve({ fetch: app.fetch, port })

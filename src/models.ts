import type { Context } from "hono"
import type { ModelRoute } from "./types.js"
import { config } from "./config.js"

export const MODEL_REGISTRY: Record<string, ModelRoute> = {
  "anthropic/claude-sonnet-4-5": {
    provider: "anthropic",
    modelId: "claude-sonnet-4-5-20251022",
    contextWindow: 200000,
    description: "Anthropic Claude Sonnet 4.5 — high capability, fast",
  },
  "anthropic/claude-3-5-haiku": {
    provider: "anthropic",
    modelId: "claude-haiku-3-5-20251022",
    contextWindow: 200000,
    description: "Anthropic Claude 3.5 Haiku — fastest, cheapest Claude",
  },
  "openai/gpt-4o": {
    provider: "openai",
    modelId: "gpt-4o",
    contextWindow: 128000,
    description: "OpenAI GPT-4o — flagship multimodal model",
  },
  "openai/gpt-4o-mini": {
    provider: "openai",
    modelId: "gpt-4o-mini",
    contextWindow: 128000,
    description: "OpenAI GPT-4o Mini — fast and affordable",
  },
  "google/gemini-2.0-flash": {
    provider: "google",
    modelId: "gemini-2.0-flash",
    contextWindow: 1000000,
    description: "Google Gemini 2.0 Flash — 1M context, very fast",
  },
  "google/gemini-2.5-pro": {
    provider: "google",
    modelId: "gemini-2.5-pro",
    contextWindow: 2000000,
    description: "Google Gemini 2.5 Pro — 2M context, highest capability",
  },
}

export function resolveModel(slug: string): ModelRoute {
  const route = MODEL_REGISTRY[slug]
  if (!route) {
    const err = new Error(`Model '${slug}' not found`) as Error & { code: string }
    err.code = "model_not_found"
    throw err
  }
  return route
}

export function modelsHandler(c: Context) {
  const models = Object.entries(MODEL_REGISTRY).map(([id, route]) => ({
    id,
    object: "model",
    created: 1715000000,
    owned_by: route.provider,
    permission: [],
    root: id,
    parent: null,
    context_length: route.contextWindow,
    description: route.description,
    pricing: {
      request: config.gatewayPriceUsd,
      note: "Flat per-call price via X402 (USDC on Base mainnet)",
    },
  }))

  return c.json({ object: "list", data: models })
}

import type { Context } from "hono"
import type { ModelRoute } from "./types.js"
import { config } from "./config.js"

export const MODEL_REGISTRY: Record<string, ModelRoute> = {
  // Anthropic — latest as of 2026-05
  "anthropic/claude-opus-4-7": {
    provider: "anthropic",
    modelId: "claude-opus-4-7",
    contextWindow: 1000000,
    description: "Anthropic Claude Opus 4.7 — most capable, complex reasoning and agentic coding",
  },
  "anthropic/claude-sonnet-4-6": {
    provider: "anthropic",
    modelId: "claude-sonnet-4-6",
    contextWindow: 1000000,
    description: "Anthropic Claude Sonnet 4.6 — best speed/intelligence balance",
  },
  "anthropic/claude-haiku-4-5": {
    provider: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
    contextWindow: 200000,
    description: "Anthropic Claude Haiku 4.5 — fastest Claude, near-frontier intelligence",
  },

  // OpenAI — latest as of 2026-05 (GPT-5.5 in API since April 24, 2026)
  "openai/gpt-5.5": {
    provider: "openai",
    modelId: "gpt-5.5",
    contextWindow: 128000,
    description: "OpenAI GPT-5.5 — latest flagship, strongest agentic coding and reasoning",
  },
  "openai/gpt-5.5-pro": {
    provider: "openai",
    modelId: "gpt-5.5-pro",
    contextWindow: 128000,
    description: "OpenAI GPT-5.5 Pro — highest capability GPT-5.5 variant",
  },
  "openai/gpt-4o": {
    provider: "openai",
    modelId: "gpt-4o",
    contextWindow: 128000,
    description: "OpenAI GPT-4o — proven multimodal model",
  },
  "openai/gpt-4o-mini": {
    provider: "openai",
    modelId: "gpt-4o-mini",
    contextWindow: 128000,
    description: "OpenAI GPT-4o Mini — fast and affordable",
  },

  // Google — latest as of 2026-05 (Gemini 3.5 Flash GA, 3.5 Pro coming soon)
  "google/gemini-3.5-flash": {
    provider: "google",
    modelId: "gemini-3.5-flash",
    contextWindow: 1000000,
    description: "Google Gemini 3.5 Flash — frontier performance, 4x faster than other frontier models",
  },
  "google/gemini-2.5-pro": {
    provider: "google",
    modelId: "gemini-2.5-pro",
    contextWindow: 2000000,
    description: "Google Gemini 2.5 Pro — 2M context, most advanced stable model",
  },
  "google/gemini-2.5-flash": {
    provider: "google",
    modelId: "gemini-2.5-flash",
    contextWindow: 1000000,
    description: "Google Gemini 2.5 Flash — 1M context, best price-performance",
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

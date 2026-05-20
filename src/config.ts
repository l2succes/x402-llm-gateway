export const config = {
  port: Number(process.env.PORT ?? 3000),

  // X402 payment settings
  gatewayPriceUsd: "$0.01",
  treasuryWallet: (process.env.TREASURY_WALLET ?? "") as `0x${string}`,
  network: "eip155:8453" as const, // Base mainnet
  facilitatorUrl: "https://api.cdp.coinbase.com/platform/v2/x402",

  // Provider API keys
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  googleApiKey: process.env.GOOGLE_AI_API_KEY ?? "",
}

export function validateConfig() {
  const missing: string[] = []
  if (!config.treasuryWallet) missing.push("TREASURY_WALLET")
  if (!config.anthropicApiKey) missing.push("ANTHROPIC_API_KEY")
  if (!config.openaiApiKey) missing.push("OPENAI_API_KEY")
  if (!config.googleApiKey) missing.push("GOOGLE_AI_API_KEY")

  if (missing.length > 0) {
    console.warn(`⚠️  Missing env vars: ${missing.join(", ")}`)
  }
}

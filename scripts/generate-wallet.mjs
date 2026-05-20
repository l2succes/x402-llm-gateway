#!/usr/bin/env node
/**
 * Generate a new EVM wallet for the x402 treasury.
 * Run: node scripts/generate-wallet.mjs
 *
 * ⚠️  SAVE THE PRIVATE KEY SOMEWHERE SAFE (1Password, etc).
 *     Only the public address needs to go into Fly secrets.
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

const privateKey = generatePrivateKey()
const account = privateKeyToAccount(privateKey)

console.log("\n=== x402 Treasury Wallet ===\n")
console.log("Address (TREASURY_WALLET):", account.address)
console.log("Private key (SAVE THIS):  ", privateKey)
console.log("\n--- Next steps ---")
console.log("1. Save the private key in 1Password or similar — you'll need it to sweep funds later")
console.log("2. Fund the address with USDC on Base mainnet to test sending payments")
console.log("   → Bridge: https://bridge.base.org")
console.log("   → Coinbase: send USDC to this address on Base network")
console.log("3. Set the treasury address on Fly:")
console.log(`   fly secrets set TREASURY_WALLET=${account.address} --app x402-llm-gateway`)
console.log("\nNote: the gateway only needs the ADDRESS, not the private key.")
console.log("The x402 exact scheme settles directly to this address on-chain.\n")

import Anthropic from "@anthropic-ai/sdk"
import type { ChatCompletionRequest, ChatCompletionResponse, NormalizedChunk } from "../types.js"
import { config } from "../config.js"

function getClient() {
  return new Anthropic({ apiKey: config.anthropicApiKey })
}

function extractSystem(messages: ChatCompletionRequest["messages"]): string | undefined {
  return messages.find((m) => m.role === "system")?.content
}

function userMessages(messages: ChatCompletionRequest["messages"]) {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
}

export async function callAnthropic(
  modelId: string,
  req: ChatCompletionRequest,
): Promise<ChatCompletionResponse> {
  const client = getClient()
  const response = await client.messages.create({
    model: modelId,
    max_tokens: req.max_tokens ?? 4096,
    messages: userMessages(req.messages),
    system: extractSystem(req.messages),
  })

  const content = response.content.find((b) => b.type === "text")?.text ?? ""
  const id = `chatcmpl-${response.id}`

  return {
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: req.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: response.stop_reason === "end_turn" ? "stop" : "length",
      },
    ],
    usage: {
      prompt_tokens: response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
      total_tokens: response.usage.input_tokens + response.usage.output_tokens,
    },
  }
}

export async function* callAnthropicStreaming(
  modelId: string,
  req: ChatCompletionRequest,
): AsyncGenerator<NormalizedChunk> {
  const client = getClient()
  const stream = client.messages.stream({
    model: modelId,
    max_tokens: req.max_tokens ?? 4096,
    messages: userMessages(req.messages),
    system: extractSystem(req.messages),
  })

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield { content: event.delta.text, done: false }
    }
  }

  yield { content: "", done: true }
}

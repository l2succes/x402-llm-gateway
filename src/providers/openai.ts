import OpenAI from "openai"
import type { ChatCompletionRequest, ChatCompletionResponse, NormalizedChunk } from "../types.js"
import { config } from "../config.js"

function getClient() {
  return new OpenAI({ apiKey: config.openaiApiKey })
}

export async function callOpenAI(
  modelId: string,
  req: ChatCompletionRequest,
): Promise<ChatCompletionResponse> {
  const client = getClient()
  const response = await client.chat.completions.create({
    model: modelId,
    messages: req.messages,
    max_tokens: req.max_tokens,
    temperature: req.temperature,
    stream: false,
  })

  return {
    id: response.id,
    object: "chat.completion",
    created: response.created,
    model: req.model,
    choices: response.choices.map((c) => ({
      index: c.index,
      message: {
        role: "assistant",
        content: c.message.content ?? "",
      },
      finish_reason: (c.finish_reason as "stop" | "length") ?? null,
    })),
    usage: response.usage
      ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        }
      : undefined,
  }
}

export async function* callOpenAIStreaming(
  modelId: string,
  req: ChatCompletionRequest,
): AsyncGenerator<NormalizedChunk> {
  const client = getClient()
  const stream = await client.chat.completions.create({
    model: modelId,
    messages: req.messages,
    max_tokens: req.max_tokens,
    temperature: req.temperature,
    stream: true,
  })

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content
    if (content) yield { content, done: false }
    if (chunk.choices[0]?.finish_reason) yield { content: "", done: true }
  }
}

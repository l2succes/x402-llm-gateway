import { GoogleGenerativeAI } from "@google/generative-ai"
import type { ChatCompletionRequest, ChatCompletionResponse, NormalizedChunk, ChatMessage } from "../types.js"
import { config } from "../config.js"

function getClient() {
  return new GoogleGenerativeAI(config.googleApiKey)
}

function toGeminiHistory(messages: ChatMessage[]) {
  // Gemini uses "user" / "model" roles
  return messages
    .filter((m) => m.role !== "system")
    .slice(0, -1) // all except last (sent as current turn)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }))
}

function lastUserMessage(messages: ChatMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === "user")
  return last?.content ?? ""
}

function systemPrompt(messages: ChatMessage[]): string | undefined {
  return messages.find((m) => m.role === "system")?.content
}

export async function callGoogle(
  modelId: string,
  req: ChatCompletionRequest,
): Promise<ChatCompletionResponse> {
  const genAI = getClient()
  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: systemPrompt(req.messages),
  })

  const chat = model.startChat({ history: toGeminiHistory(req.messages) })
  const result = await chat.sendMessage(lastUserMessage(req.messages))
  const text = result.response.text()

  return {
    id: `chatcmpl-gemini-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: req.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      },
    ],
  }
}

export async function* callGoogleStreaming(
  modelId: string,
  req: ChatCompletionRequest,
): AsyncGenerator<NormalizedChunk> {
  const genAI = getClient()
  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: systemPrompt(req.messages),
  })

  const chat = model.startChat({ history: toGeminiHistory(req.messages) })
  const result = await chat.sendMessageStream(lastUserMessage(req.messages))

  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) yield { content: text, done: false }
  }

  yield { content: "", done: true }
}

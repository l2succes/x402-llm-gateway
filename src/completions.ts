import { streamSSE } from "hono/streaming"
import type { Context } from "hono"
import type { ChatCompletionRequest, StreamChunk } from "./types.js"
import { resolveModel } from "./models.js"
import { callAnthropic, callAnthropicStreaming } from "./providers/anthropic.js"
import { callOpenAI, callOpenAIStreaming } from "./providers/openai.js"
import { callGoogle, callGoogleStreaming } from "./providers/google.js"

function modelNotFoundError(model: string) {
  return {
    error: {
      message: `The model '${model}' does not exist.`,
      type: "invalid_request_error",
      code: "model_not_found",
    },
  }
}

function providerError(err: unknown) {
  const message = err instanceof Error ? err.message : "Provider error"
  return {
    error: {
      message,
      type: "api_error",
      code: "provider_error",
    },
  }
}

export async function completionsHandler(c: Context) {
  let body: ChatCompletionRequest
  try {
    body = await c.req.json<ChatCompletionRequest>()
  } catch {
    return c.json({ error: { message: "Invalid JSON body", type: "invalid_request_error" } }, 400)
  }

  let route
  try {
    route = resolveModel(body.model)
  } catch {
    return c.json(modelNotFoundError(body.model), 404)
  }

  if (body.stream) {
    const streamGen = (() => {
      if (route.provider === "anthropic") return callAnthropicStreaming(route.modelId, body)
      if (route.provider === "openai") return callOpenAIStreaming(route.modelId, body)
      return callGoogleStreaming(route.modelId, body)
    })()

    const id = `chatcmpl-${Date.now()}`
    const created = Math.floor(Date.now() / 1000)

    return streamSSE(c, async (stream) => {
      try {
        for await (const chunk of streamGen) {
          const payload: StreamChunk = {
            id,
            object: "chat.completion.chunk",
            created,
            model: body.model,
            choices: [
              {
                index: 0,
                delta: chunk.done ? {} : { content: chunk.content },
                finish_reason: chunk.done ? "stop" : null,
              },
            ],
          }
          await stream.writeSSE({ data: JSON.stringify(payload) })
        }
        await stream.writeSSE({ data: "[DONE]" })
      } catch (err) {
        await stream.writeSSE({ data: JSON.stringify(providerError(err)) })
      }
    })
  }

  try {
    let response
    if (route.provider === "anthropic") {
      response = await callAnthropic(route.modelId, body)
    } else if (route.provider === "openai") {
      response = await callOpenAI(route.modelId, body)
    } else {
      response = await callGoogle(route.modelId, body)
    }
    return c.json(response)
  } catch (err) {
    return c.json(providerError(err), 502)
  }
}

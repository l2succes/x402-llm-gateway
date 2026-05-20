export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  max_tokens?: number
  temperature?: number
}

export interface ChatCompletionChoice {
  index: number
  message: {
    role: "assistant"
    content: string
  }
  finish_reason: "stop" | "length" | null
}

export interface ChatCompletionResponse {
  id: string
  object: "chat.completion"
  created: number
  model: string
  choices: ChatCompletionChoice[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface StreamChunk {
  id: string
  object: "chat.completion.chunk"
  created: number
  model: string
  choices: Array<{
    index: number
    delta: { role?: "assistant"; content?: string }
    finish_reason: "stop" | "length" | null
  }>
}

export type Provider = "anthropic" | "openai" | "google"

export interface ModelRoute {
  provider: Provider
  modelId: string
  contextWindow: number
  description: string
}

export interface NormalizedChunk {
  content: string
  done: boolean
}

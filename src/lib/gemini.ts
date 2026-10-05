import { env } from "../config/env.js";

const EMBEDDING_MODEL = "gemini-embedding-001";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

type BatchEmbedResponse = { embeddings: { values: number[] }[] };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, body: unknown, maxAttempts = 5): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) return res;
    if (res.status !== 429 && res.status !== 503) return res;

    lastError = await res.text().catch(() => res.statusText);
    const delay = Math.min(1000 * 2 ** (attempt - 1), 16000);
    await sleep(delay);
  }

  throw new Error(`Gemini API rate-limited after ${maxAttempts} attempts: ${String(lastError)}`);
}

export async function embedTexts(
  texts: string[],
  taskType: EmbeddingTaskType
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const BATCH_LIMIT = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_LIMIT) {
    const batch = texts.slice(i, i + BATCH_LIMIT);
    const url = `${API_BASE}/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${env.GEMINI_API_KEY}`;

    const body = {
      requests: batch.map((text) => ({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: env.EMBEDDING_DIMENSIONS,
      })),
    };

    const res = await fetchWithRetry(url, body);
    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText);
      throw new Error(`Gemini embedding request failed (${res.status}): ${errorText}`);
    }

    const data = (await res.json()) as BatchEmbedResponse;
    allEmbeddings.push(...data.embeddings.map((e) => e.values));
  }

  return allEmbeddings;
}

export async function embedText(text: string, taskType: EmbeddingTaskType): Promise<number[]> {
  const [embedding] = await embedTexts([text], taskType);
  return embedding;
}

const CHAT_MODEL = "gemini-3.5-flash-lite";

// Gemini's multi-turn format: alternating user/model turns, each with a
// single text part. "model" (not "assistant") is Gemini's name for the
// assistant role — this is the one place that mapping has to happen.
export type ChatTurn = { role: "user" | "model"; text: string };

export async function* streamChatCompletion(turns: ChatTurn[]): AsyncGenerator<string> {
  const url = `${API_BASE}/models/${CHAT_MODEL}:streamGenerateContent?alt=sse&key=${env.GEMINI_API_KEY}`;

  const contents = turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] }));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents }),
  });

  if (!res.ok || !res.body) {
    const errorText = await res.text().catch(() => res.statusText);
    throw new Error(`Gemini chat request failed (${res.status}): ${errorText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr) continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield text;
      } catch {
        // Split mid-object across reads; rejoined once the rest arrives.
      }
    }
  }
}
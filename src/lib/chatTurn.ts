import type { Response } from "express";
import { and, asc, cosineDistance, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { chatMessages, chunks, type SourceSnippet } from "../db/schema.js";
import { embedText, streamChatCompletion } from "./gemini.js";

function buildChatPrompt(question: string, contextChunks: { content: string }[]) {
  const context = contextChunks.map((c, i) => `[Source ${i + 1}]\n${c.content}`).join("\n\n");

  return `You are answering questions about a specific document. Use ONLY the context below to answer — do not use outside knowledge. If the answer isn't in the context, say "I don't have enough information in this document to answer that." Keep the answer concise. Reference sources like [Source 1] where relevant.

Context:
${context}

Question: ${question}

Answer:`;
}

export async function runChatTurn({
  res,
  documentId,
  threadId,
  question,
}: {
  res: Response;
  documentId: string;
  threadId: string;
  question: string;
}) {
  await db.insert(chatMessages).values({ threadId, role: "user", content: question });

  const allMessages = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(asc(chatMessages.createdAt));
  const recentPrior = allMessages.slice(-7, -1);

  const questionEmbedding = await embedText(question, "RETRIEVAL_QUERY");
  const similarity = sql<number>`1 - (${cosineDistance(chunks.embedding, questionEmbedding)})`;

  const relevant = await db
    .select({ content: chunks.content, chunkIndex: chunks.chunkIndex, similarity })
    .from(chunks)
    .where(and(eq(chunks.documentId, documentId), gt(similarity, 0.3)))
    .orderBy((t) => desc(t.similarity))
    .limit(5);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.write(`data: ${JSON.stringify({ threadId })}\n\n`);
  res.flushHeaders();

  if (relevant.length === 0) {
    const answer = "I don't have enough information in this document to answer that.";
    await db.insert(chatMessages).values({ threadId, role: "assistant", content: answer, sources: [] });
    res.write(`data: ${JSON.stringify({ text: answer })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true, sources: [] })}\n\n`);
    res.end();
    return;
  }

  const prompt = buildChatPrompt(question, relevant);
  const priorTurns = recentPrior.map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("model" as const),
    text: m.content,
  }));
  const turns = [...priorTurns, { role: "user" as const, text: prompt }];

  let fullAnswer = "";
  try {
    for await (const token of streamChatCompletion(turns)) {
      fullAnswer += token;
      res.write(`data: ${JSON.stringify({ text: token })}\n\n`);
    }
    const sources: SourceSnippet[] = relevant.map((c, i) => ({ index: i + 1, content: c.content }));
    await db.insert(chatMessages).values({ threadId, role: "assistant", content: fullAnswer, sources });
    res.write(`data: ${JSON.stringify({ done: true, sources })}\n\n`);
  } catch (streamErr) {
    console.error("Chat streaming failed for thread", threadId, streamErr);
    const message = streamErr instanceof Error ? streamErr.message : "Something went wrong";
    await db
      .insert(chatMessages)
      .values({ threadId, role: "assistant", content: fullAnswer || message, sources: [] });
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
  } finally {
    res.end();
  }
}
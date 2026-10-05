import { z } from "zod";

export const listDocumentsQuerySchema = z.object({
  status: z.enum(["processing", "ready", "failed"]).optional(),
});

export const querySchema = z.object({
  question: z.string().min(1, "Question is required").max(2000),
});

const historyTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(4000),
});

export const chatSchema = z.object({
  question: z.string().min(1, "Question is required").max(2000),
  history: z.array(historyTurnSchema).max(10).optional().default([]),
});
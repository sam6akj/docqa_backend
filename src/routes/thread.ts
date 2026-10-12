import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { chatMessages, chatThreads } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { HttpError } from "../middleware/errorHandler.js";
import { querySchema } from "../schemas/document.js";
import { runChatTurn } from "../lib/chatTurn.js";
import { chatLimiter } from "../middleware/rateLimit.js";

export const threadsRouter = Router();

threadsRouter.use(requireAuth);

async function loadOwnedThread(threadId: string, userId: string) {
  const [thread] = await db.select().from(chatThreads).where(eq(chatThreads.id, threadId));
  if (!thread || thread.userId !== userId) {
    throw new HttpError(404, "Thread not found");
  }
  return thread;
}

threadsRouter.get("/:id/messages", async (req, res, next) => {
  try {
    const thread = await loadOwnedThread(req.params.id, req.user!.id);

    const messages = await db
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
        sources: chatMessages.sources,
      })
      .from(chatMessages)
      .where(eq(chatMessages.threadId, thread.id))
      .orderBy(asc(chatMessages.createdAt));

    res.json({ messages });
  } catch (err) {
    next(err);
  }
});

threadsRouter.post<{ id: string }>("/:id/chat", chatLimiter, async (req, res, next) => {
  try {
    const { question } = querySchema.parse(req.body);
    const thread = await loadOwnedThread(req.params.id, req.user!.id);

    await db.update(chatThreads).set({ updatedAt: new Date() }).where(eq(chatThreads.id, thread.id));
    await runChatTurn({ res, documentId: thread.documentId, threadId: thread.id, question });
  } catch (err) {
    next(err);
  }
});

threadsRouter.delete("/:id", async (req, res, next) => {
  try {
    const thread = await loadOwnedThread(req.params.id, req.user!.id);
    await db.delete(chatThreads).where(eq(chatThreads.id, thread.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
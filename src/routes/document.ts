import { Router } from "express";
import { and, cosineDistance, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { chatThreads, chunks, documents } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { upload } from "../middleware/upload.js";
import { HttpError } from "../middleware/errorHandler.js";
import { looksLikePdf, inspectPdf } from "../lib/pdf.js";
import { saveFile, deleteFile } from "../lib/storage.js";
import { chunkText } from "../lib/chunk.js";
import { embedText, embedTexts } from "../lib/gemini.js";
import { runChatTurn } from "../lib/chatTurn.js";
import { env } from "../config/env.js";
import { querySchema } from "../schemas/document.js";

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

documentsRouter.get("/", async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.userId, req.user!.id))
      .orderBy(desc(documents.createdAt));
    res.json({ documents: rows });
  } catch (err) {
    next(err);
  }
});

documentsRouter.post("/", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new HttpError(400, "No file uploaded. Send it as multipart/form-data under the field name 'file'.");
    }

    const userId = req.user!.id;

    const existing = await db.select({ id: documents.id }).from(documents).where(eq(documents.userId, userId));
    if (existing.length >= env.MAX_DOCS_PER_USER) {
      throw new HttpError(
        403,
        `You've reached the limit of ${env.MAX_DOCS_PER_USER} documents. Delete one before uploading another.`
      );
    }

    const buffer = req.file.buffer;

    if (!looksLikePdf(buffer)) {
      throw new HttpError(400, "This file isn't a valid PDF.");
    }

    let info;
    try {
      info = await inspectPdf(buffer);
    } catch {
      throw new HttpError(400, "Couldn't read this PDF. It may be corrupt or encrypted.");
    }

    if (info.pageCount > env.MAX_PDF_PAGES) {
      throw new HttpError(
        400,
        `This PDF has ${info.pageCount} pages. The limit is ${env.MAX_PDF_PAGES} pages.`
      );
    }

    if (!info.hasText) {
      throw new HttpError(
        400,
        "This PDF has no selectable text (it may be a scan). Scanned PDFs aren't supported yet."
      );
    }

    const storagePath = await saveFile(buffer, req.file.originalname);

    const [doc] = await db
      .insert(documents)
      .values({
        userId,
        filename: req.file.originalname,
        storagePath,
        sizeBytes: buffer.length,
        pageCount: info.pageCount,
        status: "processing",
      })
      .returning();

    try {
      const pieces = chunkText(info.text);
      if (pieces.length === 0) {
        throw new Error("No text could be extracted for embedding");
      }

      const embeddings = await embedTexts(pieces, "RETRIEVAL_DOCUMENT");

      await db.insert(chunks).values(
        pieces.map((content, i) => ({
          documentId: doc.id,
          userId,
          chunkIndex: i,
          content,
          embedding: embeddings[i],
        }))
      );

      const [ready] = await db
        .update(documents)
        .set({ status: "ready" })
        .where(eq(documents.id, doc.id))
        .returning();

      res.status(201).json({ document: ready });
    } catch (embedErr) {
      console.error("Embedding failed for document", doc.id, embedErr);
      const [failed] = await db
        .update(documents)
        .set({
          status: "failed",
          errorMessage:
            embedErr instanceof Error ? embedErr.message : "Failed to process this document",
        })
        .where(eq(documents.id, doc.id))
        .returning();

      res.status(201).json({ document: failed });
    }
  } catch (err) {
    next(err);
  }
});

documentsRouter.post("/:id/query", async (req, res, next) => {
  try {
    const { question } = querySchema.parse(req.body);

    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, req.params.id), eq(documents.userId, req.user!.id)));

    if (!doc) throw new HttpError(404, "Document not found");
    if (doc.status !== "ready") {
      throw new HttpError(409, `This document isn't ready yet (status: ${doc.status}).`);
    }

    const questionEmbedding = await embedText(question, "RETRIEVAL_QUERY");
    const similarity = sql<number>`1 - (${cosineDistance(chunks.embedding, questionEmbedding)})`;

    const results = await db
      .select({ id: chunks.id, content: chunks.content, chunkIndex: chunks.chunkIndex, similarity })
      .from(chunks)
      .where(and(eq(chunks.documentId, doc.id), gt(similarity, 0.3)))
      .orderBy((t) => desc(t.similarity))
      .limit(5);

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

documentsRouter.delete("/:id", async (req, res, next) => {
  try {
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, req.params.id), eq(documents.userId, req.user!.id)));

    if (!doc) {
      throw new HttpError(404, "Document not found");
    }

    await deleteFile(doc.storagePath);
    await db.delete(documents).where(eq(documents.id, doc.id));

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});


documentsRouter.get("/:id/threads", async (req, res, next) => {
  try {
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, req.params.id), eq(documents.userId, req.user!.id)));
    if (!doc) throw new HttpError(404, "Document not found");

    const threads = await db
      .select({ id: chatThreads.id, title: chatThreads.title, updatedAt: chatThreads.updatedAt })
      .from(chatThreads)
      .where(eq(chatThreads.documentId, doc.id))
      .orderBy(desc(chatThreads.updatedAt));

    res.json({ threads });
  } catch (err) {
    next(err);
  }
});

documentsRouter.post("/:id/threads", async (req, res, next) => {
  try {
    const { question } = querySchema.parse(req.body);

    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, req.params.id), eq(documents.userId, req.user!.id)));

    if (!doc) throw new HttpError(404, "Document not found");
    if (doc.status !== "ready") {
      throw new HttpError(409, `This document isn't ready yet (status: ${doc.status}).`);
    }

    const [thread] = await db
      .insert(chatThreads)
      .values({
        documentId: doc.id,
        userId: req.user!.id,
        title: question.length > 80 ? question.slice(0, 77) + "..." : question,
      })
      .returning();

    await runChatTurn({ res, documentId: doc.id, threadId: thread.id, question });
  } catch (err) {
    next(err);
  }
});
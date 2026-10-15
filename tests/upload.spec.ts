import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe("Document upload and chat", () => {
  let accessToken: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post("/api/auth/refresh");
    if (!res.ok()) {
      throw new Error(`Refresh failed in beforeAll: ${res.status()} ${await res.text()}`);
    }
    const body = await res.json();
    accessToken = body.accessToken;
  });
  
  test("uploads a PDF and it becomes ready", async ({ request, baseURL }, testInfo) => {
    const filePath = path.join(__dirname, "fixtures", "sample.pdf");
    const fileBuffer = fs.readFileSync(filePath);
    const headers = { Authorization: `Bearer ${accessToken}` };

    // 1. Upload (server embeds synchronously, so status is final in the response)
    const res = await request.post("/api/documents", {
      headers,
      multipart: {
        file: { name: "sample.pdf", mimeType: "application/pdf", buffer: fileBuffer },
      },
    });

    const body = await res.json();
    await testInfo.attach("upload-response.json", {
      body: JSON.stringify(body, null, 2),
      contentType: "application/json",
    });
    await testInfo.attach("uploaded-sample.pdf", {
      body: fileBuffer,
      contentType: "application/pdf",
    });

    expect(res.status(), JSON.stringify(body)).toBe(201);
    expect(body.document.status, body.document.errorMessage).toBe("ready");
    expect(body.document.filename).toBe("sample.pdf");
    expect(body.document.sizeBytes).toBe(fileBuffer.length);
    expect(body.document.pageCount).toBeGreaterThan(0);

    const documentId = body.document.id;

    // 2. It shows up in the list
    const list = await request.get("/api/documents", { headers });
    expect(list.status()).toBe(200);
    const { documents } = await list.json();
    expect(documents.map((d: any) => d.id)).toContain(documentId);

    // 3. Chunks were stored and are searchable
    const q = await request.post(`/api/documents/${documentId}/query`, {
      headers,
      data: { question: "What is this document about?" },
    });
    expect(q.status()).toBe(200);
    const { results } = await q.json();
    await testInfo.attach("query-results.json", {
      body: JSON.stringify(results, null, 2),
      contentType: "application/json",
    });
    expect(results.length).toBeGreaterThan(0);

    // 4. Chat actually works end to end: retrieval + a real streamed Gemini
    // answer that correctly reflects the document's content. Uses plain
    // fetch, not the `request` fixture — this is a genuine text/event-stream
    // response, and that's the same mechanism the real frontend uses to read it.
    const chatRes = await fetch(`${baseURL}/api/documents/${documentId}/threads`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ question: "What is the secret test keyword in this document?" }),
    });

    expect(chatRes.status).toBe(200);
    expect(chatRes.headers.get("content-type")).toContain("text/event-stream");

    const reader = chatRes.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";
    let sources: unknown[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const parsed = JSON.parse(trimmed.slice(5).trim());
        if (parsed.text) answer += parsed.text;
        if (parsed.done) sources = parsed.sources ?? [];
      }
    }

    await testInfo.attach("chat-answer.txt", { body: answer, contentType: "text/plain" });

    expect(answer.toLowerCase()).toContain("pineapple");
    expect(sources.length).toBeGreaterThan(0);

    // 5. Cleanup so you don't hit MAX_DOCS_PER_USER over repeated runs
    const del = await request.delete(`/api/documents/${documentId}`, { headers });
    expect(del.status()).toBe(204);
  });
});
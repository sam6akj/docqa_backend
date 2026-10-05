import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const result = { api: "ok", database: "down" };

  try {
    await db.execute(sql`select 1`);
    result.database = "ok";
  } catch {}

  res.status(result.database === "ok" ? 200 : 503).json(result);
});

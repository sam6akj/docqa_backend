import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { documentsRouter } from "./routes/document.js";
import { threadsRouter } from "./routes/thread.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  // credentials: true is required for the refresh-token cookie to be sent/received
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);

  app.use("/api/documents", documentsRouter);
  app.use("/api/threads", threadsRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

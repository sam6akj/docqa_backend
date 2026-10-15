import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { env } from "../config/env.js";

function jsonLimitHandler(message: string) {
  return (_req: Request, res: Response) => {
    res.status(429).json({ error: message });
  };
}

export const chatLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: env.MAX_QUESTIONS_PER_DAY,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user!.id,
  handler: jsonLimitHandler(
    `You've reached the limit of ${env.MAX_QUESTIONS_PER_DAY} questions per day. Please try again tomorrow.`
  ),
});

export const uploadLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: env.MAX_UPLOADS_PER_DAY,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user!.id,
  handler: jsonLimitHandler(
    `You've reached the limit of ${env.MAX_UPLOADS_PER_DAY} uploads per day. Please try again tomorrow.`
  ),
});
import dotenv from "dotenv";
import { z } from "zod";

// Works whether you run from the repo root or from apps/api
dotenv.config();
dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(16, "Must be at least 16 characters"),
  JWT_REFRESH_SECRET: z.string().min(16, "Must be at least 16 characters"),

  UPLOAD_DIR: z.string().default("uploads"),
  MAX_PDF_PAGES: z.coerce.number().default(20),
  MAX_UPLOAD_MB: z.coerce.number().default(10),
  MAX_DOCS_PER_USER: z.coerce.number().default(5),
  GEMINI_API_KEY: z.string().min(1, "Required to embed and chat with documents"),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(768),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

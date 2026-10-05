import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";

const uploadDir = path.resolve(env.UPLOAD_DIR);

async function ensureUploadDir() {
  await fs.mkdir(uploadDir, { recursive: true });
}

export async function saveFile(buffer: Buffer, originalName: string): Promise<string> {
  await ensureUploadDir();
  const safeExt = path.extname(originalName).toLowerCase() === ".pdf" ? ".pdf" : "";
  const storedName = `${randomUUID()}${safeExt}`;
  const fullPath = path.join(uploadDir, storedName);
  await fs.writeFile(fullPath, buffer);
  return storedName;
}

export async function deleteFile(storagePath: string): Promise<void> {
  try {
    await fs.unlink(path.join(uploadDir, storagePath));
  } catch {
    
  }
}

export function resolveStoragePath(storagePath: string): string {
  return path.join(uploadDir, storagePath);
}
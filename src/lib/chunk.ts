export function chunkText(text: string, chunkSize = 1000, overlap = 150): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length === 0) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < clean.length) {
    const end = Math.min(start + chunkSize, clean.length);
    let actualEnd = end;
    if (end < clean.length) {
      const lastSpace = clean.lastIndexOf(" ", end);
      if (lastSpace > start) actualEnd = lastSpace;
    }
    chunks.push(clean.slice(start, actualEnd).trim());
    if (actualEnd >= clean.length) break;
    start = actualEnd - overlap;
    if (start < 0) start = 0;
  }

  return chunks.filter((c) => c.length > 0);
}
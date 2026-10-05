import { PDFParse } from "pdf-parse";

const PDF_MAGIC_BYTES = Buffer.from("%PDF");

export function looksLikePdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).equals(PDF_MAGIC_BYTES);
}

export type PdfInfo = {
  pageCount: number;
  hasText: boolean;
  text: string;
};

export async function inspectPdf(buffer: Buffer): Promise<PdfInfo> {
  const parser = new PDFParse({
    data: buffer,
  });

  const result = await parser.getText();

  const text = result.text ?? "";
  const textLength = text.trim().length;

  await parser.destroy();

  return {
    pageCount: result.total,
    hasText: textLength > 50,
    text,
  };
}
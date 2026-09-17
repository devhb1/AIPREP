import { createHash } from "crypto";

export type TextChunk = {
  content: string;
  pageNumber: number | null;
  chunkIndex: number;
  contentHash: string;
  tokenEstimate: number;
};

export function chunkText(text: string, pageNumber: number | null = null): TextChunk[] {
  const cleaned = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) return [];

  const maxChars = 1200;
  const overlap = 150;
  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < cleaned.length) {
    const end = Math.min(start + maxChars, cleaned.length);
    let slice = cleaned.slice(start, end);
    if (end < cleaned.length) {
      const lastBreak = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(". "));
      if (lastBreak > maxChars * 0.5) {
        slice = slice.slice(0, lastBreak + 1);
      }
    }
    const content = slice.trim();
    if (content) {
      chunks.push({
        content,
        pageNumber,
        chunkIndex: index,
        contentHash: createHash("sha256").update(content).digest("hex"),
        tokenEstimate: Math.ceil(content.length / 4),
      });
      index += 1;
    }
    if (end >= cleaned.length) break;
    start = Math.max(start + slice.length - overlap, start + 1);
  }

  return chunks;
}

export async function extractPdfText(buffer: Buffer): Promise<{
  text: string;
  pageCount: number;
  pages: Array<{ pageNumber: number; content: string }>;
}> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();

  const text = result.text ?? "";
  const pageTexts: Array<{ pageNumber: number; content: string }> =
    Array.isArray(result.pages) && result.pages.length > 0
      ? result.pages.map(
          (
            page: { text?: string; num?: number; pageNumber?: number },
            index: number,
          ) => ({
            pageNumber: page.pageNumber ?? page.num ?? index + 1,
            content: (page.text ?? "").trim(),
          }),
        )
      : text
          .split("\f")
          .map((content: string, index: number) => ({
            pageNumber: index + 1,
            content: content.trim(),
          }));

  return {
    text,
    pageCount: result.total ?? pageTexts.length,
    pages: pageTexts.filter((p) => p.content.length > 0),
  };
}

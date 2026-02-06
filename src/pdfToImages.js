/**
 * Converts a PDF file to an array of image data URLs (one per page).
 * Used when calling OpenAI Vision API, which accepts images but not PDFs.
 */
import * as pdfjsLib from 'pdfjs-dist';

// PDF.js worker (required for parsing). Load from unpkg so it matches the installed version.
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;
}

const SCALE = 1.5;
const MAX_PAGES = 10; // Limit pages to avoid huge payloads and timeouts

/**
 * @param {File} file - PDF file
 * @returns {Promise<string[]>} Array of data URLs (image/png)
 */
export async function pdfToImageDataUrls(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = Math.min(pdf.numPages, MAX_PAGES);
  const dataUrls = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({
      canvasContext: ctx,
      viewport,
      intent: 'display',
    }).promise;
    dataUrls.push(canvas.toDataURL('image/png'));
  }

  return dataUrls;
}

/**
 * Extracts raw text from a PDF using PDF.js (no API). Works on text-based PDFs only, not scanned images.
 * @param {File} file - PDF file
 * @returns {Promise<string>} Full text of the document, with lines separated by newlines where possible
 */
export async function pdfToText(file) {
  let pdf;
  try {
    const arrayBuffer = await file.arrayBuffer();
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  } catch (e) {
    throw new Error(`PDF load failed: ${e.message}`);
  }
  const numPages = Math.min(pdf.numPages, 50);
  const allLines = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent?.items ?? [];
    if (!items.length) continue;
    const transform = (item) => {
      const t = item?.transform;
      if (!t) return { x: 0, y: 0 };
      return { x: t[4] ?? 0, y: t[5] ?? 0 };
    };
    // Items have str and transform. transform[5] is typically the y position (inverted).
    const withY = items.map((item) => ({
      str: typeof item?.str === 'string' ? item.str : '',
      ...transform(item),
    }));
    withY.sort((a, b) => {
      const yDiff = b.y - a.y;
      if (Math.abs(yDiff) > 2) return yDiff;
      return a.x - b.x;
    });
    let lastY = null;
    let currentLine = [];
    for (const { str, y } of withY) {
      if (lastY !== null && Math.abs(y - lastY) > 3) {
        if (currentLine.length) {
          allLines.push(currentLine.join(' ').trim());
          currentLine = [];
        }
      }
      currentLine.push(str);
      lastY = y;
    }
    if (currentLine.length) allLines.push(currentLine.join(' ').trim());
  }
  return allLines.join('\n');
}

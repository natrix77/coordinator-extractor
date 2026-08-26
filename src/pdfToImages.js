/**
 * Converts a PDF file to an array of image data URLs (one per page).
 * Used when calling OpenAI Vision API, which accepts images but not PDFs.
 */
import * as pdfjsLib from 'pdfjs-dist';

// PDF.js worker (required for parsing). Load from unpkg so it matches the installed version.
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;
}

const SCALE = 2;
const TILE_SCALE = 2.2;
const MAX_PAGES = 10; // Limit pages to avoid huge payloads and timeouts
const LARGE_PAGE_PT = 1400; // Scanned topo sheets are often much larger than this

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
    const baseViewport = page.getViewport({ scale: 1 });
    const isLargePage = baseViewport.width > LARGE_PAGE_PT || baseViewport.height > LARGE_PAGE_PT;

    if (isLargePage) {
      // Dense coordinate tables on A0/A1 scans are unreadable at full-page scale.
      // Send overlapping 2×2 tiles at higher resolution instead.
      const viewport = page.getViewport({ scale: TILE_SCALE });
      const tileW = Math.ceil(viewport.width / 2);
      const tileH = Math.ceil(viewport.height / 2);
      const overlapX = Math.round(tileW * 0.12);
      const overlapY = Math.round(tileH * 0.12);
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          const sx = Math.max(0, col * tileW - overlapX);
          const sy = Math.max(0, row * tileH - overlapY);
          const w = Math.min(viewport.width - sx, tileW + overlapX);
          const h = Math.min(viewport.height - sy, tileH + overlapY);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.setTransform(1, 0, 0, 1, -sx, -sy);
          await page.render({
            canvasContext: ctx,
            viewport,
            intent: 'display',
          }).promise;
          dataUrls.push(canvas.toDataURL('image/png'));
        }
      }
    } else {
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

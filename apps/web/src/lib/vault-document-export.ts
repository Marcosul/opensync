import html2canvas from "html2canvas-pro";
import { PDFDocument } from "pdf-lib";

function mimeTypeForDownload(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".json") || lower.endsWith(".jsonl")) return "application/json;charset=utf-8";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown;charset=utf-8";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html;charset=utf-8";
  if (lower.endsWith(".xml")) return "application/xml;charset=utf-8";
  return "text/plain;charset=utf-8";
}

export function downloadVaultTextFile(fileName: string, content: string): void {
  const blob = new Blob([content], { type: mimeTypeForDownload(fileName) });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadPdfBytes(fileName: string, bytes: Uint8Array): void {
  const backing = bytes.buffer;
  const body: BlobPart =
    backing instanceof ArrayBuffer
      ? bytes.byteOffset === 0 && bytes.byteLength === backing.byteLength
        ? backing
        : backing.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      : new Uint8Array(bytes);
  const blob = new Blob([body], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function baseNameWithoutExt(fileName: string): string {
  const base = fileName.replace(/^.*[/\\]/, "");
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return base || "document";
  return base.slice(0, dot);
}

/**
 * Captura o nó `[data-vault-pdf-export-root]` e gera um PDF paginado (A4).
 */
export async function exportVaultEditorViewportToPdf(downloadBaseName: string): Promise<void> {
  const root = document.querySelector<HTMLElement>("[data-vault-pdf-export-root]");
  if (!root) {
    throw new Error("Não foi encontrada a área do editor para exportar.");
  }

  const canvas = await html2canvas(root, {
    scale: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    scrollX: 0,
    scrollY: 0,
    windowWidth: root.scrollWidth,
    windowHeight: root.scrollHeight,
  });

  const pdf = await PDFDocument.create();
  const pageW = 595;
  const pageH = 842;
  const margin = 40;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;

  const imgW = canvas.width;
  const imgH = canvas.height;
  if (imgW === 0 || imgH === 0) {
    throw new Error("A captura do editor ficou vazia.");
  }

  const scale = usableW / imgW;
  const stripHeightSrc = Math.ceil(usableH / scale);

  let y = 0;
  while (y < imgH) {
    const sliceH = Math.min(stripHeightSrc, imgH - y);
    const strip = document.createElement("canvas");
    strip.width = imgW;
    strip.height = sliceH;
    const sctx = strip.getContext("2d");
    if (!sctx) throw new Error("Canvas 2D indisponível.");
    sctx.drawImage(canvas, 0, y, imgW, sliceH, 0, 0, imgW, sliceH);

    const pngBytes: Uint8Array = await new Promise((resolve, reject) => {
      strip.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Falha ao gerar imagem da página."));
          return;
        }
        void blob.arrayBuffer().then((ab) => resolve(new Uint8Array(ab)));
      }, "image/png");
    });

    const embedded = await pdf.embedPng(pngBytes);
    const page = pdf.addPage([pageW, pageH]);
    const drawW = usableW;
    const drawH = sliceH * scale;
    page.drawImage(embedded, {
      x: margin,
      y: pageH - margin - drawH,
      width: drawW,
      height: drawH,
    });
    y += sliceH;
  }

  const out = await pdf.save();
  const safeBase = baseNameWithoutExt(downloadBaseName) || "document";
  downloadPdfBytes(`${safeBase}.pdf`, out);
}

export function resolveVaultExportFileName(docId: string, treeFileName: string | null): string {
  const fromTree = treeFileName?.trim();
  if (fromTree) return fromTree;
  const tail = docId.replace(/^.*[/\\]/, "").trim();
  return tail || "document.txt";
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AlignmentType, Document, Footer, Header, HeadingLevel, ImageRun,
  Packer, PageBreak, PageNumber, Paragraph, Table, TableCell, TableRow,
  TextRun, WidthType,
} from "docx";

const root = fileURLToPath(new URL("../", import.meta.url));
const markdown = await readFile(path.join(root, "docs/DOKUMEN-PEMESANAN-RESTORAN.md"), "utf8");
const green = "244A3B";
const body = [];
const p = (value, options = {}) => new Paragraph({ children: [new TextRun(value)], spacing: { after: 120, line: 276 }, alignment: AlignmentType.JUSTIFIED, ...options });
const heading = (value, level = 1, pageBreakBefore = false) => p(value, { heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, keepNext: true, pageBreakBefore, alignment: AlignmentType.LEFT });
const caption = (value) => p(value, { alignment: AlignmentType.CENTER, children: [new TextRun({ text: value, italics: true, size: 20, color: "56625A" })], spacing: { before: 70, after: 150 }, keepLines: true });

body.push(p("", { spacing: { after: 1400 } }));
body.push(p("DOKUMEN LAPORAN", { alignment: AlignmentType.CENTER, children: [new TextRun({ text: "DOKUMEN LAPORAN", bold: true, size: 44, color: green })], spacing: { after: 60 } }));
body.push(p("PENGEMBANGAN PROGRAM", { alignment: AlignmentType.CENTER, children: [new TextRun({ text: "PENGEMBANGAN PROGRAM", bold: true, size: 44, color: green })], spacing: { after: 380 } }));
body.push(p("SISTEM PEMESANAN RESTORAN", { alignment: AlignmentType.CENTER, children: [new TextRun({ text: "SISTEM PEMESANAN RESTORAN", bold: true, size: 36 })], spacing: { after: 260 } }));
body.push(p("RASA & RUANG", { alignment: AlignmentType.CENTER, children: [new TextRun({ text: "RASA & RUANG", bold: true, size: 32, color: green })], spacing: { after: 1400 } }));
body.push(p("Nama peserta: ______________________________", { alignment: AlignmentType.CENTER }));
body.push(p("Nomor peserta: _____________________________", { alignment: AlignmentType.CENTER }));
body.push(p("Praktik Demonstrasi Kompetensi Pemrograman", { alignment: AlignmentType.CENTER, spacing: { before: 500, after: 120 } }));
body.push(p("Revisi 13 Oktober 2026", { alignment: AlignmentType.CENTER }));
body.push(new Paragraph({ children: [new PageBreak()] }));

function table(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row, index) => new TableRow({
      tableHeader: index === 0, cantSplit: true,
      children: row.map((value) => new TableCell({
        shading: index === 0 ? { fill: green } : index % 2 === 0 ? { fill: "F3F5F0" } : undefined,
        margins: { top: 90, bottom: 90, left: 100, right: 100 },
        children: [p(value, { alignment: AlignmentType.LEFT, spacing: { after: 0, line: 240 }, children: [new TextRun({ text: value, size: 20, bold: index === 0, color: index === 0 ? "FFFFFF" : "29352E" })] })],
      })),
    })),
  });
}

async function diagram(alt, relative) {
  const filename = path.resolve(root, "docs", relative);
  if (!filename.startsWith(path.join(root, "docs/diagrams") + path.sep)) throw new Error("Diagram harus di docs/diagrams.");
  const png = await readFile(filename.replace(/\.svg$/, ".png"));
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  const scale = Math.min(605 / width, 660 / height);
  body.push(new Paragraph({
    alignment: AlignmentType.CENTER, keepNext: true,
    spacing: { before: 90, after: 0 },
    children: [new ImageRun({ type: "png", data: png, transformation: { width: Math.round(width * scale), height: Math.round(height * scale) }, altText: { title: alt, description: alt, name: path.basename(filename) } })],
  }));
  body.push(caption(alt));
}

const lines = markdown.slice(markdown.indexOf("# 1. Deskripsi Sistem")).split(/\r?\n/);
let code = false;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  if (line.startsWith("```")) { code = !code; continue; }
  if (code) {
    body.push(p(line, { alignment: AlignmentType.LEFT, shading: { fill: "F3F5F0" }, spacing: { after: 0, line: 220 }, children: [new TextRun({ text: line, font: "Consolas", size: 19 })] }));
  } else if (line.startsWith("|")) {
    const rows = [];
    while (i < lines.length && lines[i].startsWith("|")) {
      if (!/^\|[\s:|\-]+\|$/.test(lines[i])) rows.push(lines[i].split("|").slice(1, -1).map((cell) => cell.trim()));
      i++;
    }
    i--;
    body.push(table(rows));
    body.push(p("", { spacing: { after: 0 } }));
  } else if (line.startsWith("![")) {
    const match = line.match(/^!\[(.+)\]\((.+)\)$/);
    if (!match) throw new Error(`Syntax gambar invalid: ${line}`);
    await diagram(match[1], match[2]);
  } else if (line.startsWith("# ")) {
    const title = line.slice(2);
    body.push(heading(title, 1, !title.startsWith("1.")));
  } else if (line.startsWith("## ")) {
    const title = line.slice(3);
    const startsDiagramPage = /^(3\.[23]|4\.[2345])\b/.test(title);
    body.push(heading(title, 2, startsDiagramPage));
  } else if (line.startsWith("- ")) {
    body.push(p(line.slice(2), { bullet: { level: 0 }, alignment: AlignmentType.LEFT }));
  } else {
    body.push(p(line));
  }
}

const doc = new Document({
  creator: "Peserta Sertifikasi", title: "Dokumen Laporan Pengembangan Program — Rasa & Ruang", description: "Dokumen berdasarkan implementasi Sistem Pemesanan Restoran; delapan Instruksi Kerja dan delapan diagram.",
  styles: {
    default: { document: { run: { font: "Times New Roman", size: 23, color: "29352E" }, paragraph: { spacing: { after: 120, line: 276 } } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Times New Roman", size: 32, bold: true, color: green }, paragraph: { spacing: { before: 240, after: 160 }, keepNext: true } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Times New Roman", size: 26, bold: true, color: green }, paragraph: { spacing: { before: 180, after: 100 }, keepNext: true } },
    ],
  },
  sections: [{
    properties: { titlePage: true, page: { size: { width: 11906, height: 16838 }, margin: { top: 1247, bottom: 1247, left: 1531, right: 1304, header: 450, footer: 450 } } },
    headers: { default: new Header({ children: [p("RASA & RUANG  |  DOKUMEN PENGEMBANGAN PROGRAM", { alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "RASA & RUANG  |  DOKUMEN PENGEMBANGAN PROGRAM", font: "Calibri", size: 16, color: "69746A" })] })] }), first: new Header({ children: [p("")] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Halaman ", size: 18 }), new TextRun({ children: [PageNumber.CURRENT], size: 18 })] })] }), first: new Footer({ children: [p("")] }) },
    children: body,
  }],
});
const output = path.join(root, "pengumpulan/06-Dokumen-Pemesanan-Restoran.docx");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, await Packer.toBuffer(doc));
console.log("Dokumen sistem dibuat:", output);

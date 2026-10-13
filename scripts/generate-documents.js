import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ImageRun,
  PageBreak,
} from "docx";
import { buildPresentation } from "./generate-presentation.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "pengumpulan");
await mkdir(output, { recursive: true });
const color = {
  green: "244A3B",
  gold: "B18B50",
  cream: "F7F7F2",
  ink: "29352E",
  muted: "82867E",
  border: "E3E6DB",
};

function paragraph(text, options = {}) {
  return new Paragraph({
    children: [new TextRun({ text, ...options.run })],
    spacing: { after: 140 },
    ...options,
  });
}
function table(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (row, rowIndex) =>
        new TableRow({
          children: row.map(
            (cell) =>
              new TableCell({
                shading: rowIndex === 0 ? { fill: color.green } : undefined,
                margins: { top: 100, bottom: 100, left: 100, right: 100 },
                children: [
                  paragraph(cell, {
                    run: {
                      bold: rowIndex === 0,
                      color: rowIndex === 0 ? "FFFFFF" : color.ink,
                      size: 19,
                    },
                  }),
                ],
              }),
          ),
        }),
    ),
  });
}

function parseMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const children = [];
  let inCode = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      children.push(
        paragraph(line || " ", {
          run: { font: "Consolas", size: 17 },
          spacing: { after: 0 },
          shading: { fill: "F2F4EE" },
        }),
      );
    } else if (line.startsWith("|")) {
      const rows = [];
      while (index < lines.length && lines[index].startsWith("|")) {
        if (!/^\|[\s:|-]+\|$/.test(lines[index]))
          rows.push(
            lines[index]
              .split("|")
              .slice(1, -1)
              .map((cell) => cell.trim().replace(/`/g, "")),
          );
        index++;
      }
      index--;
      children.push(table(rows), paragraph(""));
    } else if (/^#{1,3} /.test(line)) {
      const level = line.match(/^#+/)[0].length;
      children.push(
        paragraph(line.replace(/^#+ /, ""), {
          heading: [
            HeadingLevel.TITLE,
            HeadingLevel.HEADING_1,
            HeadingLevel.HEADING_2,
          ][level - 1],
        }),
      );
    } else if (line.trim()) {
      children.push(paragraph(line.replace(/\*\*|`/g, "")));
    }
  }
  return children;
}

function makeDocument(children) {
  return new Document({
    creator: "Rasa & Ruang — Praktik Sertifikasi",
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22, color: color.ink },
          paragraph: { spacing: { line: 280 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 },
          },
        },
        children,
      },
    ],
  });
}

const report = parseMarkdown(
  await readFile(path.join(root, "docs/LAPORAN.md"), "utf8"),
);
report.push(
  new Paragraph({ children: [new PageBreak()] }),
  paragraph("Lampiran Tampilan Aplikasi", { heading: HeadingLevel.HEADING_1 }),
);
for (const [name, title, width, height] of [
  [
    "reservasi-desktop.png",
    "Reservasi, kondisi meja, dan daftar pesanan (desktop).",
    610,
    542,
  ],
  [
    "laporan-desktop.png",
    "Laporan harian dengan rekap dan pendapatan selesai.",
    610,
    424,
  ],
  ["reservasi-mobile.png", "Antarmuka pada perangkat mobile.", 245, 740],
]) {
  try {
    const data = await readFile(path.join(root, "docs/screenshots", name));
    const ratio = Math.min(
      width / data.readUInt32BE(16),
      height / data.readUInt32BE(20),
    );
    report.push(
      paragraph(title),
      new Paragraph({
        children: [
          new ImageRun({
            data,
            type: "png",
            transformation: {
              width: Math.round(data.readUInt32BE(16) * ratio),
              height: Math.round(data.readUInt32BE(20) * ratio),
            },
          }),
        ],
      }),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    console.log(`Screenshot ${name} belum tersedia; gambar dilewati.`);
  }
}
await writeFile(
  path.join(output, "03-Laporan-Pengembangan.docx"),
  await Packer.toBuffer(makeDocument(report)),
);

async function sourceFiles(directory) {
  const entries = await readdir(path.join(root, directory), {
    withFileTypes: true,
  });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(relative)));
    else if (/\.(js|html|css|sql|svg)$/.test(entry.name)) files.push(relative);
  }
  return files;
}
const files = ["package.json", ".env.example", "rest-client.http", ".vscode/launch.json", ".vscode/extensions.json"];
for (const directory of ["src", "public", "database", "tests", "scripts"])
  files.push(...(await sourceFiles(directory)));
const appendix = [
  paragraph("Lampiran Koding — Rasa & Ruang", { heading: HeadingLevel.TITLE }),
  paragraph("Nama peserta: ____________________"),
  paragraph(
    "Kode sumber lengkap. Berkas .env pribadi dan node_modules tidak disertakan. Referensi path mengikuti struktur proyek.",
  ),
  paragraph(`Jumlah berkas: ${files.length}`),
];
const markdownAppendix = ["# Lampiran Koding — Rasa & Ruang", ""];
for (const file of files) {
  const source = await readFile(path.join(root, file), "utf8");
  const name = file.replaceAll("\\", "/");
  appendix.push(
    new Paragraph({ children: [new PageBreak()] }),
    paragraph(name, { heading: HeadingLevel.HEADING_1 }),
  );
  for (const line of source.split(/\r?\n/))
    appendix.push(
      paragraph(line || " ", {
        run: { font: "Consolas", size: 15 },
        spacing: { after: 0, line: 180 },
      }),
    );
  markdownAppendix.push(
    `## ${name}`,
    "",
    "```" + path.extname(file).slice(1),
    source,
    "```",
    "",
  );
}
await writeFile(
  path.join(root, "docs/LAMPIRAN-KODING.md"),
  markdownAppendix.join("\n"),
);
await writeFile(
  path.join(output, "02-Lampiran-Koding.docx"),
  await Packer.toBuffer(makeDocument(appendix)),
);

const slideCount = await buildPresentation();
console.log(`Dokumen dibuat: laporan DOCX, lampiran ${files.length} berkas, presentasi ${slideCount} slide.`);

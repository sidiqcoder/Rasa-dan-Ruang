import { ZipArchive } from "archiver";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { finished } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "pengumpulan");
await mkdir(output, { recursive: true });

async function zip(filename, entries) {
  const stream = createWriteStream(path.join(output, filename));
  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on("error", (error) => stream.destroy(error));
  archive.on("warning", (error) => stream.destroy(error));
  archive.pipe(stream);
  for (const entry of entries) {
    if (entry.directory)
      archive.directory(path.join(root, entry.source), entry.name);
    else archive.file(path.join(root, entry.source), { name: entry.name });
  }
  await Promise.all([archive.finalize(), finished(stream)]);
}

// Allowlist menghindari kredensial, node_modules, database, dan berkas pribadi ikut terarsip.
const sourceEntries = [
  "public",
  "src",
  "database",
  "scripts",
  "tests",
  "docs",
  ".vscode",
].map((name) => ({
  source: name,
  name: `rasa-ruang/${name}`,
  directory: true,
}));
for (const name of [
  "package.json",
  "package-lock.json",
  "README.md",
  ".env.example",
  ".gitignore",
  "rest-client.http",
])
  sourceEntries.push({ source: name, name: `rasa-ruang/${name}` });
await zip("01-Kode-Sumber.zip", sourceEntries);

const submissionReadme = `BERKAS PENGUMPULAN — RASA & RUANG\n\n01-Kode-Sumber.zip: ekstrak, baca README.md, jalankan npm ci, setup database, lalu npm start.\n02-Lampiran-Koding.docx: lampiran kode lengkap.\n03-Laporan-Pengembangan.docx: isi nama dan nomor peserta.\n04-Presentasi.pptx: isi identitas pada slide pertama.\n05-Laporan-Audit-Kompetensi.docx: audit awal beserta catatan tindak lanjut.\n06-Dokumen-Pemesanan-Restoran.docx: dokumen sistem berdasarkan contoh, delapan gambar diagram, alur kode, debugging dan pengujian.\n07-Laporan-Proyek-Waterfall.docx: laporan peserta terbaru, 31 skenario error dan 183 test scenario; M. Sidiq Firdaus, NPM 2315061118.\n\nFrontend HTML/CSS/JS native; backend Express; database MySQL/MariaDB.\nPengujian terbaru: docs/bukti-unit.tap, docs/bukti-integrasi.tap, dan docs/HASIL-PELENGKAPAN.md.\nREST Client: buka rest-client.http dan kirim request berurutan.\nKredensial .env dan node_modules tidak disertakan.\n`;
await writeFile(path.join(output, "BACA-SAYA.txt"), submissionReadme);
const names = [
  "01-Kode-Sumber.zip",
  "02-Lampiran-Koding.docx",
  "03-Laporan-Pengembangan.docx",
  "04-Presentasi.pptx",
  "05-Laporan-Audit-Kompetensi.docx",
  "06-Dokumen-Pemesanan-Restoran.docx",
  "07-Laporan-Proyek-Waterfall.docx",
  "BACA-SAYA.txt",
];
for (const name of names) await readFile(path.join(output, name));
await zip(
  "Paket-Pengumpulan.zip",
  names.map((name) => ({ source: `pengumpulan/${name}`, name })),
);
console.log("Paket siap:", path.join(output, "Paket-Pengumpulan.zip"));

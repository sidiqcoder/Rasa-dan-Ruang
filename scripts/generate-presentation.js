import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pptxgen from "pptxgenjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const palette = { green: "244A3B", gold: "B18B50", cream: "F7F7F2", ink: "29352E", muted: "69746A", border: "DDE3D7", white: "FFFFFF", red: "A44739" };
const diagramDirectory = path.join(root, "docs/diagrams");
const units = [
  ["016.01", "Guidelines & Best Practices"],
  ["017.02", "Pemrograman Terstruktur"],
  ["018.02", "Pemrograman Berorientasi Objek"],
  ["019.02", "Library / Komponen Pre-existing"],
  ["021.02", "Akses Basis Data"],
  ["023.02", "Dokumentasi Kode Program"],
  ["025.02", "Debugging"],
  ["033.02", "Pengujian Unit Program"],
];

const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Satu sumber bentuk untuk diagram SVG dan objek PowerPoint yang dapat diedit. */
class Diagram {
  constructor(title) { this.title = title; this.elements = []; }
  shape(kind, x, y, w, h, fill = palette.white, stroke = palette.green) {
    this.elements.push({ type: "shape", kind, x, y, w, h, fill, stroke });
  }
  label(value, x, y, w, h, size = 14, options = {}) {
    this.elements.push({ type: "text", value, x, y, w, h, size, ...options });
  }
  line(x1, y1, x2, y2, arrow = false, color = palette.green, dash = false) {
    this.elements.push({ type: "line", x1, y1, x2, y2, arrow, color, dash });
  }
  box(value, x, y, w, h, size = 14, fill = palette.white) {
    this.shape("roundRect", x, y, w, h, fill);
    this.label(value, x + 0.08, y + 0.03, w - 0.16, h - 0.06, size);
  }
  decision(value, x, y, w = 1.25, h = 0.70) {
    this.shape("diamond", x, y, w, h, "F4EBD8");
    this.label(value, x + 0.13, y + 0.04, w - 0.26, h - 0.08, 12);
  }
  final(x, y) {
    this.shape("ellipse", x, y, 0.22, 0.22);
    this.shape("ellipse", x + 0.045, y + 0.045, 0.13, 0.13, palette.green);
  }
  draw(slide, ppt, originX = 0.65, originY = 2.15) {
    for (const e of this.elements) {
      if (e.type === "shape") {
        slide.addShape(ppt.ShapeType[e.kind], { x: originX + e.x, y: originY + e.y, w: e.w, h: e.h, ...(e.kind === "roundRect" ? { rectRadius: 0.10 } : {}), fill: { color: e.fill }, line: { color: e.stroke, width: 1.2 } });
      } else if (e.type === "text") {
        slide.addText(e.value, { x: originX + e.x, y: originY + e.y, w: e.w, h: e.h, fontFace: e.mono ? "Consolas" : "Calibri", fontSize: e.size, color: e.color || palette.ink, bold: e.bold || false, align: e.align || "center", valign: "mid", margin: 0, breakLine: false, fit: "shrink" });
      } else {
        // PptxGenJS uses positive dimensions plus flipV for descending lines.
        const startIsLeft = e.x1 <= e.x2;
        const leftY = startIsLeft ? e.y1 : e.y2;
        const rightY = startIsLeft ? e.y2 : e.y1;
        slide.addShape(ppt.ShapeType.line, {
          x: originX + Math.min(e.x1, e.x2), y: originY + Math.min(e.y1, e.y2),
          w: Math.abs(e.x2 - e.x1), h: Math.abs(e.y2 - e.y1), flipV: leftY > rightY,
          line: { color: e.color, width: 1.2, ...(e.dash ? { dashType: "dash" } : {}), ...(e.arrow ? { [startIsLeft ? "endArrowType" : "beginArrowType"]: "triangle" } : {}) },
        });
      }
    }
  }
  svg() {
    const scale = 120;
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="564" viewBox="0 0 1440 564" role="img" aria-labelledby="title"><title id="title">${escapeXml(this.title)}</title><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#${palette.green}"/></marker></defs><rect width="1440" height="564" fill="#${palette.cream}"/>`];
    for (const e of this.elements) {
      if (e.type === "shape") {
        const x = e.x * scale, y = e.y * scale, w = e.w * scale, h = e.h * scale;
        const style = `fill="#${e.fill}" stroke="#${e.stroke}" stroke-width="1.8"`;
        if (e.kind === "ellipse") parts.push(`<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${style}/>`);
        else if (e.kind === "diamond") parts.push(`<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" ${style}/>`);
        else parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${e.kind === "roundRect" ? 12 : 0}" ${style}/>`);
      } else if (e.type === "line") {
        parts.push(`<line x1="${e.x1 * scale}" y1="${e.y1 * scale}" x2="${e.x2 * scale}" y2="${e.y2 * scale}" stroke="#${e.color}" stroke-width="1.8"${e.arrow ? ' marker-end="url(#arrow)"' : ""}${e.dash ? ' stroke-dasharray="7 5"' : ""}/>`);
      } else {
        const lines = e.value.split("\n");
        const size = e.size * scale / 72;
        const lineHeight = size * 1.18;
        const centerY = (e.y + e.h / 2) * scale;
        const x = (e.align === "left" ? e.x : e.x + e.w / 2) * scale;
        parts.push(`<text x="${x}" y="${centerY - (lines.length - 1) * lineHeight / 2}" text-anchor="${e.align === "left" ? "start" : "middle"}" dominant-baseline="central" font-family="${e.mono ? "Consolas,monospace" : "Calibri,Arial,sans-serif"}" font-size="${size}" fill="#${e.color || palette.ink}" font-weight="${e.bold ? 700 : 400}">${lines.map((line, i) => `<tspan x="${x}" dy="${i ? lineHeight : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`);
      }
    }
    return parts.join("\n") + "\n</svg>\n";
  }
}

function useCaseDiagram() {
  const d = new Diagram("Use case Sistem Pemesanan Restoran — aktor Operator");
  d.shape("rect", 3.45, 0.06, 7.95, 4.55);
  d.label("Sistem Pemesanan Restoran", 3.8, 0.12, 7.2, 0.30, 17, { bold: true, color: palette.green });
  d.shape("ellipse", 1.09, 1.58, 0.35, 0.35);
  d.line(1.265, 1.93, 1.265, 2.58);
  d.line(0.89, 2.10, 1.65, 2.10);
  d.line(1.265, 2.58, 0.89, 3.05);
  d.line(1.265, 2.58, 1.65, 3.05);
  d.label("Operator\nrestoran", 0.35, 3.15, 1.80, 0.65, 18, { bold: true });
  const labels = ["UC01 · Kelola pelanggan (CRUD)", "UC02 · Lihat referensi meja dan menu", "UC03 · Buat reservasi + pesanan opsional", "UC04 · Ubah reservasi + pesanan", "UC05 · Hadir / selesai / batalkan reservasi", "UC06 · Lihat daftar reservasi per tanggal", "UC07 · Lihat rekap laporan pemesanan", "UC08 · Ekspor CSV/JSON atau cetak laporan"];
  labels.forEach((label, i) => {
    const y = 0.55 + i * 0.49;
    d.line(1.65, 2.10, 4.45, y + 0.215);
    d.shape("ellipse", 4.45, y, 5.95, 0.43);
    d.label(label, 4.70, y + 0.01, 5.45, 0.41, 14);
  });
  return d;
}

function activityDiagram() {
  const d = new Diagram("Activity diagram pembuatan reservasi — validasi, transaksi, dan hasil");
  for (const [x, w, label] of [[0.05, 2.4, "OPERATOR / UI"], [2.6, 4.4, "API / SERVICE"], [7.15, 4.75, "REPOSITORY / DATABASE"]]) {
    d.shape("rect", x, 0.08, w, 4.48, palette.cream, palette.border);
    d.label(label, x + 0.05, 0.15, w - 0.1, 0.25, 12, { bold: true, color: palette.green });
  }
  d.shape("ellipse", 0.98, 0.49, 0.20, 0.20, palette.green);
  d.box("Isi pelanggan, meja, waktu,\ntamu; menu opsional", 0.25, 0.91, 2.0, 0.70, 13);
  d.line(1.08, 0.69, 1.08, 0.91, true);
  d.box("Kirim POST\n/api/reservations", 0.25, 1.94, 2.0, 0.65, 13);
  d.line(1.25, 1.61, 1.25, 1.94, true);
  d.box("Validasi payload, tanggal WIB,\ndurasi, tamu dan items", 2.87, 1.94, 2.65, 0.65, 13);
  d.line(2.25, 2.26, 2.87, 2.26, true);
  d.decision("Valid?", 5.77, 1.94, 1.0, 0.65);
  d.line(5.52, 2.26, 5.77, 2.26, true);
  d.box("Ambil koneksi · BEGIN\nLock meja urut ID", 7.52, 0.88, 3.20, 0.65, 13);
  d.line(6.27, 1.94, 6.27, 1.21);
  d.line(6.27, 1.21, 7.52, 1.21, true);
  d.label("Ya", 6.56, 0.97, 0.4, 0.18, 11);
  d.box("Cek referensi, kapasitas, konflik;\nambil harga menu aktif dari DB", 7.52, 1.84, 3.20, 0.70, 13);
  d.line(9.12, 1.53, 9.12, 1.84, true);
  d.decision("Lolos?", 8.57, 2.78, 1.10, 0.65);
  d.line(9.12, 2.54, 9.12, 2.78, true);
  d.box("ROLLBACK\nrelease koneksi", 10.01, 2.80, 1.67, 0.65, 12);
  d.line(9.67, 3.10, 10.01, 3.10, true);
  d.label("Tidak", 9.64, 2.57, 0.52, 0.19, 10);
  d.box("Hitung total; INSERT reservasi\n+ order_items; COMMIT; release", 7.45, 3.77, 4.22, 0.64, 13);
  d.line(9.12, 3.43, 9.12, 3.77, true);
  d.label("Ya", 9.21, 3.51, 0.35, 0.16, 11);
  d.line(11.67, 4.08, 11.83, 4.08, false, palette.red, true);
  d.line(11.83, 4.08, 11.83, 3.13, false, palette.red, true);
  d.line(11.83, 3.13, 11.68, 3.13, true, palette.red, true);
  d.label("Error SQL", 10.93, 3.49, 0.83, 0.18, 10, { color: palette.red });
  d.box("Tampilkan error\n400 / 404 / 409 / 500", 2.87, 2.96, 3.90, 0.58, 13, "F9EEE9");
  d.line(6.27, 2.59, 6.27, 2.96, true);
  d.label("Tidak", 6.31, 2.66, 0.50, 0.17, 10);
  d.line(10.85, 3.45, 10.85, 3.61);
  d.line(10.85, 3.61, 6.90, 3.61);
  d.line(6.90, 3.61, 6.90, 3.25);
  d.line(6.90, 3.25, 6.77, 3.25, true);
  d.box("HTTP 201 · { id, total }", 2.87, 3.80, 3.90, 0.55, 14);
  d.line(7.45, 4.08, 6.77, 4.08, true);
  d.final(1.14, 4.01);
  d.line(2.87, 4.08, 1.36, 4.12, true);
  d.line(2.87, 3.25, 1.25, 3.25);
  d.line(1.25, 3.25, 1.25, 4.01, true);
  return d;
}

function erdDiagram() {
  const d = new Diagram("ERD lima tabel — sesuai database/schema.sql");
  const entity = (name, lines, x, y, w, h, textSize = 13) => {
    d.shape("rect", x, y, w, h);
    d.shape("rect", x, y, w, 0.42, palette.green);
    d.label(name, x + 0.08, y + 0.02, w - 0.16, 0.38, 17, { bold: true, color: palette.white });
    d.label(lines.join("\n"), x + 0.12, y + 0.48, w - 0.24, h - 0.55, textSize, { align: "left", mono: true });
  };
  entity("customers", ["PK id : INT UNSIGNED", "name : VARCHAR(100)", "UQ phone : VARCHAR(20)", "email : VARCHAR(150) NULL", "created_at : TIMESTAMP"], 0.10, 0.10, 3.28, 1.91);
  entity("restaurant_tables", ["PK id : INT UNSIGNED", "UQ name : VARCHAR(30)", "capacity : INT UNSIGNED", "area : VARCHAR(50)"], 0.10, 2.64, 3.28, 1.70);
  entity("reservations", ["PK id : INT UNSIGNED", "FK customer_id", "FK table_id", "start_at, end_at : DATETIME", "guests : INT UNSIGNED", "status : ENUM (4 status)", "notes : VARCHAR(500)", "total : INT UNSIGNED", "created_at : TIMESTAMP"], 4.46, 0.82, 3.40, 3.43);
  entity("menu_items", ["PK id : INT UNSIGNED", "UQ name : VARCHAR(100)", "category : VARCHAR(30)", "price : INT UNSIGNED", "active : BOOLEAN"], 8.98, 0.10, 2.88, 1.91);
  entity("order_items", ["PK id : INT UNSIGNED", "FK reservation_id", "FK menu_item_id", "quantity : INT UNSIGNED", "unit_price : INT UNSIGNED", "UQ (reservation_id,", "    menu_item_id)"], 8.98, 2.64, 2.88, 1.95, 12);
  // Multiplicities are explicit UML-style 1 and 0..* (not arrow directions).
  d.line(3.38, 1.12, 4.46, 1.12);
  d.label("1", 3.38, 0.85, 0.30, 0.20, 13, { bold: true });
  d.label("0..*", 3.91, 0.85, 0.50, 0.20, 13, { bold: true });
  d.line(3.38, 3.20, 4.46, 3.20);
  d.label("1", 3.38, 2.93, 0.30, 0.20, 13, { bold: true });
  d.label("0..*", 3.91, 2.93, 0.50, 0.20, 13, { bold: true });
  d.line(7.86, 3.52, 8.98, 3.52);
  d.label("1", 7.88, 3.22, 0.30, 0.20, 13, { bold: true });
  d.label("0..*", 8.43, 3.22, 0.50, 0.20, 13, { bold: true });
  d.line(10.39, 2.01, 10.39, 2.64);
  d.label("1", 10.46, 2.05, 0.40, 0.20, 13, { bold: true });
  d.label("0..*", 10.46, 2.38, 0.50, 0.20, 13, { bold: true });
  d.label("PK = primary key · FK = foreign key · UQ = unik", 0.10, 4.39, 8.60, 0.22, 12, { align: "left", color: palette.muted });
  return d;
}

/** Membuat PPT + diagram dari source terpasang, tanpa menjalankan/mengubah database. */
export async function buildPresentation() {
  await mkdir(diagramDirectory, { recursive: true });
  const output = path.join(root, "pengumpulan");
  await mkdir(output, { recursive: true });
  const ppt = new pptxgen();
  ppt.layout = "LAYOUT_WIDE";
  ppt.author = "Peserta Sertifikasi";
  ppt.subject = "Delapan Instruksi Kerja — Sistem Pemesanan Restoran";
  ppt.title = "Rasa & Ruang — Demonstrasi Kompetensi";
  ppt.company = "Praktik Sertifikasi";
  ppt.lang = "id-ID";
  ppt.theme = { headFontFace: "Georgia", bodyFontFace: "Calibri", lang: "id-ID" };
  const slideIndex = [];

  const txt = (slide, value, x, y, w, h, options = {}) => slide.addText(value, { x, y, w, h, fontFace: "Calibri", fontSize: 21, color: palette.ink, margin: 0, breakLine: false, valign: "mid", ...options });
  const base = (title, subtitle, unit, source) => {
    const s = ppt.addSlide();
    slideIndex.push({ slide: slideIndex.length + 1, title, unit: unit || null, source: source || null });
    s.background = { color: palette.cream };
    s.addShape(ppt.ShapeType.rect, { x: 0, y: 0, w: 0.16, h: 7.5, line: { color: palette.green }, fill: { color: palette.green } });
    txt(s, unit ? `${String(unit).padStart(2, "0")} / 08   ·   J.620100.${units[unit - 1][0]}` : "RASA & RUANG   /   PRAKTIK SERTIFIKASI", 0.65, 0.37, 12, 0.32, { fontSize: 12, charSpacing: 1.2, bold: true, color: palette.gold });
    txt(s, title, 0.65, 0.91, 12, 0.63, { fontFace: "Georgia", fontSize: 30, bold: true, color: palette.green });
    txt(s, subtitle, 0.65, 1.66, 12, 0.34, { fontSize: 16, color: palette.muted });
    s.addShape(ppt.ShapeType.line, { x: 0.65, y: 6.92, w: 12, h: 0, line: { color: palette.border, width: 1 } });
    txt(s, source || "Sistem Pemesanan Restoran · revisi 13 Oktober 2026", 0.65, 7.07, 11.2, 0.20, { fontSize: 10, color: palette.muted });
    txt(s, String(ppt._slides.length).padStart(2, "0"), 12.05, 7.03, 0.60, 0.27, { fontSize: 12, color: palette.gold, align: "right" });
    return s;
  };
  const card = (s, title, body, x, y, w, h, size = 20) => {
    s.addShape(ppt.ShapeType.roundRect, { x, y, w, h, radius: 0.12, rectRadius: 0.12, fill: { color: palette.white }, line: { color: palette.border, width: 1 } });
    txt(s, title, x + 0.22, y + 0.18, w - 0.44, 0.45, { fontSize: 21, bold: true, color: palette.green });
    txt(s, body, x + 0.22, y + 0.81, w - 0.44, h - 1.00, { fontSize: size, valign: "top", paraSpaceAfterPt: 10 });
  };
  const code = (s, value, x, y, w, h, size = 16) => {
    s.addShape(ppt.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.10, fill: { color: palette.green }, line: { color: palette.green } });
    txt(s, value, x + 0.22, y + 0.18, w - 0.44, h - 0.36, { fontFace: "Consolas", fontSize: size, color: palette.white, valign: "top", breakLine: false });
  };
  const note = (s, value) => s.addNotes(value);
  const image = async (s, filename, x, y, w, h) => {
    const buffer = await readFile(path.join(root, "docs/screenshots", filename));
    // Screenshot PNG: ukuran IHDR menjaga rasio tanpa helper versi library lain.
    const ratio = buffer.readUInt32BE(16) / buffer.readUInt32BE(20);
    const imageWidth = Math.min(w, h * ratio);
    const imageHeight = imageWidth / ratio;
    s.addImage({ data: `data:image/png;base64,${buffer.toString("base64")}`, x: x + (w - imageWidth) / 2, y: y + (h - imageHeight) / 2, w: imageWidth, h: imageHeight });
  };

  let s = base("Sistem Pemesanan Restoran", "Demonstrasi aplikasi berdasarkan delapan Instruksi Kerja");
  txt(s, "Rasa & Ruang", 0.65, 2.35, 6.0, 0.78, { fontFace: "Georgia", fontSize: 43, color: palette.green, bold: true });
  txt(s, "Pemesanan meja, data pelanggan,\npesanan menu dan laporan pemesanan.", 0.68, 3.44, 6.0, 1.10, { fontSize: 25 });
  txt(s, "Nama peserta: __________________\nNomor peserta: _________________", 0.68, 5.40, 6.0, 0.78, { fontSize: 18, color: palette.muted });
  card(s, "Sistem yang sudah dibuat", "Frontend HTML / CSS / JavaScript\nBackend Node.js + Express\nDatabase MySQL / MariaDB\nTerstruktur · OOP · komponen reuse", 7.05, 2.40, 5.45, 3.96, 21);
  note(s, "Isi nama dan nomor peserta. Pembahasan dimulai dari skenario dan pemodelan, kemudian tepat mengikuti urutan delapan Instruksi Kerja yang diminta. Diagram dan contoh kode berdasarkan implementasi saat ini, bukan rancangan fitur baru.");

  s = base("Skenario tugas dan hasil aplikasi", "Operator mengelola reservasi dari pencatatan pelanggan sampai laporan.", undefined, "Bukti: src/app.js · public/app.js · docs/SPESIFIKASI.md");
  card(s, "Fungsionalitas yang tersedia", "1. CRUD data pelanggan.\n2. Lihat meja dan menu aktif.\n3. Buat / ubah reservasi + pesanan.\n4. Hadir, selesai atau batalkan.\n5. Rekap laporan, CSV/JSON, cetak.", 0.65, 2.25, 6.0, 4.35, 21);
  card(s, "Aturan yang menjaga hasil", "Kapasitas meja dan jadwal tidak bentrok.\nHarga serta total dihitung server.\nPendapatan hanya reservasi completed.\nRiwayat reservasi tetap tersimpan.\nScope: operator lokal, tanpa login, pembayaran atau stok.", 6.88, 2.25, 5.62, 4.35, 21);
  note(s, "Pelanggan adalah data yang dicatat operator, bukan aktor pengguna aplikasi. Pesanan menu boleh kosong. Pembatalan mengubah status; tidak ada endpoint DELETE reservasi. Tidak mengklaim fitur pembayaran, stok atau autentikasi.");

  s = base("Urutan pembuktian Instruksi Kerja", "Setiap unit dihubungkan ke implementasi, cara menunjukkan dan bukti pemeriksaan.");
  units.forEach(([id, label], i) => {
    const y = 2.24 + i * 0.51;
    txt(s, `${i + 1}.`, 0.72, y, 0.48, 0.35, { bold: true, color: palette.gold });
    txt(s, label, 1.32, y, 7.7, 0.35, { fontSize: 21 });
    txt(s, `J.620100.${id}`, 9.17, y, 3.32, 0.35, { fontSize: 19, color: palette.green, align: "right" });
  });
  note(s, "Urutan delapan unit sama dengan permintaan. Use case dan activity menjadi pembuka agar konteks sistem jelas. ERD dibahas dalam unit akses basis data. Materi pemodelan mendukung penggunaan spesifikasi tanpa menambah unit utama di luar daftar instruksi.");

  const diagrams = { "use-case": useCaseDiagram(), activity: activityDiagram(), erd: erdDiagram() };
  s = base("Use case: satu aktor, delapan tujuan", "Operator menggunakan UI / API; pelanggan disimpan sebagai data, bukan pengguna langsung.", undefined, "Diagram: docs/diagrams/use-case.svg · sumber editable: use-case.puml");
  diagrams["use-case"].draw(s, ppt);
  note(s, "Boundary meliputi aplikasi lokal. Asosiasi adalah garis tanpa panah; tiap ellipse adalah tujuan operator. UC01 termasuk delete pelanggan tanpa riwayat; FK menolak delete yang memiliki reservasi. UC04 hanya confirmed. UC08 CSV/cetak tersedia di UI, JSON tersedia melalui API. Tidak menambahkan aktor admin terpisah, customer login atau payment gateway yang belum ada.");

  s = base("Activity: membuat reservasi", "Alur utama POST /api/reservations; kegagalan di dalam transaksi di-rollback.", undefined, "Bukti: RestaurantService.saveReservation · RestaurantRepository.transaction · docs/diagrams/activity.svg");
  diagrams.activity.draw(s, ppt);
  note(s, "Validasi payload sebelum transaksi. Callback transaksi lock seluruh meja ORDER BY id FOR UPDATE, memeriksa meja/kapasitas/pelanggan/konflik, lalu membaca harga setiap menu. Menu kosong berarti loop nol kali dan total nol. Alur Lolos? menyederhanakan pemeriksaan yang pada kode berjalan berurutan. Exception setelah BEGIN, termasuk saat INSERT atau COMMIT, menuju ROLLBACK dan finally release. Error driver di API dipetakan 500. Activity source PlantUML menyertakan exception tersebut secara eksplisit; slide merangkum jalur kegagalan untuk keterbacaan.");

  s = base("Arsitektur yang menghubungkan diagram ke kode", "Pemisahan tanggung jawab membuat validasi, aturan bisnis dan query mudah dilacak.", undefined, "Bukti: src/app.js · src/services · src/models · src/repositories · src/reports");
  const arch = new Diagram("Arsitektur aplikasi");
  [["UI browser\npublic/", 0.2], ["HTTP / Express\nsrc/app.js", 3.2], ["Business rules\nRestaurantService", 6.2], ["Query / transaksi\nRepository → DB", 9.2]].forEach(([v, x], i) => { arch.box(v, x, 0.60, 2.60, 1.05, 18); if (i < 3) arch.line(x + 2.60, 1.12, x + 3.0, 1.12, true); });
  arch.box("validation.js\nNormalisasi & batas input", 3.35, 2.20, 3.35, 1.0, 18);
  arch.box("Reservation\nStatus privat & total", 7.15, 2.20, 3.35, 1.0, 18);
  arch.line(7.5, 1.65, 5.02, 2.20, true);
  arch.line(7.5, 1.65, 8.82, 2.20, true);
  arch.box("ReportExporter → CsvReportExporter / JsonReportExporter\nKontrak sama; hasil serialisasi berbeda", 2.10, 3.66, 8.4, 0.80, 17);
  arch.draw(s, ppt);
  note(s, "createApp(pool) menerima pool sehingga HTTP bisa diuji terisolasi. RestaurantService menerima repository dan clock. Repository membungkus SQL serta transaksi. Validasi juga dipakai route rentang tanggal; exporter dipanggil route export dan memakai report repository. Diagram menunjukkan tanggung jawab utama, bukan call graph lengkap semua endpoint.");

  s = base("1. Guidelines & Best Practices", "Naming, modularitas, keterbacaan dan penanganan error konsisten.", 1, "Bukti: docs/GUIDELINES.md · src/app.js · src/validation.js · npm run check");
  card(s, "Yang diterapkan", "Class PascalCase; fungsi camelCase.\nModul UI / HTTP / service / DB terpisah.\nES modules dan async/await.\nSQL berparameter untuk input pengguna.\nError bisnis melalui AppError.\nDetail internal masuk log server.", 0.65, 2.25, 6.0, 4.36, 21);
  card(s, "Cara membuktikan", "Buka GUIDELINES dan cocokkan source.\nTelusuri createApp → service → repository.\nCoba input invalid: respons jelas.\nJalankan npm run check.\nBandingkan aturan dengan SPESIFIKASI dan hasil test.", 6.88, 2.25, 5.62, 4.36, 21);
  note(s, "Contoh nyata: integer memvalidasi ID, AppError membawa HTTP status, middleware memetakan duplicate phone/FK/JSON invalid. npm run check menjalankan node --check pada berkas JS source/test/script. Pemeriksaan syntax bukan bukti seluruh behavior benar; validasi behavior ada di unit/integrasi. Pedoman formatting terdokumentasi; tidak mengklaim ESLint/Prettier terpasang.");

  s = base("2. Pemrograman Terstruktur", "Tipe data, percabangan, perulangan dan fungsi mengikuti aturan reservasi.", 2, "Bukti: src/services/RestaurantService.js · src/models/Reservation.js · src/validation.js");
  card(s, "Struktur kontrol yang dipakai", "Number: ID, tamu, kuantitas, rupiah.\nString: kontak, tanggal input, status.\nArray: menu dan hasil query.\nif: kapasitas, konflik, status edit.\nfor...of: baca harga / simpan menu.\ntry / catch / finally: transaksi.", 0.65, 2.25, 5.20, 4.35, 21);
  code(s, "// Potongan saveReservation\nif (input.guests > table.capacity)\n  throw new AppError(\n    `Kapasitas ${table.name} hanya ${table.capacity} tamu.`,\n  );\n\n// Potongan calculateTotal\nreturn items.reduce(\n  (total, item) => total +\n    item.unitPrice * item.quantity,\n  0,\n);", 6.08, 2.25, 6.42, 3.73, 14);
  txt(s, "Coba tamu melebihi kapasitas → HTTP 400.\n2 × Rp35.000 → total Rp70.000 dari server.", 6.12, 6.12, 6.30, 0.51, { fontSize: 16, color: palette.green });
  note(s, "Potongan kode diringkas dari service/model; buka file sumber untuk fungsi lengkap. Semua bilangan penting harus integer. validateReservation memeriksa waktu mendatang WIB, durasi30–240, tamu1–8, jumlah menu1–99. API berjalan lewat Node, tidak membutuhkan tahap compile terpisah. npm start dan test membuktikan kode dijalankan.");

  s = base("3. OOP: class dan encapsulation", "State reservasi privat; perubahan status hanya melalui aturan model.", 3, "Bukti: src/models/Reservation.js · src/errors.js · tests/unit.test.js");
  code(s, "class Reservation {\n  #status;\n\n  get status() {\n    return this.#status;\n  }\n\n  changeStatus(nextStatus) {\n    // cek matriks transisi\n    this.#status = nextStatus;\n    return this.#status;\n  }\n}", 0.65, 2.25, 5.80, 4.35, 18);
  card(s, "Aturan transisi sebenarnya", "confirmed → seated → completed\nconfirmed / seated → cancelled\ncompleted dan cancelled terminal.\nGetter status hanya-baca; #status privat.\nMatriks transisi privat dan frozen.\nAppError extends Error: inheritance.", 6.68, 2.25, 5.82, 4.35, 21);
  note(s, "Snippet memperlihatkan struktur class, komentar menggantikan pemeriksaan transisi yang lengkap ada di source. Tunjukkan Reservation.transitions dan changeStatus; test assignment status langsung menghasilkan TypeError dan state tidak berubah. Public method/getter dan private #field relevan di JavaScript. Tidak mengklaim protected atau overload signature seperti Java; keduanya tidak dipaksakan. Semua kelas service/repository berisi property/method sesuai tanggung jawabnya.");

  s = base("3. OOP: inheritance, overriding, polymorphism", "Satu kontrak exporter melayani keluaran CSV dan JSON pada endpoint nyata.", 3, "Bukti: src/reports/ReportExporter.js · GET /api/reports/export?format=csv|json");
  const oop = new Diagram("Hierarki exporter");
  oop.box("ReportExporter\nexport(report) → this.serialize(report)", 3.25, 0.10, 5.5, 0.91, 18);
  oop.box("CsvReportExporter\nserialize(report) → CSV", 0.28, 1.73, 5.30, 0.98, 18);
  oop.box("JsonReportExporter\nserialize(report) → JSON", 6.32, 1.73, 5.30, 0.98, 18);
  oop.line(2.93, 1.73, 6.00, 1.01, true);
  oop.line(8.97, 1.73, 6.00, 1.01, true);
  oop.draw(s, ppt);
  code(s, "const exporter = createReportExporter(req.query.format);\nconst file = exporter.export(await repository.report(from, to));\nres.attachment(file.filename).send(file.body);", 0.65, 5.28, 11.85, 1.25, 17);
  note(s, "Panah mengarah ke base class untuk menunjukkan pewarisan secara ringkas (lihat class diagram formal di SPESIFIKASI). Kedua subclass memakai extends ReportExporter dan override serialize. Pemanggil route memakai export(report) yang sama; dynamic dispatch memilih serialize dari subclass. Default CSV; format lain selain csv/json menghasilkan AppError400. Unit test memeriksa kedua hasil serialisasi dan kontrak base abstract. Jalankan request CSV dan JSON dalam rest-client.http.");

  s = base("4. Library / Komponen Pre-existing", "Reuse dipilih sesuai fungsi; versi dan lisensi dicatat dari instalasi proyek.", 4, "Bukti: package-lock.json · docs/LIBRARY-DAN-LISENSI.md · DEPENDENCY-LICENSES.json");
  const libraries = [
    ["Express 5.3.0", "Route, middleware, JSON, static HTTP", "Runtime · MIT"],
    ["mysql2 3.24.5", "Driver Promise, pool, query, transaksi", "Runtime · MIT"],
    ["node:test / assert", "Runner / assertion bawaan Node", "Bawaan Node"],
    ["docx 9.10.0", "Laporan dan lampiran Word", "Tooling · MIT"],
    ["PptxGenJS 4.0.1", "Slide PowerPoint yang dapat diedit", "Tooling · MIT"],
    ["archiver 8.0.0", "ZIP source dan paket pengumpulan", "Tooling · MIT"],
  ];
  libraries.forEach(([a, b, c], i) => { const y = 2.26 + i * 0.53; txt(s, a, 0.72, y, 3.00, 0.36, { fontSize: 20, bold: true, color: palette.green }); txt(s, b, 3.95, y, 5.68, 0.36, { fontSize: 19 }); txt(s, c, 9.88, y, 2.65, 0.36, { fontSize: 17, color: palette.muted }); });
  code(s, "npm ci\nnpm ls --depth=0\nnpm run dependency:report\nnpm audit", 0.65, 5.44, 4.20, 1.26, 13);
  txt(s, "Snapshot pelengkapan: 138 dependency, 0 deprecated,\n0 advisory. Inventory + notice tersedia; evaluasi ulang\nsetelah dependency berubah. Reuse menghemat implementasi\nprotokol/format, tanpa klaim benchmark waktu.", 5.10, 5.47, 7.35, 1.18, { fontSize: 17 });
  note(s, "Versi terpasang berdasarkan lockfile/inventory, bukan lower bound di package.json. node:test/assert dan DOM/Fetch/Intl bawaan lingkungan. Dependency transitif tidak semuanya MIT; lihat inventory. THIRD-PARTY-NOTICES mempertahankan lisensi direct dependency. Source ZIP tidak menyertakan node_modules. Compatibility diverifikasi Node24.3.0/MariaDB10.4.32; minimum Node22.9.0. Audit0 adalah snapshot yang dapat berubah, bukan jaminan permanen.");

  s = base("5. Akses Basis Data: ERD", "Lima tabel dengan foreign key; pesanan menu opsional dan harga tersimpan per detail.", 5, "Bukti: database/schema.sql · docs/diagrams/erd.svg · sumber Mermaid: erd.mmd");
  diagrams.erd.draw(s, ppt);
  note(s, "Setiap reservasi wajib punya tepat1 customer dan1 table; customer/table bisa0..banyak reservasi. Setiap order_item wajib punya tepat1 reservation dan1 menu; reservation/menu bisa0..banyak detail. UQ(reservation_id,menu_item_id) mencegah menu duplikat. FK reservation_id ON DELETE CASCADE ada di schema meskipun API tidak menyediakan delete reservasi. FK customer melindungi pelanggan ber-riwayat. ID/FK/quantity/price/guests/total INT UNSIGNED, semua tabel InnoDB utf8mb4. Field diagram mencakup seluruh kolom schema; detail null/default/enum/index dalam schema dan sumber Mermaid.");

  s = base("5. CRUD, query dan integritas data", "Transaksi menyimpan reservasi dan detail secara utuh; bentrok ditolak sebelum commit.", 5, "Bukti: RestaurantRepository.js · RestaurantService.js · database/schema.sql · tests/integration.test.js");
  card(s, "Operasi dan perlindungan", "INSERT / SELECT / UPDATE / DELETE pelanggan.\nINSERT / UPDATE reservasi dan detail.\nJOIN daftar; GROUP BY laporan harian.\nSQL parameter ?, FK dan UNIQUE.\nIndex jadwal meja dan tanggal reservasi.\nPendapatan = total status completed.", 0.65, 2.25, 6.00, 4.35, 20);
  code(s, "BEGIN\nSELECT meja ORDER BY id FOR UPDATE\nCek referensi / kapasitas / konflik\nAmbil harga → hitung total\nINSERT / UPDATE reservasi + items\nCOMMIT\n\nJika exception: ROLLBACK\nSelalu: release koneksi", 6.88, 2.25, 5.62, 3.27, 17);
  txt(s, "Bentrok jika start baru < end lama\ndan end baru > start lama.\nSlot bersebelahan diperbolehkan.", 6.92, 5.70, 5.50, 0.94, { fontSize: 17, color: palette.green });
  note(s, "Active conflict hanya confirmed/seated, mencakup lintas tengah malam. Update mengabaikan ID dirinya sendiri, hanya confirmed. Lock semua6meja saat ini sederhana untuk skala demo, bukan optimasi throughput. Index tercantum tanpa klaim benchmark yang belum diuji. Delete pelanggan dengan riwayat menghasilkan409. Harga dari DB; unit_price adalah snapshot saat disimpan, update mengambil ulang harga. Detail order diganti dalam transaksi yang sama.");

  s = base("6. Dokumentasi Kode Program", "Dokumentasi menjelaskan kebutuhan, kontrak modul, algoritma dan cara mengulang bukti.", 6, "Bukti: README.md · docs/DOKUMENTASI-KODE.md · docs/SPESIFIKASI.md · JSDoc source");
  card(s, "Dokumen dan kegunaannya", "README: setup, API, debugging, tes, demo.\nSPESIFIKASI: kebutuhan dan pemodelan.\nDOKUMENTASI-KODE: parameter / return / error.\nGUIDELINES: aturan penulisan source.\nLIBRARY-DAN-LISENSI: reuse / notice.\nLAPORAN + audit + hasil pelengkapan.", 0.65, 2.25, 6.00, 4.35, 20);
  card(s, "Cara menunjukkan keterlacakan", "Kebutuhan cek jadwal → saveReservation.\nAlgoritma → query konflik + transaksi.\nParameter → payload .http yang terisi.\nHasil → assertion dan bukti TAP.\nJSDoc menerangkan fungsi penting.\nDiagram dapat diedit dari source.", 6.88, 2.25, 5.62, 4.35, 20);
  note(s, "Dokumentasi terpisah tersedia selain komentar kode. Tunjukkan kontrak saveReservation(data,id), callback transaction, tanggal dan exporter. Komentar dipakai untuk tujuan/logika penting, tidak mengulang setiap baris sintaks. PPT/diagram sekarang bisa diregenerasi dengan npm run ppt:generate; npm run docs:generate memanggil generator yang sama, sehingga deck lama tidak menimpa revisi.");

  s = base("7. Debugging: prosedur demonstrasi", "Breakpoint membantu melacak payload, harga, konflik dan jalur commit / rollback.", 7, "Bukti: .vscode/launch.json · npm run debug · src/services/RestaurantService.js");
  card(s, "Langkah di VS Code", "1. Aktifkan MySQL dan siapkan .env.\n2. Breakpoint saveReservation / transaction.\n3. F5: Restoran: debug server.\n4. Kirim request reservasi dari .http.\n5. F10 / F11; lihat Variables / Watch.\n6. Periksa result atau exception.", 0.65, 2.25, 6.00, 4.35, 21);
  card(s, "Variabel dan kasus yang diperiksa", "input.guests dan table.capacity.\ninput.startAt / endAt; conflicts.length.\npricedItems dan total dari server.\nRespons error sesuai aturan bisnis.\nSetelah perbaikan: ulang pemicu + test.\nAlternatif: npm run debug lalu attach9229.", 6.88, 2.25, 5.62, 4.35, 21);
  note(s, "Server debug F5 membuka port dari .env (default3001), jadi stop server biasa yang memakai port sama terlebih dahulu. Mode attach via konfigurasi Restoran: attach npm run debug. Unit test juga punya launchconfig sendiri. Request konflik adalah error bisnis yang diharapkan, bukan selalu bug. Log server mencatat timestamp/method/path/message tanpa mengirim detail DB internal ke browser. Dengan transaksi, exception harus terlihat mengalir ke rollback/finally.");

  s = base("7. Contoh bug yang sudah diperbaiki", "Bug async DOM pada submit laporan ditelusuri sampai penyebab dan diverifikasi ulang.", 7, "Bukti: public/app.js handler #report-filter · docs/BUKTI-BROWSER.md (11 Oktober 2026)");
  card(s, "Gejala dan akar masalah", "Sesudah await loadReport(), reset busy gagal.\nevent.currentTarget sudah null.\nReferensi event dibaca di finally.\nPerbaikan: simpan form sebelum await.\nBukti browser historis 11 Oktober; revisi PPT ini tidak mengklaim uji visual aplikasi baru.", 0.65, 2.25, 5.80, 4.35, 21);
  code(s, "event.preventDefault();\nconst form = event.currentTarget;\nsetBusy(form, true);\ntry {\n  await loadReport();\n} catch (error) {\n  toast(error.message, true);\n} finally {\n  setBusy(form, false);\n}", 6.68, 2.25, 5.82, 3.40, 18);
  txt(s, "Verifikasi: submit ulang; laporan tampil,\ntombol pulih, tidak ada error console.", 6.72, 5.89, 5.70, 0.65, { fontSize: 20, color: palette.green });
  note(s, "Reproduksi historis tertulis di BUKTI-BROWSER dan source screenshot/log di audit. Jangan memperkenalkan ulang bug hanya untuk demo. Pakai breakpoint browser sebelum/selepas await untuk menunjukkan form tetap tersimpan. Perbaikan lain: private state, batas kalender WIB dan start==now diuji dengan unit/integrasi terbaru. Verifikasi visual aplikasi tetap mengacu bukti11Oktober.");

  s = base("8. Pengujian Unit Program", "Unit terisolasi menguji aturan; integrasi menguji API dan database sungguhan.", 8, "Bukti: docs/bukti-unit.tap · bukti-integrasi.tap · bukti-http.json · HASIL-PELENGKAPAN.md");
  card(s, "Unit / service: 69 lulus", "node:test + assert/strict.\nValidasi, status, total, exporter.\nFake connection / repository + clock.\nKasus normal, batas dan error.\nTidak membutuhkan MySQL.\nJalankan: npm test.", 0.65, 2.25, 3.78, 4.35, 19);
  card(s, "Integrasi: 28 skenario lulus", "API HTTP + MariaDB asli.\nCRUD, FK, rollback, jadwal, laporan.\nDB sementara; tidak memakai data app.\n29 hitungan runner termasuk induk.\nJalankan:\nnpm run test:integration.", 4.63, 2.25, 3.78, 4.35, 19);
  card(s, "REST: 45 request lulus", "Semua endpoint + jalur error.\nExpected status dan summary akhir.\nRehearsal memakai file .http.\nDB sementara pada script otomatis.\nJalankan:\nnpm run test:http.", 8.62, 2.25, 3.88, 4.35, 19);
  note(s, "Hasil berdasarkan bukti pelengkapan12–13Oktober2026, bukan eksekusi ulang yang dilakukan saat membuat PPT. Assertion behavior spesifik, bukan hanya server tidak crash. test:http mem-parsing subset .http yang digunakan; tidak mengklaim menjalankan extension REST Client otomatis. Manual REST Client memakai DB aplikasi dan menambah riwayat. Bedakan unit tanpaDB, integrasi denganDB, dan API manual. Unit coverage83.92baris98.35cabang84.31fungsi; source yang dimuat saja, tidak coverage seluruh aplikasi.");

  s = base("8. Skenario uji dan hasil yang diharapkan", "Kasus normal, batas dan error dikaitkan dengan aturan yang dapat diperiksa.", 8, "Bukti: tests/unit.test.js · tests/service.test.js · tests/integration.test.js");
  const cases = [
    ["Nama / telepon dinormalisasi", "Dina; nomor tanpa spasi/simbol pemisah"],
    ["2 menu × Rp35.000; harga klien palsu", "Server menyimpan total Rp70.000"],
    ["Tamu melebihi kapasitas / jadwal bentrok", "Ditolak 400 / 409; tidak ada write"],
    ["Tanggal invalid / start sama now", "Validasi menolak, clock tetap pada unit"],
    ["Slot bersebelahan / melintasi tengah malam", "Berdekatan lolos; overlap tetap ditolak"],
    ["confirmed → completed secara langsung", "409; state tidak berubah"],
    ["Transaksi gagal / hapus customer ber-riwayat", "Rollback + release / FK menolak 409"],
    ["CSV / JSON / format tidak dikenal", "Hasil sesuai kontrak / AppError400"],
  ];
  cases.forEach(([a, b], i) => { const y = 2.27 + i * 0.46; txt(s, a, 0.72, y, 6.20, 0.34, { fontSize: 18, bold: true, color: palette.green }); txt(s, b, 7.15, y, 5.31, 0.34, { fontSize: 17 }); });
  code(s, "npm run test:coverage", 0.65, 6.12, 5.60, 0.59, 14);
  txt(s, "Jika gagal: baca assertion → telusuri source → perbaiki\n→ ulang kasus yang gagal dan regresi terkait.", 6.49, 6.10, 6.00, 0.57, { fontSize: 16 });
  note(s, "Buka test nama terkait, tunjukkan setup, input, assertion dan output TAP. Pada fake harness service, log begin/commit/release atau begin/rollback/release menjadi assertion. Error referensi memastikan writes.length === 0. Coverage bukan target 100%; lihat batas cakupan laporan. npm run test:coverage mengulang suite unit/service dan mencetak coverage source yang dimuat.");

  s = base("8. Demonstrasi langsung dengan REST Client", "rest-client.http sudah berisi request, payload, ID berantai dan status yang diharapkan.", 8, "Bukti: rest-client.http · scripts/verify-http.js · README.md");
  card(s, "Siapkan dan kirim", "Pasang extension humao.rest-client.\nCopy .env.example → .env; MySQL aktif.\nnpm ci → npm run db:setup → npm start.\nBuka rest-client.http, Send Request 01–45.\nID dari named response otomatis.\nJika port diubah, sesuaikan @baseUrl.", 0.65, 2.25, 6.0, 4.35, 20);
  card(s, "Yang ditunjukkan ke penguji", "01–04: health, UI, meja dan menu.\nPelanggan: create / read / update / delete.\nReservasi: create / update / status.\nLaporan: JSON, CSV, JSON attachment.\nCoba kapasitas, konflik, ID/input invalid.\nManual menyimpan riwayat uji; pakai tanggal kosong bila meja bentrok.", 6.88, 2.25, 5.62, 4.35, 20);
  note(s, "Default baseURL127.0.0.1:3001; date besok UTC pukul18WIB. Jalankan berurutan dari request01; request05 menghasilkan customer baru. Expected400/404/409/413 bukan kegagalan jika sesuai skenario. Manual REST Client bukan unit test dan tidak mengisolasiDB. Alternatif otomatis test:http membuat/menghapusDB sementara dan mengecek45respons plusringkasan. Jangan jalankan db:setup dengan credential DB lain tanpa memahami .env.");

  s = base("8. Evaluasi dan laporan hasil pengujian", "Hasil diperiksa terhadap spesifikasi; temuan, perbaikan dan batas cakupan dicatat.", 8, "Bukti: docs/HASIL-PELENGKAPAN.md · docs/bukti-unit.tap · docs/verification-latest/");
  card(s, "Apa yang diperiksa", "Periksa assertion, pass / fail dan skipped.\nUnit/service: 69 pass, 0 fail.\nIntegrasi: 28 skenario, 0 fail.\nHTTP: 45 status + summary sesuai.\nCatat input, expected, actual, akar sebab.\nSetelah fix: ulang pemicu dan regresi.", 0.65, 2.25, 6.0, 4.35, 21);
  card(s, "Coverage dan batas bukti", "Unit: baris 83,92%; cabang 98,35%; fungsi 84,31%.\nCoverage hanya source yang dimuat.\nTAP / JSON menjadi bukti pengulangan.\nTidak mengklaim uji beban besar atau seluruh browser.\nPemeriksaan UI terdokumentasi terpisah.", 6.88, 2.25, 5.62, 4.35, 21);
  note(s, "Laporan pelengkapan mengaitkan temuan T01–T06 dengan perbaikan dan verifikasi. Clock tetap menstabilkan uji batas waktu; fake repository mengisolasi unit service. Integrasi memperiksa persistensi/FK/rollback nyata. Coverage bukan persentase seluruh frontend dan backend. Jika error bisnis yang diharapkan muncul, cocokkan status/pesan dengan spesifikasi. Bukti TAP dan JSON yang ada berasal dari pelengkapan12–13Oktober; presentasi ini tidak menjalankan ulang tes runtime.");

  s = base("Demonstrasi akhir: pelanggan sampai laporan", "Buktikan hasil aplikasi sekaligus tunjukkan titik implementasi delapan unit.", undefined, "Screenshot aplikasi: docs/screenshots/laporan-desktop.png · bukti historis 11 Oktober 2026");
  await image(s, "laporan-desktop.png", 0.65, 2.24, 7.50, 4.38);
  card(s, "Alur presentasi", "Pelanggan → reservasi + menu\n→ hadir → selesai → laporan.\nTunjukkan penolakan konflik.\nBandingkan total dan rekap.\nEkspor CSV / JSON.\nBuka source, debugger dan tes.", 8.38, 2.24, 4.12, 4.38, 20);
  note(s, "Screenshot adalah contoh tampilan 11 Oktober, bukan data live revisi 13 Oktober. Untuk demo live gunakan tanggal mendatang dan customer baru. Setelah completed, revenue bertambah sesuai total order; cancelled tidak menambah revenue/guests. Diagram terpisah tersedia SVG/source, seluruh shape PPT diagram bisa diedit. Tutup dengan hasil 69 unit/service, 28 integrasi, 45 rehearsal berdasarkan bukti tersimpan, serta batas sistem operator lokal.");

  for (const [name, diagram] of Object.entries(diagrams)) await writeFile(path.join(diagramDirectory, `${name}.svg`), diagram.svg());
  await ppt.writeFile({ fileName: path.join(output, "04-Presentasi.pptx") });
  await writeFile(path.join(diagramDirectory, "slide-index.json"), JSON.stringify(slideIndex, null, 2) + "\n");
  console.log(`Presentasi dibuat: ${ppt._slides.length} slide; diagram SVG: use-case, activity, erd.`);
  return ppt._slides.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildPresentation();

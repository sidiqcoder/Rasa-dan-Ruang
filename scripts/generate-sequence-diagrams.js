import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const directory = fileURLToPath(new URL("../docs/diagrams/sequence/", import.meta.url));
await mkdir(directory, { recursive: true });
const ink = "#244A3B";
const xml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const definitions = [
  {
    name: "01-pelanggan", title: "Menambah pelanggan",
    participants: ["Operator / UI", "API", "Service", "Repository", "MySQL"],
    messages: [
      [0, 1, "POST /api/customers"], [1, 2, "saveCustomer(data)"],
      [2, 2, "validateCustomer(data)"], [2, 3, "saveCustomer(customer)"],
      [3, 4, "INSERT customers (?)"], [4, 3, "insertId", true],
      [3, 2, "ID tersimpan", true], [2, 1, "{ id, name, phone, email }", true],
      [1, 0, "HTTP 201; refresh daftar", true],
    ],
    note: "Input invalid: 400. Telepon duplikat: 409. PUT memakai ID; DELETE ditolak jika ada riwayat.",
  },
  {
    name: "02-buat-reservasi", title: "Membuat reservasi dan pesanan menu",
    participants: ["Operator / UI", "API", "Service", "Repository", "MySQL", "Reservation"],
    messages: [
      [0, 1, "POST /api/reservations"], [1, 2, "saveReservation(data)"],
      [2, 2, "validateReservation(data, clock)"], [2, 3, "transaction(callback)"],
      [3, 4, "getConnection(); BEGIN"], [3, 2, "callback(connection)"],
      [2, 4, "Lock meja; cek kapasitas, customer dan overlap"],
      [2, 4, "SELECT harga tiap menu aktif"], [2, 5, "calculateTotal(pricedItems)"],
      [5, 2, "total rupiah", true], [2, 4, "INSERT reservations + order_items"],
      [2, 3, "callback selesai: { id, total }", true],
      [3, 4, "COMMIT; release koneksi"], [3, 2, "hasil transaksi", true],
      [2, 1, "{ id, total }", true], [1, 0, "HTTP 201; refresh data", true],
    ],
    note: "Menu boleh kosong. Exception setelah BEGIN: ROLLBACK + finally release. Konflik: HTTP 409.",
  },
  {
    name: "03-ubah-reservasi", title: "Mengubah reservasi dan pesanan",
    participants: ["Operator / UI", "API", "Service", "Repository", "MySQL"],
    messages: [
      [0, 1, "PUT /api/reservations/:id"], [1, 2, "saveReservation(data, id)"],
      [2, 2, "validateReservation(data, clock)"], [2, 3, "transaction(callback)"],
      [3, 4, "getConnection(); BEGIN"], [3, 2, "callback(connection)"],
      [2, 4, "Lock meja + reservasi; harus confirmed"],
      [2, 4, "Cek kapasitas / overlap; abaikan ID sendiri"],
      [2, 4, "Baca harga menu; hitung ulang total"],
      [2, 4, "UPDATE reservations; DELETE detail lama"],
      [2, 4, "INSERT detail pesanan baru"], [2, 3, "callback selesai", true],
      [3, 4, "COMMIT; release koneksi"], [3, 2, "{ id, total }", true],
      [2, 1, "{ id, total }", true], [1, 0, "HTTP 200; refresh data", true],
    ],
    note: "Reservasi selain confirmed: 409. Gagal di tengah perubahan: rollback menjaga detail lama.",
  },
  {
    name: "04-detail-status", title: "Melihat detail dan mengubah status reservasi",
    participants: ["Operator / UI", "API", "Service", "Repository", "MySQL", "Reservation"],
    messages: [
      [0, 1, "GET /api/reservations?from=...&to=..."],
      [1, 3, "reservations(from, to)"], [3, 4, "JOIN customer / meja; query items"],
      [4, 3, "rows + items", true], [3, 1, "daftar beserta detail menu", true],
      [1, 0, "HTTP 200; tampilkan detail dari state", true],
      [0, 1, "PATCH /api/reservations/:id/status"], [1, 2, "changeStatus(id, status)"],
      [2, 3, "transaction(callback)"], [3, 4, "getConnection(); BEGIN"], [3, 2, "callback(connection)"],
      [2, 4, "Lock meja + SELECT reservasi FOR UPDATE"],
      [2, 5, "new Reservation(row); changeStatus(status)"],
      [5, 2, "status valid / AppError", true], [2, 4, "UPDATE reservations SET status=?"],
      [2, 3, "callback selesai", true], [3, 4, "COMMIT; release koneksi"],
      [3, 2, "{ id, status }", true], [2, 1, "{ id, status }", true],
      [1, 0, "HTTP 200; refresh data", true],
    ],
    note: "confirmed → seated → completed; confirmed/seated → cancelled. Transisi ilegal: 409 + rollback.",
  },
  {
    name: "05-laporan-ekspor", title: "Laporan, ekspor server dan cetak browser",
    participants: ["Operator / UI", "API", "Repository", "MySQL", "Exporter"],
    messages: [
      [0, 1, "GET /api/reports?from=...&to=..."], [1, 1, "validateDateRange(from, to)"],
      [1, 2, "report(from, to)"], [2, 3, "GROUP BY tanggal; SUM / COUNT"],
      [3, 2, "rekap harian", true], [2, 1, "{ from, to, daily, summary }", true],
      [1, 0, "HTTP 200; tampilkan rekap", true],
      [0, 1, "GET /api/reports/export?...&format=csv|json"],
      [1, 1, "Validasi tanggal; pilih exporter"], [1, 2, "report(from, to)"],
      [2, 3, "Query rekap laporan"], [3, 2, "data", true], [2, 1, "report", true],
      [1, 4, "export(report) → serialize(report)"], [4, 1, "filename, contentType, body", true],
      [1, 0, "HTTP 200; attachment CSV / JSON", true],
      [0, 0, "UI CSV: Blob dari state.report; cetak: window.print()"],
    ],
    note: "Pendapatan hanya completed. PDF dibuat melalui dialog cetak browser, tanpa library PDF server.",
  },
];

function wrap(value, limit) {
  const lines = [];
  let line = "";
  for (const word of value.split(" ")) {
    if (line && (line + " " + word).length > limit) { lines.push(line); line = word; }
    else line += (line ? " " : "") + word;
  }
  if (line) lines.push(line);
  return lines;
}

for (const definition of definitions) {
  const width = 1400;
  const positions = definition.participants.map((_, i) => 125 + i * (width - 250) / (definition.participants.length - 1));
  const rows = definition.messages.map(([from, to, label, response]) => {
    const span = Math.abs(positions[to] - positions[from]);
    const lines = wrap(label, from === to ? 28 : Math.max(20, Math.floor(span / 11)));
    return { from, to, label, response, lines, height: Math.max(68, lines.length * 24 + 25) };
  });
  const height = 158 + rows.reduce((n, r) => n + r.height, 0) + 80;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${xml(definition.title)}</title><defs><marker id="arrow" markerWidth="9" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke="${ink}" stroke-width="1.4"/></marker></defs><rect width="100%" height="100%" fill="white"/>`];
  const text = (value, x, y, size = 22, bold = false, anchor = "middle") => parts.push(`<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Arial,sans-serif" font-size="${size}" font-weight="${bold ? 700 : 400}" fill="${ink}">${xml(value)}</text>`);
  text(definition.title, width / 2, 35, 27, true);
  definition.participants.forEach((label, i) => {
    parts.push(`<rect x="${positions[i] - 99}" y="62" width="198" height="51" rx="6" fill="#F7F7F2" stroke="${ink}" stroke-width="2"/>`);
    text(label, positions[i], 95, 23, true);
    parts.push(`<line x1="${positions[i]}" y1="114" x2="${positions[i]}" y2="${height - 65}" stroke="#9CA99F" stroke-width="1.5" stroke-dasharray="7 5"/>`);
  });
  let y = 143;
  rows.forEach((row, i) => {
    const x1 = positions[row.from], x2 = positions[row.to];
    const arrowY = y + row.lines.length * 24 + 5;
    const style = `stroke="${ink}" stroke-width="2" fill="none" marker-end="url(#arrow)"${row.response ? ' stroke-dasharray="7 5"' : ""}`;
    if (row.from === row.to) {
      const right = x1 + 72 < width - 40;
      const end = x1 + (right ? 72 : -72);
      parts.push(`<path d="M ${x1} ${arrowY} H ${end} V ${arrowY + 16} H ${x1}" ${style}/>`);
      row.lines.forEach((line, j) => text(`${j === 0 ? `${i + 1}. ` : ""}${line}`, x1 + (right ? 12 : -12), y + (j + 1) * 24 - 3, 22, false, right ? "start" : "end"));
    } else {
      parts.push(`<line x1="${x1}" y1="${arrowY}" x2="${x2}" y2="${arrowY}" ${style}/>`);
      row.lines.forEach((line, j) => text(`${j === 0 ? `${i + 1}. ` : ""}${line}`, (x1 + x2) / 2, y + (j + 1) * 24 - 3, 22));
    }
    y += row.height;
  });
  text(definition.note, width / 2, height - 23, 19);
  parts.push("</svg>");
  await writeFile(path.join(directory, `${definition.name}.svg`), parts.join("\n"));
  const aliases = definition.participants.map((_, i) => `P${i}`);
  const mermaid = ["sequenceDiagram", "  autonumber", ...definition.participants.map((label, i) => `  participant ${aliases[i]} as ${label}`), ...definition.messages.map(([from, to, label, response]) => `  ${aliases[from]}${response ? "-->>" : "->>"}${aliases[to]}: ${label}`), `  Note over ${aliases[0]},${aliases.at(-1)}: ${definition.note}`];
  await writeFile(path.join(directory, `${definition.name}.mmd`), mermaid.join("\n") + "\n");
}
console.log("Lima sequence diagram dibuat: SVG dan source Mermaid.");

import { AppError } from "./errors.js";

function requireObject(data) {
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new AppError("Data harus berupa objek JSON.");
}

/** @returns {number} Integer dalam rentang inklusif. @throws {AppError} HTTP 400 jika tipe/rentang salah. */
export function integer(value, label, min = 1, max = 2147483647) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new AppError(`${label} harus bilangan bulat ${min}–${max}.`);
  }
  return value;
}

/** @returns {string} Teks setelah trim. @throws {AppError} HTTP 400 jika tipe, panjang, atau isian wajib salah. */
export function text(value, label, max, required = true) {
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (required && !value.trim())
  ) {
    throw new AppError(
      `${label} ${required ? "wajib diisi dan " : ""}maksimal ${max} karakter.`,
    );
  }
  return value.trim();
}

/**
 * @param {string} value YYYY-MM-DDTHH:mm dalam WIB; tahun kalender 2000–2100.
 * @returns {Date} Instant yang sesuai dengan waktu WIB input.
 * @throws {AppError} HTTP 400 untuk format/rentang/kalender tidak valid.
 */
export function parseDateTime(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  ) {
    throw new AppError("Tanggal dan jam tidak valid.");
  }
  const date = new Date(`${value}:00+07:00`);
  const year = Number(value.slice(0, 4));
  if (
    !Number.isFinite(date.getTime()) ||
    year < 2000 ||
    year > 2100
  ) {
    throw new AppError("Tanggal dan jam tidak valid.");
  }
  const roundTrip = new Date(date.getTime() + 7 * 3600000)
    .toISOString()
    .slice(0, 16);
  if (roundTrip !== value) throw new AppError("Tanggal kalender tidak valid.");
  return date;
}

/** @param {Date} date Instant valid. @returns {string} DATETIME WIB YYYY-MM-DD HH:mm:ss. */
export function sqlDateTime(date) {
  return new Date(date.getTime() + 7 * 3600000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

/** @returns {{name: string, phone: string, email: string|null}} Kontak normalisasi. @throws {AppError} HTTP 400. */
export function validateCustomer(data = {}) {
  requireObject(data);
  const name = text(data.name, "Nama pelanggan", 100);
  const phone = text(data.phone, "Nomor telepon", 20).replace(/[\s()-]/g, "");
  if (!/^\+?\d{8,15}$/.test(phone))
    throw new AppError("Nomor telepon harus 8–15 digit, boleh diawali +.");
  const email = text(data.email ?? "", "Email", 150, false);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new AppError("Format email tidak valid.");
  return { name, phone, email: email || null };
}

/**
 * @param {object} data Payload API reservasi; kontrak lengkap di docs/DOKUMENTASI-KODE.md.
 * @param {Date} now Clock valid untuk memastikan start > now; dapat diinjeksi pada tes.
 * @returns {object} Input normalisasi dengan startAt/endAt SQL WIB; tanpa harga klien.
 * @throws {AppError} HTTP 400 untuk input tidak valid atau waktu tidak mendatang.
 */
export function validateReservation(data = {}, now = new Date()) {
  requireObject(data);
  const customerId = integer(data.customerId, "Pelanggan");
  const tableId = integer(data.tableId, "Meja");
  const guests = integer(data.guests, "Jumlah tamu", 1, 8);
  const duration = integer(data.duration, "Durasi (menit)", 30, 240);
  const start = parseDateTime(data.startAt);
  if (start <= now)
    throw new AppError("Waktu reservasi harus di masa mendatang.");
  const end = new Date(start.getTime() + duration * 60000);
  const notes = text(data.notes ?? "", "Catatan", 500, false);
  if (!Array.isArray(data.items) || data.items.length > 30)
    throw new AppError("Daftar pesanan tidak valid (maksimal 30 menu).");
  const seen = new Set();
  const items = data.items.map((item) => {
    const menuItemId = integer(item?.menuItemId, "Menu");
    const quantity = integer(item?.quantity, "Jumlah menu", 1, 99);
    if (seen.has(menuItemId))
      throw new AppError("Menu yang sama tidak boleh ditambahkan dua kali.");
    seen.add(menuItemId);
    return { menuItemId, quantity };
  });
  return {
    customerId,
    tableId,
    guests,
    startAt: sqlDateTime(start),
    endAt: sqlDateTime(end),
    notes,
    items,
  };
}

/** @returns {{from: string, to: string}} Rentang tanggal inklusif valid. @throws {AppError} HTTP 400. */
export function validateDateRange(from, to) {
  parseDateTime(`${from}T00:00`);
  parseDateTime(`${to}T00:00`);
  if (from > to)
    throw new AppError(
      "Tanggal awal harus sebelum atau sama dengan tanggal akhir.",
    );
  return { from, to };
}

/** @returns {boolean} Interval [start,end) bertumpang tindih; input harus seformat dan valid. */
export function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

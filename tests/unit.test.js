import test from "node:test";
import assert from "node:assert/strict";
import { Reservation } from "../src/models/Reservation.js";
import { RestaurantRepository } from "../src/repositories/RestaurantRepository.js";
import { AppError } from "../src/errors.js";
import { ReportExporter, CsvReportExporter, JsonReportExporter, createReportExporter } from "../src/reports/ReportExporter.js";
import {
  validateCustomer,
  validateReservation,
  validateDateRange,
  parseDateTime,
  sqlDateTime,
  overlaps,
} from "../src/validation.js";

const now = new Date("2026-10-11T00:00:00+07:00");
const valid = {
  customerId: 1,
  tableId: 3,
  startAt: "2026-10-12T18:00",
  duration: 90,
  guests: 4,
  notes: "  dekat jendela  ",
  items: [{ menuItemId: 1, quantity: 2 }],
};

test("nomor telepon dan nama dinormalisasi", () => {
  assert.deepEqual(
    validateCustomer({
      name: "  Dina  ",
      phone: "+62 (812) 3456-7890",
      email: "",
    }),
    { name: "Dina", phone: "+6281234567890", email: null },
  );
});
for (const [label, value] of [
  ["nama kosong", { name: " ", phone: "081234567890" }],
  ["nomor pendek", { name: "Dina", phone: "123" }],
  ["nomor berhuruf", { name: "Dina", phone: "081234abc" }],
  ["email salah", { name: "Dina", phone: "081234567890", email: "dina@" }],
  ["objek null", null],
  ["objek array", []],
])
  test(`validasi pelanggan menolak ${label}`, () =>
    assert.throws(() => validateCustomer(value), { name: "AppError", status: 400 }));

test("reservasi menghasilkan waktu WIB dan akhir durasi", () => {
  const result = validateReservation(valid, now);
  assert.equal(result.startAt, "2026-10-12 18:00:00");
  assert.equal(result.endAt, "2026-10-12 19:30:00");
  assert.equal(result.notes, "dekat jendela");
});
test("durasi melewati tengah malam", () => {
  const result = validateReservation(
    { ...valid, startAt: "2026-10-12T23:30" },
    now,
  );
  assert.equal(result.endAt, "2026-10-13 01:00:00");
});
for (const [label, change] of [
  ["waktu lampau", { startAt: "2026-10-10T12:00" }],
  ["tanggal palsu", { startAt: "2027-02-30T12:00" }],
  ["format tanggal", { startAt: "12/10/2026" }],
  ["jam salah", { startAt: "2026-10-12T25:00" }],
  ["tamu nol", { guests: 0 }],
  ["tamu pecahan", { guests: 2.5 }],
  ["tamu string", { guests: "2" }],
  ["durasi pendek", { duration: 29 }],
  ["durasi panjang", { duration: 241 }],
  ["pelanggan salah", { customerId: -1 }],
  [
    "menu duplikat",
    {
      items: [
        { menuItemId: 1, quantity: 2 },
        { menuItemId: 1, quantity: 3 },
      ],
    },
  ],
  ["jumlah menu nol", { items: [{ menuItemId: 1, quantity: 0 }] }],
  ["jumlah menu besar", { items: [{ menuItemId: 1, quantity: 100 }] }],
  ["pesanan bukan array", { items: {} }],
  ["catatan panjang", { notes: "a".repeat(501) }],
])
  test(`validasi reservasi menolak ${label}`, () =>
    assert.throws(() => validateReservation({ ...valid, ...change }, now), { name: "AppError", status: 400 }));

test("reservasi tanpa pesanan diperbolehkan", () =>
  assert.deepEqual(
    validateReservation({ ...valid, items: [] }, now).items,
    [],
  ));
test("29 Februari tahun kabisat valid", () =>
  assert.equal(
    sqlDateTime(parseDateTime("2028-02-29T12:00")),
    "2028-02-29 12:00:00",
  ));
test("tahun nonkabisat ditolak", () =>
  assert.throws(() => parseDateTime("2027-02-29T12:00")));
test("rentang laporan terbalik ditolak", () =>
  assert.throws(() => validateDateRange("2026-10-12", "2026-10-11")));
test("rentang satu hari diterima", () =>
  assert.deepEqual(validateDateRange("2026-10-11", "2026-10-11"), {
    from: "2026-10-11",
    to: "2026-10-11",
  }));
test("rentang tanpa tanggal ditolak", () =>
  assert.throws(() => validateDateRange(undefined, undefined)));
test("bentrok pada interval yang saling tumpang tindih", () =>
  assert.equal(overlaps("18:00", "19:30", "19:00", "20:00"), true));
test("jadwal yang tepat bersebelahan tidak bentrok", () =>
  assert.equal(overlaps("18:00", "19:30", "19:30", "20:30"), false));
test("interval di dalam interval lain bentrok", () =>
  assert.equal(overlaps("18:00", "21:00", "19:00", "20:00"), true));
test("total harga berupa rupiah bulat", () =>
  assert.equal(
    Reservation.calculateTotal([
      { unitPrice: 35000, quantity: 2 },
      { unitPrice: 10000, quantity: 3 },
    ]),
    100000,
  ));
test("total pesanan kosong nol", () =>
  assert.equal(Reservation.calculateTotal([]), 0));
test("alur status terkonfirmasi → hadir → selesai", () => {
  const reservation = new Reservation({ status: "confirmed" });
  assert.equal(reservation.changeStatus("seated"), "seated");
  assert.equal(reservation.changeStatus("completed"), "completed");
});
test("pembatalan dari terkonfirmasi diperbolehkan", () =>
  assert.equal(
    new Reservation({ status: "confirmed" }).changeStatus("cancelled"),
    "cancelled",
  ));
test("status tidak boleh melompat ke selesai", () =>
  assert.throws(() =>
    new Reservation({ status: "confirmed" }).changeStatus("completed"),
  ));
test("status selesai tidak dapat dibuka kembali", () =>
  assert.throws(() =>
    new Reservation({ status: "completed" }).changeStatus("confirmed"),
  ));
test("status dibatalkan tidak dapat dibuka kembali", () =>
  assert.throws(() =>
    new Reservation({ status: "cancelled" }).changeStatus("seated"),
  ));

function fakePool(log) {
  return {
    getConnection: async () => ({
      beginTransaction: async () => log.push("begin"),
      commit: async () => log.push("commit"),
      rollback: async () => log.push("rollback"),
      release: () => log.push("release"),
    }),
  };
}
test("transaksi sukses melakukan commit dan melepas koneksi", async () => {
  const log = [];
  const repository = new RestaurantRepository(fakePool(log));
  assert.equal(await repository.transaction(async () => 42), 42);
  assert.deepEqual(log, ["begin", "commit", "release"]);
});
test("transaksi gagal melakukan rollback dan melepas koneksi", async () => {
  const log = [];
  const repository = new RestaurantRepository(fakePool(log));
  await assert.rejects(
    repository.transaction(async () => {
      throw new Error("gagal");
    }),
    /gagal/,
  );
  assert.deepEqual(log, ["begin", "rollback", "release"]);
});

test("status privat menolak assignment publik dan tidak melewati alur", () => {
  const reservation = new Reservation({ status: "confirmed" });
  assert.throws(() => { reservation.status = "completed"; }, TypeError);
  assert.equal(reservation.status, "confirmed");
  assert.throws(() => reservation.changeStatus("completed"), { name: "AppError", status: 409 });
});

test("aturan transisi tidak dapat dimutasi atau diganti", () => {
  assert.throws(() => Reservation.transitions.confirmed.push("completed"), TypeError);
  assert.throws(() => { Reservation.transitions = { confirmed: ["completed"] }; }, TypeError);
  assert.deepEqual(Reservation.transitions.confirmed, ["seated", "cancelled"]);
});

test("status awal invalid termasuk key prototype ditolak", () => {
  for (const status of ["unknown", "__proto__", "constructor"]) {
    assert.throws(() => new Reservation({ status }), { name: "AppError", status: 400 });
  }
  assert.equal(new Reservation({}).status, "confirmed");
});

test("awal tahun 2000 WIB diterima walaupun UTC masih tahun 1999", () => {
  assert.equal(sqlDateTime(parseDateTime("2000-01-01T00:00")), "2000-01-01 00:00:00");
  assert.deepEqual(validateDateRange("2000-01-01", "2000-01-01"), { from: "2000-01-01", to: "2000-01-01" });
});

test("batas tahun kalender WIB 2000 sampai 2100 diterapkan", () => {
  assert.throws(() => parseDateTime("1999-12-31T23:59"), { name: "AppError", status: 400 });
  assert.throws(() => parseDateTime("2101-01-01T00:00"), { name: "AppError", status: 400 });
  assert.equal(sqlDateTime(parseDateTime("2100-12-31T23:59")), "2100-12-31 23:59:00");
});

test("waktu sama persis dengan clock ditolak; satu menit mendatang diterima", () => {
  const clock = parseDateTime(valid.startAt);
  assert.throws(() => validateReservation(valid, clock), { name: "AppError", status: 400, message: "Waktu reservasi harus di masa mendatang." });
  assert.equal(validateReservation({ ...valid, startAt: "2026-10-12T18:01" }, clock).startAt, "2026-10-12 18:01:00");
});

const reportFixture = {
  from: "2026-10-12", to: "2026-10-12",
  daily: [{ date: "2026-10-12", reservations: 2, completed: 1, cancelled: 0, guests: 6, revenue: 70000 }],
  summary: { reservations: 2, completed: 1, cancelled: 0, guests: 6, revenue: 70000 },
};

test("exporter polymorphic memakai export yang sama untuk CSV dan JSON", () => {
  const exporters = [new CsvReportExporter(), new JsonReportExporter()];
  for (const exporter of exporters) {
    assert.ok(exporter instanceof ReportExporter);
    const file = exporter.export(reportFixture);
    assert.equal(typeof file.body, "string");
    assert.ok(file.filename.startsWith("laporan-2026-10-12-2026-10-12."));
  }
  const csv = exporters[0].export(reportFixture);
  assert.equal(csv.contentType, "text/csv; charset=utf-8");
  assert.equal(csv.body, "\uFEFFTanggal,Reservasi,Selesai,Dibatalkan,Tamu,Pendapatan (IDR)\r\n2026-10-12,2,1,0,6,70000\r\nTOTAL,2,1,0,6,70000");
  assert.deepEqual(JSON.parse(exporters[1].export(reportFixture).body), reportFixture);
});

test("CSV laporan kosong tetap memiliki header dan TOTAL nol", () => {
  const file = new CsvReportExporter().export({ ...reportFixture, daily: [], summary: { reservations: 0, completed: 0, cancelled: 0, guests: 0, revenue: 0 } });
  assert.equal(file.body.split("\r\n").length, 2);
  assert.ok(file.body.endsWith("TOTAL,0,0,0,0,0"));
});

test("factory format default/valid dan format invalid", () => {
  assert.ok(createReportExporter() instanceof CsvReportExporter);
  assert.ok(createReportExporter("json") instanceof JsonReportExporter);
  assert.throws(() => createReportExporter("pdf"), { name: "AppError", status: 400 });
});

test("base exporter menolak serialize yang belum diimplementasikan", () => {
  assert.throws(() => new ReportExporter("text/plain", "txt").export(reportFixture), /wajib mengimplementasikan/);
});

test("AppError tetap dapat ditangani sebagai Error", () => {
  const error = new AppError("Bentrok", 409);
  assert.ok(error instanceof Error);
  assert.equal(error.message, "Bentrok");
  assert.equal(error.status, 409);
});

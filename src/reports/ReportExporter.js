import { AppError } from "../errors.js";

/** Kontrak bersama exporter. Subclass mengimplementasikan serialize(report). */
export class ReportExporter {
  #contentType;
  #extension;

  /** @param {string} contentType MIME output. @param {string} extension Ekstensi tanpa titik. */
  constructor(contentType, extension) {
    this.#contentType = contentType;
    this.#extension = extension;
  }

  /**
   * @param {object} report Hasil RestaurantRepository.report; tanggal sudah divalidasi.
   * @returns {{contentType: string, filename: string, body: string}} Berkas siap dikirim.
   */
  export(report) {
    return {
      contentType: this.#contentType,
      filename: `laporan-${report.from}-${report.to}.${this.#extension}`,
      body: this.serialize(report),
    };
  }

  /** @throws {Error} Kontrak abstract: gunakan implementasi CSV atau JSON. */
  serialize(report) {
    throw new Error("Subclass exporter wajib mengimplementasikan serialize(report).");
  }
}

/** CSV rekap angka/tanggal, dengan BOM UTF-8 agar nyaman dibuka di spreadsheet. */
export class CsvReportExporter extends ReportExporter {
  constructor() {
    super("text/csv; charset=utf-8", "csv");
  }

  /** @override @returns {string} Header, baris harian, dan TOTAL dengan CRLF. */
  serialize(report) {
    const columns = ["reservations", "completed", "cancelled", "guests", "revenue"];
    const rows = [
      ["Tanggal", "Reservasi", "Selesai", "Dibatalkan", "Tamu", "Pendapatan (IDR)"],
      ...report.daily.map((day) => [day.date, ...columns.map((column) => day[column])]),
      ["TOTAL", ...columns.map((column) => report.summary[column])],
    ];
    return "\uFEFF" + rows.map((row) => row.join(",")).join("\r\n");
  }
}

/** JSON mempertahankan struktur daily/summary untuk dibaca program lain. */
export class JsonReportExporter extends ReportExporter {
  constructor() {
    super("application/json; charset=utf-8", "json");
  }

  /** @override @returns {string} JSON laporan berindentasi dua spasi. */
  serialize(report) {
    return JSON.stringify(report, null, 2);
  }
}

/** @returns {ReportExporter} Implementasi dengan kontrak sama. @throws {AppError} HTTP 400 jika format tidak didukung. */
export function createReportExporter(format = "csv") {
  if (format === "csv") return new CsvReportExporter();
  if (format === "json") return new JsonReportExporter();
  throw new AppError("Format laporan harus csv atau json.");
}

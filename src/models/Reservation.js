import { AppError } from "../errors.js";

/** Model domain: aturan status terpusat dan nilai uang dalam rupiah bulat. */
export class Reservation {
  static #transitions = Object.freeze({
    confirmed: Object.freeze(["seated", "cancelled"]),
    seated: Object.freeze(["completed", "cancelled"]),
    completed: Object.freeze([]),
    cancelled: Object.freeze([]),
  });

  #status;

  /** Matriks hanya-baca; aturan tidak dapat diganti oleh pemakai model. */
  static get transitions() {
    return Reservation.#transitions;
  }

  /**
   * @param {object} data Baris reservasi dengan status valid; default confirmed.
   * @throws {AppError} Jika status awal bukan status yang dikenal.
   */
  constructor(data) {
    const { status = "confirmed", ...properties } = data;
    if (!Object.hasOwn(Reservation.#transitions, status)) {
      throw new AppError("Status reservasi tidak valid.");
    }
    Object.assign(this, properties);
    this.#status = status;
  }

  /** Status publik hanya dapat dibaca; mutasi wajib melalui changeStatus. */
  get status() {
    return this.#status;
  }

  /**
   * @param {string} nextStatus seated, completed, atau cancelled sesuai alur.
   * @returns {string} Status setelah perubahan.
   * @throws {AppError} HTTP 409 jika transisi tidak diizinkan.
   */
  changeStatus(nextStatus) {
    if (!Reservation.#transitions[this.#status].includes(nextStatus)) {
      throw new AppError("Perubahan status tidak diizinkan.", 409);
    }
    this.#status = nextStatus;
    return this.#status;
  }

  /**
   * @param {{unitPrice: number, quantity: number}[]} items Menu yang sudah divalidasi dan diberi harga server.
   * @returns {number} Total rupiah bulat; array kosong menghasilkan nol.
   */
  static calculateTotal(items) {
    return items.reduce(
      (total, item) => total + item.unitPrice * item.quantity,
      0,
    );
  }
}

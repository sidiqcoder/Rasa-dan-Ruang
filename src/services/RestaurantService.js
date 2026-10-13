import { AppError } from "../errors.js";
import { Reservation } from "../models/Reservation.js";
import {
  integer,
  validateCustomer,
  validateReservation,
} from "../validation.js";

export class RestaurantService {
  /** @param {object} repository Kontrak repository. @param {function(): Date} clock Sumber waktu; dapat diganti tes/seed. */
  constructor(repository, clock = () => new Date()) {
    this.repository = repository;
    this.clock = clock;
  }

  /** @returns {Promise<object>} Kontak normalisasi dan ID. @throws {AppError} 400 validasi / 404 update tidak ada. */
  async saveCustomer(data, id) {
    const customer = validateCustomer(data);
    const savedId = await this.repository.saveCustomer(customer, id);
    if (!savedId) throw new AppError("Pelanggan tidak ditemukan.", 404);
    return { id: savedId, ...customer };
  }

  /** @returns {Promise<void>} @throws {AppError} 404 jika tidak ada; driver FK dipetakan 409 oleh API. */
  async deleteCustomer(id) {
    if (!(await this.repository.deleteCustomer(id)))
      throw new AppError("Pelanggan tidak ditemukan.", 404);
  }

  /** Lock meja selalu dengan urutan yang sama supaya request bersamaan tidak memesan slot yang sama. */
  async lockTables(connection) {
    const [tables] = await connection.execute(
      "SELECT * FROM restaurant_tables ORDER BY id FOR UPDATE",
    );
    return tables;
  }

  /**
   * @param {object} data Payload reservasi; harga/total klien diabaikan.
   * @param {number} [id] ID existing untuk update; hanya confirmed dapat diubah.
   * @returns {Promise<{id: number, total: number}>} ID tersimpan dan total rupiah server.
   * @throws {AppError} 400 input/kapasitas, 404 referensi tidak ada, 409 konflik/status.
   */
  async saveReservation(data, id) {
    const input = validateReservation(data, this.clock());
    return this.repository.transaction(async (connection) => {
      const tables = await this.lockTables(connection);
      if (id) {
        const [existing] = await connection.execute(
          "SELECT * FROM reservations WHERE id=? FOR UPDATE",
          [id],
        );
        if (!existing.length)
          throw new AppError("Reservasi tidak ditemukan.", 404);
        if (existing[0].status !== "confirmed")
          throw new AppError(
            "Hanya reservasi terkonfirmasi yang dapat diubah.",
            409,
          );
      }
      const table = tables.find((row) => row.id === input.tableId);
      if (!table) throw new AppError("Meja tidak ditemukan.", 404);
      if (input.guests > table.capacity)
        throw new AppError(
          `Kapasitas ${table.name} hanya ${table.capacity} tamu.`,
        );
      const [customers] = await connection.execute(
        "SELECT id FROM customers WHERE id=?",
        [input.customerId],
      );
      if (!customers.length)
        throw new AppError("Pelanggan tidak ditemukan.", 404);
      const [conflicts] = await connection.execute(
        `
        SELECT id FROM reservations WHERE table_id=? AND status IN ('confirmed','seated')
        AND start_at < ? AND end_at > ? AND id <> ? FOR UPDATE`,
        [input.tableId, input.endAt, input.startAt, id || 0],
      );
      if (conflicts.length)
        throw new AppError(
          "Meja sudah dipesan pada waktu tersebut. Pilih meja atau waktu lain.",
          409,
        );

      const pricedItems = [];
      for (const item of input.items) {
        const [menus] = await connection.execute(
          "SELECT id, price FROM menu_items WHERE id=? AND active=1",
          [item.menuItemId],
        );
        if (!menus.length)
          throw new AppError(
            "Menu tidak ditemukan atau sudah tidak tersedia.",
            404,
          );
        pricedItems.push({ ...item, unitPrice: menus[0].price });
      }
      const total = Reservation.calculateTotal(pricedItems);
      const params = [
        input.customerId,
        input.tableId,
        input.startAt,
        input.endAt,
        input.guests,
        input.notes,
        total,
      ];
      let savedId = id;
      if (id) {
        await connection.execute(
          `UPDATE reservations SET customer_id=?,table_id=?,start_at=?,end_at=?,guests=?,notes=?,total=? WHERE id=?`,
          [...params, id],
        );
        await connection.execute(
          "DELETE FROM order_items WHERE reservation_id=?",
          [id],
        );
      } else {
        const [result] = await connection.execute(
          `INSERT INTO reservations
          (customer_id,table_id,start_at,end_at,guests,notes,total) VALUES (?,?,?,?,?,?,?)`,
          params,
        );
        savedId = result.insertId;
      }
      for (const item of pricedItems) {
        await connection.execute(
          "INSERT INTO order_items (reservation_id,menu_item_id,quantity,unit_price) VALUES (?,?,?,?)",
          [savedId, item.menuItemId, item.quantity, item.unitPrice],
        );
      }
      return { id: savedId, total };
    });
  }

  /** @returns {Promise<{id: number, status: string}>} @throws {AppError} 400 ID, 404 data, 409 transisi ilegal. */
  async changeStatus(id, nextStatus) {
    integer(id, "Reservasi");
    return this.repository.transaction(async (connection) => {
      await this.lockTables(connection);
      const [rows] = await connection.execute(
        "SELECT * FROM reservations WHERE id=? FOR UPDATE",
        [id],
      );
      if (!rows.length) throw new AppError("Reservasi tidak ditemukan.", 404);
      const reservation = new Reservation(rows[0]);
      reservation.changeStatus(nextStatus);
      await connection.execute("UPDATE reservations SET status=? WHERE id=?", [
        reservation.status,
        id,
      ]);
      return { id, status: reservation.status };
    });
  }
}

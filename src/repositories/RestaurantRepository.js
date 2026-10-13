/** Seluruh query menggunakan parameter untuk data yang berasal dari pengguna. */
export class RestaurantRepository {
  /** @param {object} pool Pool mysql2/promise atau stub dengan getConnection/execute. */
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * @param {function(object): Promise<*>} work Callback memakai satu koneksi; jangan commit sendiri.
   * @returns {Promise<*>} Nilai callback setelah commit berhasil.
   * @throws {Error} Error driver/callback; rollback lalu release sebelum diteruskan.
   */
  async transaction(work) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /** @returns {Promise<object[]>} Kontak dan reservation_count, urut nama. */
  async customers() {
    const [rows] = await this.pool.execute(`
      SELECT c.id, c.name, c.phone, c.email, COUNT(r.id) AS reservation_count
      FROM customers c LEFT JOIN reservations r ON r.customer_id = c.id
      GROUP BY c.id, c.name, c.phone, c.email ORDER BY c.name`);
    return rows;
  }

  /** @returns {Promise<number|null>} ID create/update; null jika ID update tidak ada. */
  async saveCustomer(customer, id) {
    if (id) {
      const [result] = await this.pool.execute(
        "UPDATE customers SET name=?, phone=?, email=? WHERE id=?",
        [customer.name, customer.phone, customer.email, id],
      );
      return result.affectedRows ? id : null;
    }
    const [result] = await this.pool.execute(
      "INSERT INTO customers (name,phone,email) VALUES (?,?,?)",
      [customer.name, customer.phone, customer.email],
    );
    return result.insertId;
  }

  /** @returns {Promise<number>} Jumlah baris dihapus. @throws {Error} FK menolak pelanggan dengan riwayat. */
  async deleteCustomer(id) {
    const [result] = await this.pool.execute(
      "DELETE FROM customers WHERE id=?",
      [id],
    );
    return result.affectedRows;
  }

  /** @returns {Promise<object[]>} Referensi meja urut ID. */
  async tables() {
    const [rows] = await this.pool.execute(
      "SELECT * FROM restaurant_tables ORDER BY id",
    );
    return rows;
  }

  /** @returns {Promise<object[]>} Menu aktif urut kategori/ID. */
  async menu() {
    const [rows] = await this.pool.execute(
      "SELECT * FROM menu_items WHERE active=1 ORDER BY category, id",
    );
    return rows;
  }

  /** @returns {Promise<object[]>} Reservasi menurut tanggal kedatangan inklusif, beserta items. */
  async reservations(from, to) {
    const [rows] = await this.pool.execute(
      `
      SELECT r.*, c.name AS customer_name, c.phone AS customer_phone, t.name AS table_name, t.area
      FROM reservations r JOIN customers c ON c.id=r.customer_id
      JOIN restaurant_tables t ON t.id=r.table_id
      WHERE r.start_at >= ? AND r.start_at < DATE_ADD(?, INTERVAL 1 DAY)
      ORDER BY r.start_at, r.id`,
      [from, to],
    );
    if (!rows.length) return rows;
    const placeholders = rows.map(() => "?").join(",");
    const [items] = await this.pool.execute(
      `
      SELECT oi.*, m.name FROM order_items oi JOIN menu_items m ON m.id=oi.menu_item_id
      WHERE oi.reservation_id IN (${placeholders}) ORDER BY oi.id`,
      rows.map((row) => row.id),
    );
    return rows.map((row) => ({
      ...row,
      items: items.filter((item) => item.reservation_id === row.id),
    }));
  }

  /** @returns {Promise<object>} {from,to,daily,summary}; pendapatan hanya completed. */
  async report(from, to) {
    const [rows] = await this.pool.execute(
      `
      SELECT DATE(start_at) AS date, COUNT(*) AS reservations,
      SUM(status='completed') AS completed, SUM(status='cancelled') AS cancelled,
      SUM(CASE WHEN status <> 'cancelled' THEN guests ELSE 0 END) AS guests,
      SUM(CASE WHEN status='completed' THEN total ELSE 0 END) AS revenue
      FROM reservations WHERE start_at >= ? AND start_at < DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY DATE(start_at) ORDER BY date`,
      [from, to],
    );
    const daily = rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          key === "date" ? value : Number(value),
        ]),
      ),
    );
    const summary = daily.reduce(
      (total, row) => {
        for (const key of [
          "reservations",
          "completed",
          "cancelled",
          "guests",
          "revenue",
        ])
          total[key] += row[key];
        return total;
      },
      { reservations: 0, completed: 0, cancelled: 0, guests: 0, revenue: 0 },
    );
    return { from, to, daily, summary };
  }
}

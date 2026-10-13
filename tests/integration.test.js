import test from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { databaseConfig } from "../src/database.js";
import { createApp } from "../src/app.js";

// Setiap eksekusi memakai database sementara sendiri; database aplikasi tidak disentuh.
test("API dan MariaDB/MySQL: alur pemesanan restoran", async (t) => {
  const { database: ignored, ...config } = databaseConfig();
  const database = `restoran_test_${process.pid}_${Date.now()}`;
  const admin = await mysql.createConnection(config);
  let pool;
  let server;
  try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
    pool = mysql.createPool({ ...config, database, connectionLimit: 5 });
    const sql = await readFile(
      new URL("../database/schema.sql", import.meta.url),
      "utf8",
    );
    for (const statement of sql
      .replace(/--[^\n]*/g, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await pool.query(statement);
    server = createApp(pool).listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = async (route, method = "GET", body) => {
      const response = await fetch(`${base}${route}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: response.status,
        data: response.status === 204 ? null : response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text(),
        headers: Object.fromEntries(response.headers),
      };
    };
    let customerId;
    let reservationId;
    const booking = () => ({
      customerId,
      tableId: 3,
      guests: 4,
      startAt: "2099-10-12T18:00",
      duration: 90,
      items: [
        { menuItemId: 1, quantity: 2 },
        { menuItemId: 5, quantity: 2 },
      ],
      notes: "Dekat jendela",
    });

    await t.test("koneksi database dan data awal", async () => {
      assert.equal((await request("/health")).data.database, "connected");
      assert.equal((await request("/tables")).data.length, 6);
      assert.equal((await request("/menu")).data.length, 8);
    });
    await t.test("buat pelanggan", async () => {
      const result = await request("/customers", "POST", {
        name: "Dina",
        phone: "081234567890",
      });
      assert.equal(result.status, 201);
      customerId = result.data.id;
    });
    await t.test("telepon duplikat ditolak", async () =>
      assert.equal(
        (
          await request("/customers", "POST", {
            name: "Dina lain",
            phone: "081234567890",
          })
        ).status,
        409,
      ),
    );
    await t.test("input bukan objek ditolak", async () =>
      assert.equal((await request("/customers", "POST", [])).status, 400),
    );
    await t.test(
      "ubah pelanggan dan simpan karakter SQL secara literal",
      async () => {
        const result = await request(`/customers/${customerId}`, "PUT", {
          name: "Dina ' OR 1=1 --",
          phone: "081234567890",
          email: "dina@example.com",
        });
        assert.equal(result.status, 200);
        assert.equal(
          (await request("/customers")).data[0].name,
          "Dina ' OR 1=1 --",
        );
      },
    );
    await t.test("buat reservasi dan total dihitung server", async () => {
      const result = await request("/reservations", "POST", {
        ...booking(),
        total: 1,
        unitPrice: 1,
      });
      assert.equal(result.status, 201);
      assert.equal(result.data.total, 90000);
      reservationId = result.data.id;
    });
    await t.test("kapasitas meja ditolak", async () =>
      assert.equal(
        (await request("/reservations", "POST", { ...booking(), tableId: 1 }))
          .status,
        400,
      ),
    );
    await t.test("reservasi bertabrakan ditolak", async () =>
      assert.equal(
        (
          await request("/reservations", "POST", {
            ...booking(),
            startAt: "2099-10-12T19:00",
          })
        ).status,
        409,
      ),
    );
    await t.test(
      "menu tidak ada membatalkan keseluruhan transaksi",
      async () => {
        const result = await request("/reservations", "POST", {
          ...booking(),
          tableId: 4,
          items: [{ menuItemId: 9999, quantity: 1 }],
        });
        assert.equal(result.status, 404);
        const [rows] = await pool.execute(
          "SELECT COUNT(*) AS n FROM reservations",
        );
        assert.equal(rows[0].n, 1);
      },
    );
    await t.test("jadwal bersebelahan diperbolehkan", async () =>
      assert.equal(
        (
          await request("/reservations", "POST", {
            ...booking(),
            startAt: "2099-10-12T19:30",
            items: [],
          })
        ).status,
        201,
      ),
    );
    await t.test(
      "dua permintaan bersamaan hanya menghasilkan satu reservasi",
      async () => {
        const results = await Promise.all([
          request("/reservations", "POST", { ...booking(), tableId: 5 }),
          request("/reservations", "POST", { ...booking(), tableId: 5 }),
        ]);
        assert.deepEqual(
          results.map((result) => result.status).sort(),
          [201, 409],
        );
      },
    );
    await t.test("ubah reservasi dan rincian pesanan", async () => {
      const result = await request(`/reservations/${reservationId}`, "PUT", {
        ...booking(),
        items: [{ menuItemId: 2, quantity: 2 }],
      });
      assert.equal(result.status, 200);
      assert.equal(result.data.total, 84000);
      const rows = (
        await request("/reservations?from=2099-10-12&to=2099-10-12")
      ).data;
      assert.equal(
        rows.find((row) => row.id === reservationId).items[0].quantity,
        2,
      );
    });
    await t.test(
      "ubah ke meja yang bentrok gagal tanpa mengubah data lama",
      async () => {
        assert.equal(
          (
            await request(`/reservations/${reservationId}`, "PUT", {
              ...booking(),
              tableId: 5,
            })
          ).status,
          409,
        );
        const [rows] = await pool.execute(
          "SELECT table_id,total FROM reservations WHERE id=?",
          [reservationId],
        );
        assert.equal(rows[0].table_id, 3);
        assert.equal(rows[0].total, 84000);
      },
    );
    await t.test("status tidak dapat melompat", async () =>
      assert.equal(
        (
          await request(`/reservations/${reservationId}/status`, "PATCH", {
            status: "completed",
          })
        ).status,
        409,
      ),
    );
    await t.test("hadir lalu selesai", async () => {
      assert.equal(
        (
          await request(`/reservations/${reservationId}/status`, "PATCH", {
            status: "seated",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await request(`/reservations/${reservationId}/status`, "PATCH", {
            status: "completed",
          })
        ).status,
        200,
      );
    });
    await t.test("reservasi selesai tidak dapat diedit", async () =>
      assert.equal(
        (await request(`/reservations/${reservationId}`, "PUT", booking()))
          .status,
        409,
      ),
    );
    await t.test("laporan hanya mengakui pendapatan selesai", async () => {
      const result = await request("/reports?from=2099-10-12&to=2099-10-12");
      assert.equal(result.data.summary.reservations, 3);
      assert.equal(result.data.summary.completed, 1);
      assert.equal(result.data.summary.revenue, 84000);
    });
    await t.test("ekspor CSV mengirim berkas dengan harga dan ringkasan benar", async () => {
      const result = await request("/reports/export?from=2099-10-12&to=2099-10-12&format=csv");
      assert.equal(result.status, 200);
      assert.ok(result.headers["content-type"].startsWith("text/csv"));
      assert.ok(result.headers["content-disposition"].includes("laporan-2099-10-12-2099-10-12.csv"));
      assert.ok(result.data.includes("TOTAL,3,1,0,12,84000"));
    });
    await t.test("ekspor JSON menggunakan data yang sama dengan endpoint laporan", async () => {
      const result = await request("/reports/export?from=2099-10-12&to=2099-10-12&format=json");
      assert.equal(result.status, 200);
      assert.deepEqual(result.data, (await request("/reports?from=2099-10-12&to=2099-10-12")).data);
      assert.ok(result.headers["content-disposition"].includes(".json"));
    });
    await t.test("format ekspor invalid ditolak", async () => {
      assert.equal((await request("/reports/export?from=2099-10-12&to=2099-10-12&format=pdf")).status, 400);
    });
    await t.test("rentang awal tahun 2000 WIB valid dan menghasilkan laporan kosong", async () => {
      const result = await request("/reports?from=2000-01-01&to=2000-01-01");
      assert.equal(result.status, 200);
      assert.equal(result.data.summary.reservations, 0);
    });
    await t.test("JSON rusak dan payload terlalu besar menghasilkan error yang jelas", async () => {
      for (const [body, status] of [["{invalid", 400], [JSON.stringify({ name: "a".repeat(33000) }), 413]]) {
        const response = await fetch(`${base}/customers`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
        assert.equal(response.status, status);
        assert.equal(typeof (await response.json()).error, "string");
      }
    });
    await t.test("halaman frontend tersedia beserta header keamanan", async () => {
      const response = await fetch(base.replace(/\/api$/, "/"));
      assert.equal(response.status, 200);
      assert.ok((await response.text()).includes("reservation-form"));
      assert.ok(response.headers.get("content-security-policy").includes("script-src 'self'"));
    });
    await t.test("pelanggan dengan riwayat tidak dapat dihapus", async () =>
      assert.equal(
        (await request(`/customers/${customerId}`, "DELETE")).status,
        409,
      ),
    );
    await t.test(
      "reservasi lintas tengah malam bertabrakan di hari berikutnya",
      async () => {
        const first = await request("/reservations", "POST", {
          ...booking(),
          tableId: 6,
          startAt: "2099-10-12T23:30",
        });
        assert.equal(first.status, 201);
        assert.equal(
          (
            await request("/reservations", "POST", {
              ...booking(),
              tableId: 6,
              startAt: "2099-10-13T00:30",
            })
          ).status,
          409,
        );
      },
    );
    await t.test("pembatalan membebaskan slot meja", async () => {
      const rows = (
        await request("/reservations?from=2099-10-12&to=2099-10-12")
      ).data;
      const row = rows.find((reservation) => reservation.table_id === 5);
      assert.equal(
        (
          await request(`/reservations/${row.id}/status`, "PATCH", {
            status: "cancelled",
          })
        ).status,
        200,
      );
      assert.equal(
        (await request("/reservations", "POST", { ...booking(), tableId: 5 }))
          .status,
        201,
      );
    });
    await t.test("hapus pelanggan tanpa riwayat", async () => {
      const customer = await request("/customers", "POST", {
        name: "Sementara",
        phone: "081234560000",
      });
      assert.equal(
        (await request(`/customers/${customer.data.id}`, "DELETE")).status,
        204,
      );
    });
    await t.test(
      "rentang laporan salah ditolak dan endpoint tak dikenal 404",
      async () => {
        assert.equal(
          (await request("/reports?from=2099-10-13&to=2099-10-12")).status,
          400,
        );
        assert.equal((await request("/tidak-ada")).status, 404);
      },
    );
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (pool) await pool.end();
    if (/^restoran_test_\d+_\d+$/.test(database))
      await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.end();
  }
});

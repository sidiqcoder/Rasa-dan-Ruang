import test from "node:test";
import assert from "node:assert/strict";
import { RestaurantService } from "../src/services/RestaurantService.js";
import { RestaurantRepository } from "../src/repositories/RestaurantRepository.js";

const booking = { customerId: 1, tableId: 3, guests: 4, startAt: "2099-10-12T18:00", duration: 90, items: [{ menuItemId: 1, quantity: 2 }], notes: "Dekat jendela" };

/** Stub koneksi domain: tes berjalan tanpa MySQL dan merekam data yang ditulis. */
function harness(options = {}) {
  const log = [];
  const writes = [];
  const connection = {
    beginTransaction: async () => log.push("begin"),
    commit: async () => log.push("commit"),
    rollback: async () => log.push("rollback"),
    release: () => log.push("release"),
    async execute(sql, params = []) {
      if (sql.includes("FROM restaurant_tables")) return [options.tables ?? [{ id: 3, name: "Meja 03", capacity: 4 }]];
      if (sql.startsWith("SELECT * FROM reservations")) return [options.existing ?? [{ id: 17, status: "confirmed" }]];
      if (sql.includes("FROM customers")) return [options.customers ?? [{ id: 1 }]];
      if (sql.includes("FROM reservations WHERE table_id")) return [options.conflicts ?? []];
      if (sql.includes("FROM menu_items")) return [params[0] === 1 && !options.missingMenu ? [{ id: 1, price: 35000 }] : []];
      writes.push({ sql, params });
      return [{ insertId: 17, affectedRows: 1 }];
    },
  };
  const repository = new RestaurantRepository({ getConnection: async () => connection });
  const service = new RestaurantService(repository, () => new Date("2099-10-12T00:00:00+07:00"));
  return { service, log, writes };
}

test("service memakai harga database dan menyimpan detail dalam satu transaksi", async () => {
  const { service, log, writes } = harness();
  assert.deepEqual(await service.saveReservation({ ...booking, total: 1, unitPrice: 1 }), { id: 17, total: 70000 });
  assert.deepEqual(writes.find(write => write.sql.startsWith("INSERT INTO order_items")).params, [17, 1, 2, 35000]);
  assert.equal(writes.find(write => write.sql.startsWith("INSERT INTO reservations")).params.at(-1), 70000);
  assert.deepEqual(log, ["begin", "commit", "release"]);
});

for (const [label, options, data, expectedStatus] of [
  ["meja tidak ada", { tables: [] }, booking, 404],
  ["kapasitas kurang", {}, { ...booking, guests: 5 }, 400],
  ["pelanggan tidak ada", { customers: [] }, booking, 404],
  ["jadwal bentrok", { conflicts: [{ id: 8 }] }, booking, 409],
  ["menu tidak ada", { missingMenu: true }, booking, 404],
]) {
  test(`service menolak ${label} tanpa menulis reservasi`, async () => {
    const { service, log, writes } = harness(options);
    await assert.rejects(service.saveReservation(data), { name: "AppError", status: expectedStatus });
    assert.equal(writes.length, 0);
    assert.deepEqual(log, ["begin", "rollback", "release"]);
  });
}

test("validasi payload salah tidak membuka transaksi", async () => {
  const { service, log } = harness();
  await assert.rejects(service.saveReservation({ ...booking, guests: 0 }), { name: "AppError", status: 400 });
  assert.deepEqual(log, []);
});

test("update confirmed mengganti rincian pesanan dan menghitung total", async () => {
  const { service, log, writes } = harness();
  assert.deepEqual(await service.saveReservation({ ...booking, items: [{ menuItemId: 1, quantity: 3 }] }, 17), { id: 17, total: 105000 });
  assert.ok(writes.some(write => write.sql.startsWith("UPDATE reservations")));
  assert.deepEqual(writes.find(write => write.sql.startsWith("DELETE FROM order_items")).params, [17]);
  assert.deepEqual(log, ["begin", "commit", "release"]);
});

for (const [label, existing, status] of [
  ["reservasi tidak ada", [], 404],
  ["reservasi sudah hadir", [{ id: 17, status: "seated" }], 409],
]) {
  test(`update menolak ${label} dan rollback`, async () => {
    const { service, log, writes } = harness({ existing });
    await assert.rejects(service.saveReservation(booking, 17), { name: "AppError", status });
    assert.equal(writes.length, 0);
    assert.deepEqual(log, ["begin", "rollback", "release"]);
  });
}

test("service perubahan status memakai model dan menulis status valid", async () => {
  const { service, log, writes } = harness();
  assert.deepEqual(await service.changeStatus(17, "seated"), { id: 17, status: "seated" });
  assert.deepEqual(writes[0].params, ["seated", 17]);
  assert.deepEqual(log, ["begin", "commit", "release"]);
});

test("service menolak lompatan status tanpa UPDATE", async () => {
  const { service, log, writes } = harness();
  await assert.rejects(service.changeStatus(17, "completed"), { name: "AppError", status: 409 });
  assert.equal(writes.length, 0);
  assert.deepEqual(log, ["begin", "rollback", "release"]);
});

test("service status ID tidak ada menghasilkan 404", async () => {
  const { service } = harness({ existing: [] });
  await assert.rejects(service.changeStatus(17, "seated"), { name: "AppError", status: 404 });
});

test("service customer menormalisasi input dan mengembalikan ID repository", async () => {
  let received;
  const service = new RestaurantService({ saveCustomer: async (data) => { received = data; return 5; } });
  const result = await service.saveCustomer({ name: " Dina ", phone: "0812-3456-7890" });
  assert.deepEqual(received, { name: "Dina", phone: "081234567890", email: null });
  assert.deepEqual(result, { id: 5, ...received });
});

test("service update customer tidak ditemukan menghasilkan 404", async () => {
  const service = new RestaurantService({ saveCustomer: async () => null });
  await assert.rejects(service.saveCustomer({ name: "Dina", phone: "081234567890" }, 999), { name: "AppError", status: 404 });
});

test("service delete customer membedakan sukses dan tidak ada", async () => {
  assert.equal(await new RestaurantService({ deleteCustomer: async () => 1 }).deleteCustomer(1), undefined);
  await assert.rejects(new RestaurantService({ deleteCustomer: async () => 0 }).deleteCustomer(999), { name: "AppError", status: 404 });
});

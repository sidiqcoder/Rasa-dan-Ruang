import { createDatabase } from "../src/database.js";
import { RestaurantRepository } from "../src/repositories/RestaurantRepository.js";
import { RestaurantService } from "../src/services/RestaurantService.js";

const pool = createDatabase();
try {
  const [existing] = await pool.execute(
    "SELECT COUNT(*) AS count FROM reservations",
  );
  if (existing[0].count) {
    console.log(
      "Data reservasi sudah ada. Seed demo dilewati agar data tidak berulang.",
    );
  } else {
    // Jam historis diperbolehkan hanya untuk seed contoh, tidak pada API aplikasi.
    const service = new RestaurantService(
      new RestaurantRepository(pool),
      () => new Date("1970-01-01"),
    );
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const samples = [
      [
        "Dina Pramesti",
        "081234560001",
        3,
        4,
        "17:00",
        "confirmed",
        [
          { menuItemId: 1, quantity: 4 },
          { menuItemId: 5, quantity: 4 },
        ],
      ],
      [
        "Arif Wijaya",
        "081234560002",
        1,
        2,
        "18:00",
        "seated",
        [
          { menuItemId: 2, quantity: 2 },
          { menuItemId: 6, quantity: 2 },
        ],
      ],
      [
        "Sari Utami",
        "081234560003",
        5,
        5,
        "12:00",
        "completed",
        [
          { menuItemId: 3, quantity: 5 },
          { menuItemId: 5, quantity: 5 },
        ],
      ],
      ["Budi Santoso", "081234560004", 4, 3, "19:00", "cancelled", []],
    ];
    for (const [name, phone, tableId, guests, time, status, items] of samples) {
      const [rows] = await pool.execute(
        "SELECT id FROM customers WHERE phone=?",
        [phone],
      );
      const customer = rows[0] || (await service.saveCustomer({ name, phone }));
      const booking = await service.saveReservation({
        customerId: customer.id,
        tableId,
        guests,
        startAt: `${date}T${time}`,
        duration: 90,
        notes: "",
        items,
      });
      if (["seated", "completed"].includes(status))
        await service.changeStatus(booking.id, "seated");
      if (status === "completed")
        await service.changeStatus(booking.id, "completed");
      if (status === "cancelled")
        await service.changeStatus(booking.id, "cancelled");
    }
    console.log(`Empat reservasi contoh untuk ${date} ditambahkan.`);
  }
} finally {
  await pool.end();
}

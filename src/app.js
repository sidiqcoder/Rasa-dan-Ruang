import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "./errors.js";
import { integer, validateDateRange } from "./validation.js";
import { RestaurantRepository } from "./repositories/RestaurantRepository.js";
import { RestaurantService } from "./services/RestaurantService.js";
import { createReportExporter } from "./reports/ReportExporter.js";

const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));

/** Factory aplikasi memudahkan pengujian HTTP tanpa membuka port tetap. */
export function createApp(pool) {
  const app = express();
  const repository = new RestaurantRepository(pool);
  const service = new RestaurantService(repository);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    next();
  });
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  app.get("/api/health", async (req, res) => {
    await pool.execute("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  });
  app.get("/api/customers", async (req, res) =>
    res.json(await repository.customers()),
  );
  app.post("/api/customers", async (req, res) =>
    res.status(201).json(await service.saveCustomer(req.body)),
  );
  app.put("/api/customers/:id", async (req, res) =>
    res.json(
      await service.saveCustomer(
        req.body,
        integer(Number(req.params.id), "Pelanggan"),
      ),
    ),
  );
  app.delete("/api/customers/:id", async (req, res) => {
    await service.deleteCustomer(integer(Number(req.params.id), "Pelanggan"));
    res.status(204).end();
  });
  app.get("/api/tables", async (req, res) =>
    res.json(await repository.tables()),
  );
  app.get("/api/menu", async (req, res) => res.json(await repository.menu()));
  app.get("/api/reservations", async (req, res) => {
    const { from, to } = validateDateRange(req.query.from, req.query.to);
    res.json(await repository.reservations(from, to));
  });
  app.post("/api/reservations", async (req, res) =>
    res.status(201).json(await service.saveReservation(req.body)),
  );
  app.put("/api/reservations/:id", async (req, res) =>
    res.json(
      await service.saveReservation(
        req.body,
        integer(Number(req.params.id), "Reservasi"),
      ),
    ),
  );
  app.patch("/api/reservations/:id/status", async (req, res) =>
    res.json(
      await service.changeStatus(
        integer(Number(req.params.id), "Reservasi"),
        req.body?.status,
      ),
    ),
  );
  app.get("/api/reports", async (req, res) => {
    const { from, to } = validateDateRange(req.query.from, req.query.to);
    res.json(await repository.report(from, to));
  });
  app.get("/api/reports/export", async (req, res) => {
    const { from, to } = validateDateRange(req.query.from, req.query.to);
    const exporter = createReportExporter(req.query.format);
    const file = exporter.export(await repository.report(from, to));
    res.set("Content-Type", file.contentType);
    res.attachment(file.filename).send(file.body);
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Endpoint tidak ditemukan." }),
  );
  app.use(express.static(publicDirectory));
  app.get("/", (req, res) =>
    res.sendFile(path.join(publicDirectory, "index.html")),
  );

  // Detail internal database hanya masuk log server, bukan respons ke browser.
  app.use((error, req, res, next) => {
    if (error instanceof AppError)
      return res.status(error.status).json({ error: error.message });
    if (error.code === "ER_DUP_ENTRY")
      return res.status(409).json({ error: "Nomor telepon sudah terdaftar." });
    if (error.code === "ER_ROW_IS_REFERENCED_2")
      return res
        .status(409)
        .json({
          error:
            "Pelanggan memiliki riwayat reservasi dan tidak dapat dihapus.",
        });
    if (error.type === "entity.parse.failed")
      return res.status(400).json({ error: "Format JSON tidak valid." });
    if (error.type === "entity.too.large")
      return res
        .status(413)
        .json({ error: "Data yang dikirim terlalu besar." });
    console.error(
      `[${new Date().toISOString()}] ${req.method} ${req.path}:`,
      error.message,
    );
    res
      .status(500)
      .json({
        error:
          "Layanan database bermasalah. Periksa konfigurasi dan koneksi server.",
      });
  });
  return app;
}

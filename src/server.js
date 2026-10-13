import { createDatabase } from "./database.js";
import { createApp } from "./app.js";

const pool = createDatabase();
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "127.0.0.1";

try {
  await pool.execute("SELECT id FROM restaurant_tables LIMIT 1");
  const server = createApp(pool).listen(port, host, () => {
    console.log(`Rasa & Ruang siap: http://${host}:${port}`);
  });
  server.on("error", async (error) => {
    console.error(`Server gagal berjalan: ${error.message}`);
    await pool.end();
    process.exitCode = 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () =>
      server.close(async () => {
        await pool.end();
        process.exit(0);
      }),
    );
  }
} catch (error) {
  console.error(
    `Database belum siap: ${error.message}\nJalankan npm run db:setup dan periksa .env.`,
  );
  await pool.end();
  process.exitCode = 1;
}

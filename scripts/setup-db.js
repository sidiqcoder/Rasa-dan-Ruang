import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { databaseConfig } from "../src/database.js";

const config = databaseConfig();
if (!/^[a-zA-Z0-9_]+$/.test(config.database))
  throw new Error("DB_NAME hanya boleh huruf, angka, dan underscore.");
const { database, ...connectionConfig } = config;
const connection = await mysql.createConnection(connectionConfig);
try {
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await connection.changeUser({ database });
  const sql = await readFile(
    new URL("../database/schema.sql", import.meta.url),
    "utf8",
  );
  // Pemisahan ini hanya untuk berkas SQL statis milik proyek, bukan input pengguna.
  const statements = sql
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) await connection.query(statement);
  console.log(`Database ${database} siap. Meja dan menu awal tersedia.`);
} finally {
  await connection.end();
}

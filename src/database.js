import mysql from "mysql2/promise";

export function databaseConfig() {
  return {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "restoran_sertifikasi",
    charset: "utf8mb4",
    dateStrings: true,
    timezone: "+07:00",
    connectTimeout: 5000,
  };
}

/** Satu pool dibagikan ke semua repository, bukan koneksi baru per request. */
export function createDatabase() {
  return mysql.createPool({
    ...databaseConfig(),
    connectionLimit: 5,
    waitForConnections: true,
    queueLimit: 50,
  });
}

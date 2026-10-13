import mysql from "mysql2/promise";
import { readFile, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { randomInt } from "node:crypto";
import assert from "node:assert/strict";
import { databaseConfig } from "../src/database.js";
import { createApp } from "../src/app.js";

// Rehearsal subset sintaks REST Client yang dipakai rest-client.http.
// Ini pengujian HTTP terisolasi, bukan pengganti extension VS Code atau unit test.
const source = await readFile(new URL("../rest-client.http", import.meta.url), "utf8");
const variables = Object.fromEntries([...source.matchAll(/^@(\w+)\s*=\s*(.*)$/gm)].map(match => [match[1], match[2].trim()]));
const requests = source.split(/^###\s*/m).slice(1).map(block => {
  const lines = block.split(/\r?\n/);
  const methodIndex = lines.findIndex(line => /^(GET|POST|PUT|PATCH|DELETE) /.test(line));
  if (methodIndex < 0) throw new Error("Blok HTTP tidak memiliki request.");
  const [method, url] = lines[methodIndex].split(" ");
  const headers = {};
  let cursor = methodIndex + 1;
  while (lines[cursor]?.trim()) {
    const colon = lines[cursor].indexOf(":");
    if (colon < 0) throw new Error(`Header tidak valid: ${lines[cursor]}`);
    headers[lines[cursor].slice(0, colon)] = lines[cursor].slice(colon + 1).trim();
    cursor++;
  }
  return { title: lines[0].trim(), method, url, headers, body: lines.slice(cursor + 1).join("\n").trim(), name: block.match(/^# @name (\w+)$/m)?.[1], expected: Number(block.match(/^# @expect (\d+)$/m)?.[1]) };
});
const exchanges = new Map();

function jsonPath(data, expression) {
  const tokens = [...expression.matchAll(/\[(\d+)\]|\.(\w+)/g)];
  let value = data;
  for (const token of tokens) value = value?.[token[1] ?? token[2]];
  if (value === undefined) throw new Error(`JSONPath tidak ditemukan: ${expression}`);
  return value;
}

function resolve(value, depth = 0) {
  if (depth > 20) throw new Error("Referensi variabel berulang.");
  return value.replace(/\{\{([^{}]+)\}\}/g, (match, expression) => {
    if (expression === "$datetime 'YYYY-MM-DD' 1 d") return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const random = expression.match(/^\$randomInt (\d+) (\d+)$/);
    if (random) return String(randomInt(Number(random[1]), Number(random[2]) + 1));
    if (Object.hasOwn(variables, expression)) return resolve(variables[expression], depth + 1);
    const reference = expression.match(/^(\w+)\.(request|response)\.body\.(\$.*)$/);
    if (reference && exchanges.has(reference[1])) return String(jsonPath(exchanges.get(reference[1])[reference[2]], reference[3]));
    throw new Error(`Variabel belum tersedia: ${expression}; jalankan request pendahulu.`);
  });
}

const { database: ignored, ...config } = databaseConfig();
const database = `restoran_http_${process.pid}_${Date.now()}`;
const admin = await mysql.createConnection(config);
let pool;
let server;
const results = [];
try {
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
  pool = mysql.createPool({ ...config, database, connectionLimit: 5 });
  const schema = await readFile(new URL("../database/schema.sql", import.meta.url), "utf8");
  for (const statement of schema.replace(/--[^\n]*/g, "").split(";").map(value => value.trim()).filter(Boolean)) await pool.query(statement);
  server = createApp(pool).listen(0, "127.0.0.1");
  await once(server, "listening");
  variables.baseUrl = `http://127.0.0.1:${server.address().port}`;
  for (const request of requests) {
    const body = resolve(request.body);
    const response = await fetch(resolve(request.url), { method: request.method, headers: request.headers, ...(body ? { body } : {}) });
    const text = await response.text();
    const data = response.headers.get("content-type")?.includes("application/json") && text ? JSON.parse(text) : text;
    let requestData;
    try { requestData = body ? JSON.parse(body) : null; } catch { requestData = body; }
    if (request.name) exchanges.set(request.name, { request: requestData, response: data });
    const passed = response.status === request.expected;
    results.push({ title: request.title, method: request.method, expected: request.expected, actual: response.status, passed });
    assert.equal(response.status, request.expected, `${request.title}: ${text}`);
  }
  const finalReport = exchanges.get("finalReport").response;
  assert.deepEqual(finalReport.summary, { reservations: 3, completed: 1, cancelled: 2, guests: 2, revenue: 3 * exchanges.get("getMenu").response[0].price });
  console.log(`REST Client rehearsal: ${results.length}/${requests.length} request sesuai status; total laporan benar.`);
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  if (pool) await pool.end();
  if (/^restoran_http_\d+_\d+$/.test(database)) await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
  await admin.end();
  await writeFile(new URL("../docs/bukti-http.json", import.meta.url), JSON.stringify({ source: "rest-client.http", executedAt: new Date().toISOString(), isolatedDatabase: true, results }, null, 2));
}

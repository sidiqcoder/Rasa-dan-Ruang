import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "docs/laporan-waterfall/bukti");
await mkdir(output, { recursive: true });
const results = [];
const checks = [
  ["syntax", ["scripts/check-syntax.js"], "syntax.txt"],
  ["unit", ["--test", "--test-reporter=tap", "--experimental-test-coverage", "tests/unit.test.js", "tests/service.test.js"], "unit.tap"],
  ["integration", ["--env-file-if-exists=.env", "--test", "--test-reporter=tap", "--experimental-test-coverage", "tests/integration.test.js"], "integration.tap"],
  ["http", ["--env-file-if-exists=.env", "scripts/verify-http.js"], "http.txt"],
];
for (const [name, args, filename] of checks) {
  const executedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
  const text = result.stdout + (result.stderr ? "\nSTDERR:\n" + result.stderr : "");
  await writeFile(path.join(output, filename), text);
  results.push({ name, executedAt, command: `node ${args.join(" ")}`, exitCode: result.status, passed: result.status === 0, ...(result.error ? { error: result.error.message } : {}) });
  console.log(`${name}: ${result.status === 0 ? "LULUS" : "GAGAL"}`);
  if (name === "http" && result.status === 0) await writeFile(path.join(output, "http.json"), await readFile(path.join(root, "docs/bukti-http.json")));
}
const summary = { executedAt: new Date().toISOString(), node: process.version, platform: process.platform, results };
await writeFile(path.join(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
if (results.some((r) => !r.passed)) process.exitCode = 1;

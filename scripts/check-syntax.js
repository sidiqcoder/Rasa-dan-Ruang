import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));

/** Memeriksa sintaks source tanpa menjalankan server atau mengubah database. */
async function checkDirectory(directory) {
  let count = 0;
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) count += await checkDirectory(filename);
    else if (/\.(js|mjs)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ["--check", filename], { cwd: root, encoding: "utf8" });
      if (result.status !== 0) throw new Error(`${filename}: ${result.stderr || result.error?.message}`);
      count++;
    }
  }
  return count;
}

let count = 0;
for (const directory of ["src", "public", "scripts", "tests"]) count += await checkDirectory(directory);
console.log(`Pemeriksaan sintaks: ${count} berkas lulus.`);

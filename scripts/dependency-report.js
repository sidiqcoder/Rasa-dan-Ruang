import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const lock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
const direct = new Set([...Object.keys(manifest.dependencies), ...Object.keys(manifest.devDependencies)]);
const packages = Object.entries(lock.packages).filter(([location]) => location).map(([location, pkg]) => ({
  name: pkg.name || location.split("node_modules/").at(-1),
  version: pkg.version,
  location,
  direct: direct.has(location.replace(/^node_modules\//, "")),
  development: pkg.dev === true,
  license: pkg.license || "Tidak tercatat pada lockfile",
  deprecated: pkg.deprecated || null,
}));
const notices = ["THIRD-PARTY NOTICES — RASA & RUANG", "", "Teks lisensi dependency langsung disalin dari distribusi terpasang. Inventaris seluruh dependency tersedia di DEPENDENCY-LICENSES.json.", ""];
for (const name of direct) {
  const directory = path.join(root, "node_modules", name);
  const filenames = (await readdir(directory)).filter(filename => /^licen[cs]e(?:[._-].*)?$/i.test(filename));
  notices.push(`=== ${name} ===`);
  if (!filenames.length) notices.push("Teks lisensi tidak ditemukan di direktori paket; periksa sumber resmi sebelum distribusi.");
  for (const filename of filenames) notices.push(await readFile(path.join(directory, filename), "utf8"));
  notices.push("");
}
await writeFile(path.join(root, "docs/DEPENDENCY-LICENSES.json"), JSON.stringify({ source: "package-lock.json", packages }, null, 2));
await writeFile(path.join(root, "docs/THIRD-PARTY-NOTICES.txt"), notices.join("\n"));
const deprecated = packages.filter(pkg => pkg.deprecated);
console.log(`Inventaris: ${packages.length} dependency; ${deprecated.length} ditandai deprecated pada lockfile.`);
for (const pkg of deprecated) console.log(`${pkg.name}@${pkg.version}: ${pkg.deprecated}`);

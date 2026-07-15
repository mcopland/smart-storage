// Run wasm-pack only when crates/engine/pkg is missing or older than the
// crate's sources, so dev/test/typecheck don't pay a rebuild on every run.
// `npm run build:wasm` remains the unconditional escape hatch.
import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const crate = path.join(root, "crates", "engine");
const pkg = path.join(crate, "pkg");

function mtimeOf(file) {
  try {
    return statSync(file).mtimeMs;
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw new Error(`ensure-wasm: failed to stat ${file}: ${err.message}`);
  }
}

function newestMtimeUnder(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const mtime = entry.isDirectory() ? newestMtimeUnder(full) : statSync(full).mtimeMs;
    if (mtime > newest) newest = mtime;
  }
  return newest;
}

// engine_bg.wasm is written last by wasm-pack's bindgen step, so its mtime
// stands in for "when the package was built".
const artifactMtime = mtimeOf(path.join(pkg, "engine_bg.wasm"));
const sourcesMtime = Math.max(
  newestMtimeUnder(path.join(crate, "src")),
  mtimeOf(path.join(crate, "Cargo.toml")) ?? 0,
  mtimeOf(path.join(crate, "Cargo.lock")) ?? 0,
);

if (artifactMtime !== null && artifactMtime >= sourcesMtime) {
  process.exit(0);
}

console.log(
  artifactMtime === null
    ? "ensure-wasm: crates/engine/pkg missing, building..."
    : "ensure-wasm: crates/engine sources changed, rebuilding...",
);
try {
  execSync("npm run build:wasm", { cwd: root, stdio: "inherit" });
} catch (err) {
  console.error(`ensure-wasm: wasm-pack build failed (exit ${err.status ?? "unknown"})`);
  process.exit(err.status ?? 1);
}

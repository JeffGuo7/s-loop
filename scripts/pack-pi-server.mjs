// Packs src-tauri/pi-server/ into src-tauri/pi-server.zip before the Tauri
// bundle step. Bundling the directory as a single archive resource avoids
// NSIS/makensis hitting the Windows MAX_PATH (260) limit on deeply nested
// files (e.g. @mistralai operation files with ~113-char names). The Rust
// side extracts this archive on first launch.
import { readdir, stat, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import JSZip from "jszip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const srcDir = join(root, "src-tauri", "pi-server");
const outZip = join(root, "src-tauri", "pi-server.zip");

// Skip files/dirs that are not needed at runtime or would bloat the archive.
const SKIP_NAMES = new Set([".git", ".DS_Store", "Thumbs.db"]);
// Within node_modules, skip type-only and source-map artifacts the runtime
// never loads (also keeps paths short).
const SKIP_EXTS = new Set([".d.ts", ".d.ts.map", ".js.map", ".ts.map", ".ts"]);

function shouldSkip(relPath, name, isDir) {
  if (SKIP_NAMES.has(name)) return true;
  if (isDir) return false;
  // Only apply extension skips inside node_modules to avoid touching our own
  // source .ts files (there are none under pi-server root anyway, but be safe).
  if (relPath.includes("node_modules")) {
    for (const ext of SKIP_EXTS) {
      if (name.endsWith(ext)) return true;
    }
  }
  return false;
}

async function walk(dir, zip, relBase) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (shouldSkip(rel, entry.name, entry.isDirectory())) continue;
    if (entry.isDirectory()) {
      await walk(abs, zip, rel);
    } else if (entry.isFile()) {
      const data = await readFile(abs);
      zip.file(rel, data, { date: new Date(0) }); // stable date for reproducible zip
    }
  }
}

async function main() {
  const t0 = Date.now();
  try {
    await stat(srcDir);
  } catch {
    console.error(`[pack-pi-server] source dir not found: ${srcDir}`);
    process.exit(1);
  }
  console.log(`[pack-pi-server] packing ${srcDir} -> ${outZip}`);

  const zip = new JSZip();
  // Package files at the archive root (no top-level "pi-server/" prefix) so
  // the Rust extractor can unzip straight into <install>/pi-server/.
  await walk(srcDir, zip, "");
  const buf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  await rm(outZip, { force: true });
  await mkdir(dirname(outZip), { recursive: true });
  await writeFile(outZip, buf);
  const mb = (buf.length / 1048576).toFixed(1);
  console.log(`[pack-pi-server] wrote pi-server.zip (${mb} MB) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error("[pack-pi-server] failed:", e);
  process.exit(1);
});

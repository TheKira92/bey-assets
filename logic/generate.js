// logic/generate.js
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IMAGES_DIR = path.join(ROOT, "images");
const MANIFEST_PATH = path.join(ROOT, "manifest", "index.json");

// Overrides opzionali
let OVERRIDES = {
  xoverSystem: {},   // es: { "dragoon": "BX", "wizard": "UX" }
  bladeConfig: {},   // es: { "hells_scythe": "integrated", "wizard": "standard" }
  assistShort: {},   // es: { "slash": "S" }
  chipShort: {},     // es: { "dran": "Dran" }
  bitShort: {}       // es: { "gear ball": "GB" }
};
try {
  const raw = await fs.readFile(path.join(__dirname, "data", "overrides", "config.json"), "utf8");
  OVERRIDES = { ...OVERRIDES, ...JSON.parse(raw) };
} catch { /* ok, nessun override */ }

// ---- Helpers naming ----
const baseName = (p) => path.basename(p).replace(/\.webp$/i, "");
const toId = (s) =>
  s.toLowerCase().replace(/\s+/g, "-").replace(/_+/g, "-").replace(/\.webp$/i, "");

// Trasforma filename in display name:
// - '_' → spazio
// - '-' rimane solo se numerico (tra due cifre), altrimenti diventa spazio
// - ogni parola alfabetica in Title Case
function titleFromFilenameStem(stem) {
  // 1) sostituisci _ con spazio
  let s = stem.replace(/_/g, " ");
  // 2) gestione '-' (spazio se NON tra due cifre)
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "-") {
      const prev = s[i - 1] ?? "";
      const next = s[i + 1] ?? "";
      if (/\d/.test(prev) && /\d/.test(next)) out += "-"; // numerico: preserva
      else out += " "; // altrimenti: separatore parola
    } else {
      out += ch;
    }
  }
  // 3) Title Case per token alfabetici, preserva token numerici/tipo "1-60"
  return out
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/^\d/.test(w) || w.includes("-") ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

const relFromImages = (abs) =>
  path.relative(path.join(ROOT, "images"), abs).replace(/\\/g, "/");
const isWebp = (f) => /\.webp$/i.test(f);

const shortForBlade = (name) => name; // mai abbreviate
const shortForRachet = (name /*, type*/) => name; // anche le standard non le accorciamo
function shortForBit(name) {
  const key = name.toLowerCase();
  if (OVERRIDES.bitShort?.[key]) return OVERRIDES.bitShort[key];
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
function shortForChip(stem) {
  const key = stem.toLowerCase();
  if (OVERRIDES.chipShort?.[key]) return OVERRIDES.chipShort[key];
  // "dran" -> "Dran"
  return titleFromFilenameStem(key).split(" ")[0];
}
function shortForAssist(stem) {
  const key = stem.toLowerCase();
  if (OVERRIDES.assistShort?.[key]) return OVERRIDES.assistShort[key];
  return titleFromFilenameStem(key).charAt(0).toUpperCase(); // "Slash" -> "S"
}

async function safeList(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.map((e) => ({ name: e.name, path: path.join(dir, e.name), dirent: e }));
  } catch {
    return [];
  }
}

// ---- Collectors ----
async function collectBlades() {
  const out = [];
  const systems = [
    ["bx", "BX", "canon"],
    ["ux", "UX", "canon"],
    ["cx", "CX", "canon"],
  ];

  for (const [sub, sys, cat] of systems) {
    const dir = path.join(IMAGES_DIR, "blade", sub);
    const files = (await safeList(dir)).filter((e) => e.dirent.isFile() && isWebp(e.name));
    for (const e of files) {
      const stem = baseName(e.name);
      const name = titleFromFilenameStem(stem);
      out.push({
        id: `${toId(stem)}-${sub}`,
        name,
        short: shortForBlade(name),
        system: sys,
        config: OVERRIDES.bladeConfig?.[stem] ?? "integrated",
        category: "canon",
        path: relFromImages(e.path),
        aliases: [],
      });
    }
  }

  // collabs -> trattate come BX
  {
    const dir = path.join(IMAGES_DIR, "blade", "collabs");
    const files = (await safeList(dir)).filter((e) => e.dirent.isFile() && isWebp(e.name));
    for (const e of files) {
      const stem = baseName(e.name);
      const name = titleFromFilenameStem(stem);
      out.push({
        id: `${toId(stem)}-collab`,
        name,
        short: shortForBlade(name),
        system: "BX",
        config: OVERRIDES.bladeConfig?.[stem] ?? "integrated",
        category: "collab",
        path: relFromImages(e.path),
        aliases: [],
      });
    }
  }

  // xover -> system da override (default BX)
  {
    const dir = path.join(IMAGES_DIR, "blade", "xover");
    const files = (await safeList(dir)).filter((e) => e.dirent.isFile() && isWebp(e.name));
    for (const e of files) {
      const stem = baseName(e.name);
      const name = titleFromFilenameStem(stem);
      const sys = OVERRIDES.xoverSystem?.[stem] ?? "BX";
      out.push({
        id: `${toId(stem)}-xover`,
        name,
        short: shortForBlade(name),
        system: sys,
        config: OVERRIDES.bladeConfig?.[stem] ?? "standard",
        category: "xover",
        path: relFromImages(e.path),
        aliases: [],
      });
    }
  }

  return out;
}

async function collectRachets() {
  const out = [];
  // standard
  {
    const dir = path.join(IMAGES_DIR, "rachet", "standard");
    const files = (await safeList(dir)).filter((e) => e.dirent.isFile() && isWebp(e.name));
    for (const e of files) {
      const stem = baseName(e.name);
      const name = titleFromFilenameStem(stem); // "1-60" preserva il trattino
      out.push({
        id: toId(stem),
        name,
        short: shortForRachet(name, "standard"),
        type: "standard",
        path: relFromImages(e.path),
        aliases: [],
      });
    }
  }
  // integrated (es. Turbo)
  {
    const dir = path.join(IMAGES_DIR, "rachet", "integrated");
    const files = (await safeList(dir)).filter((e) => e.dirent.isFile() && isWebp(e.name));
    for (const e of files) {
      const stem = baseName(e.name);
      const name = titleFromFilenameStem(stem);
      out.push({
        id: toId(stem),
        name,
        short: name, // mai abbreviata
        type: "integrated",
        path: relFromImages(e.path),
        aliases: [],
      });
    }
  }
  return out;
}

async function collectBits() {
  const out = [];
  const dir = path.join(IMAGES_DIR, "bit", "standard");
  const files = (await safeList(dir)).filter((e) => e.dirent.isFile() && isWebp(e.name));
  for (const e of files) {
    const stem = baseName(e.name);
    const name = titleFromFilenameStem(stem);
    out.push({
      id: toId(stem),
      name,
      short: shortForBit(name),
      path: relFromImages(e.path),
      aliases: [],
    });
  }
  return out;
}

async function collectChips() {
  const out = [];
  const dir = path.join(IMAGES_DIR, "blade", "chip");
  const files = (await safeList(dir)).filter((e) => e.dirent.isFile() && isWebp(e.name));
  for (const e of files) {
    const stem = baseName(e.name);
    const base = titleFromFilenameStem(stem);
    out.push({
      id: `${toId(stem)}-chip`,
      name: `${base} Chip`,
      short: shortForChip(stem), // es. "Dran"
      path: relFromImages(e.path),
      aliases: [],
    });
  }
  return out;
}

async function collectAssists() {
  const out = [];
  const dir = path.join(IMAGES_DIR, "blade", "assist");
  const files = (await safeList(dir)).filter((e) => e.dirent.isFile() && isWebp(e.name));
  for (const e of files) {
    const stem = baseName(e.name);
    const base = titleFromFilenameStem(stem);
    out.push({
      id: `${toId(stem)}-assist-blade`,
      name: `${base} Assist Blade`,
      short: shortForAssist(stem), // es. "S"
      path: relFromImages(e.path),
      aliases: [],
    });
  }
  return out;
}

function datasetVersion(parts) {
  const count =
    parts.blade.length +
    parts.rachet.length +
    parts.bit.length +
    parts.chip.length +
    parts.assist.length;
  const today = new Date().toISOString().slice(0, 10);
  return `${today}+${count}`;
}

async function main() {
  const dry = process.argv.includes("--dry-run");

  const parts = {
    blade: await collectBlades(),
    rachet: await collectRachets(),
    bit: await collectBits(),
    chip: await collectChips(),
    assist: await collectAssists(),
  };

  const manifest = {
    schema: 1,
    version: datasetVersion(parts),
    parts,
  };

  if (dry) {
    console.log(
      JSON.stringify(
        {
          summary: {
            blades: parts.blade.length,
            rachets: parts.rachet.length,
            bits: parts.bit.length,
            chips: parts.chip.length,
            assists: parts.assist.length,
          },
        },
        null,
        2
      )
    );
    return;
  }

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
  console.log("Manifest scritto in", path.relative(ROOT, MANIFEST_PATH));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// End-to-end OCR eval: synthetic Indian plates -> preprocessing -> Tesseract -> plate parser.
//
//   node evals/ocr/ocr-eval.mjs            (60 synthetic images, seeded, reproducible)
//   node evals/ocr/ocr-eval.mjs --n 150 --seed 7
//
// Real photos: drop files into evals/ocr/real/ named after the plate, e.g.
// MH01AB1234.jpg (or MH01AB1234_2.jpg). They are scored as a separate set.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import { extractPlate, STATE_CODES } from '../../src/ocr/plateParser.js';
import { binarize } from '../../src/ocr/preprocess.js';
import { readPlate } from '../../src/ocr/pipeline.js';
import { TESS_PARAMS } from '../../src/ocr/ocrConfig.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const argN = process.argv.indexOf('--n');
const N = argN > -1 ? Number(process.argv[argN + 1]) : 60;

// ---------- seeded RNG so every run uses the same images ----------
const argSeed = process.argv.indexOf('--seed');
let seed = argSeed > -1 ? Number(process.argv[argSeed + 1]) : 20251;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = (a) => a[Math.floor(rnd() * a.length)];
const range = (lo, hi) => lo + rnd() * (hi - lo);

// ---------- fonts ----------
const FONT_DIR = '/System/Library/Fonts/Supplemental';
const FONT_FILES = ['DIN Condensed Bold.ttf', 'DIN Alternate Bold.ttf', 'Arial Bold.ttf', 'Verdana Bold.ttf'];
const fonts = [];
for (const f of FONT_FILES) {
  const p = path.join(FONT_DIR, f);
  if (fs.existsSync(p)) {
    const name = f.replace('.ttf', '');
    GlobalFonts.registerFromPath(p, name);
    fonts.push(name);
  }
}
if (!fonts.length) fonts.push('sans-serif');

// ---------- synthetic plates ----------
const STATES = [...STATE_CODES].filter((s) => !['DD', 'DN', 'LD', 'LA', 'OR'].includes(s));
const L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
const randomPlate = () => {
  const series = rnd() < 0.8 ? pick([...L]) + pick([...L]) : pick([...L]);
  const num = String(Math.floor(rnd() * 10000)).padStart(4, '0');
  const dist = String(1 + Math.floor(rnd() * 50)).padStart(2, '0');
  const state = pick(STATES);
  return { plate: state + dist + series + num, parts: [state, dist, series, num] };
};

const TIERS = {
  easy: { rot: 2, noise: 6, blur: 0, contrast: [0.9, 1], twoRow: 0 },
  medium: { rot: 6, noise: 22, blur: 0.6, contrast: [0.65, 0.9], twoRow: 0.25 },
  hard: { rot: 10, noise: 40, blur: 1.2, contrast: [0.45, 0.7], twoRow: 0.35 },
};

function renderPlate({ parts }, tier) {
  const t = TIERS[tier];
  const twoRow = rnd() < t.twoRow;
  const W = 640;
  const H = 360;
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');

  // background "scene": car body colour + gradient
  const g = ctx.createLinearGradient(0, 0, W, H);
  const base = Math.floor(range(40, 200));
  g.addColorStop(0, `rgb(${base},${base},${base + 10})`);
  g.addColorStop(1, `rgb(${base * 0.6},${base * 0.6},${base * 0.7})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(W / 2 + range(-20, 20), H / 2 + range(-15, 15));
  ctx.rotate((range(-t.rot, t.rot) * Math.PI) / 180);
  const pw = twoRow ? 340 : 520;
  const ph = twoRow ? 200 : 120;
  const yellow = rnd() < 0.25; // commercial vehicles
  ctx.fillStyle = yellow ? '#f2c94c' : '#f5f5f2';
  ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#111';
  ctx.strokeRect(-pw / 2 + 6, -ph / 2 + 6, pw - 12, ph - 12);

  const font = pick(fonts);
  ctx.fillStyle = '#111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (twoRow) {
    ctx.font = `76px "${font}"`;
    ctx.fillText(`${parts[0]} ${parts[1]}`, 0, -45);
    ctx.fillText(`${parts[2]} ${parts[3]}`, 0, 48);
  } else {
    ctx.font = `84px "${font}"`;
    ctx.fillText(`${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]}`, 0, 4, pw - 40);
  }
  ctx.restore();

  // lighting / contrast loss, sensor noise, blur
  const img = ctx.getImageData(0, 0, W, H);
  const k = range(...t.contrast);
  const off = (1 - k) * range(60, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    for (let ch = 0; ch < 3; ch += 1) {
      const n = (rnd() - 0.5) * 2 * t.noise;
      img.data[i + ch] = Math.max(0, Math.min(255, img.data[i + ch] * k + off + n));
    }
  }
  ctx.putImageData(img, 0, 0);
  if (t.blur > 0) {
    const b = createCanvas(W, H);
    const bctx = b.getContext('2d');
    bctx.filter = `blur(${t.blur}px)`;
    bctx.drawImage(c, 0, 0);
    return b;
  }
  return c;
}

const toPng = (canvas) => canvas.toBuffer('image/png');
const preprocessed = (canvas) => {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const bin = binarize(img).image;
  const out = createCanvas(canvas.width, canvas.height);
  const octx = out.getContext('2d');
  const id = octx.createImageData(canvas.width, canvas.height);
  id.data.set(bin.data);
  octx.putImageData(id, 0, 0);
  return out;
};
const rgbaToPng = ({ data, width, height }) => {
  const c = createCanvas(width, height);
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(width, height);
  id.data.set(data);
  ctx.putImageData(id, 0, 0);
  return c.toBuffer('image/png');
};
const dumpImages = (tier, items) => {
  const d = path.join(here, 'debug');
  fs.mkdirSync(d, { recursive: true });
  items.forEach((it, i) => {
    fs.writeFileSync(path.join(d, `${tier}_${i}_${it.plate}.png`), toPng(it.canvas));
    fs.writeFileSync(path.join(d, `${tier}_${i}_${it.plate}_bin.png`), toPng(preprocessed(it.canvas)));
  });
};
const rawNormalise = (text) => text.toUpperCase().replace(/[^A-Z0-9]/g, '');

async function scoreSet(worker, items) {
  const r = { sources: {}, n: 0, rawExact: 0, parserOnly: 0, full: 0, fullWrongButConfident: 0, rejected: 0, failures: [] };
  for (const { canvas, plate } of items) {
    r.n += 1;
    const { data: a } = await worker.recognize(toPng(canvas));
    if (rawNormalise(a.text) === plate) r.rawExact += 1;
    if (extractPlate(a.text)?.plate === plate) r.parserOnly += 1;
    const ctx = canvas.getContext('2d');
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const got = await readPlate(rgba, async (img) => (await worker.recognize(rgbaToPng(img))).data.text);
    r.sources[got?.source || 'none'] = (r.sources[got?.source || 'none'] || 0) + 1;
    if (got?.plate === plate) r.full += 1;
    else {
      if (!got) r.rejected += 1;
      else if (got.confidence === 'high') r.fullWrongButConfident += 1;
      if (r.failures.length < 8) r.failures.push({ expected: plate, got: got?.plate ?? null, ocr: (got?.text || a.text).trim().replace(/\n/g, ' / ') });
    }
  }
  return r;
}

const pct = (a, n) => (n ? `${((100 * a) / n).toFixed(1)}%` : '—');

async function main() {
  const worker = await createWorker('eng');
  await worker.setParameters(TESS_PARAMS);

  const tiers = Object.keys(TIERS);
  const results = {};
  for (const tier of tiers) {
    const items = Array.from({ length: Math.ceil(N / tiers.length) }, () => {
      const p = randomPlate();
      return { plate: p.plate, canvas: renderPlate(p, tier) };
    });
    if (tier === 'medium') {
      const sample = path.join(here, 'samples');
      fs.rmSync(sample, { recursive: true, force: true });
      fs.mkdirSync(sample, { recursive: true });
      items.slice(0, 3).forEach((it, i) => fs.writeFileSync(path.join(sample, `${tier}_${i}_${it.plate}.png`), toPng(it.canvas)));
    }
    if (process.env.DUMP) dumpImages(tier, items); // DUMP=1 saves every image + its binarized version for inspection
    results[tier] = await scoreSet(worker, items);
    process.stdout.write(`  ${tier} done\n`);
  }

  const realDir = path.join(here, 'real');
  const realFiles = fs.existsSync(realDir) ? fs.readdirSync(realDir).filter((f) => /\.(jpe?g|png)$/i.test(f)) : [];
  if (realFiles.length) {
    const items = [];
    for (const f of realFiles) {
      const img = await loadImage(path.join(realDir, f));
      const c = createCanvas(img.width, img.height);
      c.getContext('2d').drawImage(img, 0, 0);
      items.push({ plate: f.split(/[_.]/)[0].toUpperCase(), canvas: c });
    }
    results.real = await scoreSet(worker, items);
  }
  await worker.terminate();

  const rows = Object.entries(results).map(([k, r]) => ({
    set: k,
    n: r.n,
    'raw OCR exact': pct(r.rawExact, r.n),
    'OCR + parser': pct(r.parserOnly, r.n),
    'full pipeline': pct(r.full, r.n),
    'no plate found': pct(r.rejected, r.n),
    'wrong but "high" confidence': pct(r.fullWrongButConfident, r.n),
  }));
  console.log('\nColumns: raw OCR on the photo | + plate parser | full app pipeline (plate locate + binarize + OCR + parser)');
  console.table(rows);
  for (const [k, r] of Object.entries(results)) {
    if (r.failures.length) {
      console.log(`\nSample failures (${k}):`);
      r.failures.forEach((f) => console.log(`  expected ${f.expected}  got ${f.got}  ocr="${f.ocr}"`));
    }
  }
  fs.writeFileSync(path.join(here, 'last-run.json'), JSON.stringify({ date: new Date().toISOString(), N, seed: argSeed > -1 ? Number(process.argv[argSeed + 1]) : 20251, results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

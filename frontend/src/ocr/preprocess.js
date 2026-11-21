// Pixel-level clean-up before OCR. Works on any {data, width, height} RGBA
// buffer, so the same code runs in the browser (canvas ImageData) and in the
// Node eval script.

const toGray = ({ data, width, height }) => {
  const g = new Uint8Array(width * height);
  for (let i = 0; i < g.length; i += 1) {
    g[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
  }
  return g;
};

// Otsu's method over a sub-rectangle: threshold that best separates two intensity classes.
const otsu = (gray, width, x0, y0, x1, y1) => {
  const hist = new Array(256).fill(0);
  let n = 0;
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) { hist[gray[y * width + x]] += 1; n += 1; }
  let sum = 0;
  for (let t = 0; t < 256; t += 1) sum += t * hist[t];
  let sumB = 0; let wB = 0; let best = -1; let threshold = 127;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  let dark = 0;
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) if (gray[y * width + x] <= threshold) dark += 1;
  return { threshold, darkShare: dark / n };
};

const toRgba = (mask, width, height) => {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < mask.length; i += 1) {
    const v = mask[i] ? 0 : 255; // mask=1 → ink (black)
    out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v; out[i * 4 + 3] = 255;
  }
  return { data: out, width, height };
};

/**
 * Binarize so characters are black on white. Threshold and polarity are
 * decided from the centre of the frame (where the guard aims at the plate),
 * not the whole photo, so a dark car body doesn't flip the result.
 * Returns { image, ink } where ink[i] = 1 for character pixels.
 */
export function binarize(img) {
  const { width, height } = img;
  const gray = toGray(img);
  const x0 = Math.floor(width * 0.2); const x1 = Math.ceil(width * 0.8);
  const y0 = Math.floor(height * 0.3); const y1 = Math.ceil(height * 0.7);
  const { threshold, darkShare } = otsu(gray, width, x0, y0, x1, y1);
  // On a plate the background dominates the characters; if "dark" dominates the
  // centre, the plate is light-text-on-dark and we flip polarity.
  const darkIsInk = darkShare < 0.5;
  const ink = new Uint8Array(width * height);
  for (let i = 0; i < ink.length; i += 1) ink[i] = (gray[i] <= threshold) === darkIsInk ? 1 : 0;
  return { image: toRgba(ink, width, height), ink };
}

/**
 * Find the plate: the connected background-coloured region that contains the
 * centre of the frame. Returns a crop box slightly inset to drop the border,
 * or null if nothing plate-like is found.
 */
export function locatePlate(ink, width, height) {
  // seed: nearest background pixel to the centre
  const cx = Math.floor(width / 2); const cy = Math.floor(height / 2);
  let seed = -1;
  for (let r = 0; r < Math.min(width, height) / 4 && seed < 0; r += 1) {
    for (let dx = -r; dx <= r && seed < 0; dx += 1) {
      for (const dy of [-r, r]) {
        const x = cx + dx; const y = cy + dy;
        if (x >= 0 && y >= 0 && x < width && y < height && !ink[y * width + x]) { seed = y * width + x; break; }
      }
    }
  }
  if (seed < 0) return null;

  const seen = new Uint8Array(width * height);
  const stack = [seed];
  seen[seed] = 1;
  let minX = width; let minY = height; let maxX = 0; let maxY = 0; let count = 0;
  while (stack.length) {
    const p = stack.pop();
    const x = p % width; const y = (p - x) / width;
    count += 1;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (x > 0 && !seen[p - 1] && !ink[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
    if (x < width - 1 && !seen[p + 1] && !ink[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
    if (y > 0 && !seen[p - width] && !ink[p - width]) { seen[p - width] = 1; stack.push(p - width); }
    if (y < height - 1 && !seen[p + width] && !ink[p + width]) { seen[p + width] = 1; stack.push(p + width); }
  }

  const w = maxX - minX + 1; const h = maxY - minY + 1;
  // Region leaked into the whole frame, or is a tiny blob: not a plate.
  if (w * h > 0.92 * width * height || w < width * 0.2 || h < height * 0.1 || count < 0.05 * width * height) return null;
  const inset = Math.round(Math.min(w, h) * 0.04);
  return { x: minX + inset, y: minY + inset, w: Math.max(1, w - 2 * inset), h: Math.max(1, h - 2 * inset) };
}

export function crop({ data, width }, { x, y, w, h }, pad = 12) {
  const W = w + 2 * pad; const H = h + 2 * pad;
  const out = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let r = 0; r < h; r += 1) {
    const src = ((y + r) * width + x) * 4;
    out.set(data.subarray(src, src + w * 4), ((r + pad) * W + pad) * 4);
  }
  return { data: out, width: W, height: H };
}

/** Images to try with OCR, best guess first. */
export function candidateImages(img) {
  const { image, ink } = binarize(img);
  const box = locatePlate(ink, img.width, img.height);
  const list = [];
  if (box) list.push({ name: 'plate-crop', image: crop(image, box) });
  list.push({ name: 'binarized', image });
  list.push({ name: 'original', image: img });
  return list;
}

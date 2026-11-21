import { candidateImages } from './preprocess.js';
import { extractPlate } from './plateParser.js';

/**
 * Full plate-reading pipeline, independent of where it runs.
 * @param {{data, width, height}} rgba  the photo
 * @param {(img) => Promise<string>} recognize  runs OCR on an RGBA image, returns text
 */
export async function readPlate(rgba, recognize) {
  const rank = { high: 3, medium: 2, low: 1 };
  let best = null;
  for (const { name, image } of candidateImages(rgba)) {
    const text = await recognize(image);
    const r = extractPlate(text);
    if (r && (!best || rank[r.confidence] > rank[best.confidence])) best = { ...r, text, source: name };
    if (best && best.confidence === 'high') break; // good enough, skip slower fallbacks
  }
  return best;
}

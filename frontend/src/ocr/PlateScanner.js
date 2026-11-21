import { useEffect, useRef, useState } from 'react';
import { readPlate } from './pipeline';
import { TESS_PARAMS } from './ocrConfig';
import './PlateScanner.css';

// Load an image File into an RGBA buffer, downscaling huge phone photos.
async function fileToRgba(file, maxWidth = 1400) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function rgbaToCanvas({ data, width, height }) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(width, height);
  id.data.set(data);
  ctx.putImageData(id, 0, 0);
  return c;
}

const CONFIDENCE_TEXT = {
  high: 'Read clearly',
  medium: 'Some characters were corrected — please check',
  low: 'Low confidence — please check carefully',
};

/**
 * Camera / upload → number plate. Calls onDetected(plate) when the guard
 * accepts the reading. OCR runs entirely in the browser (Tesseract.js), so no
 * photo ever leaves the guard's phone.
 */
export default function PlateScanner({ onDetected }) {
  const [status, setStatus] = useState('idle'); // idle | loading | reading | done | failed
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const workerRef = useRef(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => () => {
    if (workerRef.current) workerRef.current.terminate();
  }, []);

  const getWorker = async () => {
    if (workerRef.current) return workerRef.current;
    setStatus('loading');
    // Loaded on first use so the main bundle stays small.
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, {
      logger: (m) => m.status === 'recognizing text' && setProgress(Math.round(m.progress * 100)),
    });
    await worker.setParameters(TESS_PARAMS);
    workerRef.current = worker;
    return worker;
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setResult(null);
    setPreview(URL.createObjectURL(file));
    try {
      const worker = await getWorker();
      setStatus('reading');
      setProgress(0);
      const rgba = await fileToRgba(file);
      const r = await readPlate(rgba, async (img) => (await worker.recognize(rgbaToCanvas(img))).data.text);
      setResult(r);
      setStatus(r ? 'done' : 'failed');
    } catch (err) {
      console.error('Plate OCR failed:', err);
      setStatus('failed');
    }
  };

  const busy = status === 'loading' || status === 'reading';

  return (
    <div className="plate-scanner">
      <label className={`scan-btn ${busy ? 'disabled' : ''}`}>
        📷 {busy ? 'Reading plate…' : 'Scan number plate'}
        {/* capture="environment" opens the rear camera on phones; desktop gets a file picker */}
        <input type="file" accept="image/*" capture="environment" onChange={handleFile} disabled={busy} hidden />
      </label>

      {preview && <img className="scan-preview" src={preview} alt="Captured number plate" />}

      {status === 'loading' && <p className="scan-msg">Loading OCR engine (first scan only)…</p>}
      {status === 'reading' && <p className="scan-msg">Reading… {progress}%</p>}

      {status === 'done' && result && (
        <div className={`scan-result ${result.confidence}`}>
          <div className="scan-plate">{result.plate}</div>
          <p className="scan-msg">{CONFIDENCE_TEXT[result.confidence]}</p>
          <button type="button" className="scan-use" onClick={() => onDetected(result.plate)}>
            Use this plate
          </button>
        </div>
      )}

      {status === 'failed' && (
        <p className="scan-msg error">
          Couldn't read a plate. Fill the frame with the plate, avoid glare, and try again — or type it in.
        </p>
      )}
    </div>
  );
}

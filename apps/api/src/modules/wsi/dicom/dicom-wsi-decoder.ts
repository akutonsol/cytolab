import { deflateSync } from 'node:zlib';
import * as dcmjs from 'dcmjs';

/**
 * Program 5C · C2 — the DICOM WSI DECODER. The C2 profile is the probe-proven one and NOTHING wider:
 * VL Whole Slide Microscopy Image Storage · uncompressed (Implicit/Explicit VR Little Endian) · RGB ·
 * 8-bit · TILED_FULL · a single optical path. Any other profile (compressed JPEG/JPEG2000/JPEG-LS,
 * non-RGB, multi-optical-path, sparse tiling) is truthfully UNSUPPORTED — never flattened or guessed.
 *
 * It reconstructs the TotalPixelMatrix deterministically from the DICOM frame geometry + TILED_FULL ordering
 * and emits a libvips-readable PNG working file. The tiling engine is never taught DICOM; it just receives
 * the reconstructed working image via the existing workingFilePath contract.
 */
const UNCOMPRESSED_TS = new Set(['1.2.840.10008.1.2', '1.2.840.10008.1.2.1']);

export interface DecodeProfileReason {
  code: 'COMPRESSED_UNSUPPORTED' | 'PHOTOMETRIC_UNSUPPORTED' | 'BIT_DEPTH_UNSUPPORTED' | 'TILING_UNSUPPORTED' | 'MULTI_OPTICAL_PATH_UNSUPPORTED' | 'GEOMETRY_INCOMPLETE';
  message: string;
  actual?: string;
}
export interface DecodeProfileAssessment {
  supported: boolean;
  reasons: DecodeProfileReason[];
}

/** Non-retryable: the DICOM object is conformant but outside the C2 decode profile (no slide is created). */
export class UnsupportedDicomProfileError extends Error {
  constructor(public readonly reasons: DecodeProfileReason[]) {
    super(`unsupported DICOM decode profile: ${reasons.map((r) => r.code).join(', ')}`);
    this.name = 'UnsupportedDicomProfileError';
  }
}

interface DecodeCtx {
  ts: string;
  photometric: string;
  samples: number;
  bits: number;
  planar: number;
  dimOrg: string;
  opticalPathCount: number;
  frameRows: number;
  frameCols: number;
  totalCols: number;
  totalRows: number;
  numberOfFrames: number;
  pixel: Buffer;
}

function ctxFromBytes(bytes: Buffer): DecodeCtx {
  const dm = dcmjs.data.DicomMessage.readFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const ds = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dm.dict) as Record<string, unknown>;
  const meta = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dm.meta) as Record<string, unknown>;
  const pd = ds.PixelData;
  // Defensive: a compressed/encapsulated object has no plain pixel buffer. Never throw here — assess() rejects
  // the unsupported profile (e.g. COMPRESSED_UNSUPPORTED) truthfully before the pixel buffer is ever used.
  let pixel = Buffer.alloc(0);
  try { pixel = Buffer.from(Array.isArray(pd) ? (pd[0] as ArrayBuffer) : (pd as ArrayBuffer)); } catch { /* leave empty */ }
  const ops = ds.OpticalPathSequence as unknown[] | undefined;
  const n = (v: unknown, d = 0): number => (typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : d);
  return {
    ts: String(meta.TransferSyntaxUID ?? ''),
    photometric: String(ds.PhotometricInterpretation ?? ''),
    samples: n(ds.SamplesPerPixel),
    bits: n(ds.BitsAllocated),
    planar: n(ds.PlanarConfiguration),
    dimOrg: String(ds.DimensionOrganizationType ?? ''),
    opticalPathCount: Array.isArray(ops) ? ops.length : 0,
    frameRows: n(ds.Rows),
    frameCols: n(ds.Columns),
    totalCols: n(ds.TotalPixelMatrixColumns),
    totalRows: n(ds.TotalPixelMatrixRows),
    numberOfFrames: n(ds.NumberOfFrames),
    pixel,
  };
}

function assess(c: DecodeCtx): DecodeProfileReason[] {
  const reasons: DecodeProfileReason[] = [];
  if (!UNCOMPRESSED_TS.has(c.ts)) reasons.push({ code: 'COMPRESSED_UNSUPPORTED', actual: c.ts, message: 'only uncompressed (Little Endian) pixel data is supported in C2' });
  if (c.photometric !== 'RGB' || c.samples !== 3) reasons.push({ code: 'PHOTOMETRIC_UNSUPPORTED', actual: `${c.photometric}/${c.samples}`, message: 'only 3-sample RGB is supported in C2' });
  if (c.bits !== 8) reasons.push({ code: 'BIT_DEPTH_UNSUPPORTED', actual: String(c.bits), message: 'only 8-bit pixels are supported in C2' });
  if (c.dimOrg !== 'TILED_FULL') reasons.push({ code: 'TILING_UNSUPPORTED', actual: c.dimOrg, message: 'only TILED_FULL frame organization is supported in C2' });
  if (c.opticalPathCount > 1) reasons.push({ code: 'MULTI_OPTICAL_PATH_UNSUPPORTED', actual: String(c.opticalPathCount), message: 'only a single optical path is supported in C2' });
  if (!(c.frameRows > 0 && c.frameCols > 0 && c.totalCols > 0 && c.totalRows > 0 && c.numberOfFrames > 0)) {
    reasons.push({ code: 'GEOMETRY_INCOMPLETE', message: 'frame/total-pixel-matrix geometry is incomplete' });
  }
  return reasons;
}

/** Assess (without decoding) whether the object is inside the C2 decode profile. */
export function assessDecodeProfile(bytes: Buffer): DecodeProfileAssessment {
  const reasons = assess(ctxFromBytes(bytes));
  return { supported: reasons.length === 0, reasons };
}

/** Reconstruct the TotalPixelMatrix (TILED_FULL, row-major) and encode a libvips-readable PNG. Throws for an
 *  unsupported profile so no unsupported input ever reaches the tiling engine. */
export function decodeDicomWsiToPng(bytes: Buffer): Buffer {
  const c = ctxFromBytes(bytes);
  const reasons = assess(c);
  if (reasons.length) throw new UnsupportedDicomProfileError(reasons);

  const perRow = Math.ceil(c.totalCols / c.frameCols);
  const canvas = Buffer.alloc(c.totalCols * c.totalRows * 3);
  const frameStride = c.frameCols * c.frameRows * 3;
  for (let f = 0; f < c.numberOfFrames; f++) {
    const tileCol = f % perRow;
    const tileRow = Math.floor(f / perRow);
    const originX = tileCol * c.frameCols;
    const originY = tileRow * c.frameRows;
    if (originX >= c.totalCols || originY >= c.totalRows) continue; // padding frame past the matrix edge
    const frame = c.pixel.subarray(f * frameStride, (f + 1) * frameStride);
    const copyCols = Math.min(c.frameCols, c.totalCols - originX);
    const copyRows = Math.min(c.frameRows, c.totalRows - originY);
    for (let y = 0; y < copyRows; y++) {
      const src = y * c.frameCols * 3;
      const dst = ((originY + y) * c.totalCols + originX) * 3;
      frame.copy(canvas, dst, src, src + copyCols * 3);
    }
  }
  return encodePngRGB(c.totalCols, c.totalRows, canvas);
}

/** Minimal dependency-free PNG (RGB, no filter) — a real image the deployed libvips reads + tiles. */
function encodePngRGB(w: number, h: number, rgb: Buffer): Buffer {
  const tab: number[] = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tab[n] = c >>> 0; }
  const crc = (b: Buffer) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = tab[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length, 0); const tb = Buffer.from(t, 'ascii'); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(Buffer.concat([tb, d])), 0); return Buffer.concat([l, tb, d, cc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) { const o = y * (1 + w * 3); rows[o] = 0; rgb.copy(rows, o + 1, y * w * 3, (y + 1) * w * 3); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

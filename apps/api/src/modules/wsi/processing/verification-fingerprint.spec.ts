import {
  buildCertifiedSurface,
  CertifiedSurfaceAsset,
  CertifiedSurfaceInput,
  fingerprintCertifiedSurface,
} from './verification-fingerprint';

function baseInput(): CertifiedSurfaceInput {
  return {
    generationId: 'gen-1',
    slideId: 'slide-1',
    jobId: 'job-1',
    ingestionId: 'ing-1',
    sealed: true,
    tileSourceType: 'DZI',
    derivativeManifestChecksum: 'a'.repeat(64),
    tiledWidth: 300,
    tiledHeight: 150,
    tileSize: 256,
    levelCount: 2,
    sourceObjectKey: 'slides/l/s/source/i/image.svs',
    sourceChecksum: 'b'.repeat(64),
  };
}
function baseAssets(): CertifiedSurfaceAsset[] {
  return [
    { role: 'TILE_PYRAMID', storageKey: 'slides/l/s/derivatives/gen-1/pyramid', checksum: null, sizeBytes: 18 },
    { role: 'DZI_DESCRIPTOR', storageKey: 'slides/l/s/derivatives/gen-1/dzi_descriptor', checksum: 'c'.repeat(64), sizeBytes: 40 },
    { role: 'MANIFEST', storageKey: 'slides/l/s/derivatives/gen-1/manifest.json', checksum: 'd'.repeat(64), sizeBytes: 700 },
  ];
}
const fp = (input: CertifiedSurfaceInput, assets: CertifiedSurfaceAsset[]) => fingerprintCertifiedSurface(buildCertifiedSurface(input, assets));

describe('verification-fingerprint (P5-3B.3B-ii-a)', () => {
  it('is deterministic and a 64-hex sha256', () => {
    const a = fp(baseInput(), baseAssets());
    const b = fp(baseInput(), baseAssets());
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is independent of the input asset order (registry is canonically sorted)', () => {
    const shuffled = [baseAssets()[2], baseAssets()[0], baseAssets()[1]];
    expect(fp(baseInput(), shuffled)).toBe(fp(baseInput(), baseAssets()));
  });

  it('changes when ANY covered scalar field changes', () => {
    const base = fp(baseInput(), baseAssets());
    const mutate = (fn: (i: CertifiedSurfaceInput) => void): string => {
      const i = baseInput();
      fn(i);
      return fp(i, baseAssets());
    };
    expect(mutate((i) => (i.generationId = 'gen-2'))).not.toBe(base);
    expect(mutate((i) => (i.slideId = 'slide-2'))).not.toBe(base);
    expect(mutate((i) => (i.jobId = 'job-2'))).not.toBe(base);
    expect(mutate((i) => (i.ingestionId = 'ing-2'))).not.toBe(base);
    expect(mutate((i) => (i.sealed = false))).not.toBe(base);
    expect(mutate((i) => (i.tileSourceType = 'IMAGE'))).not.toBe(base);
    expect(mutate((i) => (i.derivativeManifestChecksum = 'f'.repeat(64)))).not.toBe(base);
    expect(mutate((i) => (i.tiledWidth = 301))).not.toBe(base);
    expect(mutate((i) => (i.tiledHeight = 151))).not.toBe(base);
    expect(mutate((i) => (i.tileSize = 512))).not.toBe(base);
    expect(mutate((i) => (i.levelCount = 3))).not.toBe(base);
    expect(mutate((i) => (i.sourceObjectKey = 'other'))).not.toBe(base);
    expect(mutate((i) => (i.sourceChecksum = '0'.repeat(64)))).not.toBe(base);
  });

  it('changes when ANY asset field changes (role, key, checksum, size)', () => {
    const base = fp(baseInput(), baseAssets());
    const mutate = (fn: (a: CertifiedSurfaceAsset[]) => void): string => {
      const a = baseAssets();
      fn(a);
      return fp(baseInput(), a);
    };
    expect(mutate((a) => (a[0].role = 'THUMBNAIL'))).not.toBe(base);
    expect(mutate((a) => (a[0].storageKey = 'moved'))).not.toBe(base);
    expect(mutate((a) => (a[1].checksum = '1'.repeat(64)))).not.toBe(base);
    expect(mutate((a) => (a[0].sizeBytes = 19))).not.toBe(base);
    expect(mutate((a) => a.pop())).not.toBe(base); // dropped asset
    expect(mutate((a) => a.push({ role: 'LABEL', storageKey: 'slides/l/s/derivatives/gen-1/label', checksum: 'e'.repeat(64), sizeBytes: 5 }))).not.toBe(base); // extra asset
  });

  it('null vs empty-string in nullable fields are distinct', () => {
    const withNull = fp({ ...baseInput(), sourceChecksum: null }, baseAssets());
    const withEmpty = fp({ ...baseInput(), sourceChecksum: '' }, baseAssets());
    expect(withNull).not.toBe(withEmpty);
  });
});

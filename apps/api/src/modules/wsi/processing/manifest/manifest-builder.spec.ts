import { buildManifest, ManifestInput } from './manifest-builder';
import { MANIFEST_SCHEMA_ID } from './manifest';

function baseInput(): ManifestInput {
  return {
    generationId: 'gen-1',
    slideId: 'slide-1',
    ingestionId: 'ing-1',
    sourceObjectKey: 'slides/l/s/source/i/image.svs',
    sourceChecksum: 'a'.repeat(64),
    engineName: 'fake-tiling-engine',
    engineVersion: '1.0.0',
    processingConfig: { configVersion: 1, tileSize: 256, overlap: 1, tileFormat: 'jpeg', quality: 90, pyramidLayout: 'dzi', associatedImages: true, thumbnail: true },
    structure: { tiledWidth: 300, tiledHeight: 150, tileSize: 256, overlap: 1, tileFormat: 'jpeg', levelCount: 2 },
    acquisition: { sourceWidth: 300, sourceHeight: 150, objectivePower: 40, mpp: 0.25, vendor: 'FakeScanner' },
    assets: [
      { role: 'TILE_PYRAMID', storageKey: 'slides/l/s/derivatives/gen-1/pyramid', checksum: null, sizeBytes: 20, objectCount: 3 },
      { role: 'DZI_DESCRIPTOR', storageKey: 'slides/l/s/derivatives/gen-1/dzi_descriptor', checksum: 'b'.repeat(64), sizeBytes: 10 },
    ],
    levels: [
      { level: 1, cols: 2, rows: 1, tileCount: 2, tileDigest: 'd'.repeat(64) },
      { level: 0, cols: 1, rows: 1, tileCount: 1, tileDigest: 'c'.repeat(64) },
    ],
  };
}

describe('buildManifest (P5-3B.2A)', () => {
  it('is deterministic: identical input → identical bytes + checksum', () => {
    const a = buildManifest(baseInput());
    const b = buildManifest(baseInput());
    expect(a.bytes.equals(b.bytes)).toBe(true);
    expect(a.checksum).toBe(b.checksum);
    expect(a.manifest.schemaId).toBe(MANIFEST_SCHEMA_ID);
  });

  it('sorts assets by (role, key) and levels by level; excludes any MANIFEST asset', () => {
    const input = baseInput();
    input.assets.push({ role: 'MANIFEST', storageKey: 'slides/l/s/derivatives/gen-1/manifest.json', checksum: 'e'.repeat(64), sizeBytes: 5 });
    const { manifest } = buildManifest(input);
    expect(manifest.assets.map((a) => a.role)).toEqual(['DZI_DESCRIPTOR', 'TILE_PYRAMID']); // sorted, no MANIFEST
    expect(manifest.levels.map((l) => l.level)).toEqual([0, 1]); // sorted
  });

  it('checksum changes when ANY hashed field changes', () => {
    const base = buildManifest(baseInput()).checksum;
    const mutate = (fn: (i: ManifestInput) => void): string => {
      const i = baseInput();
      fn(i);
      return buildManifest(i).checksum;
    };
    expect(mutate((i) => (i.generationId = 'gen-2'))).not.toBe(base);
    expect(mutate((i) => (i.sourceChecksum = 'f'.repeat(64)))).not.toBe(base);
    expect(mutate((i) => (i.engineVersion = '2.0.0'))).not.toBe(base);
    expect(mutate((i) => (i.processingConfig.tileSize = 512))).not.toBe(base);
    expect(mutate((i) => (i.structure.levelCount = 3))).not.toBe(base);
    expect(mutate((i) => (i.acquisition.mpp = 0.5))).not.toBe(base);
    expect(mutate((i) => (i.assets[1].checksum = '0'.repeat(64)))).not.toBe(base);
    expect(mutate((i) => (i.levels[0].tileDigest = '1'.repeat(64)))).not.toBe(base);
  });
});

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { FakeTilingEngine } from './fake-tiling-engine';
import { TilingEngineError } from './tiling-engine';
import { loadTilingConfig } from './tiling-config';
import { validateTilingOutput } from './tiling-output-validator';

const cfg = loadTilingConfig({} as any);
const input = (outputDirectory: string) => ({
  workingFilePath: '/dev/null',
  outputDirectory,
  config: cfg,
  abortSignal: new AbortController().signal,
});

async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  async function walk(rel: string) {
    for (const e of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
      const childRel = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) await walk(childRel);
      else out[childRel] = await fs.readFile(path.join(dir, childRel), 'utf8');
    }
  }
  await walk('');
  return out;
}

describe('FakeTilingEngine (P5-3B.1C)', () => {
  let d1: string;
  let d2: string;
  beforeEach(async () => {
    d1 = await fs.mkdtemp(path.join(os.tmpdir(), 'fake-eng-1-'));
    d2 = await fs.mkdtemp(path.join(os.tmpdir(), 'fake-eng-2-'));
  });
  afterEach(async () => {
    await fs.rm(d1, { recursive: true, force: true });
    await fs.rm(d2, { recursive: true, force: true });
  });

  it('produces deterministic, byte-identical output across runs', async () => {
    const eng = new FakeTilingEngine();
    const r1 = await eng.tile(input(d1));
    const r2 = await eng.tile(input(d2));
    expect(await snapshot(d1)).toEqual(await snapshot(d2));
    expect(r1.structure).toEqual(r2.structure);
    expect(r1.assets).toEqual(r2.assets);
  });

  it('produces valid output that passes the output validator', async () => {
    const result = await new FakeTilingEngine('none').tile(input(d1));
    await expect(validateTilingOutput(result, d1)).resolves.toBeUndefined();
  });

  it('maps in-engine failures to typed error codes', async () => {
    await expect(new FakeTilingEngine('crash').tile(input(d1))).rejects.toMatchObject({ code: 'ENGINE_CRASH' });
    await expect(new FakeTilingEngine('unsupported-format').tile(input(d2))).rejects.toBeInstanceOf(TilingEngineError);
  });
});

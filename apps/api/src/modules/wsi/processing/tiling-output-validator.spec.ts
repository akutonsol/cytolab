import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { FakeCorruption, FakeTilingEngine } from './fake-tiling-engine';
import { loadTilingConfig } from './tiling-config';
import { InvalidEngineOutputError, validateTilingOutput } from './tiling-output-validator';

const cfg = loadTilingConfig({} as any);

/** Run the fake engine with a given corruption into a fresh dir, returning {result, dir}. */
async function produce(corruption: FakeCorruption) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'validate-'));
  const result = await new FakeTilingEngine(corruption).tile({
    workingFilePath: '/dev/null',
    outputDirectory: dir,
    config: cfg,
    abortSignal: new AbortController().signal,
  });
  return { result, dir };
}

describe('validateTilingOutput (P5-3B.1C — untrusted engine output)', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    while (dirs.length) await fs.rm(dirs.pop()!, { recursive: true, force: true });
  });

  it('accepts well-formed output', async () => {
    const { result, dir } = await produce('none');
    dirs.push(dir);
    await expect(validateTilingOutput(result, dir)).resolves.toBeUndefined();
  });

  const badCases: FakeCorruption[] = [
    'no-descriptor',
    'duplicate-descriptor', // (surfaces as a missing/extra descriptor path; still rejected)
    'descriptor-outside-root',
    'bad-level-count',
    'missing-tile-dir',
    'duplicate-role',
    'unsafe-relative-path',
  ];

  it.each(badCases)('rejects corrupted output: %s', async (corruption) => {
    const { result, dir } = await produce(corruption);
    dirs.push(dir);
    await expect(validateTilingOutput(result, dir)).rejects.toBeInstanceOf(InvalidEngineOutputError);
  });
});

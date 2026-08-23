/**
 * Pre-downloads the catalog's recommended on-device model into the demo profile.
 *
 * Uses the exact call the app's own ModelManager.download() makes
 * (`resolveModelFile` from node-llama-cpp, same `hf:` URI from
 * resources/models.catalog.json, same `<userData>/models/<id>.gguf` filename),
 * so the app sees a genuinely installed model rather than something hand-placed.
 * It runs ahead of the recording only so the capture is not twenty minutes of a
 * progress bar.
 */
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ID = 'qwen2.5-1.5b-instruct-q4';
const profileDir = join('C:', 'Users', 'Public', 'tepegoz-demo');
const modelsDir = join(profileDir, 'models');
const target = join(modelsDir, `${ID}.gguf`);

const catalog = JSON.parse(
  readFileSync(resolve('apps/desktop/resources/models.catalog.json'), 'utf8'),
);
const entry = catalog.models.find((m) => m.id === ID);
if (!entry) throw new Error(`no catalog entry for ${ID}`);

if (existsSync(target)) {
  console.log('already present:', target, (statSync(target).size / 1e9).toFixed(2), 'GB');
  process.exit(0);
}

mkdirSync(modelsDir, { recursive: true });
console.log('downloading', entry.uri, '→', target);

const { resolveModelFile } = await import('node-llama-cpp');

let lastPct = -5;
await resolveModelFile(entry.uri, {
  directory: modelsDir,
  fileName: `${ID}.gguf`,
  cli: false,
  onProgress: ({ totalSize, downloadedSize }) => {
    if (!totalSize) return;
    const pct = Math.floor((downloadedSize / totalSize) * 100);
    if (pct >= lastPct + 5) {
      lastPct = pct;
      console.log(`  ${pct}%  ${(downloadedSize / 1e9).toFixed(2)}/${(totalSize / 1e9).toFixed(2)} GB`);
    }
  },
});

console.log('done:', (statSync(target).size / 1e9).toFixed(2), 'GB');

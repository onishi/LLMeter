import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const input = readFileSync(0, 'utf8');
const collectorPath = fileURLToPath(new URL('./claude-statusline.mjs', import.meta.url));
const existingStatusLine = '/Users/onishi/.claude/statusline3.sh';

const existing = spawnSync(existingStatusLine, [], {
  input,
  encoding: 'utf8',
  timeout: 2_000,
});
const llmeter = spawnSync(process.execPath, [collectorPath], {
  input,
  encoding: 'utf8',
  timeout: 2_000,
});

const lines = [existing.stdout, llmeter.stdout]
  .map((value) => value?.trim())
  .filter(Boolean);

process.stdout.write(lines.join('\n'));

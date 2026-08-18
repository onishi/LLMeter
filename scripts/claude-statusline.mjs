import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getStateDirectory } from '../src/state.mjs';

const cachePath = join(getStateDirectory(), 'claude-usage.json');

function toEpochSeconds(value) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric > 10_000_000_000 ? Math.round(numeric / 1000) : Math.round(numeric);
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.round(timestamp / 1000) : null;
}

function snapshot(value) {
  const usedPercent = Number(value?.used_percentage);
  if (!Number.isFinite(usedPercent)) return null;
  return {
    usedPercent: Math.min(100, Math.max(0, Math.round(usedPercent))),
    resetsAt: toEpochSeconds(value?.resets_at),
  };
}

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.stdout.write('LLMeter: Claude quota unavailable');
  process.exit(0);
}

const fiveHour = snapshot(input?.rate_limits?.five_hour);
const sevenDay = snapshot(input?.rate_limits?.seven_day);
const sevenDaySonnet = snapshot(input?.rate_limits?.seven_day_sonnet);
const sevenDayOpus = snapshot(input?.rate_limits?.seven_day_opus);
const rateLimits = { fiveHour, sevenDay, sevenDaySonnet, sevenDayOpus };

if (Object.values(rateLimits).some(Boolean)) {
  mkdirSync(dirname(cachePath), { recursive: true });
  const temporaryPath = `${cachePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), rateLimits }, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporaryPath, cachePath);
}

const parts = [];
if (fiveHour) parts.push(`5h ${100 - fiveHour.usedPercent}% left`);
if (sevenDay) parts.push(`7d ${100 - sevenDay.usedPercent}% left`);
process.stdout.write(parts.length ? `Claude · ${parts.join(' · ')}` : 'LLMeter: Claude quota pending');

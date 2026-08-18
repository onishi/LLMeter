import { collectClaude } from './providers/claude.mjs';
import { collectCodex } from './providers/codex.mjs';
import { collectGitHub } from './providers/github.mjs';

export const defaultProviders = [collectClaude, collectCodex, collectGitHub];

export async function collectUsage({ providers = defaultProviders, now = () => new Date(), ...options } = {}) {
  const services = await Promise.all(providers.map(async (provider) => provider({ now, ...options })));
  return {
    version: 1,
    updatedAt: now().toISOString(),
    services,
  };
}

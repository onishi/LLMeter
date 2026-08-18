#!/usr/bin/env node

import { runCli } from '../src/cli.mjs';

try {
  const exitCode = await runCli(process.argv.slice(2));
  process.exitCode = exitCode;
} catch (error) {
  process.stderr.write(`llmeter: ${error instanceof Error ? error.message : 'unexpected error'}\n`);
  process.exitCode = 1;
}

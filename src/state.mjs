import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

export function getStateDirectory(environment = process.env) {
  if (environment.LLMETER_STATE_DIR) {
    return isAbsolute(environment.LLMETER_STATE_DIR)
      ? environment.LLMETER_STATE_DIR
      : resolve(environment.LLMETER_STATE_DIR);
  }
  const root = environment.XDG_STATE_HOME || join(homedir(), '.local', 'state');
  return join(root, 'llmeter');
}

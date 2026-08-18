import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getStateDirectory } from './state.mjs';

function cacheUpdatedAt(path) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'))?.updatedAt;
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function refreshClaudeUsage({
  environment = process.env,
  platform = process.platform,
  spawnCommand = spawn,
  timeoutMs = 25_000,
} = {}) {
  if (platform !== 'darwin') {
    return Promise.resolve({ ok: false, message: 'Claudeの自動更新は現在macOSに対応しています。' });
  }

  const cachePath = join(getStateDirectory(environment), 'claude-usage.json');
  const previousUpdatedAt = cacheUpdatedAt(cachePath);
  const expectScript = `
log_user 0
set timeout 12
spawn -noecho claude
expect {
  -re "Try" {}
  timeout { exit 2 }
  eof { exit 1 }
}
send -- "/usage\\r"
expect {
  -re "Current" {}
  timeout { exit 3 }
  eof { exit 1 }
}
after 1000
send -- "\\033"
after 2000
send -- "\\003\\003"
expect eof
`;

  return new Promise((resolve) => {
    let child;
    let settled = false;
    let timer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    try {
      child = spawnCommand('expect', ['-c', expectScript], {
        stdio: 'ignore',
        env: environment,
      });
    } catch {
      resolve({ ok: false, message: 'Claude CLI用の疑似端末を起動できませんでした。' });
      return;
    }

    child.on('error', () => finish({ ok: false, message: 'Claude CLIを起動できませんでした。' }));
    child.on('exit', (code) => {
      const updatedAt = cacheUpdatedAt(cachePath);
      if (code === 0 && updatedAt && updatedAt !== previousUpdatedAt) {
        finish({ ok: true, updatedAt });
      } else {
        finish({ ok: false, message: 'Claudeの利用枠を更新できませんでした。' });
      }
    });
    timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish({ ok: false, message: 'Claudeの利用枠更新がタイムアウトしました。' });
    }, timeoutMs);
  });
}

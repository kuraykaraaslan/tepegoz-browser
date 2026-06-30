// Dev launcher: guarantees Electron starts as a real GUI app even if ELECTRON_RUN_AS_NODE is set
// in the environment (some sandboxes/CI/agent shells set it, which makes Electron behave as plain
// Node — no window, and `require('electron')` returns a path string instead of the API).
import { spawn } from 'node:child_process';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn('electron-vite', ['dev'], { stdio: 'inherit', shell: true, env });
child.on('exit', (code) => {
  process.exit(code ?? 0);
});

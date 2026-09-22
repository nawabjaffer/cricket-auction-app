import { spawn } from 'node:child_process';
import { startScriptTimer } from './scriptTiming.mjs';

const command = process.argv[2];
const args = process.argv.slice(3);

if (!command) {
  console.error('Usage: node scripts/run-with-timing.mjs <command> [args...]');
  process.exit(2);
}

const label = [command, ...args].join(' ');
startScriptTimer(`command: ${label}`);

const child = spawn(command, args, {
  stdio: 'inherit',
  shell: false,
});

child.on('error', (error) => {
  console.error(`[command: ${label}] failed to start: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});

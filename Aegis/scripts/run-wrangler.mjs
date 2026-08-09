#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;

if (!token) {
  console.error([
    'Missing CLOUDFLARE_API_TOKEN.',
    '',
    'Create a Cloudflare API token with Workers edit permissions, then run:',
    '  PowerShell: $env:CLOUDFLARE_API_TOKEN="your-token"',
    '  Bash:       export CLOUDFLARE_API_TOKEN="your-token"',
    '',
    'This wrapper intentionally fails without a token so Wrangler does not fall back to OAuth.',
  ].join('\n'));
  process.exit(1);
}

const env = {
  ...process.env,
  CLOUDFLARE_API_TOKEN: token,
  NODE_OPTIONS: appendNodeOption(process.env.NODE_OPTIONS, '--use-system-ca'),
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workerDir = resolve(scriptDir, '..', 'worker');
const wranglerBin = resolve(scriptDir, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const child = spawn(process.execPath, [wranglerBin, ...args], {
  cwd: workerDir,
  env,
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

function appendNodeOption(current, option) {
  const parts = (current || '').split(/\s+/).filter(Boolean);
  if (!parts.includes(option)) parts.push(option);
  return parts.join(' ');
}

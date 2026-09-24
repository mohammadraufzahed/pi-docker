import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const source = readFileSync(new URL('../extensions/index.ts', import.meta.url), 'utf8');
const registeredTools = [...source.matchAll(/name:\s*"([^"]+)"/g)].map((match) => match[1]);

assert.deepEqual(registeredTools, [
  'docker_ps',
  'docker_logs',
  'docker_stats',
  'docker_inspect',
  'docker_exec',
]);

assert.match(source, /function assertReadOnlyCommand/);
assert.match(source, /docker_exec only allows observational commands/);

console.log('smoke ok');

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

// env is a command launcher ('env rm -rf ...' has no shell metacharacters),
// so it must stay out of the allowlist; printenv can't launch and stays.
const allowlistBlock = source.match(/READ_ONLY_COMMANDS = new Set\(\[([\s\S]*?)\]\)/);
assert.ok(allowlistBlock, 'READ_ONLY_COMMANDS set not found');
const allowlist = [...allowlistBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
assert.ok(!allowlist.includes('env'), "'env' must not be in READ_ONLY_COMMANDS (launcher bypass)");
assert.ok(allowlist.includes('printenv'), "'printenv' should remain in READ_ONLY_COMMANDS");

console.log('smoke ok');

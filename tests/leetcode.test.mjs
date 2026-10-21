import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExecution, validateExecution } from '../src/execution-config.js';
import { wrapLeetCode } from '../scripts/leetcode.mjs';

const config = (options = {}) => ({ mode: 'leetcode', method: 'solve', arguments: '[]', nodes: 'none', ...options });

test('legacy drafts and ordinary C++ keep the main-program mode', () => {
  assert.equal(normalizeExecution().mode, 'program');
  const source = 'int main() { return 0; }';
  assert.equal(wrapLeetCode(source), source);
});

test('LeetCode JSON arguments accept common shapes and reject ambiguous or unsafe data', () => {
  validateExecution(config({ arguments: '[[1,2],[["a","b"]],true,null,3.5,"文本"]' }));
  for (const args of ['{broken', '{}', '[{"name":1}]', '[9007199254740993]', '[1e999]']) {
    assert.throws(() => validateExecution(config({ arguments: args })));
  }
  assert.throws(() => validateExecution(config({ arguments: JSON.stringify(Array(17).fill(1)) })), /16/);
  assert.throws(() => validateExecution(config({ method: 'solve();' })), /方法名/);
  assert.throws(() => validateExecution(config({ nodes: 'unknown' })), /节点定义/);
  assert.throws(() => validateExecution(config({ arguments: '['.repeat(35) + '0' + ']'.repeat(35) })), /32/);
});

test('generated entry preserves the original instrumentation and safely encodes string bytes', () => {
  const original = '#line 1 "main.cpp"\nclass Solution {};';
  const wrapped = wrapLeetCode(original, config({ arguments: '["\\u0000\\"\\n😀"]', nodes: 'both' }));
  assert.ok(wrapped.includes(original));
  assert.match(wrapped, /#line 1 "leetcode-entry.cpp"/);
  assert.match(wrapped, /&Solution::solve/);
  assert.match(wrapped, /DEFINE_LIST_NODE/);
  assert.match(wrapped, /DEFINE_TREE_NODE/);
  assert.match(wrapped, /\\x00\\x22\\x0a\\xf0\\x9f\\x98\\x80/);
});

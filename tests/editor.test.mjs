import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultWatch, validateWatches } from '../src/watch-config.js';
import { EDITOR_SAMPLES, rebaseWatches } from '../src/editor-samples.js';
import { instrument } from '../scripts/instrument.mjs';

const array = (options = {}) => ({ ...defaultWatch('array'), id: 'a', expression: 'a', count: 'a.size()', line: 3, ...options });

test('all editor examples have valid explicit watch configurations', () => {
  for (const sample of EDITOR_SAMPLES.filter(s => s.watches.length)) {
    validateWatches(sample.watches, sample.source.split('\n').length);
    assert.doesNotMatch(sample.source, /viz::|VIZ_STEP/);
  }
});

test('capture lines follow insertions and deletions above them', () => {
  const before = 'one\ntwo\nthree\nfour';
  assert.equal(rebaseWatches([array()], before, '// new\n' + before)[0].line, 4);
  assert.equal(rebaseWatches([array()], before, 'two\nthree\nfour')[0].line, 2);
  assert.equal(rebaseWatches([array()], before, before + '\nfive')[0].line, 3);
});

test('deleting the watched statement requires review instead of silently moving it', () => {
  const result = rebaseWatches([array()], 'one\ntwo\nthree\nfour', 'one\ntwo\nfour')[0];
  assert.equal(result.needsReview, true);
  assert.equal(result.line, 3);
  assert.equal(rebaseWatches([array()], 'one\ntwo\nthree', 'one\ntwo\nthree + 1')[0].needsReview, undefined);
});

test('watch validation rejects unusable configurations', () => {
  assert.throws(() => validateWatches([], 10), /1–12/);
  assert.throws(() => validateWatches([array(), array()], 10), /重复/);
  assert.throws(() => validateWatches([array({ line: 11 })], 10), /范围/);
  validateWatches([array({ count: '' })], 10);
  assert.throws(() => validateWatches([array({ expression: 'a\nb' })], 10), /一行/);
  assert.throws(() => validateWatches([{ ...defaultWatch('tree'), id: 't', expression: 'root', line: 1, left: 'left()' }], 10), /成员名/);
  assert.throws(() => validateWatches([{ ...defaultWatch(), id: 'm', expression: 'dp', line: 1, activeRow: 'i' }], 10), /一起/);
});

test('instrumentation groups same-line watches and restores original diagnostics line numbers', () => {
  const source = '#include <vector>\nint main() {\nstd::vector<int> a{1};\na[0]++;\n}';
  const code = instrument(source, [array(), array({ id: 'b', expression: 'a', line: 3 })]);
  assert.equal((code.match(/session\(\)\.step\(/g) || []).length, 1);
  assert.equal((code.match(/session\(\)\.capture</g) || []).length, 2);
  assert.match(code, /#line 4 "main.cpp"\na\[0\]\+\+;/);
  assert.match(code, /std::vector<int> a\{1\};\n\{ try/);
  assert.match(code, /#line 1 "watch_a"/);
  assert.equal(source.split('\n').length, 5);
});

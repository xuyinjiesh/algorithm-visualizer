import test from 'node:test';
import assert from 'node:assert/strict';
import { captureLines, mutationLines, identifierAt, watchColor } from '../src/watch-strategy.js';
import { instrument } from '../scripts/instrument.mjs';
import { defaultWatch } from '../src/watch-config.js';
import { rebaseWatches } from '../src/editor-samples.js';

const source = `int a = 99;
int main() {
  std::vector<int> a{1, 2};
  a[0] += 2;
  a.push_back(3);
  // a.clear();
  cout << "a.pop_back();";
  auto b = a[0];
  a[1]++;
  std::sort(a.begin(), a.end());
  if (ready)
    a.clear();
}`;
const watch = { ...defaultWatch('array'), id: 'a', expression: 'a', line: 3, strategy: 'changes' };

test('automatic capture detects initialization, indexed assignments, increments and container mutations', () => {
  assert.deepEqual(mutationLines(source, 'a'), [3, 4, 5, 9, 10]);
  assert.deepEqual(captureLines(source, { ...watch, strategy: 'line', line: 8 }), [8]);
  assert.deepEqual(mutationLines(source, 'aa'), []);
});

test('all capture sites share a variable ID and report their own source lines', () => {
  const code = instrument(source, [watch]);
  assert.equal((code.match(/session\(\)\.capture</g) || []).length, 5);
  for (const line of [3, 4, 5, 9, 10]) assert.ok(code.includes(`"a", "a", "array", ${line},`));
  assert.throws(() => instrument(source, [{ ...watch, expression: 'missing' }]), /没有可安全采集/);
});

test('automatic sites recompute after edits and do not require manual line review', () => {
  const updated = '// inserted\n' + source;
  const [rebased] = rebaseWatches([watch], source, updated);
  assert.equal(rebased.needsReview, false);
  assert.deepEqual(captureLines(updated, rebased), [4, 5, 6, 10, 11]);
});

test('identifier targeting ignores comments and strings and colors survive watch removal', () => {
  assert.equal(identifierAt(source, source.indexOf('a[0]')), 'a');
  assert.equal(identifierAt(source, source.indexOf('a.clear')), '');
  assert.equal(identifierAt(source, source.indexOf('a.pop')), '');
  const colored = { ...watch, color: '#70cfff' };
  assert.equal(watchColor(colored, [colored]), '#70cfff');
});

test('ordinary scalar watches generate a single-cell view', () => {
  const code = instrument('int main() {\nint n = 1;\nn++;\n}', [{ ...defaultWatch('scalar'), id: 'n', expression: 'n', line: 2, strategy: 'changes' }]);
  assert.equal((code.match(/capture<viz::MatrixBuilder>/g) || []).length, 2);
  assert.match(code, /viz::str\(\(n\)\)/);
});

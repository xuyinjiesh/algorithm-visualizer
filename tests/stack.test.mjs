import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTrace, serializeTrace, validateTrace, changedItems } from '../src/trace.js';
import { defaultWatch, validateWatches } from '../src/watch-config.js';
import { instrument } from '../scripts/instrument.mjs';
import { captureLines } from '../src/watch-strategy.js';

const stack = () => ({ id: 's', name: 'stack', kind: 'stack', columns: ['first', 'second'], items: [
  [{ text: 'false' }, { text: '7', nodeId: 'node-a' }],
  [{ text: 'true' }, { text: 'nullptr', nodeId: null }],
] });
const records = s => [{ type: 'header', version: 1, title: 'Stack' }, { type: 'frame', seq: 0, label: 'Capture', structures: [s] }];

test('stack traces round-trip pointer identity, pair members, order and empty state', () => {
  for (const s of [stack(), { ...stack(), items: [] }]) {
    const trace = validateTrace(records(s));
    assert.deepEqual(parseTrace(serializeTrace(trace)), trace);
  }
  const invalid = [
    { ...stack(), columns: [] }, { ...stack(), items: [[{ text: 'true' }]] },
    { ...stack(), items: [[{ text: true }, { text: '7' }]] },
    { ...stack(), items: [[{ text: 'true' }, { text: '7', nodeId: 7 }]] },
    { ...stack(), items: Array(1001).fill(stack().items[0]) },
  ];
  for (const s of invalid) assert.throws(() => validateTrace(records(s)), /栈/);
});

test('stack differences detect pointer changes with equal values and keep bottom indices stable', () => {
  const before = stack(), after = structuredClone(before);
  after.items[0][1].nodeId = 'node-b';
  assert.deepEqual([...changedItems(after, before)], ['item:0:1']);
  after.items[0][0].text = 'true';
  assert.ok(changedItems(after, before).has('item:0:0'));
  const pushed = { ...before, items: [...before.items, [{ text: 'false' }, { text: '2', nodeId: 'node-c' }]] };
  assert.deepEqual([...changedItems(pushed, before)], ['item:2:0', 'item:2:1']);
  assert.equal(changedItems(before, pushed).size, 0);
});

test('stack watches support explicit captures and automatic push/pop/top mutations', () => {
  const source = 'void run() {\nstd::stack<int> stack;\nstack.push(1);\nstack.top() = 2;\nstack.pop();\n}';
  const watch = { ...defaultWatch('stack'), id: 's', expression: 'stack', line: 3, strategy: 'changes' };
  validateWatches([watch], 6);
  assert.deepEqual(captureLines(source, watch), [3, 4, 5]);
  const generated = instrument(source, [watch]);
  assert.match(generated, /capture<structure_lab_editor::StackBuilder>/);
  assert.throws(() => validateWatches([{ ...watch, valueField: 'val; delete p' }], 6), /成员名/);
});

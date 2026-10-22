import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { runCode, execute } from '../scripts/runner.mjs';
import { defaultWatch } from '../src/watch-config.js';
import { EDITOR_SAMPLES } from '../src/editor-samples.js';
import { parseTrace } from '../src/trace.js';

const watch = (kind, expression, line, options = {}) => ({ ...defaultWatch(kind), id: expression, expression, line, ...options });
const run = async input => {
  const result = await runCode(input);
  return { ...result, parsed: parseTrace(result.trace) };
};
const named = (frame, name) => frame.structures.find(s => s.name === name);

test('editor examples compile and capture simultaneous structures from actual execution', async () => {
  const expected = { bfs: 7, dp: 30, tree: 7, list: 5, 'leetcode-array': 3, 'leetcode-list': 5, 'leetcode-stack': 10 };
  for (const sample of EDITOR_SAMPLES.filter(s => s.watches.length)) {
    const { parsed, stdout } = await run(sample);
    assert.equal(parsed.header.source.code, sample.source);
    assert.equal(parsed.frames.length, expected[sample.id]);
    for (const frame of parsed.frames) {
      assert.equal(frame.structures.length, sample.watches.length);
      for (const s of frame.structures) {
        assert.equal(s.capturedSeq, frame.seq);
        assert.equal(s.capturedLine, frame.source.line);
      }
    }
    const last = parsed.frames.at(-1);
    if (sample.id === 'bfs') {
      assert.deepEqual(named(last, 'dist').values[0], ['0', '1', '1', '2', '2', '2', '3', '-1']);
      assert.equal(named(last, 'adj').nodes.length, 8); // The isolated node remains visible.
    }
    if (sample.id === 'dp') {
      assert.equal(named(last, 'dp').values[4][5], '126');
      assert.match(stdout, /126/);
    }
    if (sample.id === 'tree') assert.deepEqual(named(last, 'order').values[0], ['2', '4', '6', '8', '10', '12', '14']);
    if (sample.id === 'list') {
      assert.equal(named(last, 'curr').nodes.length, 0);
      assert.equal(named(last, 'prev').nodes.length, 5);
      assert.equal(stdout.trim(), '50 40 30 20 10');
    }
    if (sample.id === 'leetcode-array') {
      assert.deepEqual(named(last, 'nums').values[0], ['1', '3', '6', '10']);
      assert.match(stdout, /返回值: \[1,3,6,10\]/);
    }
    if (sample.id === 'leetcode-list') {
      assert.equal(named(last, 'head').nodes.length, 0);
      assert.equal(named(last, 'prev').nodes.length, 5);
      assert.match(stdout, /返回值: \[50,40,30,20,10\]/);
    }
    if (sample.id === 'leetcode-stack') {
      assert.deepEqual(named(last, 'stack').items, []);
      assert.deepEqual(named(last, 'ans').values[0], ['1', '3', '2']);
      assert.match(stdout, /返回值: \[1,3,2\]/);
      const first = parsed.frames[0];
      const root = named(first, 'root');
      assert.equal(named(first, 'stack').items[1][1].nodeId, root.root);
    }
  }
});

test('stack pair snapshots preserve boolean, nulls, duplicate-valued pointer identity and the original stack', async () => {
  const source = `#include <stack>
#include <cassert>
struct Node { int val; };
int main() {
    Node a{7}, b{7};
    std::stack<std::pair<bool, Node*>> stack;
    for (int step = 0; step < 6; ++step) {
        if (step == 0) stack.push({false, &a});
        if (step == 1) stack.push({true, &b});
        if (step == 2) stack.top().first = false;
        if (step == 3) stack.push({false, nullptr});
        if (step == 4) { stack.pop(); stack.pop(); }
        if (step == 5) stack.pop();
        int expected = step == 0 || step == 4 ? 1 : step == 5 ? 0 : step == 3 ? 3 : 2;
        assert(stack.size() == expected);
        if (step == 4) assert(stack.top().second == &a && !stack.top().first);
    }
}`;
  const { parsed } = await run({ source, watches: [watch('stack', 'stack', 14)] });
  const snapshots = parsed.frames.map(frame => named(frame, 'stack').items);
  assert.deepEqual(snapshots.map(items => items.length), [1, 2, 2, 3, 1, 0]);
  assert.deepEqual(snapshots[1].map(item => item.map(cell => cell.text)), [['false', '7'], ['true', '7']]);
  assert.notEqual(snapshots[1][0][1].nodeId, snapshots[1][1][1].nodeId);
  assert.equal(snapshots[2][1][0].text, 'false');
  assert.deepEqual(snapshots[3][2][1], { text: 'nullptr', nodeId: null });
  assert.deepEqual(snapshots[4][0], snapshots[0][0]);
});

test('stack adapters support scalar, pair and node elements with alternate containers and fields', async () => {
  const source = `#include <stack>
struct Node { int value; };
int main() {
    Node n{42};
    std::stack<int, std::vector<int>> numbers;
    std::stack<std::pair<bool, std::string>> pairs;
    std::stack<Node*> nodes;
    std::stack<bool, std::vector<bool>> bits;
    numbers.push(1); numbers.push(2);
    pairs.push({true, "hello"});
    nodes.push(&n);
    bits.push(true);
    int snapshot = 0;
}`;
  const line = source.split('\n').findIndex(text => text.includes('int snapshot')) + 1;
  const { parsed } = await run({ source, watches: [
    watch('stack', 'numbers', line), watch('stack', 'pairs', line), watch('stack', 'nodes', line, { valueField: 'value' }), watch('stack', 'bits', line),
  ] });
  const frame = parsed.frames[0];
  assert.deepEqual(named(frame, 'numbers').items.map(item => item[0].text), ['1', '2']);
  assert.deepEqual(named(frame, 'pairs').items, [[{ text: 'true' }, { text: 'hello' }]]);
  assert.equal(named(frame, 'nodes').items[0][0].text, '42');
  assert.equal(named(frame, 'bits').items[0][0].text, 'true');
});

test('automatic stack capture includes top member writes and rejects oversized stacks clearly', async () => {
  const source = `int main() {
    std::stack<std::pair<bool, int>> stack;
    stack.push({false, 1});
    stack.top().first = true;
    stack.pop();
}`;
  const { parsed } = await run({ source, watches: [watch('stack', 'stack', 3, { strategy: 'changes' })] });
  assert.deepEqual(parsed.frames.map(f => f.source.line), [3, 4, 5]);
  assert.equal(parsed.frames[1].structures[0].items[0][0].text, 'true');
  assert.deepEqual(parsed.frames[2].structures[0].items, []);
  const large = 'int main() {\nstd::stack<int> s(std::deque<int>(1001));\nint snapshot = 0;\n}';
  await assert.rejects(runCode({ source: large, watches: [watch('stack', 's', 3)] }),
    error => error.phase === 'run' && /Stack exceeds 1000/.test(error.diagnostics));
});

test('modified source and stdin determine the captured result', async () => {
  const source = '#include <iostream>\nint main() {\nint a[1] = {};\nstd::cin >> a[0];\na[0] *= 3;\nstd::cout << a[0];\n}';
  const config = { source, watches: [watch('array', 'a', 5, { count: '1' })], stdin: '7\n' };
  const result = await run(config);
  assert.equal(result.stdout, '21');
  assert.equal(result.parsed.frames[0].structures[0].values[0][0], '21');
  const changed = await run({ ...config, source: source.replace('*= 3', '*= 4') });
  assert.equal(changed.stdout, '28');
});

test('watches on different lines retain snapshots with explicit capture provenance', async () => {
  const source = 'int main() {\nint a[1] = {1};\n{\nint b[1] = {2};\n}\na[0] = 3;\n}';
  const { parsed } = await run({ source, watches: [
    watch('array', 'b', 4, { count: '1' }),
    watch('array', 'a', 6, { count: '1' }),
  ] });
  assert.equal(parsed.frames.length, 2);
  assert.equal(parsed.frames[0].structures.length, 1);
  const b = named(parsed.frames[1], 'b');
  assert.equal(b.capturedSeq, 0);
  assert.equal(b.capturedLine, 4);
  assert.deepEqual(b.values, [['2']]);
  assert.equal(named(parsed.frames[1], 'a').capturedSeq, 1);
});

test('graph mappings preserve isolated nodes, parallel edges, weights and alternate member names', async () => {
  const source = `#include <vector>
#include <utility>
int main() {
    int matrix[3][3] = {{-1, 0, -1}, {-1, -1, 4}, {-1, -1, -1}};
    int head[3] = {0, 2, -1}, to[3] = {1, 1, 2}, nxt[3] = {1, -1, -1}, weight[3] = {0, 3, 4};
    std::vector<std::vector<std::pair<int,int>>> pairs = {{{1,0}, {1,3}}, {{2,4}}, {}};
    struct Edge { int dest, cost; };
    std::vector<std::vector<Edge>> fields = {{{1,0}, {1,3}}, {{2,4}}, {}};
    int marker = 0;
}`;
  const watches = [
    watch('graph_matrix', 'matrix', 9, { count: '3', absent: '-1' }),
    watch('forward_star', 'head', 9, { count: '3', edgeCount: '3' }),
    watch('adjacency', 'pairs', 9, { count: '3', entry: 'pair' }),
    watch('adjacency', 'fields', 9, { count: '3', entry: 'fields', toField: 'dest', weightField: 'cost' }),
  ];
  const { parsed } = await run({ source, watches });
  const frame = parsed.frames[0];
  assert.equal(named(frame, 'matrix').edges.length, 2);
  assert.equal(String(named(frame, 'matrix').edges[0].weight), '0');
  for (const name of ['head', 'pairs', 'fields']) {
    const s = named(frame, name);
    assert.equal(s.nodes.length, 3);
    assert.equal(s.edges.length, 3);
    assert.deepEqual(s.edges.map(e => String(e.weight)).sort(), ['0', '3', '4']);
  }
});

test('empty arrays and a forward-star graph without edges are valid', async () => {
  const source = '#include <vector>\nint main() {\nstd::vector<int> empty;\nint head[2] = {-1,-1};\n}';
  const { parsed } = await run({ source, watches: [
    watch('array', 'empty', 4, { count: '0' }),
    watch('forward_star', 'head', 4, { to: 'empty', next: 'empty', weight: '', count: '2', edgeCount: '0' }),
  ] });
  assert.deepEqual(named(parsed.frames[0], 'empty').values, [[]]);
  assert.equal(named(parsed.frames[0], 'head').nodes.length, 2);
  assert.equal(named(parsed.frames[0], 'head').edges.length, 0);
});

test('compile errors, unreachable captures and invalid dimensions are reported by phase', async () => {
  const source = 'int main() {\nint a[1] = {};\na[0] = 1;\n}';
  const watches = [watch('array', 'a', 3, { count: '1' })];
  await assert.rejects(runCode({ source: source.replace('a[0] = 1', 'a[0] = unknown'), watches }),
    error => error.phase === 'compile' && /main.cpp.*3/.test(error.diagnostics) && !error.diagnostics.includes('\uFFFD'));
  await assert.rejects(runCode({ source: 'int main() {\nif (false) {\nint a[1] = {};\n}\n}', watches }),
    error => error.phase === 'trace' && /没有执行到采集行/.test(error.message));
  await assert.rejects(runCode({ source, watches: [watch('array', 'a', 3, { count: '2' })] }),
    error => error.phase === 'run' && /container bounds/.test(error.diagnostics));
});

test('blank dimensions infer vector and C-array sizes, including empty matrices and graphs', async () => {
  const source = `#include <vector>
int main() {
    std::vector<int> values{1,2,3};
    int fixed[2] = {4,5};
    std::vector<std::vector<int>> empty;
    int grid[2][3] = {{1,2,3},{4,5,6}};
    std::vector<std::vector<int>> adj{{1},{0}};
    int matrix[2][2] = {{0,1},{1,0}};
    int checkpoint = 0;
}`;
  const { parsed } = await run({ source, watches: [
    watch('array', 'values', 9), watch('array', 'fixed', 9),
    watch('matrix', 'empty', 9), watch('matrix', 'grid', 9),
    watch('adjacency', 'adj', 9), watch('graph_matrix', 'matrix', 9, { absent: '0' }),
  ] });
  const frame = parsed.frames[0];
  assert.deepEqual(named(frame, 'values').values, [['1', '2', '3']]);
  assert.deepEqual(named(frame, 'fixed').values, [['4', '5']]);
  assert.deepEqual(named(frame, 'empty').values, []);
  assert.deepEqual(named(frame, 'grid').values, [['1', '2', '3'], ['4', '5', '6']]);
  assert.equal(named(frame, 'adj').nodes.length, 2);
  assert.equal(named(frame, 'matrix').edges.length, 2);
});

test('infinite programs time out and process cancellation terminates execution', async () => {
  const jobs = new URL('../build/runs/', import.meta.url);
  const before = (await readdir(jobs).catch(() => [])).sort();
  await assert.rejects(runCode({
    source: 'int main() {\nint a[1] = {};\nwhile (true) {}\n}',
    watches: [watch('array', 'a', 2, { count: '1' })], timeoutMs: 150,
  }), error => error.phase === 'run' && /超时/.test(error.message));
  const controller = new AbortController();
  const running = execute(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { signal: controller.signal });
  const timer = setTimeout(() => controller.abort(), 150);
  try { await assert.rejects(running, error => error.phase === 'cancelled'); }
  finally { clearTimeout(timer); }
  await assert.rejects(execute(process.execPath, ['-e', 'process.stdout.write("x".repeat(2 * 1024 * 1024));']), /输出超过/);
  assert.deepEqual((await readdir(jobs)).sort(), before);
});

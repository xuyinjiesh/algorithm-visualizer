import test from 'node:test';
import assert from 'node:assert/strict';
import { runCode } from '../scripts/runner.mjs';
import { defaultWatch } from '../src/watch-config.js';
import { parseTrace } from '../src/trace.js';

const entry = (method, args, nodes = 'none') => ({ mode: 'leetcode', method, arguments: JSON.stringify(args), nodes });
const watch = (source, expression, kind, marker, options = {}) => ({
  ...defaultWatch(kind), id: expression, expression, line: source.split('\n').findIndex(line => line.includes(marker)) + 1, ...options,
});
const run = async (source, execution, watches) => {
  const result = await runCode({ source, execution, watches });
  return { ...result, parsed: parseTrace(result.trace) };
};

test('method signature converts vectors, matrices, references, strings, chars, booleans and numbers', async () => {
  const source = `class Solution {
public:
    vector<int> solve(vector<int>& nums, const vector<vector<int>>& grid, int n, bool add, char c, const string& text, double d) const {
        nums[0] += grid[0][1] + (add ? n : 0) + c + int(text.size()) + int(d);
        return nums;
    }
};`;
  const watches = [watch(source, 'nums', 'array', 'nums[0] +=', { count: 'nums.size()' })];
  const result = await run(source, entry('solve', [[2], [[3, 4]], 5, true, 'A', '你好', 1.5]), watches);
  assert.match(result.stdout, /返回值: \[83\]/);
  assert.equal(result.parsed.header.source.code, source);
  assert.equal(result.parsed.frames[0].source.line, 4);
  assert.equal(result.parsed.frames[0].structures[0].values[0][0], '83');
});

test('void methods expose mutated reference parameters and vector<bool> is supported', async () => {
  const source = `class Solution {
public:
    void solve(vector<vector<int>>& grid, vector<bool>& bits) {
        grid[0][0] = 9;
        bits[0] = !bits[0];
    }
};`;
  const watches = [watch(source, 'grid', 'matrix', 'bits[0] =', { rows: 'grid.size()', cols: 'grid[0].size()' })];
  const result = await run(source, entry('solve', [[[1, 2]], [false, true]]), watches);
  assert.match(result.stdout, /返回值: void/);
  assert.match(result.stdout, /参数（调用后）: \[\[\[9,2\]\],\[true,true\]\]/);
});

test('string results preserve NUL, quotes, newlines and UTF-8; static noexcept methods work', async () => {
  const source = `class Solution {
public:
    static string solve(string text) noexcept {
        vector<int> lengths{int(text.size())};
        return text;
    }
};`;
  const text = '\0"\n😀';
  const result = await run(source, entry('solve', [text]), [watch(source, 'lengths', 'array', 'vector<int>', { count: '1' })]);
  assert.equal(JSON.parse(result.stdout.split('返回值: ')[1]), text);
  assert.equal(result.parsed.frames[0].structures[0].values[0][0], '7');
});

test('TreeNode input and return use level order and keep null positions', async () => {
  const source = `class Solution {
public:
    TreeNode* solve(TreeNode* root) {
        if (root) {
            root->val += 10;
        }
        return root;
    }
};`;
  const result = await run(source, entry('solve', [[1, null, 2, 3]], 'tree'), [
    watch(source, 'root', 'tree', 'root->val +=', { valueField: 'val' }),
  ]);
  assert.match(result.stdout, /返回值: \[11,null,2,3\]/);
  assert.equal(result.parsed.frames[0].structures[0].nodes.length, 3);
});

test('custom node definitions and empty node inputs do not need injected definitions', async () => {
  const source = `struct ListNode {
    int val; ListNode* next;
    ListNode(int x) : val(x), next(nullptr) {}
};
class Solution {
public:
    ListNode* solve(ListNode* head) {
        ListNode* result = head;
        return result;
    }
};`;
  const watches = [watch(source, 'result', 'list', 'ListNode* result =', { valueField: 'val' })];
  for (const input of [null, [], [2, 4]]) {
    const result = await run(source, entry('solve', [input]), watches);
    assert.deepEqual(JSON.parse(result.stdout.split('返回值: ')[1]), input || []);
  }
});

test('zero-argument methods work, and invalid count/types fail clearly before invocation', async () => {
  const source = `class Solution {
public:
    int solve() {
        vector<int> data{42};
        return data[0];
    }
};`;
  const watches = [watch(source, 'data', 'array', 'vector<int>', { count: '1' })];
  const result = await run(source, entry('solve', []), watches);
  assert.match(result.stdout, /返回值: 42/);
  await assert.rejects(run(source, entry('solve', [1]), watches),
    error => error.phase === 'run' && /Argument count/.test(error.diagnostics));
  const typed = source.replace('int solve()', 'int solve(int n)');
  await assert.rejects(run(typed, entry('solve', [1.5]), watches),
    error => error.phase === 'run' && /fractional/.test(error.diagnostics));
  await assert.rejects(run(typed, entry('solve', ['1']), watches),
    error => error.phase === 'run' && /JSON number/.test(error.diagnostics));
});

test('snippet compilation diagnostics still refer to the original source line', async () => {
  const source = `class Solution {
public:
    int solve() {
        vector<int> data{missing};
        return 0;
    }
};`;
  await assert.rejects(run(source, entry('solve', []), [watch(source, 'data', 'array', 'vector<int>', { count: '1' })]),
    error => error.phase === 'compile' && /main.cpp.*4/.test(error.diagnostics));
});

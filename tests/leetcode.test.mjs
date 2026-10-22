import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExecution, validateExecution } from '../src/execution-config.js';
import { wrapLeetCode } from '../scripts/leetcode.mjs';
import { analyzeLeetCode } from '../src/leetcode-analysis.js';

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

test('automatic entry follows the sole public method and ignores constructors, helpers and initializers', () => {
  const source = `class Solution {
    int hidden(int x) { return x; }
  public:
    Solution() : cache(make()) {}
    ~Solution() {}
    vector<int> cache = vector<int>(3);
    function<int(int)> callback = [](int x) { return x; };
    struct Helper { int nested() { return 1; } };
    [[nodiscard]] static vector<int> solve(vector<int>& nums) noexcept { return nums; }
  protected:
    int make() { return 1; }
  };`;
  assert.deepEqual(analyzeLeetCode(source).methods, ['solve']);
  const automatic = { mode: 'leetcode' };
  assert.equal(validateExecution(automatic, source).method, 'solve');
  assert.equal(validateExecution(automatic, source.replace(' solve(', ' renamed(')).method, 'renamed');
  assert.equal(automatic.method, undefined, 'auto detection must not pin the saved method');
  assert.deepEqual(analyzeLeetCode('struct Solution { int solve(); }; int Solution::solve() { return 1; }').methods, ['solve']);
});

test('multiple, missing and overloaded methods require an unambiguous entry', () => {
  const source = 'class Solution { public: int first() { return 1; } int second() { return 2; } };';
  assert.throws(() => validateExecution({ mode: 'leetcode' }, source), /多个 public 方法/);
  assert.equal(validateExecution(config({ method: 'second' }), source).method, 'second');
  assert.throws(() => validateExecution({ mode: 'leetcode' }, 'class Solution { int hidden(); };'), /未识别/);
  assert.throws(() => validateExecution(config({ method: 'solve' }), 'class Solution { public: int solve(); private: int solve(int); };'), /重载/);
  assert.deepEqual(analyzeLeetCode('class Solution { public: template<class T> T helper(T x) { return x; } int solve() { return 1; } };').methods, ['solve']);
});

test('comments, strings, raw literals and macro text do not create methods or node definitions', () => {
  const source = `// class Solution { public: void fake(); };
  /* struct ListNode { int val; }; */
  #define EXAMPLE class Solution { public: void macro(); }
  const char* text = "struct ListNode { int val; }; class Solution { public: void fake(); };";
  const char* raw = R"tag(class Solution { public: void fake(); }; struct TreeNode {}; )tag";
  class Solution { public: ListNode* solve(ListNode* head) { return head; } };`;
  const analysis = analyzeLeetCode(source);
  assert.deepEqual(analysis.methods, ['solve']);
  assert.deepEqual(analysis.missingNodes, ['ListNode']);
  assert.deepEqual(analysis.definedNodes, []);
  assert.equal(validateExecution({ mode: 'leetcode' }, source).nodes, 'list');
});

test('automatic node definitions are selective and respect real definitions and aliases', () => {
  const source = 'class Solution { public: TreeNode* solve(ListNode* head, TreeNode* root) { return root; } };';
  const automatic = { mode: 'leetcode' };
  assert.equal(validateExecution(automatic, source).nodes, 'both');
  assert.equal(validateExecution(automatic, 'struct TreeNode; ' + source).nodes, 'both');
  for (const definition of ['struct TreeNode { int val; };', 'class TreeNode final { public: int val; };', 'using TreeNode = CustomTree;', 'typedef CustomTree TreeNode;', 'typedef struct T { int val; } TreeNode;']) {
    assert.equal(validateExecution(automatic, definition + source).nodes, 'list', definition);
    const wrapped = wrapLeetCode(definition + source, config({ nodes: 'both' }));
    assert.doesNotMatch(wrapped, /DEFINE_TREE_NODE/);
    assert.match(wrapped, /DEFINE_LIST_NODE/);
  }
  assert.equal(validateExecution({ ...automatic, nodes: 'none' }, source).nodes, 'none');
  assert.equal(validateExecution(automatic, 'class Solution { public: int solve() { return 1; } };').nodes, 'none');
});

import { defaultWatch } from './watch-config.js';

const lineOf = (source, text) => source.split('\n').findIndex(line => line.includes(text)) + 1;
const watch = (source, expression, kind, marker, options = {}) => ({
  ...defaultWatch(kind), id: `watch_${expression}`, expression, line: lineOf(source, marker), ...options,
});

const bfs = `#include <iostream>
#include <vector>
#include <queue>
using namespace std;

int main() {
    vector<vector<int>> adj = {
        {1, 2}, {3, 4}, {4, 5}, {6}, {6}, {6}, {}, {}
    };
    int n = static_cast<int>(adj.size());
    vector<int> dist(n, -1);
    queue<int> q;
    dist[0] = 0;
    q.push(0);
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        for (int v : adj[u]) {
            if (dist[v] == -1) {
                dist[v] = dist[u] + 1;
                q.push(v);
            }
        }
        cout << "处理节点 " << u << "\\n";
    }
    return 0;
}
`;
const dp = `#include <iostream>
using namespace std;

int main() {
    const int rows = 5, cols = 6;
    int dp[rows][cols] = {};
    int rowSum[rows] = {};
    for (int i = 0; i < rows; ++i) {
        for (int j = 0; j < cols; ++j) {
            dp[i][j] = (i == 0 || j == 0)
                ? 1 : dp[i - 1][j] + dp[i][j - 1];
            rowSum[i] += dp[i][j];
        }
    }
    cout << "不同路径: " << dp[rows - 1][cols - 1] << "\\n";
    return 0;
}
`;
const tree = `#include <iostream>
#include <vector>
#include <functional>
using namespace std;

struct Node {
    int value;
    Node* left = nullptr;
    Node* right = nullptr;
};

int main() {
    Node nodes[] = {{8}, {4}, {12}, {2}, {6}, {10}, {14}};
    for (int i = 0; i < 3; ++i) {
        nodes[i].left = &nodes[2 * i + 1];
        nodes[i].right = &nodes[2 * i + 2];
    }
    Node* root = &nodes[0];
    vector<int> order;
    function<void(Node*)> visit = [&](Node* node) {
        if (!node) return;
        visit(node->left);
        order.push_back(node->value);
        visit(node->right);
    };
    visit(root);
    for (int v : order) cout << v << " ";
    return 0;
}
`;
const list = `#include <iostream>
using namespace std;

struct Node {
    int value;
    Node* next = nullptr;
};

int main() {
    Node nodes[] = {{10}, {20}, {30}, {40}, {50}};
    for (int i = 0; i < 4; ++i) nodes[i].next = &nodes[i + 1];
    Node* prev = nullptr;
    Node* curr = &nodes[0];
    while (curr) {
        Node* next = curr->next;
        curr->next = prev;
        prev = curr;
        curr = next;
    }
    for (auto* p = prev; p; p = p->next) cout << p->value << " ";
    return 0;
}
`;
const custom = `#include <iostream>
#include <vector>
using namespace std;

int main() {
    vector<int> values = {5, 3, 8, 1, 2};
    for (int i = 0; i < static_cast<int>(values.size()); ++i) {
        values[i] *= 2;
    }
    return 0;
}
`;
const leetcodeArray = `class Solution {
public:
    vector<int> runningSum(vector<int>& nums) {
        for (int i = 1; i < static_cast<int>(nums.size()); ++i) {
            nums[i] += nums[i - 1];
        }
        return nums;
    }
};
`;
const leetcodeList = `class Solution {
public:
    ListNode* reverseList(ListNode* head) {
        ListNode* prev = nullptr;
        while (head) {
            ListNode* next = head->next;
            head->next = prev;
            prev = head;
            head = next;
        }
        return prev;
    }
};
`;

const leetcodeStack = `class Solution {
public:
    vector<int> inorderTraversal(TreeNode* root) {
        vector<int> ans;
        stack<pair<bool, TreeNode*>> stack;
        stack.push({false, root});
        while (!stack.empty()) {
            auto [visited, node] = stack.top();
            stack.pop();
            if (node) {
                if (visited) {
                    ans.push_back(node->val);
                } else {
                    stack.push({false, node->right});
                    stack.push({true, node});
                    stack.push({false, node->left});
                }
            } // 本轮操作完成
        }
        return ans;
    }
};
`;

export const EDITOR_SAMPLES = [
  { id: 'bfs', title: '图 · BFS', source: bfs, stdin: '', watches: [
    watch(bfs, 'adj', 'adjacency', 'cout << "处理节点', { count: 'n', active: 'u' }),
    watch(bfs, 'dist', 'array', 'cout << "处理节点', { count: 'n', active: 'u' }),
  ] },
  { id: 'dp', title: '矩阵 · 动态规划', source: dp, stdin: '', watches: [
    watch(dp, 'dp', 'matrix', 'rowSum[i] +=', { rows: 'rows', cols: 'cols', activeRow: 'i', activeCol: 'j' }),
    watch(dp, 'rowSum', 'array', 'rowSum[i] +=', { count: 'rows', active: 'i' }),
  ] },
  { id: 'tree', title: '二叉树 · 中序遍历', source: tree, stdin: '', watches: [
    watch(tree, 'root', 'tree', 'order.push_back'),
    watch(tree, 'order', 'array', 'order.push_back', { count: 'order.size()' }),
  ] },
  { id: 'list', title: '链表 · 原地反转', source: list, stdin: '', watches: [
    watch(list, 'prev', 'list', 'curr = next;'),
    watch(list, 'curr', 'list', 'curr = next;'),
  ] },
  { id: 'leetcode-array', title: 'LeetCode · 一维数组动态和', source: leetcodeArray, stdin: '',
    execution: { mode: 'leetcode', method: '', arguments: '[[1,2,3,4]]', nodes: 'auto' },
    watches: [watch(leetcodeArray, 'nums', 'array', 'nums[i] +=', { count: 'nums.size()', active: 'i' })] },
  { id: 'leetcode-list', title: 'LeetCode · 反转链表', source: leetcodeList, stdin: '',
    execution: { mode: 'leetcode', method: '', arguments: '[[10,20,30,40,50]]', nodes: 'auto' },
    watches: [
      watch(leetcodeList, 'prev', 'list', 'head = next;', { valueField: 'val' }),
      watch(leetcodeList, 'head', 'list', 'head = next;', { valueField: 'val' }),
    ] },
  { id: 'leetcode-stack', title: 'LeetCode · 栈与二叉树遍历', source: leetcodeStack, stdin: '',
    execution: { mode: 'leetcode', method: '', arguments: '[[1,null,2,3]]', nodes: 'auto' },
    watches: [
      watch(leetcodeStack, 'root', 'tree', '本轮操作完成', { valueField: 'val' }),
      watch(leetcodeStack, 'stack', 'stack', '本轮操作完成'),
      watch(leetcodeStack, 'ans', 'array', '本轮操作完成'),
    ] },
  { id: 'custom', title: '自定义代码', source: custom, stdin: '', watches: [] },
];

// Keep capture lines attached when lines above them are inserted/deleted.
export function rebaseWatches(watches, before, after) {
  const oldLines = before.split('\n'), newLines = after.split('\n');
  if (oldLines.length === newLines.length) return watches;
  let prefix = 0, suffix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix++;
  return watches.map(w => {
    if (w.strategy === 'changes') return { ...w, line: Math.max(1, Math.min(w.line, newLines.length)), needsReview: false };
    if (w.line <= prefix) return w;
    if (w.line > oldLines.length - suffix) return { ...w, line: w.line + newLines.length - oldLines.length };
    return { ...w, line: Math.max(1, Math.min(w.line, newLines.length)), needsReview: true };
  });
}

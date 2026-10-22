/**
 * Definition for a binary tree node.
 * struct TreeNode {
 *     int val;
 *     TreeNode *left;
 *     TreeNode *right;
 *     TreeNode() : val(0), left(nullptr), right(nullptr) {}
 *     TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
 *     TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
 * };
 */
class Solution {
public:
    vector<int> inorderTraversal(TreeNode* root) {
        vector<int> ans;
        stack<pair<bool, TreeNode*>> stack;
        stack.emplace(0, root);
        while (!stack.empty()) {
            auto node = stack.top();
            stack.pop();
            if (node.first == 0) {
                if (node.second == nullptr) continue;
                stack.emplace(0, node.second->right);
                stack.emplace(1, node.second);
                stack.emplace(0, node.second->left);
            }
            else {
                ans.push_back(node.second->val);
            }
        }
        return ans;
    }
};

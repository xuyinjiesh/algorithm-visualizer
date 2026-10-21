#include "viz.hpp"
#include <functional>

struct Node { int id, value; Node* left = nullptr; Node* right = nullptr; };
int main(int argc, char** argv) {
    Node nodes[] = {{0,8},{1,4},{2,12},{3,2},{4,6},{5,10},{6,14}};
    for (int i = 0; i < 3; ++i) { nodes[i].left = &nodes[2*i+1]; nodes[i].right = &nodes[2*i+2]; }
    Node* root = &nodes[0];
    std::vector<std::string> state(7,"default");
    std::string result = "", current = "—";
    viz::Session session(argc > 1 ? argv[1] : "tree.jsonl", "二叉树中序遍历", __FILE__);
    auto tree = session.watch_tree("tree", "binary_tree", [&](auto& g) {
        g.root(root->id);
        // Stable IDs describe identity; pointer values are never used as labels.
        for (const auto& node : nodes) g.node(node.id, viz::str(node.value), state[node.id]);
        for (const auto& node : nodes) {
            if (node.left) g.edge(viz::str(node.id)+"L", node.id, node.left->id, "L");
            if (node.right) g.edge(viz::str(node.id)+"R", node.id, node.right->id, "R");
        }
    });
    auto order = session.watch_value("inorder", [&] { return "[" + result + "]"; });
    auto cur = session.watch_value("current", [&] { return current; });
    VIZ_STEP(session, "从根节点 8 开始，按左子树 → 根 → 右子树遍历");
    std::function<void(Node*)> visit = [&](Node* node) {
        if (!node) return;
        state[node->id] = "frontier"; current = viz::str(node->value);
        VIZ_STEP(session, "进入节点 " + current + "，先访问左子树");
        visit(node->left);
        current = viz::str(node->value); state[node->id] = "active";
        if (!result.empty()) result += ", ";
        result += current;
        VIZ_STEP(session, "输出节点 " + current);
        visit(node->right);
        state[node->id] = "done";
        VIZ_STEP(session, "节点 " + viz::str(node->value) + " 的子树遍历完成");
    };
    visit(root); current = "—";
    VIZ_STEP(session, "遍历完成：得到有序序列 2, 4, 6, 8, 10, 12, 14");
}

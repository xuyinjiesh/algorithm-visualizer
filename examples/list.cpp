#include "viz.hpp"

struct Node { int id, value; Node* next = nullptr; };
int main(int argc, char** argv) {
    Node nodes[] = {{0,10},{1,20},{2,30},{3,40},{4,50}};
    for (int i = 0; i < 4; ++i) nodes[i].next = &nodes[i+1];
    Node* head = &nodes[0]; Node* prev = nullptr; Node* curr = head;
    viz::Session session(argc > 1 ? argv[1] : "list.jsonl", "单链表原地反转", __FILE__);
    auto list = session.watch_list("list", "linked_list", [&](auto& g) {
        if (head) g.head(head->id);
        // Observe all allocated nodes, including both components during reversal.
        for (const auto& node : nodes) g.node(node.id, viz::str(node.value), &node == curr ? "active" : (&node == prev ? "frontier" : "default"));
        for (const auto& node : nodes) if (node.next) g.edge(viz::str(node.id)+".next", node.id, node.next->id);
    });
    auto p = session.watch_value("prev", [&] { return prev ? viz::str(prev->value) : "nullptr"; });
    auto c = session.watch_value("curr", [&] { return curr ? viz::str(curr->value) : "nullptr"; });
    auto h = session.watch_value("head", [&] { return head ? viz::str(head->value) : "nullptr"; });
    VIZ_STEP(session, "初始化：prev 为空，curr 指向第一个节点");
    while (curr) {
        Node* next = curr->next;
        curr->next = prev;
        VIZ_STEP(session, "反转节点 " + viz::str(curr->value) + " 的 next 指针");
        prev = curr; curr = next;
        VIZ_STEP(session, "向前移动 prev 和 curr");
    }
    head = prev;
    VIZ_STEP(session, "反转完成：head 指向 50，链表为 50 → 40 → 30 → 20 → 10");
}

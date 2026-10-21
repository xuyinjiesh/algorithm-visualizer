#include "viz.hpp"
#include <queue>
#include <iostream>

struct Arc { int to, id, weight; };

int main(int argc, char** argv) {
    const std::string output = argc > 1 ? argv[1] : "bfs.jsonl";
    const std::string mode = argc > 2 ? argv[2] : "list";
    const int n = 8;
    const std::vector<std::pair<int,int>> links = {{0,1},{0,2},{1,3},{1,4},{2,4},{2,5},{3,6},{4,6},{5,6}};
    std::vector<std::vector<Arc>> adj(n);
    std::vector<std::vector<int>> matrix(n, std::vector<int>(n, -1));
    std::vector<int> head(n,-1), to(links.size()), next(links.size()), weight(links.size(),1);
    for (int e = 0; e < int(links.size()); ++e) {
        const auto [u,v] = links[e];
        adj[u].push_back({v,e,1}); matrix[u][v] = 1;
    }
    for (int e = int(links.size()) - 1; e >= 0; --e) {
        const auto [u,v] = links[e];
        to[e] = v; next[e] = head[u]; head[u] = e;
    }
    std::vector<int> dist(n,-1);
    std::vector<std::string> state(n,"default");
    std::queue<int> q;
    int current = -1, visited = 0;
    viz::Session session(output, "广度优先搜索 · BFS", __FILE__);
    auto graph = session.watch_graph("graph", "graph", [&](auto& g) {
        if (mode == "matrix") viz::adjacency_matrix(g, matrix, 0, n, [](int,int,int w) { return w != -1; });
        else if (mode == "star") viz::forward_star(g, head, to, next, weight, 0, n, -1, int(links.size()));
        else viz::adjacency_list(g, adj, 0, n);
        for (int u = 0; u < n; ++u) g.node_state(u, state[u]);
    });
    auto distances = session.watch_array("dist", "dist[]", [&](auto& m) {
        m.values(std::vector<std::vector<int>>{dist});
        if (current >= 0) m.mark(0,current);
    });
    auto queue_watch = session.watch_value("queue", [&] {
        std::string text = "["; auto copy = q;
        while (!copy.empty()) { if (text != "[") text += ", "; text += std::to_string(copy.front()); copy.pop(); }
        return text + "]";
    });
    auto current_watch = session.watch_value("current", [&] { return current < 0 ? "—" : std::to_string(current); });
    auto visited_watch = session.watch_value("visited", [&] { return std::to_string(visited) + " / " + std::to_string(n); });
    VIZ_STEP(session, "初始化图：8 个节点，节点 7 是孤立点");
    dist[0] = 0; state[0] = "frontier"; q.push(0);
    VIZ_STEP(session, "起点 0 入队，距离设为 0");
    while (!q.empty()) {
        current = q.front(); q.pop(); state[current] = "active";
        VIZ_STEP(session, "取出节点 " + std::to_string(current));
        auto discover = [&](int v) {
            if (dist[v] != -1) return;
            dist[v] = dist[current] + 1; state[v] = "frontier"; q.push(v);
            VIZ_STEP(session, "发现节点 " + std::to_string(v) + "，距离为 " + std::to_string(dist[v]));
        };
        if (mode == "matrix") { for (int v = 0; v < n; ++v) if (matrix[current][v] != -1) discover(v); }
        else if (mode == "star") { for (int e = head[current]; e != -1; e = next[e]) discover(to[e]); }
        else { for (const auto& e : adj[current]) discover(e.to); }
        state[current] = "done"; ++visited;
        VIZ_STEP(session, "节点 " + std::to_string(current) + " 的邻居处理完成");
    }
    current = -1;
    VIZ_STEP(session, "搜索完成：可达 7 个节点，孤立点 7 的距离仍为 -1");
    std::cout << output << '\n';
}

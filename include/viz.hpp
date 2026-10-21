#pragma once
// Structure Lab — C++17, header-only. No third-party dependencies.
#include <algorithm>
#include <cmath>
#include <fstream>
#include <functional>
#include <iomanip>
#include <map>
#include <memory>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace viz {
template<class T> std::string str(const T& value) { std::ostringstream s; s << value; return s.str(); }
inline std::string quote(const std::string& value) {
    std::ostringstream out; out << '"';
    for (unsigned char c : value) {
        switch (c) {
            case '"': out << "\\\""; break;
            case '\\': out << "\\\\"; break;
            case '\n': out << "\\n"; break;
            case '\r': out << "\\r"; break;
            case '\t': out << "\\t"; break;
            default: if (c < 32) out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << int(c) << std::dec; else out << c;
        }
    }
    out << '"'; return out.str();
}
inline std::string join(const std::vector<std::string>& values) {
    std::string result;
    for (const auto& v : values) { if (!result.empty()) result += ','; result += v; }
    return result;
}
inline void check_state(const std::string& state) {
    if (state != "default" && state != "active" && state != "frontier" && state != "visited" && state != "done") throw std::invalid_argument("Unknown visualization state");
}

class GraphBuilder {
    struct Node { std::string id, label, state; };
    struct Edge { std::string id, source, target, weight, state; };
    std::vector<Node> nodes_;
    std::vector<Edge> edges_;
    bool directed_ = true;
    std::string root_, head_;
    bool has_root_ = false, has_head_ = false;
public:
    void directed(bool directed) { directed_ = directed; }
    template<class T> void node_state(const T& id, const std::string& state) {
        check_state(state); for (auto& n : nodes_) if (n.id == str(id)) { n.state = state; return; }
        throw std::invalid_argument("Cannot mark missing node");
    }
    template<class T> void edge_state(const T& id, const std::string& state) {
        check_state(state); for (auto& e : edges_) if (e.id == str(id)) { e.state = state; return; }
        throw std::invalid_argument("Cannot mark missing edge");
    }
    template<class T> void root(const T& id) { root_ = str(id); has_root_ = true; }
    template<class T> void head(const T& id) { head_ = str(id); has_head_ = true; }
    template<class T> void node(const T& id, const std::string& label = "", const std::string& state = "default") {
        check_state(state); const auto key = str(id);
        nodes_.push_back({key, label.empty() ? key : label, state});
    }
    template<class I, class U, class V> void edge(const I& id, const U& from, const V& to) { edge(id, from, to, "", "default"); }
    template<class I, class U, class V, class W> void edge(const I& id, const U& from, const V& to, const W& weight, const std::string& state = "default") {
        check_state(state); edges_.push_back({str(id), str(from), str(to), str(weight), state});
    }
    std::string json(const std::string& id, const std::string& name, const std::string& kind) const {
        if (nodes_.size() > 1000 || edges_.size() > 5000) throw std::length_error("Graph exceeds viewer limits");
        std::set<std::string> node_ids, edge_ids;
        std::vector<std::string> nodes, edges;
        for (const auto& n : nodes_) {
            if (!node_ids.insert(n.id).second) throw std::invalid_argument("Duplicate node ID");
            nodes.push_back("{\"id\":" + quote(n.id) + ",\"label\":" + quote(n.label) + ",\"state\":" + quote(n.state) + "}");
        }
        for (const auto& e : edges_) {
            if (!edge_ids.insert(e.id).second || !node_ids.count(e.source) || !node_ids.count(e.target)) throw std::invalid_argument("Duplicate edge ID or missing endpoint");
            edges.push_back("{\"id\":" + quote(e.id) + ",\"source\":" + quote(e.source) + ",\"target\":" + quote(e.target) + ",\"weight\":" + quote(e.weight) + ",\"state\":" + quote(e.state) + "}");
        }
        if ((has_root_ && !node_ids.count(root_)) || (has_head_ && !node_ids.count(head_))) throw std::invalid_argument("Missing root/head node");
        return "{\"id\":" + quote(id) + ",\"name\":" + quote(name) + ",\"kind\":" + quote(kind) + ",\"directed\":" + (directed_ ? "true" : "false") + ",\"nodes\":[" + join(nodes) + "],\"edges\":[" + join(edges) + "]" + (has_root_ ? ",\"root\":" + quote(root_) : "") + (has_head_ ? ",\"head\":" + quote(head_) : "") + "}";
    }
};

struct CellMark { int row, col; std::string state; };
struct Dependency { int from_row, from_col, to_row, to_col; };
class MatrixBuilder {
    std::vector<std::vector<std::string>> rows_;
    std::vector<CellMark> marks_;
    std::vector<Dependency> dependencies_;
    bool valid(int r, int c) const { return r >= 0 && c >= 0 && r < int(rows_.size()) && c < int(rows_[r].size()); }
public:
    template<class Rows> void values(const Rows& rows) {
        rows_.clear();
        for (const auto& row : rows) { std::vector<std::string> result; for (const auto& v : row) result.push_back(str(v)); rows_.push_back(std::move(result)); }
    }
    // Use explicit dimensions to observe only the initialized portion of a fixed array.
    template<class Rows> void values(const Rows& rows, int height, int width) {
        if (height < 0 || width < 0) throw std::invalid_argument("Negative matrix size");
        rows_.clear();
        for (int r = 0; r < height; ++r) { std::vector<std::string> result; for (int c = 0; c < width; ++c) result.push_back(str(rows[r][c])); rows_.push_back(std::move(result)); }
    }
    void mark(int row, int col, const std::string& state = "active") { check_state(state); marks_.push_back({row, col, state}); }
    void depends(int from_row, int from_col, int to_row, int to_col) { dependencies_.push_back({from_row, from_col, to_row, to_col}); }
    std::string json(const std::string& id, const std::string& name, const std::string& kind) const {
        std::vector<std::string> rows, marks, dependencies;
        const auto width = rows_.empty() ? 0 : rows_[0].size();
        if (rows_.size() > 40000 || width > 40000 || rows_.size() * width > 40000) throw std::length_error("Matrix exceeds viewer limits");
        for (const auto& row : rows_) {
            if (row.size() != width) throw std::invalid_argument("Matrix must be rectangular");
            std::vector<std::string> cells; for (const auto& v : row) cells.push_back(quote(v)); rows.push_back("[" + join(cells) + "]");
        }
        for (const auto& m : marks_) {
            if (!valid(m.row, m.col)) throw std::out_of_range("Matrix mark out of range");
            marks.push_back("{\"row\":" + str(m.row) + ",\"col\":" + str(m.col) + ",\"state\":" + quote(m.state) + "}");
        }
        for (const auto& d : dependencies_) {
            if (!valid(d.from_row, d.from_col) || !valid(d.to_row, d.to_col)) throw std::out_of_range("Matrix dependency out of range");
            dependencies.push_back("{\"from\":[" + str(d.from_row) + "," + str(d.from_col) + "],\"to\":[" + str(d.to_row) + "," + str(d.to_col) + "]}");
        }
        return "{\"id\":" + quote(id) + ",\"name\":" + quote(name) + ",\"kind\":" + quote(kind) + ",\"values\":[" + join(rows) + "],\"marks\":[" + join(marks) + "],\"dependencies\":[" + join(dependencies) + "]}";
    }
};

namespace detail {
struct Registry { std::map<std::string, std::function<std::string()>> structures, variables; };
}
class Watch {
    std::weak_ptr<detail::Registry> registry_;
    std::string id_;
    bool variable_ = false;
    void release() { if (auto r = registry_.lock()) (variable_ ? r->variables : r->structures).erase(id_); registry_.reset(); }
public:
    Watch(std::shared_ptr<detail::Registry> registry, std::string id, bool variable = false) : registry_(registry), id_(std::move(id)), variable_(variable) {}
    Watch(const Watch&) = delete;
    Watch& operator=(const Watch&) = delete;
    Watch(Watch&& other) noexcept : registry_(std::move(other.registry_)), id_(std::move(other.id_)), variable_(other.variable_) { other.registry_.reset(); }
    Watch& operator=(Watch&& other) noexcept { if (this != &other) { release(); registry_ = std::move(other.registry_); id_ = std::move(other.id_); variable_ = other.variable_; other.registry_.reset(); } return *this; }
    ~Watch() { release(); }
};

class Session {
    std::ofstream output_;
    std::shared_ptr<detail::Registry> registry_ = std::make_shared<detail::Registry>();
    int seq_ = 0;
    std::size_t bytes_ = 0;
    void write(const std::string& record) {
        if (bytes_ + record.size() + 1 > 25 * 1024 * 1024) throw std::length_error("Trace exceeds 25 MB");
        output_ << record << '\n'; output_.flush();
        if (!output_) throw std::runtime_error("Cannot write trace");
        bytes_ += record.size() + 1;
    }
    template<class Builder, class F> Watch watch(const std::string& id, const std::string& name, const std::string& kind, F capture) {
        if (registry_->structures.count(id)) throw std::invalid_argument("Duplicate structure ID");
        if (registry_->structures.size() >= 24) throw std::length_error("Too many structures");
        registry_->structures.emplace(id, [=]() { Builder builder; capture(builder); return builder.json(id, name, kind); });
        return Watch(registry_, id);
    }
public:
    Session(const std::string& path, const std::string& title, const std::string& source_file = "") : output_(path, std::ios::binary) {
        if (!output_) throw std::runtime_error("Cannot open trace output: " + path);
        std::string source;
        if (!source_file.empty()) { std::ifstream in(source_file, std::ios::binary); std::ostringstream buffer; buffer << in.rdbuf(); source = buffer.str(); }
        write("{\"type\":\"header\",\"version\":1,\"title\":" + quote(title) + ",\"source\":{\"file\":" + quote(source_file) + ",\"code\":" + quote(source) + "}}");
    }
    Session(const Session&) = delete;
    Session& operator=(const Session&) = delete;
    template<class F> Watch watch_graph(const std::string& id, const std::string& name, F capture) { return watch<GraphBuilder>(id, name, "graph", capture); }
    template<class F> Watch watch_tree(const std::string& id, const std::string& name, F capture) { return watch<GraphBuilder>(id, name, "tree", capture); }
    template<class F> Watch watch_list(const std::string& id, const std::string& name, F capture) { return watch<GraphBuilder>(id, name, "list", capture); }
    template<class F> Watch watch_matrix(const std::string& id, const std::string& name, F capture) { return watch<MatrixBuilder>(id, name, "matrix", capture); }
    template<class F> Watch watch_array(const std::string& id, const std::string& name, F capture) { return watch<MatrixBuilder>(id, name, "array", capture); }
    template<class F> Watch watch_value(const std::string& name, F capture) {
        if (registry_->variables.count(name)) throw std::invalid_argument("Duplicate variable name");
        if (registry_->variables.size() >= 100) throw std::length_error("Too many variables");
        registry_->variables.emplace(name, [=] { return quote(str(capture())); });
        return Watch(registry_, name, true);
    }
    void step(const std::string& label, const std::string& file, int line) {
        if (seq_ >= 5000) throw std::length_error("Trace exceeds 5000 frames");
        std::vector<std::string> structures, variables;
        for (const auto& item : registry_->structures) structures.push_back(item.second());
        for (const auto& item : registry_->variables) variables.push_back(quote(item.first) + ":" + item.second());
        write("{\"type\":\"frame\",\"seq\":" + str(seq_) + ",\"label\":" + quote(label) + ",\"source\":{\"file\":" + quote(file) + ",\"line\":" + str(line) + "},\"structures\":[" + join(structures) + "],\"variables\":{" + join(variables) + "}}");
        ++seq_;
    }
};

// Adjacency entries expose .to, .id and .weight, keeping edge identity explicit.
// For an undirected list with mirrored entries, both directions must share an ID.
template<class Adj> void adjacency_list(GraphBuilder& g, const Adj& adj, int first, int count, bool directed = true) {
    g.directed(directed); std::set<std::string> emitted;
    for (int u = first; u < first + count; ++u) g.node(u);
    for (int u = first; u < first + count; ++u) for (const auto& e : adj[u]) {
        if (directed || emitted.insert(str(e.id)).second) g.edge(e.id, u, e.to, e.weight);
    }
}
template<class Matrix, class Exists> void adjacency_matrix(GraphBuilder& g, const Matrix& matrix, int first, int count, Exists exists, bool directed = true) {
    g.directed(directed);
    for (int u = first; u < first + count; ++u) g.node(u);
    for (int u = first; u < first + count; ++u) for (int v = first; v < first + count; ++v)
        if ((directed || u <= v) && exists(u, v, matrix[u][v])) g.edge(str(u) + ":" + str(v), u, v, matrix[u][v]);
}
// One stored arc is one directed edge. For undirected paired arcs use an explicit custom adapter.
template<class Heads, class Tos, class Nexts, class Weights> void forward_star(GraphBuilder& g, const Heads& head, const Tos& to, const Nexts& next, const Weights& weight, int first, int count, int end, int edge_count) {
    g.directed(true);
    for (int u = first; u < first + count; ++u) g.node(u);
    for (int u = first; u < first + count; ++u) {
        std::set<int> seen;
        for (int e = head[u]; e != end; e = next[e]) {
            if (e < 0 || e >= edge_count || !seen.insert(e).second) throw std::out_of_range("Invalid or cyclic forward-star edge chain");
            g.edge(e, u, to[e], weight[e]);
        }
    }
}
} // namespace viz
#define VIZ_STEP(session, label) (session).step((label), __FILE__, __LINE__)

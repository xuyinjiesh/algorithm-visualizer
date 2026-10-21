#pragma once
#include "viz.hpp"
#include <cstdint>
#include <cstdlib>
#include <limits>
#include <iostream>
#include <type_traits>

namespace structure_lab_editor {
// Each capture reads values immediately in their original scope. Never retain pointers/lambdas.
template<class T> int size(const T& value, int maximum = 40000) {
    const long double n = static_cast<long double>(value);
    if (!std::isfinite(n) || n < 0 || n > maximum || std::floor(n) != n)
        throw std::out_of_range("Visualization size outside allowed range");
    return static_cast<int>(n);
}
template<class C> auto extent(const C& c) -> decltype(c.size()) { return c.size(); }
template<class T, std::size_t N> std::size_t extent(const T (&)[N]) { return N; }
template<class C> void range(const C& c, int first, int count) {
    if (first < 0 || count < 0 || static_cast<std::size_t>(first) + count > extent(c))
        throw std::out_of_range("Visualization range exceeds container bounds");
}
template<class T> std::string pointer_id(T* p) {
    return viz::str(reinterpret_cast<std::uintptr_t>(p));
}

class Session {
    std::ofstream out_;
    std::map<std::string, std::string> latest_;
    int seq_ = 0;
    std::size_t bytes_ = 0;
    void write(const std::string& json) {
        if (bytes_ + json.size() + 1 > 25 * 1024 * 1024) throw std::length_error("Trace exceeds 25 MB");
        out_ << json << '\n'; out_.flush();
        if (!out_) throw std::runtime_error("Cannot write trace");
        bytes_ += json.size() + 1;
    }
public:
    Session() : out_("trace.jsonl", std::ios::binary) {
        if (!out_) throw std::runtime_error("Cannot open trace output");
        std::ifstream input("main.cpp", std::ios::binary);
        std::ostringstream source; source << input.rdbuf();
        write("{\"type\":\"header\",\"version\":1,\"title\":\"C++ 编辑器运行\",\"source\":{\"file\":\"main.cpp\",\"code\":" + viz::quote(source.str()) + "}}");
    }
    template<class Builder, class F>
    void capture(const std::string& id, const std::string& name, const std::string& kind, int line, F capture) {
        Builder builder;
        capture(builder);
        auto json = builder.json(id, name, kind);
        json.pop_back();
        latest_[id] = json + ",\"capturedSeq\":" + viz::str(seq_) + ",\"capturedLine\":" + viz::str(line) + "}";
    }
    void step(const std::string& label, int line) {
        if (seq_ >= 5000) throw std::length_error("Trace exceeds 5000 frames");
        std::vector<std::string> structures;
        for (const auto& entry : latest_) structures.push_back(entry.second);
        write("{\"type\":\"frame\",\"seq\":" + viz::str(seq_++) + ",\"label\":" + viz::quote(label) + ",\"source\":{\"file\":\"main.cpp\",\"line\":" + viz::str(line) + "},\"structures\":[" + viz::join(structures) + "]}");
    }
};
inline Session& session() { static Session instance; return instance; }

template<class Node, class Value, class Left, class Right>
void tree(viz::GraphBuilder& g, Node* root, Value value, Left left, Right right) {
    if (!root) return;
    g.root(pointer_id(root));
    std::vector<Node*> pending{root};
    std::set<Node*> seen{root};
    for (std::size_t i = 0; i < pending.size(); ++i) {
        if (pending.size() > 1000) throw std::length_error("Tree exceeds 1000 nodes");
        Node* p = pending[i];
        g.node(pointer_id(p), viz::str(value(p)));
        for (const auto& entry : {std::make_pair(left(p), "L"), std::make_pair(right(p), "R")}) {
            if (!entry.first) continue;
            g.edge(pointer_id(p) + entry.second, pointer_id(p), pointer_id(entry.first), entry.second);
            if (seen.insert(entry.first).second) pending.push_back(entry.first);
        }
    }
}
template<class Node, class Value, class Next>
void list(viz::GraphBuilder& g, Node* head, Value value, Next next) {
    if (!head) return;
    g.head(pointer_id(head));
    std::set<Node*> seen;
    for (auto* p = head; p && seen.insert(p).second; p = next(p)) {
        if (seen.size() > 1000) throw std::length_error("List exceeds 1000 nodes");
        g.node(pointer_id(p), viz::str(value(p)));
        if (next(p)) g.edge(pointer_id(p) + ".next", pointer_id(p), pointer_id(next(p)));
    }
}
} // namespace structure_lab_editor

#include "viz.hpp"
#include <cassert>
#include <iostream>

struct Arc { int to, id, weight; };
template<class F> bool throws(F f) { try { f(); return false; } catch (const std::exception&) { return true; } }
int main(int argc, char** argv) {
    assert(argc > 1);
    // Isolated nodes, zero-weight edges, loops and parallel edges all survive.
    std::vector<std::vector<Arc>> adj(3);
    adj[0] = {{1,0,0},{1,1,5},{0,2,3}};
    viz::GraphBuilder graph;
    viz::adjacency_list(graph,adj,0,3);
    const auto graph_json = graph.json("g","g","graph");
    assert(graph_json.find("\"weight\":\"0\"") != std::string::npos);
    assert(graph_json.find("\"id\":\"2\",\"label\":\"2\"") != std::string::npos);
    // Explicit pairing keeps parallel undirected edges distinct.
    adj[1] = {{0,0,0},{0,1,5}};
    viz::GraphBuilder undirected;
    viz::adjacency_list(undirected,adj,0,3,false);
    assert(undirected.json("g","g","graph").find("\"directed\":false") != std::string::npos);
    int matrix[3][3]={{-1,0,-1},{-1,-1,-1},{-1,-1,-1}};
    viz::GraphBuilder from_matrix;
    viz::adjacency_matrix(from_matrix,matrix,0,3,[](int,int,int v){return v!=-1;});
    assert(from_matrix.json("m","m","graph").find("\"weight\":\"0\"") != std::string::npos);
    std::vector<int> head={0,-1,-1},to={1},next={0},weight={0};
    assert(throws([&]{viz::GraphBuilder g;viz::forward_star(g,head,to,next,weight,0,3,-1,1);}));
    next[0]=-1;head[0]=8;
    assert(throws([&]{viz::GraphBuilder g;viz::forward_star(g,head,to,next,weight,0,3,-1,1);}));
    assert(throws([]{viz::GraphBuilder g;g.node(1);g.node(1);g.json("g","g","graph");}));
    assert(throws([]{viz::GraphBuilder g;g.node(1);g.edge(0,1,2);g.json("g","g","graph");}));
    assert(throws([]{viz::MatrixBuilder m;m.values(std::vector<std::vector<int>>{{1},{2,3}});m.json("m","m","matrix");}));
    assert(throws([]{viz::MatrixBuilder m;m.values(std::vector<std::vector<int>>{{1}});m.mark(2,2);m.json("m","m","matrix");}));
    viz::Session session(argv[1],"contract",__FILE__);
    {
        auto watch = session.watch_graph("g","g",[&](auto& g){viz::adjacency_list(g,adj,0,3,false);});
        assert(throws([&]{auto duplicate=session.watch_graph("g","g",[](auto&){});}));
        VIZ_STEP(session,"中文 \"quote\" \\ slash\nnewline\tTAB");
        auto moved = std::move(watch);
        VIZ_STEP(session,"moved handle still observes");
    }
    VIZ_STEP(session,"destroyed handle unregisters");
    std::cout << "C++ contracts passed\n";
}

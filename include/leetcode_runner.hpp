#pragma once
#include "viz.hpp"
#include <algorithm>
#include <array>
#include <bitset>
#include <cassert>
#include <cctype>
#include <climits>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <functional>
#include <iomanip>
#include <iostream>
#include <iterator>
#include <limits>
#include <list>
#include <map>
#include <memory>
#include <numeric>
#include <optional>
#include <queue>
#include <set>
#include <stack>
#include <string>
#include <tuple>
#include <type_traits>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

#ifdef STRUCTURE_LAB_DEFINE_LIST_NODE
struct ListNode {
    int val;
    ListNode* next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode* next) : val(x), next(next) {}
};
#endif
#ifdef STRUCTURE_LAB_DEFINE_TREE_NODE
struct TreeNode {
    int val;
    TreeNode* left;
    TreeNode* right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode* left, TreeNode* right) : val(x), left(left), right(right) {}
};
#endif

namespace structure_lab_leetcode {
struct Value {
    enum class Kind { Null, Boolean, Number, String, Array };
    Kind kind = Kind::Null;
    std::string text;
    std::vector<Value> items;
    static Value boolean(bool value) { Value v; v.kind = Kind::Boolean; v.text = value ? "true" : "false"; return v; }
    static Value number(std::string value) { Value v; v.kind = Kind::Number; v.text = std::move(value); return v; }
    static Value string(std::string value) { Value v; v.kind = Kind::String; v.text = std::move(value); return v; }
    static Value array(std::vector<Value> value) { Value v; v.kind = Kind::Array; v.items = std::move(value); return v; }
};

template<class> struct dependent_false : std::false_type {};
template<class> struct is_vector : std::false_type {};
template<class T, class A> struct is_vector<std::vector<T, A>> : std::true_type {};
template<class T, class = void> struct is_list_node : std::false_type {};
template<class T> struct is_list_node<T, std::void_t<decltype(std::declval<T>().val), decltype(std::declval<T>().next)>> : std::true_type {};
template<class T, class = void> struct is_tree_node : std::false_type {};
template<class T> struct is_tree_node<T, std::void_t<decltype(std::declval<T>().val), decltype(std::declval<T>().left), decltype(std::declval<T>().right)>> : std::true_type {};

inline void require(bool condition, const char* message) {
    if (!condition) throw std::invalid_argument(message);
}
template<class T> T convert(const Value& value) {
    if constexpr (std::is_same_v<T, std::string>) {
        require(value.kind == Value::Kind::String, "Expected a JSON string");
        return value.text;
    } else if constexpr (std::is_same_v<T, char>) {
        require(value.kind == Value::Kind::String && value.text.size() == 1, "A char argument needs a single-byte JSON string");
        return value.text[0];
    } else if constexpr (std::is_same_v<T, bool>) {
        require(value.kind == Value::Kind::Boolean, "Expected a JSON boolean");
        return value.text == "true";
    } else if constexpr (std::is_arithmetic_v<T>) {
        require(value.kind == Value::Kind::Number, "Expected a JSON number");
        const long double n = std::stold(value.text);
        require(std::isfinite(n) && n >= std::numeric_limits<T>::lowest() && n <= std::numeric_limits<T>::max(), "Number outside parameter type range");
        if constexpr (std::is_integral_v<T>) require(std::floor(n) == n, "Integer parameter cannot receive a fractional value");
        return static_cast<T>(n);
    } else if constexpr (is_vector<T>::value) {
        require(value.kind == Value::Kind::Array, "Expected a JSON array for vector");
        T result;
        for (const auto& item : value.items) result.push_back(convert<typename T::value_type>(item));
        return result;
    } else if constexpr (std::is_pointer_v<T> && is_list_node<std::remove_pointer_t<T>>::value) {
        using Node = std::remove_pointer_t<T>;
        if (value.kind == Value::Kind::Null) return nullptr;
        require(value.kind == Value::Kind::Array && value.items.size() <= 1000, "ListNode expects null or an array with at most 1000 values");
        T head = nullptr, tail = nullptr;
        // Input nodes live for this process. The solution may delete or rewire them.
        for (const auto& item : value.items) {
            auto* node = new Node(convert<int>(item)); node->next = nullptr;
            if (tail) tail->next = node; else head = node;
            tail = node;
        }
        return head;
    } else if constexpr (std::is_pointer_v<T> && is_tree_node<std::remove_pointer_t<T>>::value) {
        using Node = std::remove_pointer_t<T>;
        if (value.kind == Value::Kind::Null) return nullptr;
        require(value.kind == Value::Kind::Array && value.items.size() <= 2001, "TreeNode expects null or a level-order array with at most 1000 nodes");
        if (value.items.empty()) return nullptr;
        if (value.items[0].kind == Value::Kind::Null) {
            for (const auto& item : value.items) require(item.kind == Value::Kind::Null, "Tree contains values without a parent");
            return nullptr;
        }
        T root = new Node(convert<int>(value.items[0])); root->left = root->right = nullptr;
        std::vector<T> pending{root};
        std::size_t index = 1;
        for (std::size_t i = 0; i < pending.size() && index < value.items.size(); ++i) {
            for (T* child : {&pending[i]->left, &pending[i]->right}) {
                if (index == value.items.size()) break;
                const auto& item = value.items[index++];
                if (item.kind == Value::Kind::Null) continue;
                require(pending.size() < 1000, "Tree exceeds 1000 nodes");
                *child = new Node(convert<int>(item)); (*child)->left = (*child)->right = nullptr;
                pending.push_back(*child);
            }
        }
        for (; index < value.items.size(); ++index) require(value.items[index].kind == Value::Kind::Null, "Tree contains values without a parent");
        return root;
    } else {
        static_assert(dependent_false<T>::value, "Unsupported LeetCode parameter type: use numbers, bool, char, string, vector, ListNode* or TreeNode*");
    }
}

template<class T> void print(const T& value) {
    if constexpr (std::is_same_v<T, std::string>) {
        std::cout << viz::quote(value);
    } else if constexpr (std::is_same_v<T, char>) {
        std::cout << viz::quote(std::string(1, value));
    } else if constexpr (std::is_same_v<T, bool>) {
        std::cout << (value ? "true" : "false");
    } else if constexpr (std::is_arithmetic_v<T>) {
        if constexpr (std::is_floating_point_v<T>) {
            if (!std::isfinite(value)) { std::cout << "null"; return; }
            std::cout << std::setprecision(std::numeric_limits<T>::max_digits10);
        }
        std::cout << value;
    } else if constexpr (is_vector<T>::value) {
        std::cout << '[';
        for (std::size_t i = 0; i < value.size(); ++i) {
            if (i) std::cout << ',';
            // Explicit conversion handles vector<bool>'s proxy references.
            print(static_cast<typename T::value_type>(value[i]));
        }
        std::cout << ']';
    } else if constexpr (std::is_pointer_v<T> && is_list_node<std::remove_pointer_t<T>>::value) {
        std::set<T> seen;
        std::cout << '[';
        for (T p = value; p; p = p->next) {
            require(seen.size() < 1000 && seen.insert(p).second, "Returned list has a cycle or exceeds 1000 nodes");
            if (seen.size() > 1) std::cout << ',';
            print(p->val);
        }
        std::cout << ']';
    } else if constexpr (std::is_pointer_v<T> && is_tree_node<std::remove_pointer_t<T>>::value) {
        std::vector<T> queue;
        if (value) queue.push_back(value);
        std::vector<std::string> cells;
        std::set<T> seen;
        for (std::size_t i = 0; i < queue.size(); ++i) {
            T p = queue[i];
            if (!p) { cells.push_back("null"); continue; }
            require(seen.size() < 1000 && seen.insert(p).second, "Returned tree has a cycle/shared child or exceeds 1000 nodes");
            cells.push_back(viz::str(p->val));
            queue.push_back(p->left); queue.push_back(p->right);
        }
        while (!cells.empty() && cells.back() == "null") cells.pop_back();
        std::cout << '[' << viz::join(cells) << ']';
    } else {
        static_assert(dependent_false<T>::value, "Unsupported LeetCode return type");
    }
}

template<class> struct method_traits;
template<class R, class C, class... A>
struct method_traits<R(C::*)(A...)> { using arguments = std::tuple<std::decay_t<A>...>; };
template<class R, class C, class... A>
struct method_traits<R(C::*)(A...) const> : method_traits<R(C::*)(A...)> {};
template<class R, class C, class... A>
struct method_traits<R(C::*)(A...) noexcept> : method_traits<R(C::*)(A...)> {};
template<class R, class C, class... A>
struct method_traits<R(C::*)(A...) const noexcept> : method_traits<R(C::*)(A...)> {};
template<class R, class... A>
struct method_traits<R(*)(A...)> { using arguments = std::tuple<std::decay_t<A>...>; };
template<class R, class... A>
struct method_traits<R(*)(A...) noexcept> : method_traits<R(*)(A...)> {};

template<class Tuple, std::size_t... I>
Tuple arguments(const Value& value, std::index_sequence<I...>) {
    require(value.kind == Value::Kind::Array && value.items.size() == sizeof...(I), "Argument count does not match the selected method");
    return Tuple{convert<std::tuple_element_t<I, Tuple>>(value.items[I])...};
}
template<class F, class Tuple> void call(F function, Tuple& args) {
    using Result = decltype(std::apply(function, args));
    if constexpr (std::is_void_v<Result>) {
        std::apply(function, args);
        std::cout << "返回值: void\n参数（调用后）: [";
        std::size_t index = 0;
        std::apply([&](const auto&... values) { ((std::cout << (index++ ? "," : ""), print(values)), ...); }, args);
        std::cout << "]\n";
    } else {
        decltype(auto) result = std::apply(function, args);
        std::cout << "返回值: "; print(result); std::cout << '\n';
    }
}
template<class Solution, class Method>
void run(Solution& solution, Method method, const Value& input) {
    using Tuple = typename method_traits<Method>::arguments;
    auto args = arguments<Tuple>(input, std::make_index_sequence<std::tuple_size_v<Tuple>>{});
    auto invoke = [&](auto&... values) -> decltype(auto) {
        if constexpr (std::is_member_function_pointer_v<Method>) return std::invoke(method, solution, values...);
        else return std::invoke(method, values...);
    };
    call(invoke, args);
}
} // namespace structure_lab_leetcode

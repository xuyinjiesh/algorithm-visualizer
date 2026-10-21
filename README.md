# Structure Lab

一个只关注关键数据结构的 C++ 算法可视化工具。左侧编辑 C++ 源码、手动添加观察变量，右侧同时显示所有结构；本地编译并执行代码，按指定行采集快照，再用一条时间轴回放。无 npm 依赖、无外部字体、无云服务。

## 运行

需要 Node.js 20+，编译运行还需要本机已安装的 C++17 编译器（GCC、Clang 或 Visual Studio C++ Build Tools）。只导入和回放轨迹时不需要编译器。

```sh
npm run dev
```

打开 <http://127.0.0.1:5173>。Windows PowerShell 如限制 npm 脚本执行，可使用 `npm.cmd run dev`。设置 `PORT` 环境变量可更改端口。

- 编辑器内置 BFS、中序遍历、链表反转、二维 DP、自定义代码，以及 LeetCode 数组动态和 / 反转链表示例。
- 多个变量以卡片放在同一结构面板中，不需要切换标签才能比较。
- 支持运行、停止、标准输入、编译错误、播放、单步、时间轴、倍速、各结构独立缩放和元素详情。
- 可打开 / 下载 `.cpp`，导入 / 导出 JSONL 轨迹，拖放文件；源码、观察配置和输入保存在当前浏览器。
- 快捷键：`Ctrl+Enter` 编译运行，`F5` 前进一帧，`Shift+F5` 返回上一帧。两个单步快捷键均会暂停自动播放，在编辑器内也有效。编辑器内 `Tab` 插入四个空格；在表单外可用左右方向键单步、空格播放。
- `F5` / `Shift+F5` 不会刷新页面；没有轨迹时提示先运行，第一帧和最后一帧不会越界。回退恢复已采集的历史快照，无需重新编译，也不反向执行 C++。观察变量配置和说明弹窗内不会触发单步。`Ctrl+F5` 保留浏览器强制刷新功能。

## 在界面中添加变量

1. 在左侧直接编辑代码，或点击“打开 .cpp”。
2. 点击“添加变量”，填写表达式，例如 `adj`、`dp`、`root`、`curr`。
3. 选择结构类型，填写维度、字段名或关联数组。
4. 指定“在哪一行执行后采集”：选择变量仍在作用域内的一条完整语句。可以先点击源码行号，再添加观察。
5. 点击“编译并运行”。该行每执行一次就生成一帧，右侧所有已添加变量共享时间轴。

例如对 `int dp[5][6]`，选择“二维矩阵”，行数填 `5`，列数填 `6`。如果采集行在 `i / j` 循环体内，还可以填写当前行 `i`、当前列 `j`，高亮正在计算的位置。

### LeetCode 的 class Solution 代码

运行模式选择 **LeetCode · class Solution**，即可直接粘贴不含 `main()` 的代码。填写 public 方法名和 JSON 参数，随后按原有流程添加观察变量。也可以从“打开实验”中选择两个 LeetCode 示例直接运行。

```cpp
class Solution {
public:
    vector<int> runningSum(vector<int>& nums) {
        for (int i = 1; i < static_cast<int>(nums.size()); ++i) {
            nums[i] += nums[i - 1];
        }
        return nums;
    }
};
```

此代码的调用方法填 `runningSum`，测试参数填 `[[1,2,3,4]]`；添加一维数组 `nums`，元素数量 `nums.size()`，采集行 `5`，当前下标 `i`。运行后得到三帧变化，输出返回值 `[1,3,6,10]`。

测试参数最外层数组表示一次调用的参数列表：

| 方法参数 | 测试参数填写方式 |
| --- | --- |
| `vector<int>& nums` | `[[1,2,3]]` |
| `vector<int>& nums, int target` | `[[2,7,11,15],9]` |
| `vector<vector<int>>& grid` | `[[[1,2],[3,4]]]` |
| `string s, char c, bool enabled` | `["hello","a",true]` |
| `ListNode* head` | `[[1,2,3]]`；空链表为 `[[]]` 或 `[null]` |
| `TreeNode* root` | `[[1,null,2,3]]`，按层序，`null` 表示缺失孩子 |
| 无参数 | `[]` |

工具会补全常用标准库头文件、`using namespace std;` 和运行入口。参数类型从选定方法的 C++ 签名获取，支持常见数值类型、`bool`、单字节 `char`、`string`、嵌套 `vector`、`ListNode*` 和 `TreeNode*`，包括引用和 const 引用。返回类型支持上述类型及 `void`；`void` 方法会输出调用后参数，便于检查原地修改。每次运行创建一个新的 `Solution`，执行一组参数。

链表 / 树题可以选择补全标准 `ListNode` / `TreeNode` 定义，默认节点值字段为 `val`。如果源码已经包含实际节点定义，请选“不补全”避免重复定义；题目给出的注释模板不算实际定义。自定义节点需保留标准字段和接收 `int` 的构造函数。树和链表观察器在此模式下默认使用 `val` 字段。

源码下载、观察行号、回放定位仍使用原始片段。运行入口只写入临时编译副本；片段中的编译错误定位为 `main.cpp`，生成入口中的错误定位为 `leetcode-entry.cpp`。测试参数和模式一起保存在浏览器草稿中，修改参数会将旧结果标记为待更新。

此模式要求 `Solution` 可默认构造，入口是单个 public、无重载、非模板的方法；设计题的多次操作序列、自定义 JSON 对象及任意指针类型请使用完整程序模式编写 `main()`。参数最多 16 个，JSON 最多 64 KB；为避免 JSON 解析丢失精度，整数限制在 `±(2^53−1)` 内。新增后端功能后需重启 `npm run dev`；旧服务会明确提示重启。

### 结构类型配置

| 类型 | 变量表达式 | 需要的配置 |
| --- | --- | --- |
| 图 · 邻接表 | `adj` | 起始下标、节点数、条目类型、方向 |
| 图 · 邻接矩阵 | `a` | 起始下标、节点数、无边标记、方向 |
| 图 · 链式前向星 | `head` | `to / next / weight` 数组、节点区间、链尾标记、边下标上界 |
| 二叉树 · 指针 | `root` | 节点值、左右孩子字段名 |
| 链表 · 指针 | `head` / `curr` | 节点值、next 字段名 |
| 二维矩阵 | `dp` | 行数、列数，可选当前单元格 |
| 一维数组 | `dist` | 元素数量，可选当前下标 |

邻接表支持整数邻居、`pair<终点, 权重>`、带自定义终点 / 权重字段的结构体。无向邻接表要求对称存储；矩阵的无边标记可指定为 `-1`，因此零权边可正常显示。链式前向星把存储弧显示成有向边，边下标上界是有效范围的右端点（不含）；例如有效下标为 `1…m`，填 `m + 1`。

数组和矩阵支持 C++ 固定数组、`std::array`、`std::vector` 等有明确容量的容器；暂不支持直接从裸指针推断数组长度。树和链表字段需要简单成员名，例如 `val`、`left`、`next`。反转链表时可以同时添加 `prev` 和 `curr`，观察两段链表。

### 采集语义

服务器在源码的临时副本中插入采集代码，编辑器中的原始代码保持不变。插入代码在原作用域立即读取变量，不会保存对局部变量的悬空引用。编译诊断通过 `#line` 对应到原始 `main.cpp`；观察配置中的错误会显示为 `watch_<观察 ID>`。

- 同一行的多个观察变量在同一帧采集。
- 不同行的观察变量各自更新，其他卡片保留最近一次采集值，并显示“沿用第 N 步的值”。变量离开作用域后，卡片仍是历史快照。
- 在采集行之前增删源码行，会相应调整行号；修改范围无法可靠对应时，会要求编辑并确认采集位置。
- 修改源码、观察配置或标准输入后，旧结果有明确提示，重新运行才会更新。
- 回退只查看快照，不会逆向执行 C++。这是运行完成后的回放，不是逐条语句的调试器。

采集位置需要位于函数体中的完整语句之后。多行语句选择最后一行；`for / if` 的单语句体请先加大括号；不要选择预处理指令、跨行宏、声明中间、`return / break / continue` 之后或作用域已关闭的位置。配置中的表达式也在该位置求值，请使用无副作用的变量访问，且只读取已初始化数据和有效指针。当前采集器用于单线程算法。

### 本地执行边界

服务只监听 `127.0.0.1`，运行接口校验同源请求和会话令牌。C++ 在当前用户权限下作为本机进程执行，**不是隔离沙箱**；只运行自己信任的代码。公开部署前需要另加进程、文件系统和资源隔离。

默认程序时限 5 秒、编译时限 30 秒，标准输出与标准错误合计最多 1 MB；源码最多 200 KB，标准输入最多 64 KB，最多添加 12 个观察变量。停止运行或断开请求会终止执行进程，结束后清理对应的临时编译目录。程序自行创建的其他文件不在清理范围内。指针有效性和程序自身的内存使用仍由 C++ 程序负责。

## 可选：用头文件离线采集

复杂自定义结构、依赖边或需要精细控制时，仍可复制 `include/viz.hpp`，以 C++17 编译，在程序中添加观察器和关键步骤。项目的 `examples/` 和六份 `traces/` 展示了这种方式。

```cpp
#include "viz.hpp"
#include <vector>

int main() {
    std::vector<std::vector<int>> adj = {{1, 2}, {2}, {}};
    int current = -1;
    viz::Session session("trace.jsonl", "我的图算法", __FILE__);
    auto graph = session.watch_graph("g", "graph", [&](auto& g) {
        g.directed(true);
        for (int u = 0; u < int(adj.size()); ++u)
            g.node(u, viz::str(u), current == u ? "active" : "default");
        for (int u = 0; u < int(adj.size()); ++u)
            for (int i = 0; i < int(adj[u].size()); ++i)
                g.edge(viz::str(u) + ":" + viz::str(i), u, adj[u][i]);
    });
    auto value = session.watch_value("current", [&] { return current; });
    VIZ_STEP(session, "初始化");
    current = 0;
    VIZ_STEP(session, "处理节点 0");
}
```

```sh
g++ -std=c++17 -Iinclude my_algorithm.cpp -o my_algorithm
./my_algorithm
```

运行后在网页中导入 `trace.jsonl`。导入轨迹仅回放数据，不执行其中嵌入的源码；如需执行源码，需手动添加观察变量并点击编译运行。

`Session` 构造时会创建或覆盖指定输出文件。提供 `__FILE__` 时，会尝试将源文件内容嵌入轨迹；运行目录应能解析该路径，否则仍可回放但不显示源码。宏记录的是采集调用所在行，不是对整个程序自动逐行跟踪。

**必须保留 `watch_*` 返回的句柄。** 句柄销毁时注销观察器；支持移动，不可复制。捕获的变量必须在观察期间存活。每次 `VIZ_STEP` 会同步读取当前值并输出一份完整快照。回退是查看历史快照，不会逆向执行程序。

## 适配器 API

| API | 用途 |
| --- | --- |
| `session.watch_graph(id, name, callback)` | 任意图，回调接收 `GraphBuilder&` |
| `session.watch_tree(id, name, callback)` | 树，使用 `g.root(id)` 指定根 |
| `session.watch_list(id, name, callback)` | 链表，使用 `g.head(id)` 指定头 |
| `session.watch_matrix(id, name, callback)` | 矩阵，回调接收 `MatrixBuilder&` |
| `session.watch_array(id, name, callback)` | 用一行矩阵观察数组 |
| `session.watch_value(name, callback)` | 运行变量，返回可输出到流的值 |

GraphBuilder：

```cpp
g.directed(true);
g.node(id, label, "active");           // label 和 state 可省略
g.edge(edge_id, from, to, weight);     // weight 可省略
g.node_state(id, "done");
g.edge_state(edge_id, "active");
```

状态包括 `default`、`frontier`、`active`、`visited`、`done`。所有 ID 序列化为字符串；节点标签与节点身份分离。边需要独立、稳定的 ID。节点单独输出，所以孤立点不会丢失。自环、重边和零权边都可表示。

内置图适配器：

```cpp
// 条目包含 .to、.id、.weight，first/count 指定有效节点区间。
viz::adjacency_list(g, adj, first, count, directed);

// 无边判定显式传入；0 不被固定解释为无边。
viz::adjacency_matrix(g, a, first, count,
    [](int u, int v, int weight) { return weight != -1; }, directed);

// end 为 -1 或 0 等链尾标记；edge_count 是有效下标范围上界（不含）。
viz::forward_star(g, head, to, next, weight,
    first, count, end, edge_count);
```

邻接表的无向边：两条镜像存储记录必须使用相同的边 ID，不同重边使用不同 ID。邻接矩阵的无向图适配器读取上三角，要求输入表示对称关系；普通单值矩阵本身不能表达多条独立重边。链式前向星适配器把每条存储弧解释为有向边；无向配对、残量网络或带删除标记的结构请使用自定义回调。不同适配器间允许边 ID 不同，但同一条轨迹内必须稳定。

MatrixBuilder：

```cpp
m.values(vector_of_vectors);
m.values(native_array, initialized_rows, initialized_cols);
m.mark(i, j, "active");
m.depends(i - 1, j, i, j);  // 显式记录转移依赖
```

后添加的同一单元格标记覆盖先前标记。调用者负责传入有效维度、有效指针和已初始化数据。矩阵数值由 C++ 采集器转为字符串，保留大整数文本精度；网页协议也接受 JSON 标量。值的变化可以自动比较，读依赖和算法含义需要显式记录。

对自定义指针链表，可以沿 `next` 遍历并通过已访问 ID 集合截断环。反转过程中，仅从旧 head 遍历会遗漏暂时断开的节点，所以示例观察整个存活节点集合。地址作为 ID 时需考虑释放后地址复用，推荐程序自身的稳定编号。

## 轨迹格式 v1

JSONL，每行一个 JSON 对象。第一行为 header，其后为连续 seq 从 0 开始的完整 frame。

```jsonl
{"type":"header","version":1,"title":"demo","source":{"file":"demo.cpp","code":"..."}}
{"type":"frame","seq":0,"label":"初始化","source":{"file":"demo.cpp","line":1},"variables":{"current":"0"},"structures":[{"id":"g","name":"graph","kind":"graph","directed":true,"nodes":[{"id":"0","label":"0","state":"active"}],"edges":[]}]}
```

结构类型为 `graph/tree/list/matrix/array`。树和链表采用图模型并附加可选 `root/head`；矩阵和数组均使用二维 `values`，可附加 `marks: [{row,col,state}]` 和 `dependencies: [{from:[r,c],to:[r,c]}]`。同一 ID 在时间轴上代表同一元素。一个 frame 可以包含多个观察结构和变量。

编辑器采集的结构还带有 `capturedSeq` 与 `capturedLine`，表示该结构最近一次实际采集的帧和源代码行号。保留旧快照时这两个字段不变。原有 v1 轨迹仍可导入。

导入会校验版本、连续帧号、重复 ID、边端点、矩阵形状和高亮坐标。限额：文件 25 MB、5000 帧、每帧 24 个结构、每结构 1000 个节点 / 5000 条边 / 40000 个单元格。限额用于避免明显失控的导入，当前布局面向教学规模数据，不保证上限数据量仍然流畅。

## 重新生成与验证

```sh
npm run examples   # 编译四个 C++ 示例，生成六份轨迹
npm test           # 协议、算法结果、布局、观察配置、行号和 LeetCode 配置（26 项）
npm run test:cpp   # 编译执行 C++ 边界与观察器生命周期测试
npm run test:runner # 真实编译运行、stdin、各适配器、错误、超时和取消（7 组）
npm run test:leetcode # 真实编译 Solution：参数、返回值、void、节点、行号和错误（7 组）
```

自动发现 `g++` / `clang++`，Windows 下也会发现 Visual Studio Build Tools 的 MSVC。可通过 `CXX` 指定兼容 GCC 参数风格的编译器可执行文件。安装编译器或更改配置后重启服务。编辑器的 MSVC 编译使用 `/std:c++17 /EHsc /utf-8 /W3`。

## 项目结构与范围

```text
include/viz.hpp       采集、JSON 编码、结构构建器、内置图适配器
include/viz_editor.hpp 编辑器采集运行时、容器范围检查、指针结构遍历
include/leetcode_runner.hpp Solution 方法签名、参数转换、节点构造与结果输出
examples/             四个真实 C++ 算法
traces/               可直接导入的实际执行轨迹
src/trace.js          协议校验、序列化和状态差异
src/render.js         稳定布局、SVG 图/树/链表、矩阵
src/app.js            源码编辑、观察配置、多结构工作区与时间轴
src/watch-config.js   界面与服务器共享的变量配置定义
src/editor-samples.js 无需修改源码即可使用的编辑器示例
src/execution-config.js 运行模式与 LeetCode JSON 参数校验
scripts/instrument.mjs 按采集行生成临时 C++ 代码
scripts/leetcode.mjs  生成 LeetCode 编译环境及调用入口
scripts/runner.mjs    编译器发现、进程执行、超时、取消与清理
scripts/serve.mjs     本地静态文件和编译运行接口
tests/                JS 与 C++ 验证
```

此版本根据用户明确配置的表达式、结构类型和行号生成采集代码；不包括任意 C++ 语法树分析、GDB/LLDB 调试器集成、自动识别任意存储结构、增量轨迹压缩或程序逆向执行。图用确定性的环形布局，树用层次布局，链表保持节点位置稳定。布局与每帧重绘面向教学规模数据。

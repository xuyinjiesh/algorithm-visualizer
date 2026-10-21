#include "viz.hpp"

int main(int argc, char** argv) {
    const int rows = 5, cols = 6;
    int dp[rows][cols] = {};
    int i = -1, j = -1;
    viz::Session session(argc > 1 ? argv[1] : "dp.jsonl", "二维动态规划 · 不同路径", __FILE__);
    auto matrix = session.watch_matrix("dp", "dp[i][j]", [&](auto& m) {
        m.values(dp, rows, cols);
        for (int r = 0; r < rows; ++r) for (int c = 0; c < cols; ++c) if (dp[r][c]) m.mark(r,c,"done");
        if (i >= 0 && j >= 0) {
            if (i > 0) { m.mark(i-1,j,"frontier"); m.depends(i-1,j,i,j); }
            if (j > 0) { m.mark(i,j-1,"frontier"); m.depends(i,j-1,i,j); }
            m.mark(i,j,"active");
        }
    });
    auto row = session.watch_value("i", [&] { return i < 0 ? "—" : viz::str(i); });
    auto col = session.watch_value("j", [&] { return j < 0 ? "—" : viz::str(j); });
    auto formula = session.watch_value("transition", [&] { return "上方 + 左方"; });
    VIZ_STEP(session, "初始化 5 × 6 的 DP 表，每一步只允许向右或向下");
    for (i = 0; i < rows; ++i) for (j = 0; j < cols; ++j) {
        dp[i][j] = (i == 0 || j == 0) ? 1 : dp[i-1][j] + dp[i][j-1];
        VIZ_STEP(session, "计算 dp[" + viz::str(i) + "][" + viz::str(j) + "] = " + viz::str(dp[i][j]));
    }
    i = j = -1;
    VIZ_STEP(session, "计算完成：从左上角到右下角共有 126 条不同路径");
}

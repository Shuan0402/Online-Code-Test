#!/bin/sh
# C++ sandbox wrapper：stdin → main.cpp → compile → exec a.out
#
# 流程上每筆 submission 都會跑一次這支 script（一個容器 = 一筆 submission）。
# 任何一步失敗 → set -e 立即退出 → exit code 非 0 → worker 拿來判 verdict。

set -e

# stdin 倒進 source 檔
cat > /sandbox/main.cpp

# 編譯
#   -O2          標準競賽優化等級
#   -std=c++17   對齊 codeforces / 系所 OJ 預設
#   -pipe        compile 中間產物走 pipe 不寫 /tmp，省 disk I/O
#   stderr 自然走 docker 的 stderr stream → worker 收到 compile error
g++ -O2 -std=c++17 -pipe -o /sandbox/a.out /sandbox/main.cpp

# exec：a.out 取代 wrapper 變成 PID 1
#   - 訊號（SIGTERM / SIGKILL）直接到 a.out
#   - 不留 sh 當父 process 浪費資源
exec /sandbox/a.out

#!/bin/sh
# C++ sandbox wrapper：compile /sandbox/source.cpp → exec a.out → stdin = testcase input
#
# Step 8 protocol：source code 由 worker bind mount 到 /sandbox/source.cpp (readonly)，
# 編譯產物 a.out 寫 /tmp（/sandbox 是 :ro 寫不進去；step 7 加 read-only filesystem
# 時也要保留 /tmp 為 rw tmpfs）。
# stdin 純粹是 testcase input、給 a.out 讀。
#
# 流程上每筆 testcase 都會跑一次這支 script（一個容器 = 一個 testcase）。
# 任何一步失敗 → set -e 立即退出 → exit code 非 0 → worker 拿來判 verdict。
#
# CE sentinel：g++ 失敗 → exit 100 → worker decide_verdict 判 CE。

set -e

# 編譯
#   -O2          標準競賽優化等級
#   -std=c++17   對齊 codeforces / 系所 OJ 預設
#   -pipe        compile 中間產物走 pipe 不寫 /tmp，省 disk I/O
#   stderr 自然走 docker 的 stderr stream → worker 收到 compile error
g++ -O2 -std=c++17 -pipe -o /tmp/a.out /sandbox/source.cpp || exit 100

# exec：a.out 取代 wrapper 變成 PID 1
#   - 訊號（SIGTERM / SIGKILL）直接到 a.out
#   - 不留 sh 當父 process 浪費資源
#   - stdin 沒被前面消耗、原樣傳到 a.out
exec /tmp/a.out

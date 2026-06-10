#!/usr/bin/env bash
#
# Sandbox 功能 + 安全測試。
#
# 前置:呼叫前須已 build 好 sandbox:python 與 sandbox:cpp 兩個映像檔
#       (CI 的 build-test-scan job 會先 build 再呼叫本腳本)。
# 用法:bash judge-sandbox/tests/run.sh
#
# 功能測試:把「已知答案」的程式掛進 sandbox 跑,比對輸出 / exit code。
# 安全測試 (test 4-6):用本腳本「手動帶入」旗標跑惡意程式,驗證 docker 引擎
#   會 enforce 那些旗標(設計層 spec)。
# e2e 安全測試 (test 7):走 worker production code path、直接呼叫
#   DockerSpawner.run() 跑 netattempt 並斷言 NETWORK_BLOCKED → 驗證「實作層」
#   真有套上旗標。過去 worker._build_run_cmd() 是 TODO 沒套、test 4-6 PASS
#   但 production 裸跑;這條 e2e 是 regression guard、未來 anyone 拔旗標立刻紅。

set -u

FIX="$(cd "$(dirname "$0")/fixtures" && pwd)"
PASS=0
FAIL=0

# check <名稱> <預期值> <實際值>
check() {
  if [ "$2" = "$3" ]; then
    echo "  PASS — $1"
    PASS=$((PASS + 1))
  else
    echo "  FAIL — $1(預期:$2,實際:$3)"
    FAIL=$((FAIL + 1))
  fi
}

echo "── 功能測試 ──────────────────────────────────"

# 1. Python:讀 "3 4" → 應印 "7"
out="$(echo '3 4' | docker run --rm -i \
  -v "$FIX/good.py:/sandbox/source.py:ro" sandbox:python 2>/dev/null)"
check "Python 正確執行(3+4=7)" "7" "$out"

# 2. C++:讀 "3 4" → 應印 "7"
out="$(echo '3 4' | docker run --rm -i \
  -v "$FIX/good.cpp:/sandbox/source.cpp:ro" sandbox:cpp 2>/dev/null)"
check "C++ 正確執行(3+4=7)" "7" "$out"

# 3. C++ 編譯失敗 → entrypoint 回傳 exit 100(CE sentinel)
docker run --rm -i \
  -v "$FIX/bad.cpp:/sandbox/source.cpp:ro" sandbox:cpp >/dev/null 2>&1
check "C++ 編譯失敗回報 CE(exit 100)" "100" "$?"

echo "── 安全測試 ──────────────────────────────────"

# 4. 記憶體炸彈:--memory=128m 應觸發 OOM kill,程式無法存活
#    contained = 非正常結束(exit≠0)且沒印出存活訊息
out="$(docker run --rm -i --memory=128m --memory-swap=128m \
  -v "$FIX/membomb.py:/sandbox/source.py:ro" sandbox:python 2>/dev/null)"
code=$?
if [ "$code" -ne 0 ] && [ "$out" != "MEMBOMB_SURVIVED" ]; then
  check "記憶體炸彈被 --memory 限制住" "contained" "contained"
else
  check "記憶體炸彈被 --memory 限制住" "contained" "survived(exit=$code)"
fi

# 5. 無窮迴圈:確認它「跑不停、必須靠外力中斷」—— worker 逾時後就是用 docker kill。
#    背景啟動容器,等 5 秒後檢查是否還活著;還活著 = 它不會自己停 = 須被強制中斷。
#    註:不能用「timeout docker run」—— 容器內 python 是 PID 1,會忽略 SIGTERM,
#        timeout 送的 SIGTERM 無效、會整個卡死。直接用 docker kill 才打得到容器。
docker run --rm -i --name sbx-infloop \
  -v "$FIX/infloop.py:/sandbox/source.py:ro" sandbox:python >/dev/null 2>&1 &
sleep 5
if docker ps --filter name=sbx-infloop --format '{{.Names}}' | grep -q sbx-infloop; then
  still_running="yes"
else
  still_running="no"
fi
docker kill sbx-infloop >/dev/null 2>&1 || true
wait 2>/dev/null
check "無窮迴圈跑不停、需被 docker kill 強制中斷" "yes" "$still_running"

# 6. 連網嘗試:--network=none 應擋掉所有對外連線
out="$(docker run --rm -i --network=none \
  -v "$FIX/netattempt.py:/sandbox/source.py:ro" sandbox:python 2>/dev/null)"
check "對外連線被 --network=none 阻擋" "NETWORK_BLOCKED" "$out"

echo "── e2e 安全測試(走 worker production code path)──"

# 7. 直接呼叫 worker DockerSpawner.run() 跑 netattempt → 驗證實作層真套了 --network=none。
#    這是 P1 regression guard:若 worker._build_run_cmd() 哪天被改掉、忘了帶旗標、
#    test 4-6 還是 PASS(因為它們各自手動 hardcode 旗標)、但 test 7 會立刻紅。
WORKER_DIR="$(cd "$(dirname "$0")/../../judge-worker" && pwd)"
out="$(cd "$WORKER_DIR" && python3 -c "
import sys
sys.path.insert(0, '.')
from spawner.docker_spawner import DockerSpawner

with open('$FIX/netattempt.py') as f:
    src = f.read()

r = DockerSpawner().run(
    image='sandbox:python',
    source=src,
    source_filename='source.py',
    stdin='',
    timeout=10,
)
print(r.stdout.strip())
" 2>/dev/null)"
check "worker 實際 spawn 套上 --network=none(production)" "NETWORK_BLOCKED" "$out"

echo "──────────────────────────────────────────────"
echo "結果:$PASS 通過,$FAIL 失敗"

# 有任何一項失敗 → 非 0 退出 → CI 變紅
[ "$FAIL" -eq 0 ]

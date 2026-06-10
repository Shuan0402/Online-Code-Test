#!/bin/bash
# Load test for Grafana dashboard demo.
# Generates mixed 2xx / 4xx traffic so QPS / latency / status-code panels light up.
#
# Usage:
#   ./scripts/loadtest.sh           # default 60s
#   ./scripts/loadtest.sh 30        # 30s
#   ./scripts/loadtest.sh 120       # 2 min

set -e
DURATION=${1:-60}
BASE=http://localhost:8000

echo "── 抓 token ─────────────────────────────────────"
CANDIDATE_TOKEN=$(curl -s -X POST "$BASE/api/v1/auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=demo_candidate&password=password123" | sed -nE 's/.*"access_token":"([^"]+)".*/\1/p')

if [ -z "$CANDIDATE_TOKEN" ]; then
  echo "❌ login 失敗。確認 backend 跑了、demo_candidate seed 過。"
  exit 1
fi
echo "✅ candidate token: ${CANDIDATE_TOKEN:0:20}..."
echo ""
echo "── 開跑 ${DURATION}s,Ctrl+C 提前停 ──────────"
echo ""

END=$(($(date +%s) + DURATION))

# ── 1) 高頻 healthcheck + metrics(產 200 流量) ──
{
  while [ "$(date +%s)" -lt $END ]; do
    curl -s -o /dev/null "$BASE/health" || true
    sleep 0.3
  done
} &

# ── 2) 中頻 authenticated GET(產 200) ──
{
  while [ "$(date +%s)" -lt $END ]; do
    curl -s -o /dev/null -H "Authorization: Bearer $CANDIDATE_TOKEN" "$BASE/api/v1/users/me" || true
    curl -s -o /dev/null -H "Authorization: Bearer $CANDIDATE_TOKEN" "$BASE/api/v1/candidate/exams/" || true
    sleep 0.8
  done
} &

# ── 3) 故意 404 / 401 / 422(產錯誤、status code pie 變紅) ──
{
  while [ "$(date +%s)" -lt $END ]; do
    # 401: 沒帶 token 打受保護資源
    curl -s -o /dev/null "$BASE/api/v1/users/me" || true
    # 401: 錯密碼登入
    curl -s -o /dev/null -X POST "$BASE/api/v1/auth/login" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -d "username=demo_candidate&password=WRONG_PASSWORD" || true
    # 404: 不存在的路徑
    curl -s -o /dev/null "$BASE/api/v1/nonexistent-endpoint-12345" || true
    # 422: payload 缺欄位
    curl -s -o /dev/null -X POST "$BASE/api/v1/auth/login" \
      -H "Content-Type: application/json" \
      -d '{"wrong":"shape"}' || true
    sleep 1.5
  done
} &

# ── 4) 進度條(對著終端機看比較有感) ──
{
  while [ "$(date +%s)" -lt $END ]; do
    REMAINING=$((END - $(date +%s)))
    printf "\r⏱  剩 %3ds  |  Grafana → http://localhost:3001  " "$REMAINING"
    sleep 1
  done
  echo ""
} &

wait
echo ""
echo "✅ 完成。預期 Grafana 看到:"
echo "   • QPS panel:從 ~0.1 升到 ~5-10 req/s"
echo "   • Status Codes pie:不再全綠、出現 4xx 色塊"
echo "   • P95 latency:有變化"
echo "   • Logs dashboard:backend 那條 INFO/WARNING 大量湧入"

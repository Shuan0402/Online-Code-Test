# 安全測試用:嘗試對外連線,驗證 docker run 的 --network=none 會擋掉。
# 連得上 → NETWORK_REACHABLE(代表沒關住);連不上 → NETWORK_BLOCKED(正確)。
import socket

try:
    socket.create_connection(("1.1.1.1", 53), timeout=5)
    print("NETWORK_REACHABLE")
except OSError:
    print("NETWORK_BLOCKED")

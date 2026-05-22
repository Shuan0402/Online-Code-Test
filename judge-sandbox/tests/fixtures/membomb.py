# 安全測試用:不斷配置記憶體,驗證 docker run 的 --memory 限制會把它擋下來。
# 每塊 bytearray 都是實際寫入的記憶體,會被 cgroup 計入。
# 若限制失效、程式竟然跑完,會印出 MEMBOMB_SURVIVED(測試據此判定失敗)。
chunks = []
for _ in range(100000):
    chunks.append(bytearray(10 * 1024 * 1024))  # 每塊 10 MB
print("MEMBOMB_SURVIVED")

# Round 2 — sandbox:cpp (C++ sandbox base image)
#
# 設計目標：跑陌生人 C++ code 的最小可用 image，攻擊面最小化、可重現、non-root。
#           C++ 必然帶 g++ runtime，無法做到 Python sandbox 那種 distroless 等級。
#
# Build:   docker build -t sandbox:cpp judge-sandbox/images/cpp
# Test:    docker run --rm -i sandbox:cpp < /tmp/test-good.cpp
#
# 對比 Round 1 (sandbox:cpp-naive)：
#   SIZE:      2.14 GB → 預計 ~250-400 MB
#   USER:      root (uid 0) → nonroot (uid 65532)
#   TAG:       gcc:latest 浮動 → debian-slim digest 釘死
#   ENTRYPOINT: inline /bin/sh -c → 獨立 entrypoint.sh + exec a.out
#   PID 1:     永遠是 sh → 編譯後變 a.out

# Base：debian-slim digest 釘死。
# digest 抓法：
#   docker pull debian:bookworm-slim
#   docker inspect --format='{{index .RepoDigests 0}}' debian:bookworm-slim
FROM debian:bookworm-slim@sha256:f9c6a2fd2ddbc23e336b6257a5245e31f996953ef06cd13a59fa0a1df2d5c252

# 裝 g++ + 必要 deps（libstdc++, binutils 等會被 apt 自動帶進來）
#   --no-install-recommends：只裝 hard deps，不裝「文件、debugger、其他語言」
#   清 apt cache：節省 image size + 不留下 attack surface
RUN apt-get update \
 && apt-get install -y --no-install-recommends g++ \
 && rm -rf /var/lib/apt/lists/*

# 自建 nonroot user (uid 跟 Step 5 對齊)
#   -M：不建 home dir
#   -s /usr/sbin/nologin：不能 login shell（多一層防線）
RUN groupadd -g 65532 nonroot \
 && useradd -u 65532 -g nonroot -s /usr/sbin/nologin -M nonroot

# wrapper script，root 期間 COPY 進去並設成 nonroot 可讀執行
COPY --chown=root:root --chmod=0555 \
     entrypoint.sh /usr/local/bin/entrypoint.sh

# 從這邊起所有指令以 nonroot 身份執行
USER nonroot

# user code 的 cwd（Step 7 會把 /sandbox 換成 tmpfs）
# WORKDIR 在 USER nonroot 之後 → /sandbox 的 owner 自動是 nonroot
WORKDIR /sandbox

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

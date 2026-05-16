# Round 2 — sandbox:python (Python sandbox base image)
#
# 設計目標：跑陌生人 Python code 的最小 image，攻擊面最小、可重現、non-root。
#
# Build:   docker build -t sandbox:python judge-sandbox/images/python
# Test:    echo "print(2+2)" | docker run --rm -i sandbox:python
#
# 對比 Round 1 (sandbox:python-naive)：
#   SIZE:  1.61 GB → ~50 MB
#   USER:  root (uid 0) → nonroot (uid 65532)
#   TAG:   floating (python:3.13) → digest-pinned
#   SHELL: bash + sh + apt + ls 全有 → 全無（distroless）

# Base：distroless python3-debian12 nonroot 變體，digest 釘死。
# digest 抓法：
#   docker pull gcr.io/distroless/python3-debian12:nonroot
#   docker inspect --format='{{index .RepoDigests 0}}' \
#       gcr.io/distroless/python3-debian12:nonroot
# 換 base image 時要重抓。
FROM gcr.io/distroless/python3-debian12:nonroot@sha256:7d1042ce588ab97019fe95c24ffca7bc5a82ccdac572511d5e09bda4435c89c5

# user code 的 cwd；Step 7 會把 /sandbox 換成 tmpfs（記憶體 fs，容器死即消滅）
WORKDIR /sandbox

# PYTHONDONTWRITEBYTECODE：不寫 .pyc bytecode（一次性容器寫了也白寫；
#                          Step 7 會 read-only filesystem，寫 .pyc 還會直接報錯）
# PYTHONUNBUFFERED：       stdout/stderr 不 buffer，worker 即時讀到 output、verdict 不延遲
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Step 8 protocol：source code 由 worker bind mount 到 /sandbox/source.py、
# stdin 純粹是 testcase input、餵 process stdin。
# 寫 python3 而非 python：distroless 只 ship python3 binary，沒有無版本 symlink。
# 寫死 ENTRYPOINT 而非用 base image 預設：避免上游升級時 entrypoint 改動造成行為飄移。
ENTRYPOINT ["python3", "/sandbox/source.py"]

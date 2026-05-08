# Online Code Test

NTHU Cloud Native 期末專案——線上程式測驗平台。User 提交 Python / C++ code，
backend 排隊送進判題 sandbox、回傳 verdict。

## Architecture

```
browser → frontend → nginx → backend (FastAPI) ─┬─ pg
                                                └─ queue → worker → docker run sandbox:{python,cpp}
```

## Roles

- **A. Sandbox & Compute + D. Platform & Obs** — jane
- **B. Backend + C. Worker / Queue** — Shuan0402

## Local Development

需要：Docker Desktop（或 Linux 的 Docker Engine + Compose v2）。

### 第一次 setup

```bash
cp .env.example .env                                              # 填 JWT_SECRET 等
docker build -t sandbox:python judge-sandbox/images/python
docker build -t sandbox:cpp    judge-sandbox/images/cpp
```

### 跑 stack

```bash
docker compose up -d                          # 起 backend + pg
curl http://localhost:8000/health             # → {"status":"ok"}
docker compose logs -f backend                # debug
docker compose restart backend                # 改 code 後重啟
docker compose up -d --build backend          # requirements.txt 改了
docker compose down [-v]                      # 停（-v 砍 DB）
```

### 測 sandbox（手動，沒進 compose）

```bash
echo "print(2+2)" | docker run --rm -i sandbox:python   # 4
printf '#include <iostream>\nint main(){std::cout<<2+2;}\n' \
  | docker run --rm -i sandbox:cpp                       # 4
```

## Backend 合約（給 @Shuan0402）

`backend/app/main.py` 必須：
- listen `0.0.0.0:8000`
- 提供 `GET /health` 回 200（compose healthcheck 在打）
- 從 env 讀 DB：`POSTGRES_HOST=pg`、`POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB`

目前的 `main.py` 是 **placeholder**，覆蓋掉就好（保留 `/health`）。

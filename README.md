# Online Code Test

NTHU Cloud Native 期末專案——線上程式測驗平台。User 提交 Python / C++ code，
backend 排隊送進判題 sandbox、回傳 verdict。

## Architecture

```
browser → frontend → nginx → backend (FastAPI) ─┬─ pg
                                                ├─ queue → worker → docker run sandbox:{python,cpp}
                                                └─ (app_logs Volume) ➔ Promtail ➔ Loki ➔ Grafana
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

### 測試與開發環境分流
專案採用環境感知建置：正式環境維持極致精簡與資安加固；本地開發與 CI 測試階段則會自動注入 `pytest` 等開發期工具。
#### 變更套件依賴
- 核心業務套件（如新框架、驅動）：請寫入 `backend/requirements.txt`
- 輔助開發套件（如測試、Linter）：請寫入 `backend/requirements-dev.txt`
#### 開發期建置與測試
```bash
# 編譯帶有開發期依賴（BUILD_ENV=development）的後端映像檔
docker build --build-arg BUILD_ENV=development -t backend:dev ./backend

# 全服務重啟建置
docker compose down && docker compose up -d

# 執行本地單元測試
docker compose exec backend pytest
```

### 系統觀測與日誌
已整合 Grafana 全自動預配置（Provisioning），`docker compose up -d` 啟動時會自動綁定資料源並掛載儀表板。
- **實時觀測入口**： `http://localhost:3001`
  - 預設帳密：`admin` / `admin` (或讀取 `.env` 中的 `GRAFANA_PASSWORD`)
- **Dashboards 儀錶板**
  - 登入後點擊左側選單 **Dashboards**，選擇 `Online Code Test - FastAPI Backend Matrix` 看板，實時監控 QPS 流量山峰與 P95 Latency 效能防線。
- **Explore 追蹤查詢**
  - 點擊左側選單 **Explore**，左上角數據源下拉選單直接切換至 **Loki**，於查詢列輸入 LogQL `{service="backend"}`，即可免進終端機、實時滾動刨出後端結構化 JSON 日誌流。



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
# Online Code Test

NTHU Cloud Native 期末專案——線上程式測驗平台。User 提交 Python / C++ code，
backend 排隊送進判題 sandbox、回傳 verdict。

## Architecture

```
browser → frontend → nginx → backend (FastAPI) ─┬─ pg (PostgreSQL)
                                                ├─ (app_logs Volume) → Promtail → Loki ───┬➔ Grafana
                                                ├─ Metrics / Exporter → Prometheus ───────┘
                                                └─ Redis Queue ─┬─ [submissions:pending] → judge-worker → docker run sandbox:{python,cpp}
                                                                └─ [messages:email] → email-worker → SMTP → mailhog (Web UI: :8025)
```

## Roles

- **A. Sandbox & Compute + D. Platform & Obs** — jane
- **B. Backend + C. Worker / Queue** — Shuan0402

## Local Development

需要：Docker Desktop（或 Linux 的 Docker Engine + Compose v2）。

Windows 的 Git 預設可能會將 shell 腳本檔案轉換為 CRLF 換行符號。這會導致 Docker 映像檔內的 Linux 殼層 (Shell) 無法正確解析 `entrypoint.sh`，評測時會對 C++ 或 Python 回傳 **RE (Runtime Error)**。

**解決方案：**
1. 在本地執行以下 Git 設定，防止未來 Checkout 時自動將換行符號轉換為 CRLF：
   ```bash
   git config --global core.autocrlf false
   ```
2. 將專案中的 shell 檔案換行符號轉換回 LF。您可以使用 IDE (例如 VS Code) 將檔案的換行符號設定為 `LF`，或者在專案根目錄下使用 Python 進行一鍵轉換：
   ```bash
   python -c "for f in ['judge-sandbox/images/cpp/entrypoint.sh', 'judge-sandbox/tests/run.sh', 'scripts/e2e/helpers/verify-password-hash.sh']: content = open(f, 'rb').read().replace(b'\r\n', b'\n'); open(f, 'wb').write(content)"
   ```
3. **重新編譯** Sandbox 映像檔以套用 LF 換行符號（必須加上 `--no-cache` 以免使用舊快取）：
   ```bash
   docker build --no-cache -t sandbox:cpp judge-sandbox/images/cpp
   ```

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

### 資料庫初始化與測試資料灌入 (Database Initialization & Seeding)

當您首次啟動服務，或是執行 `docker compose down -v` 導致資料庫被清空時，需要重新初始化資料庫並灌入測試資料：

1. **基本測試帳號與資料庫結構初始化**
   本專案在 `backend` 啟動時會自動執行 `python app/db/init_db.py` 以建立 Table 結構，並建立預設的系統測試帳號（包含 `admin@nthu.edu.tw` / `password123` 等）。

2. **手動測試資料灌入 (適用於一般手動測試與 Demo)**
   若要登入考生帳號、建立考試或進行程式碼提交測試，您需要執行以下指令以建立 `demo_candidate`、`demo_questioner` 以及範例題目「兩數相加 (demo)」：
   ```bash
   docker compose exec backend python -m app.scripts.seed_demo_scenarios
   ```

3. **端到端 (E2E) 測試資料灌入 (適用於 Playwright 測試)**
   若您需要執行 Playwright 端到端測試，請分別執行以下指令來灌入對應的測試情境資料：
   ```bash
   # 灌入考生端 E2E 測試資料
   docker compose exec backend python -m app.scripts.seed_e2e_candidate
   
   # 灌入面試官端 E2E 測試資料
   docker compose exec backend python -m app.scripts.seed_e2e_interviewer
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
docker compose down
docker compose up -d

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

## 程式碼品質與安全性檢查 (SonarQube)
本專案引入 **SonarQube Build / SonarScanner** 來檢測程式碼中的潛在漏洞（Vulnerabilities）、安全性風險（Security Hotspots）以及代碼異味（Code Smells）。
為了提高開發效率，我們採用 **「左移（Shift-Left）」** 策略。請在提交程式碼或推送到 GitHub Actions CI 之前，先在本地環境完成漏洞修補與驗證，避免頻繁觸發雲端 CI。
### 1. 啟動本地 SonarQube 服務
專案內建了本地 SonarQube 容器服務，已自動避開與 MinIO (9000) 的埠口衝突，改在 `9005` 監聽。

```bash
# 啟動本地 SonarQube 服務 (首次啟動需等待約 30s-1min 初始化)
docker compose up -d sonarqube

# 檢查啟動狀態與日誌
docker compose logs -f sonarqube
```
啟動後可使用瀏覽器造訪：http://localhost:9005 (預設帳密: admin / admin)。
建議更改密碼為：password@123
### 2. 本地快速掃描指令範本
我們使用官方推薦的 pysonar 工具在 WSL2/Linux 環境下直連掃描。請先確保已切換至專案虛擬環境並安裝套件：

```bash
# 建立並啟用 Python 隔離環境 (若尚未建立)
python3 -m venv .venv
source .venv/bin/activate

# 安裝 Sonar 官方 Python 掃描器
pip install pysonar
```
#### 掃描指令模板
請複製以下指令，並將 --sonar-token 替換為你在本地 http://localhost:9005 個人帳號或專案中所產生的 Access Token：
```Bash
pysonar \
  --sonar-host-url=http://localhost:9005 \
  --sonar-token=YOUR_SONAR_TOKEN_HERE \
  --sonar-project-key=Online-Code-Test
```
### 3. 符合一般軟體開發流程的修復循環 (Recommended Workflow)
當你看到雲端 CI 或本地 Sonar 頁面跳出漏洞提示時，最有效率的日常修復節奏為：
1. 程式碼修改：針對提示漏洞，直接於本地編輯器（建議搭配 IDE 的 SonarLint 套件）修改原始碼。
2. 邏輯驗證：在本地 Docker 容器中快速執行全部單元測試，確保修補未改壞既有邏輯（Regression）。
   ```Bash
   docker compose exec backend pytest
   ```
3. 安全驗證：執行上述的 pysonar 模板指令，確認 SonarQube 上的漏洞紅字歸零。
4. 點收成果：確認測試全過、漏洞全滅後，再執行 git commit 與 git push 送上雲端。
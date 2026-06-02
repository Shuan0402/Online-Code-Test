# AWS Learner Lab — 最基本部署手冊

> **目標**：把整套 Online Code Test 部署到一台 EC2、用 EC2 的 public DNS 連線、網站運作正常、**沒有 CORS 問題**。
> **適用**：AWS Academy Learner Lab（無 Route 53 / ACM / CloudFront、4 小時 credentials、session 結束 EC2 stop）。
> **架構**：單台 EC2 跑全部 docker-compose 服務、nginx 在 :80 同源反向代理（避免 CORS）。

---

## 為什麼是同源反向代理

瀏覽器的 **same-origin policy**：JS 從 A 網站發的請求、不能讀 B 網站的回應，除非 B 在 response 加 CORS header 明說「我允許 A 來」。「同源」= protocol + host + port 三個都一樣。

這份方案讓**前端、後端 API、MinIO 檔案、Grafana** 全部從 `http://<ec2-public-dns>` 出來（同一個 host:80）→ 對瀏覽器來說都是同源 → 完全不需要 CORS 設定。

```
瀏覽器 ──http://<ec2-host>──> nginx :80 ──┬─ /api/*                 → backend:8000
                                          ├─ /octest-submissions/*  → minio:9000
                                          ├─ /grafana/*             → grafana:3000
                                          └─ 其他                    → React SPA index.html
```

---

## 步驟 1：在 Learner Lab 開 EC2

1. 登入 AWS Academy → **Start Lab** → 等綠燈 → 點 **AWS** 進 Console
2. 進 **EC2** → **Launch instance**
   - **Name**：`octest-prod`
   - **AMI**：Amazon Linux 2023（預設選項）
   - **Instance type**：`t3.large`（2 vCPU / 8 GB RAM）
   - **Key pair**：建一組新的、下載 `.pem`、`chmod 400 octest.pem`
   - **Network settings → Edit → Security group**：建新的、加兩條 inbound rule
     - SSH (22) — Source: My IP
     - HTTP (80) — Source: Anywhere (`0.0.0.0/0`)
   - **Storage**：30 GB gp3
3. **Launch instance** → 進 instance detail page → 抄 **Public IPv4 DNS**（長這樣 `ec2-XX-XX-XX-XX.compute-1.amazonaws.com`）

---

## 步驟 2：SSH 進 EC2 裝環境

```bash
ssh -i octest.pem ec2-user@ec2-XX-XX-XX-XX.compute-1.amazonaws.com

# 裝 docker
sudo dnf update -y
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user

# 裝 docker compose v2 plugin（Amazon Linux 2023 dnf 還沒進）
DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
mkdir -p $DOCKER_CONFIG/cli-plugins
curl -SL https://github.com/docker/compose/releases/download/v2.27.0/docker-compose-linux-x86_64 \
  -o $DOCKER_CONFIG/cli-plugins/docker-compose
chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose

# 重新登入讓 docker group 生效
exit
ssh -i octest.pem ec2-user@ec2-XX-XX-XX-XX.compute-1.amazonaws.com

# 驗證
docker --version
docker compose version
```

---

## 步驟 3：Clone repo + 設定 .env

```bash
git clone https://github.com/Shuan0402/Online-Code-Test.git
cd Online-Code-Test
git checkout feat/aws-deploy   # 雲端部署分支

# 複製 prod 範本、編輯填值
cp .env.prod.example .env
nano .env
```

**`.env` 一定要改的**：
- `PUBLIC_HOST=http://ec2-XX-XX-XX-XX.compute-1.amazonaws.com` —— 步驟 1 抄的 public DNS、**前面要加 `http://`、結尾不要斜線**
- `JWT_SECRET` —— 用 `openssl rand -base64 32` 產
- `WORKER_SECRET` —— 同上
- `POSTGRES_PASSWORD`、`MINIO_PASSWORD`、`GRAFANA_PASSWORD` —— 改強密碼

---

## 步驟 4：起服務

```bash
# build + 起所有 container（第一次會跑 8-15 分鐘，前端 build 跟 image pull 是大頭）
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 看狀態
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

# 看 log（卡住或 debug 時）
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f nginx
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f backend
```

等 `STATUS` 全部變 `Up` 或 `Up (healthy)` 後、瀏覽器開：

- 主站：`http://ec2-XX-XX-XX-XX.compute-1.amazonaws.com`
- Grafana：`http://ec2-XX-XX-XX-XX.compute-1.amazonaws.com/grafana/`

---

## 步驟 5：建第一個帳號 / seed 測試資料

```bash
# 進 backend container
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend bash

# 在 container 內跑 seed 腳本（建 manual test 場 + 4 角色帳號）
python -m app.scripts.seed_manual_test
exit
```

帳號清單會印在 stdout（admin / manual_q / interviewer / manual_test）。

---

## 步驟 6：驗證

開瀏覽器到 `http://<public-dns>`：

1. 登入頁出現、UI 正常（中文字、layout 對）
2. 用 admin 帳號登入 → 看到 admin 主控台
3. 開 DevTools → Network → 隨便點一個動作 → 看 request URL 是 `http://<public-dns>/api/v1/...`、**Response Headers 沒有 `Access-Control-Allow-Origin`**（因為是同源、根本不需要）
4. 上傳一份 submission → 開 interviewer 看 submission detail → 能看到原始碼（這條走 MinIO presigned URL）

---

## Learner Lab 的眉角

### 1. Session 結束 EC2 會被 stop、public DNS 會換

下次再來：
1. Start Lab → 進 Console → EC2 → 找到 instance → **Start** 它
2. 抄**新的** Public IPv4 DNS
3. SSH 進去：
   ```bash
   cd Online-Code-Test
   nano .env                 # 改 PUBLIC_HOST 成新 DNS
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```
4. 不用 rebuild image、不用重 seed 資料（pg / minio 都用 named volume、host 重啟資料還在）

### 2. 4 小時 credentials 到期

只影響 AWS CLI / SDK 操作（你這次部署沒用到、不會被影響）。EC2 instance 本身一旦起來、後續會持續跑直到你 Stop Lab。

### 3. 沒有 HTTPS

Learner Lab 給不了 ACM、也沒 Route 53 可以串自訂 domain。只能用 HTTP。Demo 給人看時直接貼 `http://...` 網址、瀏覽器會說「Not Secure」但能用。

如果之後要 HTTPS，最簡單是：
- 用個人的 Cloudflare 帳號 → Quick Tunnel（`cloudflared tunnel --url http://localhost:80`）→ 拿到一條 `*.trycloudflare.com` 的免費 HTTPS URL
- 不需要 ACM、不需要 domain、ephemeral 但 demo 夠用

---

## CORS 故障排除

如果瀏覽器 Console 出現 `CORS policy: No 'Access-Control-Allow-Origin' header`：

**先檢查請求的 host**：DevTools → Network → 點失敗的 request → Headers → `Request URL`。

- 如果是 `http://ec2-XX.../api/...` → 走 nginx 同源、應該不會 CORS。看是不是後端真的 down（502/504）
- 如果是 `http://ec2-XX...:8000/api/...`（有 `:8000`）→ 前端打到後端的 host port，繞過了 nginx。檢查 `frontend/src/lib/api.js` 的 `baseURL` 應該是空字串
- 如果是 `http://localhost:8000/api/...` → 前端可能用了開發環境變數 build。重 build 一次

如果是 MinIO presigned URL fail：
- 看 URL 開頭是 `http://ec2-XX.../octest-submissions/...`（同源，正常）還是 `http://minio:9000/...`（內部名、外部看不到）
- 後者代表 `MINIO_EXTERNAL_ENDPOINT` 沒設好。確認 `.env` 的 `PUBLIC_HOST` 對、然後 `docker compose ... up -d backend` 重啟 backend

---

## 收尾 / 關機省 credit

```bash
# 暫時關掉所有 container（資料保留）
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# 整套清掉重來（會洗 DB / MinIO 資料！）
docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v
```

EC2 那邊到 Console **Stop Instance**（不要 Terminate、Terminate 會掉 volume）。下次 Start 起來只要重設 `PUBLIC_HOST` 就好。

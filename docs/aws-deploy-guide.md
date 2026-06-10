# AWS 個人帳號 — 最基本部署手冊

> **目標**：把整套 Online Code Test 部署到一台 EC2、用 Elastic IP 對應的 public DNS 連線、網站運作正常、**沒有 CORS 問題**。
> **適用**：個人 AWS 帳號（Elastic IP 讓 stop/start 後 IP 不會變、HTTP only）。
> **架構**：單台 EC2 跑全部 docker-compose 服務、nginx 在 :80 同源反向代理（避免 CORS）。
> **成本提醒**：t3.large running 24/7 約 USD 60/月、EBS 30 GB gp3 約 USD 2.4/月、Elastic IP attach 到 running instance 不收費（detach 後才收 USD 3.6/月）。Demo 結束記得 stop instance 或 terminate。

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

## 步驟 1：開 EC2 + Elastic IP

### 1a. 用 IAM user 登入 AWS Console

用個人 AWS 帳號的 IAM user（不是 root）登入 Console、切到要部署的 region（建議離你近的、例如 `ap-northeast-1` 東京、`us-east-1` 維吉尼亞）。Region 一旦選定、後面所有資源（EC2、EIP、security group）都要在同一個 region 才能互相 attach。

### 1b. Launch EC2 instance

進 **EC2** → **Launch instance**

- **Name**：`octest-prod`
- **AMI**：Amazon Linux 2023（預設選項）
- **Instance type**：`t3.large`（2 vCPU / 8 GB RAM）
- **Key pair**：建一組新的、下載 `.pem`、本機 `chmod 400 octest.pem`
- **Network settings → Edit → Security group**：建新的、加兩條 inbound rule
  - SSH (22) — Source: My IP
  - HTTP (80) — Source: Anywhere (`0.0.0.0/0`)
- **Storage**：30 GB gp3

**Launch instance** → 等 instance state 變 `Running`。

### 1c. 申請 Elastic IP 並 attach 到 instance

進 **EC2 → Elastic IPs** → **Allocate Elastic IP address** → 預設 region pool、**Allocate**。

剛拿到的 EIP → 選它 → **Actions → Associate Elastic IP address**：
- **Resource type**：Instance
- **Instance**：選剛開的 `octest-prod`
- **Associate**

回 instance detail page、抄 **Public IPv4 DNS**（會自動更新成 EIP 對應的、長這樣 `ec2-XX-XX-XX-XX.compute-1.amazonaws.com`）。之後 stop/start instance 這個 DNS 都不會變。

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

## 個人帳號的眉角

### 1. Stop / Start instance 省錢

Demo 結束沒在用、想省 EC2 hourly 費用：

```bash
# EC2 Console → 選 instance → Instance state → Stop
```

EIP 已 attach、stop 後 IP 不會變。下次 Start：
1. EC2 Console → Start instance
2. SSH 進去 → `cd Online-Code-Test && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`
3. **不用改 .env**（EIP 沒變）、**不用 rebuild image**、**不用重 seed**（pg / minio 都用 named volume、資料還在）

注意：stop 後 instance 不收 hourly，但 **EBS volume 還在收**（30 GB gp3 ~ USD 2.4/月）、且 **EIP 從 attached running → attached stopped 開始收費**（USD 3.6/月）。要徹底省錢就 **disassociate EIP** 或 release（但下次要重新 associate / 拿新的）。

### 2. 帳單監控

開個 **Budget alert**：Billing & Cost Management → Budgets → Create budget → Monthly cost > $5 寄信。t3.large 24/7 + EBS + EIP attached running ~ USD 62/月，記得 demo 完 stop instance 或 terminate。

### 3. 沒有 HTTPS

這份 minimal guide 沒設 ACM / Route 53 / 自訂 domain，所以只能用 HTTP。Demo 給人看時直接貼 `http://...` 網址、瀏覽器會說「Not Secure」但能用。

如果要 HTTPS，由低到高複雜度：
- **Cloudflare Quick Tunnel**（`cloudflared tunnel --url http://localhost:80`）→ 拿到一條 `*.trycloudflare.com` 的免費 HTTPS URL，不需要 domain、ephemeral 但 demo 夠用
- **Let's Encrypt + Certbot 直接裝 EC2** → 需要自己的 domain 指向 EIP，certbot 自動續憑證
- **ALB + ACM**（個人帳號可以用）→ ACM 出免費 cert、ALB 做 TLS termination 後再 forward 給 EC2 :80。最 prod-grade、也最貴（ALB 約 USD 18/月）

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

## 收尾 / 關機省錢

```bash
# 暫時關掉所有 container（資料保留）
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# 整套清掉重來（會洗 DB / MinIO 資料！）
docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v
```

EC2 那邊到 Console **Stop Instance**（不要 Terminate、Terminate 會掉 EBS volume 跟資料）。EIP 有 attach 不需要動、下次 Start 起來 `PUBLIC_HOST` 也不用改。

**徹底不用了**：
1. EC2 → **Terminate instance**（會刪 EBS volume 跟所有資料）
2. Elastic IPs → 選 EIP → **Release Elastic IP address**（不 release 會繼續被收 detach 費）
3. Security Groups → 刪掉專門開的 group（避免 inventory 越堆越多）

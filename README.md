# 聲音共振（能量場／神聖幾何）

三種聲音互動遊戲，支援最多 20 人即時連線：

1. **聲音共振**：單人鍵盤／觸控演奏
2. **能量場**：用麥克風發聲的多人脈輪能量場
3. **神聖幾何**：講師帶領的團體梵唱，學員以 QR code 加入

## 本機執行

```bash
npm install
npm start        # http://localhost:3000
```

麥克風需要 HTTPS 或 `localhost`。手機測試請用部署後的網址。

## 部署到 Render

1. 把整個資料夾推到 GitHub：
   ```bash
   git init && git add . && git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/<帳號>/sound-resonance.git
   git push -u origin main
   ```
2. 到 [Render](https://render.com) → **New → Blueprint**（或 New → Web Service），選這個 repo。
   - 使用 Blueprint 時會自動讀取 `render.yaml`。
   - 手動建立時：Runtime `Node`、Build Command `npm install`、Start Command `npm start`、Health Check Path `/healthz`。
3. 部署完成後，用 Render 給的 `https://xxx.onrender.com` 開啟。大廳的 QR code 會自動使用這個網址。

注意：免費方案閒置約 15 分鐘會休眠，第一位進入者要等約 30–60 秒喚醒。正式上課前先開一次頁面。伺服器只在記憶體中存放房間狀態，不需要資料庫，也只開一個實例（多實例會讓同一房間的人看不到彼此）。

## 結構

- `server.js`：靜態檔案 + WebSocket 房間（`/ws`），約 10 Hz 廣播房內快照；`/healthz` 健康檢查
- `public/index.html`：三個遊戲（單檔）
- `public/net.js`：即時連線客戶端

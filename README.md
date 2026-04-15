# CCTV MVP

React + TypeScript + Vite 前端；demo 資料以 **CSV + 影片** 驅動，路徑僅使用 **ASCII 目錄名**（`data/demo/...`），避免跨平台（Windows / macOS / Linux）與 CI 路徑問題。

## 專案結構

```
CCTV_MVP/
├── .github/workflows/     # GitHub Actions（含 Pages 部署）
├── data/demo/             # Demo 資料：包裹 / 繳費機 / 即時查詢（CSV + videoSample）
│   ├── package/
│   ├── kiosk/
│   └── live/
├── docs/                  # 說明文件（如 install.zh-Hant.txt）
├── public/                # 靜態資源（favicon 等）
├── src/                   # React 應用程式
├── demo.html              # 單檔離線 demo（內嵌資源）
├── interactive.html       # 互動示範頁（相對路徑讀取 data/demo）
├── index.html             # Vite 入口
├── package.json
└── vite.config.ts
```

## 本機開發

```bash
npm install
npm run dev
```

## 建置

```bash
npm run build
```

子路徑部署（例如 GitHub Pages）請在建置前設定 `VITE_BASE`，例如：`VITE_BASE=/CCTV/ npm run build`。

## 大型影片

- 倉庫內 `*.mp4`（`data/demo/.../videoSample`）以 **Git LFS** 追蹤（見 `.gitattributes`）。clone 後請執行：`git lfs install`。
- **詳情頁監視器九宮格**：目前以 **黑色底 +「影片示意」** 呈現嵌入區，不播放實際串流；鏡位標籤仍依 `videoSample` 檔名規則產生。

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// 對外提供：dev / preview 使用 host: true 綁定 0.0.0.0，同網段或防火牆開放後可用 http://<主機IP>:埠 存取
// 子路徑部署：建置前設定環境變數 VITE_BASE，例如 VITE_BASE=/cctv-mvp/ npm run build
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
  server: {
    host: true,
    port: 5173,
    strictPort: false,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: false,
  },
})

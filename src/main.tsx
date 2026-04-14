import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as AntdApp, ConfigProvider } from 'antd'
import zhTW from 'antd/locale/zh_TW'
import 'antd/dist/reset.css'
import './twtc-tokens.css'
import './index.css'
import App from './App.tsx'
import { twtcTheme } from './twtcTheme'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={zhTW} theme={twtcTheme}>
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
)

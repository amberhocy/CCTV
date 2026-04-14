/**
 * Ant Design 主題對齊 TWTC / 內部 Storybook 常見規範（主色、側欄、表格、分頁等）。
 * 實際元件仍以 AntD 為主；若內網有 @twtc/* npm 套件，可再替換為對應元件。
 * Storybook: https://twtc.shopee.tw/storybook?path=/
 */
import type { ThemeConfig } from 'antd'
import { theme } from 'antd'

export const TWTC_STORYBOOK_URL =
  'https://twtc.shopee.tw/storybook?path=/' as const

/** 與 TWTC 後台常見視覺一致的全域 token（無法連線 Storybook 時以此對齊） */
export const twtcTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#ee4d2d',
    colorPrimaryHover: '#f05a41',
    colorPrimaryActive: '#d7321a',
    colorLink: '#0088ff',
    colorSuccess: '#26aa3e',
    colorWarning: '#f5a623',
    colorError: '#ff424f',
    colorInfo: '#0088ff',
    borderRadius: 4,
    wireframe: false,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'PingFang TC', 'PingFang SC', 'Microsoft JhengHei', 'Heiti TC', 'Noto Sans TC', sans-serif",
    fontSize: 14,
    lineHeight: 1.5715,
    colorText: '#262626',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#8c8c8c',
    colorBorder: '#f0f0f0',
    colorBorderSecondary: '#e8e8e8',
    colorFillAlter: '#fafafa',
    colorBgLayout: '#f5f5f5',
    controlHeight: 32,
    controlOutline: 'rgba(238, 77, 45, 0.2)',
  },
  components: {
    Layout: {
      bodyBg: '#f5f5f5',
      headerBg: '#ffffff',
      headerHeight: 48,
      headerPadding: '0 20px',
      headerColor: '#262626',
      siderBg: '#f5f5f5',
      lightSiderBg: '#f5f5f5',
    },
    Menu: {
      itemBorderRadius: 4,
      itemMarginInline: 8,
      itemSelectedBg: '#fff1f0',
      itemSelectedColor: '#cf1322',
      itemHoverBg: '#ebebeb',
      itemColor: '#262626',
      iconSize: 16,
      collapsedIconSize: 16,
    },
    Tabs: {
      inkBarColor: '#ee4d2d',
      itemSelectedColor: '#ee4d2d',
      itemActiveColor: '#ee4d2d',
      itemHoverColor: '#ee4d2d',
      titleFontSize: 14,
    },
    Table: {
      headerBg: '#fafafa',
      headerColor: '#262626',
      borderColor: '#f0f0f0',
      rowHoverBg: '#fafafa',
    },
    Button: {
      primaryShadow: 'none',
      controlHeight: 32,
    },
    Input: {
      activeBorderColor: '#ee4d2d',
      hoverBorderColor: '#f05a41',
    },
    Select: {
      optionSelectedBg: '#fff4f0',
    },
    Pagination: {
      itemActiveBg: '#ffffff',
      itemActiveColor: '#ee4d2d',
    },
    Breadcrumb: {
      /** 與一般內文階層一致：連結與純文字同色，hover 才用主色 */
      itemColor: '#595959',
      linkColor: '#595959',
      linkHoverColor: '#ee4d2d',
      lastItemColor: '#262626',
      separatorColor: '#bfbfbf',
    },
    DatePicker: {
      activeBorderColor: '#ee4d2d',
      hoverBorderColor: '#f05a41',
    },
  },
}

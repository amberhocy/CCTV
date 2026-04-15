import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import {
  Breadcrumb,
  Button,
  Col,
  Collapse,
  DatePicker,
  Descriptions,
  Dropdown,
  Empty,
  Form,
  Grid,
  Input,
  Layout,
  message,
  Menu,
  Modal,
  Pagination,
  Row,
  Select,
  Slider,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { MenuProps } from 'antd'
import {
  BarChartOutlined,
  CopyOutlined,
  ExpandOutlined,
  DownloadOutlined,
  PauseOutlined,
  SoundOutlined,
  AudioMutedOutlined,
  CaretRightOutlined,
  DownOutlined,
  EyeOutlined,
  FolderOutlined,
  HomeOutlined,
  LeftOutlined,
  MenuOutlined,
  PlusOutlined,
  SearchOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import './App.css'
import { PackageYoutubeHost } from './PackageYoutubeHost'
import { loadYoutubeIframeApi } from './youtube/loadIframeApi'

const { Header, Sider, Content } = Layout
const { RangePicker } = DatePicker

const TAB_PACKAGE = 'package'
const TAB_KIOSK = 'kiosk'
const TAB_LIVE = 'live'

/** 詳情「備註」與各列表 CSV：包裹／即時 = 備註；繳費機 = 後台備註 */
function detailNoteColumnKey(fromTab: string): '備註' | '後台備註' {
  return fromTab === TAB_KIOSK ? '後台備註' : '備註'
}

/** 備註結尾可附「監視器鏡頭」清單，與文字本文分開編輯 */
function parseNoteWithMonitors(raw: string): { body: string; monitors: string[] } {
  const s = (raw ?? '').replace(/\r\n/g, '\n')
  const only = s.match(/^\[監視器鏡頭\]\s*(.+)$/m)
  if (only && only.index === 0) {
    return {
      body: '',
      monitors: only[1]
        .split(/[、,，]/)
        .map((x) => x.trim())
        .filter(Boolean),
    }
  }
  const tail = s.match(/\n\[監視器鏡頭\]\s*(.+)$/m)
  if (!tail || tail.index === undefined) return { body: s, monitors: [] }
  return {
    body: s.slice(0, tail.index),
    monitors: tail[1]
      .split(/[、,，]/)
      .map((x) => x.trim())
      .filter(Boolean),
  }
}

function composeNoteWithMonitors(body: string, monitors: string[]): string {
  const mon = monitors.map((m) => m.trim()).filter(Boolean)
  const b = body.replace(/\r\n/g, '\n').trimEnd()
  const line = '[監視器鏡頭] ' + mon.join('、')
  if (mon.length === 0) return b
  if (!b) return line
  return `${b}\n${line}`
}

/** 包裹資訊：超過此筆數顯示分頁 */
const PACKAGE_INFO_PAGE_SIZE = 5

/** 包裹詳情監視器：YouTube 嵌入（順序對應九宮格第 1～N 格） */
const PACKAGE_DETAIL_YOUTUBE_IDS = ['0Y66BM0ZDn0', 'vSy10j-rl94', 'ioY56QjQMEE'] as const

function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

/** 九宮格索引是否有對應監視器（與上方 YouTube 清單長度一致） */
function hasPackageMonitorSlot(idx: number): boolean {
  return idx >= 0 && idx < PACKAGE_DETAIL_YOUTUBE_IDS.length
}

const packageVideoSampleMonitorNames = PACKAGE_DETAIL_YOUTUBE_IDS.map((_, index) => {
  const num = String(index + 1).padStart(3, '0')
  return `監視器${num}`
})

/** 監視器鏡頭複選：僅列出有影片之鏡位 */
const MONITOR_LENS_SELECT_OPTIONS = packageVideoSampleMonitorNames.map((label) => ({
  label,
  value: label,
}))

type CsvColumn = { key: string; title: string }
type CsvTableRow = { key: string } & Record<string, string>
type CsvTable = { columns: CsvColumn[]; rows: CsvTableRow[] }

function normalizeText(v: unknown) {
  return String(v ?? '').trim()
}

/** packageDetail.csv 與門市上架子 tab 聯動之主鍵：欄位「包裹配送編號」（相容舊表「配送編號」） */
function packageDetailRowDeliveryId(r: CsvTableRow) {
  return normalizeText(r['包裹配送編號'] ?? r['配送編號'])
}

const COPYABLE_FIELD_TITLES = new Set(['案件編號', '退貨物流編號', '包裹配送編號'])

async function copyToClipboard(text: string) {
  const v = String(text ?? '')
  if (!v) {
    message.warning('沒有可複製的內容')
    return
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(v)
      message.success('已複製到剪貼簿')
      return
    }
  } catch {
    // fallback below
  }

  try {
    const el = document.createElement('textarea')
    el.value = v
    el.style.position = 'fixed'
    el.style.left = '-9999px'
    el.style.top = '0'
    document.body.appendChild(el)
    el.focus()
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    if (!ok) throw new Error('copy failed')
    message.success('已複製到剪貼簿')
  } catch {
    message.error('複製失敗，請手動複製')
  }
}

function includesInsensitive(haystack: string, needle: string) {
  if (!needle) return true
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

function parseLooseDateTimeToMs(input: string) {
  const s = input.trim()
  if (!s) return null
  // Accept: YYYY-MM-DD HH:mm:ss (and some loose variants)
  // Replace multiple spaces, normalize separators
  const normalized = s.replace(/\s+/g, ' ')
  const ms = Date.parse(normalized.replace(/-/g, '/'))
  return Number.isNaN(ms) ? null : ms
}

function parseCsvLine(line: string) {
  const cells: string[] = []
  let i = 0
  let current = ''
  let inQuotes = false

  while (i < line.length) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        const next = line[i + 1]
        if (next === '"') {
          current += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      current += ch
      i += 1
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ',') {
      cells.push(current)
      current = ''
      i += 1
      continue
    }
    current += ch
    i += 1
  }

  cells.push(current)
  return cells
}

function parseCsvText(text: string) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0)
  if (nonEmptyLines.length === 0) return { columns: [] as CsvColumn[], rows: [] as CsvTableRow[] }

  let headerLineIdx = 0
  const firstScanCount = Math.min(nonEmptyLines.length, 12)
  for (let idx = 0; idx < firstScanCount; idx += 1) {
    if (
      nonEmptyLines[idx].includes('案件編號') ||
      nonEmptyLines[idx].includes('任務編號') ||
      nonEmptyLines[idx].includes('包裹配送編號') ||
      nonEmptyLines[idx].includes('配送編號')
    ) {
      headerLineIdx = idx
      break
    }
  }

  const rawHeaders = parseCsvLine(nonEmptyLines[headerLineIdx]).map((h) => h.trim())
  const columns: CsvColumn[] = rawHeaders.map((title, idx) => ({
    title,
    key: title.length > 0 ? title : `__col_${idx}`,
  }))

  const rows: CsvTableRow[] = []
  for (let i = headerLineIdx + 1; i < nonEmptyLines.length; i += 1) {
    const cells = parseCsvLine(nonEmptyLines[i])
    const row: CsvTableRow = { key: String(rows.length + 1) }
    for (let c = 0; c < columns.length; c += 1) {
      const colKey = columns[c].key
      row[colKey] = (cells[c] ?? '').trim()
    }
    rows.push(row)
  }
  return { columns, rows }
}

async function fetchCsvTable(url: string): Promise<CsvTable> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`CSV 讀取失敗：${res.status}`)
  const text = await res.text()
  return parseCsvText(text)
}

const vendorFilterOptions = [
  { value: 'libao', label: '立保 (繳費機)' },
  { value: 'bochen', label: '博辰 (繳費機)' },
]

const abnormalFilterOptions = [
  { value: '1004', label: '1004 - 卡幣' },
  { value: 'short', label: '少找錢' },
  { value: 'state', label: '設備狀態錯誤' },
]

const LIVE_TRACKING_PLACEHOLDER =
  '用半形逗號分隔，中間不留空白'
const userMenuItems: MenuProps['items'] = [
  { key: 'profile', label: '個人設定' },
  { key: 'logout', label: '登出' },
]

function App() {
  const screens = Grid.useBreakpoint()
  const isNarrow = screens.lg === false
  const [collapsed, setCollapsed] = useState(false)
  const [view, setView] = useState<'list' | 'packageDetail'>('list')
  const [detailFromTab, setDetailFromTab] = useState<string>(TAB_PACKAGE)
  const detailFromTabRef = useRef(detailFromTab)
  const [activeTab, setActiveTab] = useState<string>(TAB_PACKAGE)
  const [packageTable, setPackageTable] = useState<CsvTable>({ columns: [], rows: [] })
  const [packageDetailTable, setPackageDetailTable] = useState<CsvTable>({ columns: [], rows: [] })
  const [kioskTable, setKioskTable] = useState<CsvTable>({ columns: [], rows: [] })
  const [liveTable, setLiveTable] = useState<CsvTable>({ columns: [], rows: [] })
  const [liveExtraRows, setLiveExtraRows] = useState<CsvTableRow[]>([])
  const [selectedPackageRow, setSelectedPackageRow] = useState<CsvTableRow | null>(null)
  /** 詳情備註輸入框（與列表該筆之「備註」或「後台備註」同步） */
  const [detailNoteText, setDetailNoteText] = useState('')
  /** 詳情備註區：監視器鏡頭複選（儲存時寫入備註末行 [監視器鏡頭] …） */
  const [detailMonitorSelection, setDetailMonitorSelection] = useState<string[]>([])
  const [packageDetailTab, setPackageDetailTab] = useState<'pickup' | 'listing'>('pickup')
  /** 門市上架影片下方子 tab：與包裹資訊「包裹配送編號」欄（packageDetail.csv）一致 */
  const [selectedListingTrackingNo, setSelectedListingTrackingNo] = useState<string>('')
  const [packageInfoPage, setPackageInfoPage] = useState(1)
  /** 包裹案件詳情左側 Collapse：與「用戶取件／門市上架」及子 tab 聯動 */
  const [packageLeftCollapseKeys, setPackageLeftCollapseKeys] = useState<string[]>([
    'pickup',
    'package',
    'case',
    'note',
  ])
  // kiosk 影片 modal 已不再使用（改為「查看」導詳情頁）
  const [isGridPlayerZoomOpen, setIsGridPlayerZoomOpen] = useState(false)
  const [gridViewMode, setGridViewMode] = useState<'grid' | 'single'>('grid')
  const [gridActiveIdx, setGridActiveIdx] = useState<number>(0)
  const [gridAllMuted, setGridAllMuted] = useState(true)
  const [gridAllPlaying, setGridAllPlaying] = useState(false)
  const [gridPlaybackRate, setGridPlaybackRate] = useState(1)
  const [gridTime, setGridTime] = useState<{ current: number; duration: number }>({
    current: 0,
    duration: 0,
  })
  const isSeekingRef = useRef(false)
  const [ytApiReady, setYtApiReady] = useState(false)
  const ytPlayersRef = useRef<(YT.Player | null)[]>(
    Array.from({ length: PACKAGE_DETAIL_YOUTUBE_IDS.length }, () => null),
  )
  const modalYtPlayerRef = useRef<YT.Player | null>(null)
  const gridAllMutedRef = useRef(gridAllMuted)
  const gridPlaybackRateRef = useRef(gridPlaybackRate)
  const pageSize = 20
  const [currentPage, setCurrentPage] = useState(1)

  const [packageForm] = Form.useForm()
  const [kioskForm] = Form.useForm()
  const [liveForm] = Form.useForm()
  const [liveCreateForm] = Form.useForm()

  const [packageFilters, setPackageFilters] = useState<{
    caseId?: string
    trackingNo?: string
    dateRange?: [number | null, number | null]
  }>({})
  const [kioskFilters, setKioskFilters] = useState<{
    store?: string
    taskId?: string
    vendor?: string
    abnormal?: string
    dateRange?: [number | null, number | null]
  }>({})
  const [liveFilters, setLiveFilters] = useState<{
    trackingNos?: string[]
    dateRange?: [number | null, number | null]
  }>({})

  const [isLiveCreateOpen, setIsLiveCreateOpen] = useState(false)
  const [liveCreateDuplicate, setLiveCreateDuplicate] = useState<string | null>(null)

  const isKioskDetail = view === 'packageDetail' && detailFromTab === TAB_KIOSK

  useEffect(() => {
    detailFromTabRef.current = detailFromTab
  }, [detailFromTab])

  useEffect(() => {
    void loadYoutubeIframeApi().then(() => setYtApiReady(true))
  }, [])

  useEffect(() => {
    gridAllMutedRef.current = gridAllMuted
  }, [gridAllMuted])

  useEffect(() => {
    gridPlaybackRateRef.current = gridPlaybackRate
  }, [gridPlaybackRate])

  const registerGridPlayer = useCallback((index: number, player: YT.Player) => {
    ytPlayersRef.current[index] = player
    try {
      if (gridAllMutedRef.current) player.mute()
      else player.unMute()
      player.setPlaybackRate(gridPlaybackRateRef.current)
    } catch {
      // ignore
    }
  }, [])

  const unregisterGridPlayer = useCallback((index: number) => {
    ytPlayersRef.current[index] = null
  }, [])

  const registerModalPlayer = useCallback((index: number, player: YT.Player) => {
    void index
    modalYtPlayerRef.current = player
    try {
      if (gridAllMutedRef.current) player.mute()
      else player.unMute()
      player.setPlaybackRate(gridPlaybackRateRef.current)
    } catch {
      // ignore
    }
  }, [])

  const unregisterModalPlayer = useCallback((index: number) => {
    void index
    modalYtPlayerRef.current = null
  }, [])

  const getYoutubePlayersForControls = useCallback((): YT.Player[] => {
    if (isGridPlayerZoomOpen && modalYtPlayerRef.current) {
      return [modalYtPlayerRef.current]
    }
    if (gridViewMode === 'single') {
      const p = ytPlayersRef.current[gridActiveIdx]
      return p ? [p] : []
    }
    return PACKAGE_DETAIL_YOUTUBE_IDS.map((_, i) => ytPlayersRef.current[i]).filter(
      (p): p is YT.Player => p != null,
    )
  }, [isGridPlayerZoomOpen, gridViewMode, gridActiveIdx])

  const getActivePlayerForTime = useCallback((): YT.Player | null => {
    if (isGridPlayerZoomOpen && modalYtPlayerRef.current) {
      return modalYtPlayerRef.current
    }
    return ytPlayersRef.current[gridActiveIdx] ?? null
  }, [isGridPlayerZoomOpen, gridActiveIdx])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const v = getActivePlayerForTime()
      if (v && !isSeekingRef.current) {
        const duration = v.getDuration?.() ?? 0
        const cur = v.getCurrentTime?.() ?? 0
        const d = Number.isFinite(duration) && duration > 0 ? duration : 0
        setGridTime({ current: cur, duration: d })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [getActivePlayerForTime])

  useEffect(() => {
    if (!isGridPlayerZoomOpen) return
    ytPlayersRef.current.forEach((p) => {
      try {
        p?.pauseVideo()
      } catch {
        // ignore
      }
    })
  }, [isGridPlayerZoomOpen])

  useEffect(() => {
    if (view !== 'packageDetail') {
      setDetailNoteText('')
      setDetailMonitorSelection([])
      return
    }
    if (!selectedPackageRow) {
      setDetailNoteText('')
      setDetailMonitorSelection([])
      return
    }
    const col = detailNoteColumnKey(detailFromTab)
    const raw = selectedPackageRow[col] ?? ''
    const { body, monitors } = parseNoteWithMonitors(raw)
    setDetailNoteText(body)
    setDetailMonitorSelection(monitors)
  }, [view, selectedPackageRow, detailFromTab])

  const detailNoteSaveDisabled = useMemo(() => {
    if (!selectedPackageRow) return true
    const col = detailNoteColumnKey(detailFromTab)
    const saved = normalizeText(selectedPackageRow[col] ?? '')
    const current = normalizeText(composeNoteWithMonitors(detailNoteText, detailMonitorSelection))
    return saved === current
  }, [selectedPackageRow, detailFromTab, detailNoteText, detailMonitorSelection])

  const handleDetailNoteSave = useCallback(() => {
    if (!selectedPackageRow) return
    const col = detailNoteColumnKey(detailFromTab)
    const rowKey = selectedPackageRow.key
    const newVal = composeNoteWithMonitors(detailNoteText, detailMonitorSelection)

    const mapRow = (r: CsvTableRow) => (r.key === rowKey ? { ...r, [col]: newVal } : r)

    if (detailFromTab === TAB_PACKAGE) {
      setPackageTable((prev) => ({ ...prev, rows: prev.rows.map(mapRow) }))
    } else if (detailFromTab === TAB_KIOSK) {
      setKioskTable((prev) => ({ ...prev, rows: prev.rows.map(mapRow) }))
    } else if (detailFromTab === TAB_LIVE) {
      setLiveTable((prev) => ({ ...prev, rows: prev.rows.map(mapRow) }))
      setLiveExtraRows((prev) => prev.map(mapRow))
    }

    setSelectedPackageRow((prev) => (prev && prev.key === rowKey ? { ...prev, [col]: newVal } : prev))
    message.success('備註已儲存')
  }, [selectedPackageRow, detailFromTab, detailNoteText, detailMonitorSelection])

  useEffect(() => {
    if (view !== 'packageDetail' || isKioskDetail) return
    if (packageDetailTab === 'listing') {
      setPackageLeftCollapseKeys(['package', 'case', 'note'])
    } else {
      setPackageLeftCollapseKeys(['pickup', 'package', 'case', 'note'])
    }
  }, [
    view,
    isKioskDetail,
    packageDetailTab,
    selectedPackageRow?.key,
    selectedListingTrackingNo,
  ])

  const detailVideoProcessStatus = useMemo(
    () => normalizeText(selectedPackageRow?.['影片處理狀況']),
    [selectedPackageRow],
  )

  /** 九宮格：準備中／等待中 → Empty；下載中 → Spin；其餘 → 播放影片 */
  const videoDetailGridMode = useMemo((): 'videos' | 'preparing' | 'downloading' => {
    const s = detailVideoProcessStatus
    if (s === '下載中') return 'downloading'
    if (s === '準備中' || s === '等待中') return 'preparing'
    return 'videos'
  }, [detailVideoProcessStatus])

  const liveAllRows = useMemo(() => {
    return [...liveExtraRows, ...liveTable.rows]
  }, [liveExtraRows, liveTable.rows])

  const findRowForDetail = useCallback(
    (fromTab: string, rowKey: string): CsvTableRow | null => {
      const rows =
        fromTab === TAB_PACKAGE
          ? packageTable.rows
          : fromTab === TAB_KIOSK
            ? kioskTable.rows
            : fromTab === TAB_LIVE
              ? liveAllRows
              : []
      return rows.find((r) => r.key === rowKey) ?? null
    },
    [packageTable.rows, kioskTable.rows, liveAllRows],
  )

  const openPackageDetail = useCallback((record: CsvTableRow, fromTab: string) => {
    setDetailFromTab(fromTab)
    setActiveTab(fromTab)
    setSelectedPackageRow(record)
    setView('packageDetail')
    window.history.pushState(
      { appView: 'packageDetail' as const, detailFrom: fromTab, rowKey: record.key },
      '',
      window.location.href,
    )
  }, [])

  /** 側邊欄「SPX 案件排查中心」：回到列表首頁（包裹案件）並清除篩選與瀏覽器歷史狀態 */
  const goSpxHome = useCallback(() => {
    setView('list')
    setSelectedPackageRow(null)
    setDetailFromTab(TAB_PACKAGE)
    setActiveTab(TAB_PACKAGE)
    packageForm.resetFields()
    setPackageFilters({})
    kioskForm.resetFields()
    setKioskFilters({})
    liveForm.resetFields()
    setLiveFilters({})
    setCurrentPage(1)
    window.history.replaceState(null, '', window.location.href)
    if (isNarrow) setCollapsed(true)
  }, [isNarrow, kioskForm, liveForm, packageForm])

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const s = e.state as { appView?: string; detailFrom?: string; rowKey?: string } | null
      if (s?.appView === 'packageDetail' && s.rowKey && s.detailFrom) {
        const row = findRowForDetail(s.detailFrom, s.rowKey)
        if (row) {
          setDetailFromTab(s.detailFrom)
          setActiveTab(s.detailFrom)
          setSelectedPackageRow(row)
          setView('packageDetail')
          return
        }
      }
      setView('list')
      setSelectedPackageRow(null)
      setActiveTab(detailFromTabRef.current)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [findRowForDetail])

  useEffect(() => {
    // 切換分頁時，刷新各頁搜尋狀態（表單 + filters + 分頁）
    if (activeTab === TAB_PACKAGE) {
      packageForm.resetFields()
      setPackageFilters({})
    }
    if (activeTab === TAB_KIOSK) {
      kioskForm.resetFields()
      setKioskFilters({})
    }
    if (activeTab === TAB_LIVE) {
      liveForm.resetFields()
      setLiveFilters({})
    }
    setCurrentPage(1)
  }, [activeTab, kioskForm, liveForm, packageForm])

  useEffect(() => {
    // 離開詳情頁時，關閉放大
    if (view !== 'packageDetail') {
      setIsGridPlayerZoomOpen(false)
      setGridViewMode('grid')
    }
  }, [view])

  const applyGridMuted = (muted: boolean) => {
    setGridAllMuted(muted)
    getYoutubePlayersForControls().forEach((p) => {
      try {
        if (muted) p.mute()
        else p.unMute()
      } catch {
        // ignore
      }
    })
  }

  const playAllGridVideos = async () => {
    const list = getYoutubePlayersForControls()
    if (list.length === 0) {
      message.info('播放器尚未就緒，請稍候再試')
      setGridAllPlaying(false)
      return
    }
    let ok = false
    for (const p of list) {
      try {
        p.playVideo()
        ok = true
      } catch {
        // ignore
      }
    }
    setGridAllPlaying(ok)
    if (!ok) message.warning('無法自動播放，請先點選畫面或使用播放器')
  }

  const pauseAllGridVideos = () => {
    getYoutubePlayersForControls().forEach((p) => {
      try {
        p.pauseVideo()
      } catch {
        // ignore
      }
    })
    setGridAllPlaying(false)
  }

  const syncAllGridVideos = () => {
    if (isGridPlayerZoomOpen) {
      message.info('放大模式僅單一畫面，無需同步')
      return
    }
    const list = PACKAGE_DETAIL_YOUTUBE_IDS.map((_, i) => ytPlayersRef.current[i]).filter(
      (p): p is YT.Player => p != null,
    )
    if (list.length === 0) return
    const t = list[0].getCurrentTime()
    list.forEach((p) => {
      try {
        p.seekTo(t, true)
      } catch {
        // ignore
      }
    })
    message.success('已同步九宮格播放時間')
  }

  const applyGridPlaybackRate = (rate: number) => {
    setGridPlaybackRate(rate)
    getYoutubePlayersForControls().forEach((p) => {
      try {
        p.setPlaybackRate(rate)
      } catch {
        // ignore
      }
    })
  }

  const formatTime = (sec: number) => {
    const s = Math.max(0, Math.floor(sec))
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(s % 60).padStart(2, '0')
    return `${mm}:${ss}`
  }

  const downloadGridVideoByMonitorIndex = async (monitorIdx: number) => {
    if (!hasPackageMonitorSlot(monitorIdx)) {
      message.warning('此監視器無影片')
      return
    }
    const id = PACKAGE_DETAIL_YOUTUBE_IDS[monitorIdx]
    window.open(youtubeWatchUrl(id), '_blank', 'noopener,noreferrer')
    message.info('已在新分頁開啟 YouTube')
  }

  const downloadMonitorMenuItems = useMemo(
    () =>
      packageVideoSampleMonitorNames
        .map((label, idx) => ({ key: String(idx), label }))
        .filter((_, idx) => hasPackageMonitorSlot(idx)),
    [],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(max-width: 991px)').matches) {
      setCollapsed(true)
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    const PACKAGE_CSV_URL = new URL('../data/demo/package/dataTable.csv', import.meta.url).toString()
    const PACKAGE_DETAIL_CSV_URL = new URL(
      '../data/demo/package/packageDetail.csv',
      import.meta.url,
    ).toString()
    const KIOSK_CSV_URL = new URL('../data/demo/kiosk/dataTable.csv', import.meta.url).toString()
    const LIVE_CSV_URL = new URL('../data/demo/live/dataTable.csv', import.meta.url).toString()

    async function load() {
      try {
        const [packageCsv, packageDetailCsv, kioskCsv, liveCsv] = await Promise.all([
          fetchCsvTable(PACKAGE_CSV_URL),
          fetchCsvTable(PACKAGE_DETAIL_CSV_URL),
          fetchCsvTable(KIOSK_CSV_URL),
          fetchCsvTable(LIVE_CSV_URL),
        ])
        if (isCancelled) return
        setPackageTable(packageCsv)
        setPackageDetailTable(packageDetailCsv)
        setKioskTable(kioskCsv)
        setLiveTable(liveCsv)
      } catch {
        // demo 資料載入失敗：不阻斷頁面
      }
    }

    void load()
    return () => {
      isCancelled = true
    }
  }, [])

  const packageColumnsFromCsv = useMemo(() => {
    const baseCols = packageTable.columns.map((col) => ({
      title: col.title,
      dataIndex: col.key,
      key: col.key,
      ellipsis: true,
      render: (v: string) => {
        const value = v && v.length > 0 ? v : '—'
        if (!COPYABLE_FIELD_TITLES.has(col.title)) return value
        const raw = v && v.length > 0 ? v : ''
        return (
          <Space size={6}>
            <span>{value}</span>
            <Tooltip title="複製">
              <Button
                size="small"
                type="text"
                aria-label={`複製${col.title}`}
                icon={<CopyOutlined />}
                disabled={!raw}
                onClick={() => {
                  void copyToClipboard(raw)
                }}
              />
            </Tooltip>
          </Space>
        )
      },
    }))

    return [
      ...baseCols,
      {
        title: '影片',
        key: '__video',
        fixed: 'right' as const,
        width: 96,
        render: (_: unknown, record: CsvTableRow) => {
          return (
            <Button
              type="link"
              size="small"
              className="video-link"
              icon={<EyeOutlined />}
              onClick={() => openPackageDetail(record, TAB_PACKAGE)}
            >
              查看
            </Button>
          )
        },
      },
    ]
  }, [packageTable.columns, openPackageDetail])

  const kioskColumnsFromCsv = useMemo(() => {
    const baseCols = kioskTable.columns.map((col) => ({
      title: col.title,
      dataIndex: col.key,
      key: col.key,
      ellipsis: true,
      render: (v: string) => {
        const value = v && v.length > 0 ? v : '—'
        if (!COPYABLE_FIELD_TITLES.has(col.title)) return value
        const raw = v && v.length > 0 ? v : ''
        return (
          <Space size={6}>
            <span>{value}</span>
            <Tooltip title="複製">
              <Button
                size="small"
                type="text"
                aria-label={`複製${col.title}`}
                icon={<CopyOutlined />}
                disabled={!raw}
                onClick={() => {
                  void copyToClipboard(raw)
                }}
              />
            </Tooltip>
          </Space>
        )
      },
    }))

    return [
      ...baseCols,
      {
        title: '影片',
        key: '__video',
        fixed: 'right' as const,
        width: 96,
        render: (_: unknown, record: CsvTableRow) => {
          return (
            <Button
              type="link"
              size="small"
              className="video-link"
              icon={<EyeOutlined />}
              onClick={() => openPackageDetail(record, TAB_KIOSK)}
            >
              查看
            </Button>
          )
        },
      },
    ]
  }, [kioskTable.columns, openPackageDetail])

  const liveColumnsFromCsv = useMemo(() => {
    const baseCols = liveTable.columns.map((col) => ({
      title: col.title,
      dataIndex: col.key,
      key: col.key,
      ellipsis: true,
      render: (v: string) => {
        const value = v && v.length > 0 ? v : '—'
        if (!COPYABLE_FIELD_TITLES.has(col.title)) return value
        const raw = v && v.length > 0 ? v : ''
        return (
          <Space size={6}>
            <span>{value}</span>
            <Tooltip title="複製">
              <Button
                size="small"
                type="text"
                aria-label={`複製${col.title}`}
                icon={<CopyOutlined />}
                disabled={!raw}
                onClick={() => {
                  void copyToClipboard(raw)
                }}
              />
            </Tooltip>
          </Space>
        )
      },
    }))

    return [
      ...baseCols,
      {
        title: '影片',
        key: '__video',
        fixed: 'right' as const,
        width: 96,
        render: (_: unknown, record: CsvTableRow) => {
          return (
            <Button
              type="link"
              size="small"
              className="video-link"
              icon={<EyeOutlined />}
              onClick={() => openPackageDetail(record, TAB_LIVE)}
            >
              查看
            </Button>
          )
        },
      },
    ]
  }, [liveTable.columns, openPackageDetail])

  const breadcrumbItems = useMemo(() => {
    const base = [
      { title: '首頁' },
      { title: 'SPX 案件排查中心' },
    ] as { title: string }[]
    if (view === 'packageDetail') {
      const isFromLive = detailFromTab === TAB_LIVE
      const isFromKiosk = detailFromTab === TAB_KIOSK
      let listTitle = '包裹案件'
      let id = selectedPackageRow?.['案件編號'] ?? '—'
      if (isFromLive) {
        listTitle = '即時查詢'
        id = selectedPackageRow?.['包裹配送編號'] ?? '—'
      } else if (isFromKiosk) {
        listTitle = '繳費機案件'
        id = selectedPackageRow?.['任務編號'] ?? '—'
      }
      return [
        ...base,
        {
          title: listTitle,
          href: '#',
          onClick: (e: MouseEvent<HTMLAnchorElement>) => {
            e.preventDefault()
            window.history.back()
          },
        },
        { title: id },
      ]
    }
    if (activeTab === TAB_PACKAGE) {
      return [...base, { title: '包裹案件' }]
    }
    if (activeTab === TAB_KIOSK) {
      return [...base, { title: '繳費機案件' }]
    }
    if (activeTab === TAB_LIVE) {
      return [...base, { title: '即時查詢' }]
    }
    return base
  }, [activeTab, detailFromTab, selectedPackageRow, view])

  const pageDesc = useMemo(() => {
    if (activeTab === TAB_KIOSK) {
      return '整合門市包裹異常與繳費機事件監控，協助排查設備異常、廠商與影片處理狀態。'
    }
    if (activeTab === TAB_LIVE) {
      return '依包裹配送編號建立即時查詢，檢視查詢紀錄、影片處理狀態與後續動作。'
    }
    return '整合 SPX 門市異常與監控資料，協助快速排查包裹與影片處理狀態。'
  }, [activeTab])

  /** 包裹資訊「包裹配送編號」不重複值（packageDetail.csv 首次出現順序） */
  const packageTrackingNumbers = useMemo(() => {
    const seen = new Set<string>()
    const unique: string[] = []
    for (const r of packageDetailTable.rows) {
      const v = packageDetailRowDeliveryId(r)
      if (!v || seen.has(v)) continue
      seen.add(v)
      unique.push(v)
    }
    if (unique.length > 0) return unique
    const fallback = normalizeText(selectedPackageRow?.['包裹配送編號'])
    return fallback ? [fallback] : []
  }, [packageDetailTable.rows, selectedPackageRow])

  const packageListingTabItems = useMemo(
    () => packageTrackingNumbers.map((no) => ({ key: no, label: no })),
    [packageTrackingNumbers],
  )

  useEffect(() => {
    if (packageTrackingNumbers.length === 0) return
    const cur = normalizeText(selectedListingTrackingNo)
    const hit = packageTrackingNumbers.some((n) => normalizeText(n) === cur)
    if (!hit) setSelectedListingTrackingNo(packageTrackingNumbers[0])
  }, [packageTrackingNumbers, selectedListingTrackingNo])

  /** 門市上架：依子 tab（= 包裹配送編號）篩選；用戶取件：顯示全部列 */
  const packageRowsFiltered = useMemo(() => {
    const all = packageDetailTable.rows
    if (packageDetailTab !== 'listing' || packageTrackingNumbers.length === 0) return all
    const t = normalizeText(selectedListingTrackingNo)
    if (!t) return all
    return all.filter((r) => packageDetailRowDeliveryId(r) === t)
  }, [packageDetailTab, packageDetailTable.rows, packageTrackingNumbers, selectedListingTrackingNo])

  useEffect(() => {
    setPackageInfoPage(1)
  }, [packageDetailTab, selectedListingTrackingNo, selectedPackageRow?.key, packageDetailTable.rows])

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(packageRowsFiltered.length / PACKAGE_INFO_PAGE_SIZE))
    setPackageInfoPage((p) => (p > maxPage ? maxPage : p))
  }, [packageRowsFiltered.length])

  const handlePackageInfoPageChange = useCallback(
    (page: number) => {
      setPackageInfoPage(page)
      if (packageDetailTab !== 'pickup' || packageTrackingNumbers.length === 0) return
      const start = (page - 1) * PACKAGE_INFO_PAGE_SIZE
      const first = packageRowsFiltered[start]
      if (!first) return
      const tr = packageDetailRowDeliveryId(first)
      const match = packageTrackingNumbers.find((n) => normalizeText(n) === tr)
      if (match) setSelectedListingTrackingNo(match)
    },
    [packageDetailTab, packageRowsFiltered, packageTrackingNumbers],
  )

  /** 案件資訊：包裹配送編號與 data/demo/package/dataTable.csv 案件列一致（不依門市上架子 tab 覆寫） */
  const packageCaseInfoTableRow = useMemo(() => {
    const row = selectedPackageRow
    const deliveryNo = normalizeText(row?.['包裹配送編號']) || '—'
    return [
      {
        key: 'case-info',
        caseId: row?.['案件編號'] ?? '—',
        deliveryNo,
        summary: row?.['案件摘要'] ?? '—',
        caseNote: row?.['案件說明'] ?? '—',
        description: row?.['案件描述'] ?? '—',
        returnTrackingNo: row?.['退貨物流編號'] ?? '—',
        userType: row?.['用戶類型'] ?? '—',
        createdAt: row?.['案件建立時間'] ?? '—',
      },
    ]
  }, [selectedPackageRow])

  const packageDetailColumns = useMemo(() => {
    return packageDetailTable.columns.map((col) => ({
      title: col.title,
      dataIndex: col.key,
      key: col.key,
      ellipsis: true,
      render: (v: string) => {
        const value = v && v.length > 0 ? v : '—'
        if (col.title === '狀態') {
          if (!v || v.length === 0) return '—'
          const color = v === '未取件' ? 'red' : 'cyan'
          return (
            <Tag color={color} bordered={false}>
              {v}
            </Tag>
          )
        }
        return value
      },
    }))
  }, [packageDetailTable.columns])

  /** 繳費機 dataTable.csv 欄位；不含後台備註、影片處理狀況、更新時間 */
  const kioskDetailDescItems = useMemo(() => {
    if (!selectedPackageRow) return []
    const keys = [
      '任務編號',
      '門市編號',
      '門市名稱',
      '設備類型',
      '廠商',
      '異常狀況',
      '任務狀態',
      '門市系統備註',
      '異常發生時間',
    ] as const
    return keys.map((key) => ({
      label: key,
      children: normalizeText(selectedPackageRow[key]) || '—',
    }))
  }, [selectedPackageRow])

  const filteredPackageRows = useMemo(() => {
    const caseIdNeedle = normalizeText(packageFilters.caseId)
    const trackingNeedle = normalizeText(packageFilters.trackingNo)
    const [fromMs, toMs] = packageFilters.dateRange ?? [null, null]
    return packageTable.rows.filter((r) => {
      const caseId = normalizeText(r['案件編號'])
      const trackingNo = normalizeText(r['包裹配送編號'])
      if (!includesInsensitive(caseId, caseIdNeedle)) return false
      if (!includesInsensitive(trackingNo, trackingNeedle)) return false

      if (fromMs || toMs) {
        const created = normalizeText(r['案件建立時間'])
        const createdMs = parseLooseDateTimeToMs(created)
        if (createdMs == null) return false
        if (fromMs && createdMs < fromMs) return false
        if (toMs && createdMs > toMs) return false
      }
      return true
    })
  }, [packageFilters.caseId, packageFilters.dateRange, packageFilters.trackingNo, packageTable.rows])

  const filteredKioskRows = useMemo(() => {
    const storeNeedle = normalizeText(kioskFilters.store)
    const taskIdNeedle = normalizeText(kioskFilters.taskId)
    const vendorNeedle = normalizeText(kioskFilters.vendor)
    const abnormalNeedle = normalizeText(kioskFilters.abnormal)
    const [fromMs, toMs] = kioskFilters.dateRange ?? [null, null]

    const vendorMap: Record<string, string> = {
      libao: '立保',
      bochen: '博辰',
    }
    const abnormalMap: Record<string, string> = {
      '1004': '1004',
      short: '少找錢',
      state: '狀態錯誤',
    }

    const vendorKey = vendorMap[vendorNeedle] ?? vendorNeedle
    const abnormalKey = abnormalMap[abnormalNeedle] ?? abnormalNeedle

    return kioskTable.rows.filter((r) => {
      const storeId = normalizeText(r['門市編號'])
      const storeName = normalizeText(r['門市名稱'])
      const taskId = normalizeText(r['任務編號'])
      const vendor = normalizeText(r['廠商'])
      const abnormal = normalizeText(r['異常狀況'])

      if (storeNeedle) {
        const storeHit =
          includesInsensitive(storeId, storeNeedle) || includesInsensitive(storeName, storeNeedle)
        if (!storeHit) return false
      }
      if (!includesInsensitive(taskId, taskIdNeedle)) return false
      if (vendorKey && !includesInsensitive(vendor, vendorKey)) return false
      if (abnormalKey && !includesInsensitive(abnormal, abnormalKey)) return false

      if (fromMs || toMs) {
        const created = normalizeText(r['案件建立時間'])
        const createdMs = parseLooseDateTimeToMs(created)
        if (createdMs == null) return false
        if (fromMs && createdMs < fromMs) return false
        if (toMs && createdMs > toMs) return false
      }
      return true
    })
  }, [
    kioskFilters.abnormal,
    kioskFilters.dateRange,
    kioskFilters.store,
    kioskFilters.taskId,
    kioskFilters.vendor,
    kioskTable.rows,
  ])

  const filteredLiveRows = useMemo(() => {
    const trackingList = liveFilters.trackingNos ?? []
    const [fromMs, toMs] = liveFilters.dateRange ?? [null, null]
    return liveAllRows.filter((r) => {
      const trackingNo = normalizeText(r['包裹配送編號'])
      if (trackingList.length > 0 && !trackingList.includes(trackingNo)) return false

      if (fromMs || toMs) {
        const created = normalizeText(r['查詢建立時間'])
        const createdMs = parseLooseDateTimeToMs(created)
        if (createdMs == null) return false
        if (fromMs && createdMs < fromMs) return false
        if (toMs && createdMs > toMs) return false
      }
      return true
    })
  }, [liveAllRows, liveFilters.dateRange, liveFilters.trackingNos])

  /** 詳情「上一筆／下一筆」：依進入詳情時的分頁來源，走該列表目前篩選結果順序 */
  const detailNavRows = useMemo(() => {
    if (detailFromTab === TAB_KIOSK) return filteredKioskRows
    if (detailFromTab === TAB_LIVE) return filteredLiveRows
    return filteredPackageRows
  }, [detailFromTab, filteredKioskRows, filteredLiveRows, filteredPackageRows])

  const detailNavIndex = useMemo(() => {
    if (!selectedPackageRow) return -1
    const rows = detailNavRows
    const k = String(selectedPackageRow.key ?? '')
    const i = rows.findIndex((r) => String(r.key ?? '') === k)
    if (i >= 0) return i
    if (detailFromTab === TAB_KIOSK) {
      const id = normalizeText(selectedPackageRow['任務編號'])
      return rows.findIndex((r) => normalizeText(r['任務編號']) === id)
    }
    if (detailFromTab === TAB_LIVE) {
      const id = normalizeText(selectedPackageRow['包裹配送編號'])
      return rows.findIndex((r) => normalizeText(r['包裹配送編號']) === id)
    }
    const caseId = normalizeText(selectedPackageRow['案件編號'])
    const track = normalizeText(selectedPackageRow['包裹配送編號'])
    return rows.findIndex(
      (r) =>
        normalizeText(r['案件編號']) === caseId && normalizeText(r['包裹配送編號']) === track,
    )
  }, [detailFromTab, detailNavRows, selectedPackageRow])

  const applyDetailRow = (row: CsvTableRow) => {
    setSelectedPackageRow(row)
    setGridViewMode('grid')
    setGridActiveIdx(0)
    setIsGridPlayerZoomOpen(false)
    setPackageInfoPage(1)
    setSelectedListingTrackingNo('')
  }

  const liveExistingTrackingSet = useMemo(() => {
    return new Set(
      liveAllRows
        .map((r) => normalizeText(r['包裹配送編號']))
        .filter((v) => v.length > 0),
    )
  }, [liveAllRows])

  const isValidTrackingNo = (value: string) => {
    // demo 資料涵蓋：TW + 數字/大寫字母，長度不一（允許較寬鬆）
    return /^TW[0-9A-Z]{6,24}$/i.test(value.trim())
  }

  const listTotalFiltered = useMemo(() => {
    if (activeTab === TAB_PACKAGE) return filteredPackageRows.length
    if (activeTab === TAB_KIOSK) return filteredKioskRows.length
    if (activeTab === TAB_LIVE) return filteredLiveRows.length
    return 0
  }, [activeTab, filteredKioskRows.length, filteredLiveRows.length, filteredPackageRows.length])

  const pageStartIdxFiltered = (currentPage - 1) * pageSize
  const pageEndIdxFiltered = pageStartIdxFiltered + pageSize

  const start = listTotalFiltered === 0 ? 0 : pageStartIdxFiltered + 1
  const end = Math.min(pageEndIdxFiltered, listTotalFiltered)

  const packagePageRows = useMemo(
    () => filteredPackageRows.slice(pageStartIdxFiltered, pageEndIdxFiltered),
    [filteredPackageRows, pageEndIdxFiltered, pageStartIdxFiltered],
  )
  const kioskPageRows = useMemo(
    () => filteredKioskRows.slice(pageStartIdxFiltered, pageEndIdxFiltered),
    [filteredKioskRows, pageEndIdxFiltered, pageStartIdxFiltered],
  )
  const livePageRows = useMemo(
    () => filteredLiveRows.slice(pageStartIdxFiltered, pageEndIdxFiltered),
    [filteredLiveRows, pageEndIdxFiltered, pageStartIdxFiltered],
  )

  const detailNoteSection = (
    <div>
      <div className="detail-note-monitor-select">
        <div className="detail-note-field-label">監視器鏡頭</div>
        <Select
          mode="multiple"
          allowClear
          placeholder="請選擇監視器鏡頭"
          options={MONITOR_LENS_SELECT_OPTIONS}
          value={detailMonitorSelection}
          onChange={(v) => setDetailMonitorSelection(v)}
          className="detail-note-monitor-select-inner"
          maxTagCount="responsive"
          tagRender={(props) => {
            const { label, closable, onClose } = props
            return (
              <Tag
                bordered={false}
                closable={closable}
                onClose={onClose}
                className="detail-monitor-lens-tag"
              >
                {label}
              </Tag>
            )
          }}
        />
      </div>
      <Input.TextArea
        rows={6}
        placeholder="請輸入說明..."
        value={detailNoteText}
        onChange={(e) => setDetailNoteText(e.target.value)}
      />
      <div className="detail-panel-actions">
        <Button type="primary" disabled={detailNoteSaveDisabled} onClick={handleDetailNoteSave}>
          儲存
        </Button>
      </div>
    </div>
  )

  return (
    <Layout className="app-layout">
      {isNarrow && !collapsed ? (
        <button
          type="button"
          className="sider-backdrop"
          aria-label="關閉選單"
          onClick={() => setCollapsed(true)}
        />
      ) : null}
      <Header className="top-header">
        <div className="header-left">
          <Button
            type="text"
            className={`mobile-sider-toggle${isNarrow ? ' is-visible' : ''}`}
            icon={<MenuOutlined />}
            aria-label="選單"
            onClick={() => setCollapsed((c) => !c)}
          />
          <div className="logo header-logo">
            <span className="logo-icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M4 6h16v2H4V6zm0 4h10v10H4V10zm12 0h8v10h-8V10z" />
              </svg>
            </span>
            <span className="logo-text">Tech Platform</span>
          </div>
        </div>
        <div className="header-right">
          <Button type="text" icon={<SearchOutlined />} className="header-icon-btn" />
          <Dropdown menu={{ items: userMenuItems }} trigger={['click']}>
            <button type="button" className="user-trigger">
              <span className="avatar">VY</span>
              <span className="user-name">Vera Yang</span>
              <DownOutlined className="user-chevron" />
            </button>
          </Dropdown>
        </div>
      </Header>

      <Layout className="layout-body">
        <Sider
          className={`app-sider${isNarrow && !collapsed ? ' app-sider-overlay' : ''}`}
          width={232}
          collapsed={collapsed}
          collapsedWidth={isNarrow ? 0 : 64}
          breakpoint="lg"
          trigger={null}
        >
          <Menu
            mode="inline"
            selectedKeys={['spx']}
            className="sider-menu"
            onClick={({ key }) => {
              if (key === 'spx') goSpxHome()
            }}
            items={[
              {
                key: 'home',
                icon: <HomeOutlined />,
                label: '首頁',
              },
              {
                key: 'spx',
                icon: <BarChartOutlined />,
                label: 'SPX 案件排查中心',
              },
              {
                key: 'folder',
                icon: <FolderOutlined />,
                label: '資料夾',
                children: [{ key: 'folder-sub', label: '子資料夾' }],
              },
              {
                key: 'create-root',
                label: (
                  <span className="menu-create-root">
                    <PlusOutlined /> Create Root Folder
                  </span>
                ),
              },
              {
                key: 'admin',
                icon: <UserOutlined />,
                label: '管理員',
              },
              {
                key: 'list',
                icon: <TeamOutlined />,
                label: '名單管理',
              },
            ]}
          />
          <button
            type="button"
            className={`sider-collapse-btn${collapsed ? ' is-collapsed' : ''}`}
            aria-label={collapsed ? '展開側邊欄' : '收合側邊欄'}
            onClick={() => setCollapsed((c) => !c)}
          >
            <LeftOutlined />
          </button>
        </Sider>

        <Layout className="main-shell">
          <Content className="content">
          <Modal
            open={isLiveCreateOpen}
            title="新增查詢"
            centered
            onCancel={() => setIsLiveCreateOpen(false)}
            onOk={() => liveCreateForm.submit()}
            okText="新增"
            cancelText="取消"
            destroyOnClose
          >
            <Form
              form={liveCreateForm}
              layout="vertical"
              onValuesChange={() => {
                if (liveCreateDuplicate) setLiveCreateDuplicate(null)
              }}
              onFinish={(values) => {
                const trackingNo = normalizeText(values.trackingNo)
                if (!trackingNo) return
                if (!isValidTrackingNo(trackingNo)) return
                if (liveExistingTrackingSet.has(trackingNo)) {
                  setLiveCreateDuplicate(trackingNo)
                  return
                }
                const now = new Date()
                const pad2 = (n: number) => String(n).padStart(2, '0')
                const nowStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(
                  now.getHours(),
                )}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`

                setLiveExtraRows((prev) => [
                  {
                    key: `live-extra-${Date.now()}`,
                    包裹配送編號: trackingNo,
                    查詢建立時間: nowStr,
                    查詢者: 'vera.yang@shopee.tw',
                    備註: '',
                    影片處理狀況: '下載中',
                  },
                  ...prev,
                ])
                setCurrentPage(1)
                setIsLiveCreateOpen(false)
              }}
            >
              <Form.Item
                label="包裹配送編號"
                name="trackingNo"
                required
                validateStatus={liveCreateDuplicate ? 'error' : undefined}
                help={
                  liveCreateDuplicate ? (
                    <span>
                      包裹配送編號已存在，可{' '}
                      <Typography.Link
                        onClick={() => {
                          const trackingNo = liveCreateDuplicate
                          setIsLiveCreateOpen(false)
                          setLiveCreateDuplicate(null)
                          liveForm.setFieldsValue({ trackingNos: trackingNo, dateRange: undefined })
                          setLiveFilters({ trackingNos: [trackingNo], dateRange: undefined })
                          setCurrentPage(1)
                        }}
                      >
                        直接查看
                      </Typography.Link>
                    </span>
                  ) : null
                }
                rules={[
                  { required: true, message: '必填' },
                  {
                    validator: async (_, value) => {
                      const v = normalizeText(value)
                      if (!v) return
                      if (!isValidTrackingNo(v)) {
                        throw new Error('包裹配送編號格式錯誤')
                      }
                    },
                  },
                ]}
              >
                <Input placeholder="請輸入包裹配送編號..." allowClear onPressEnter={() => liveCreateForm.submit()} />
              </Form.Item>
            </Form>
          </Modal>
          <Modal
            open={isGridPlayerZoomOpen}
            title="影片放大"
            onCancel={() => setIsGridPlayerZoomOpen(false)}
            footer={null}
            destroyOnClose
            width={1100}
          >
            {hasPackageMonitorSlot(gridActiveIdx) && ytApiReady ? (
              <PackageYoutubeHost
                monitorIndex={gridActiveIdx}
                videoId={PACKAGE_DETAIL_YOUTUBE_IDS[gridActiveIdx]}
                variant="modal"
                apiReady={ytApiReady}
                onRegister={registerModalPlayer}
                onUnregister={unregisterModalPlayer}
              />
            ) : (
              <div className="detail-video-schematic detail-video-schematic--modal">
                <span className="detail-video-schematic-text">影片示意</span>
              </div>
            )}
          </Modal>
          <div className="breadcrumb-bar">
            <Breadcrumb className="page-breadcrumb" items={breadcrumbItems} />
          </div>
          {view === 'list' ? (
            <div className={`page-head${activeTab === TAB_LIVE ? ' page-head--live' : ''}`}>
              <div className="page-head-main">
                <Typography.Title level={3} className="page-title">
                  SPX 案件排查中心
                </Typography.Title>
                <Typography.Paragraph type="secondary" className="page-desc">
                  {pageDesc}
                </Typography.Paragraph>
              </div>
            </div>
          ) : null}

          {view === 'packageDetail' ? (
            <div className="card package-detail-card">
              <div className="package-detail-body package-detail-body--v2">
                <div className="package-detail-left">
                  <Collapse
                    className="detail-collapse"
                    {...(isKioskDetail
                      ? { defaultActiveKey: ['case', 'note'] }
                      : {
                          activeKey: packageLeftCollapseKeys,
                          onChange: (keys: string | string[]) => {
                            setPackageLeftCollapseKeys(Array.isArray(keys) ? keys : [String(keys)])
                          },
                        })}
                    items={
                      isKioskDetail
                        ? [
                            {
                              key: 'case',
                              label: '異常事件資訊',
                              children: (
                                <Descriptions
                                  size="small"
                                  column={1}
                                  className="detail-desc"
                                  items={kioskDetailDescItems}
                                />
                              ),
                            },
                            {
                              key: 'note',
                              label: '備註',
                              children: detailNoteSection,
                            },
                          ]
                        : [
                            {
                              key: 'pickup',
                              label: '取件資訊',
                              children: (
                                <Descriptions
                                  size="small"
                                  column={1}
                                  className="detail-desc"
                                  items={[
                                    { label: '取件任務編號', children: '2602000857984290' },
                                    { label: '取件任務狀態', children: '已取件' },
                                    { label: '門市名稱', children: '[3435] 楊梅新明 - 智取店' },
                                  ]}
                                />
                              ),
                            },
                            {
                              key: 'package',
                              label: '包裹資訊',
                              children: (
                                <div className="detail-package-table-outer">
                                  <Table
                                    size="small"
                                    pagination={
                                      packageRowsFiltered.length > PACKAGE_INFO_PAGE_SIZE
                                        ? {
                                            current: packageInfoPage,
                                            pageSize: PACKAGE_INFO_PAGE_SIZE,
                                            total: packageRowsFiltered.length,
                                            showSizeChanger: false,
                                            size: 'small',
                                            showTotal: (total, range) =>
                                              `第 ${range[0]}–${range[1]} 筆，共 ${total} 筆`,
                                            onChange: handlePackageInfoPageChange,
                                          }
                                        : false
                                    }
                                    scroll={{ x: 'max-content' }}
                                    className="detail-mini-table detail-package-info-table"
                                    columns={packageDetailColumns}
                                    dataSource={packageRowsFiltered}
                                    rowClassName={(record) => {
                                      const raw = packageDetailRowDeliveryId(record)
                                      const sel = normalizeText(selectedListingTrackingNo)
                                      return raw && sel && raw === sel
                                        ? 'detail-package-row--active'
                                        : ''
                                    }}
                                    onRow={(record) => ({
                                      onClick: () => {
                                        const raw = packageDetailRowDeliveryId(record)
                                        if (!raw) return
                                        const match = packageTrackingNumbers.find(
                                          (n) => normalizeText(n) === raw,
                                        )
                                        if (match) setSelectedListingTrackingNo(match)
                                      },
                                    })}
                                  />
                                </div>
                              ),
                            },
                            {
                              key: 'case',
                              label: '案件資訊',
                              children: (
                                <div>
                                  <Table
                                    size="small"
                                    pagination={false}
                                    scroll={{ x: 'max-content' }}
                                    className="detail-mini-table"
                                    columns={[
                                      { title: '案件編號', dataIndex: 'caseId', key: 'caseId', width: 170 },
                                      {
                                        title: '包裹配送編號',
                                        dataIndex: 'deliveryNo',
                                        key: 'deliveryNo',
                                        width: 180,
                                      },
                                      { title: '案件摘要', dataIndex: 'summary', key: 'summary', width: 200 },
                                      { title: '案件說明', dataIndex: 'caseNote', key: 'caseNote', width: 220 },
                                      { title: '案件描述', dataIndex: 'description', key: 'description', width: 360 },
                                      { title: '用戶類型', dataIndex: 'userType', key: 'userType', width: 120 },
                                      {
                                        title: '退貨物流編號',
                                        dataIndex: 'returnTrackingNo',
                                        key: 'returnTrackingNo',
                                        width: 180,
                                      },
                                      {
                                        title: '案件建立時間',
                                        dataIndex: 'createdAt',
                                        key: 'createdAt',
                                        width: 160,
                                      },
                                    ]}
                                    dataSource={packageCaseInfoTableRow}
                                  />
                                </div>
                              ),
                            },
                            {
                              key: 'note',
                              label: '備註',
                              children: detailNoteSection,
                            },
                          ]
                    }
                  />

                  <div className="detail-nav-footer">
                    <Button
                      disabled={detailNavIndex <= 0}
                      onClick={() => {
                        if (detailNavIndex <= 0) return
                        const row = detailNavRows[detailNavIndex - 1]
                        if (row) applyDetailRow(row)
                      }}
                    >
                      上一筆
                    </Button>
                    <Button
                      disabled={detailNavIndex < 0 || detailNavIndex >= detailNavRows.length - 1}
                      onClick={() => {
                        if (detailNavIndex < 0 || detailNavIndex >= detailNavRows.length - 1) return
                        const row = detailNavRows[detailNavIndex + 1]
                        if (row) applyDetailRow(row)
                      }}
                    >
                      下一筆
                    </Button>
                  </div>
                </div>

                <div className="package-detail-right">
                  {!isKioskDetail ? (
                    <div className="detail-right-tabs-stack">
                      <Tabs
                        className="detail-top-tabs"
                        activeKey={packageDetailTab}
                        onChange={(k) => {
                          setPackageDetailTab(k as 'pickup' | 'listing')
                          setPackageInfoPage(1)
                        }}
                        items={[
                          { key: 'pickup', label: '用戶取件' },
                          { key: 'listing', label: '門市上架' },
                        ]}
                      />

                      {packageDetailTab === 'listing' && packageListingTabItems.length > 0 ? (
                        <div className="detail-sub-tabs-scroll">
                          <Tabs
                            className="detail-sub-tabs detail-sub-tabs--nowrap"
                            activeKey={
                              packageListingTabItems.length > 0
                                ? selectedListingTrackingNo || packageTrackingNumbers[0]
                                : undefined
                            }
                            onChange={(k) => {
                              setSelectedListingTrackingNo(k)
                              setPackageInfoPage(1)
                            }}
                            moreIcon={null}
                            items={packageListingTabItems}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {videoDetailGridMode === 'preparing' ? (
                    <div className="detail-video-pending-wrap">
                      <Empty description="影片準備中，請稍後" />
                    </div>
                  ) : videoDetailGridMode === 'downloading' ? (
                    <div className="detail-video-pending-wrap detail-video-pending-wrap--loading">
                      <Spin size="large" />
                      <Typography.Text type="secondary">影片下載中，請稍後</Typography.Text>
                    </div>
                  ) : (
                    <>
                      {gridViewMode === 'single' ? (
                        <div className="detail-media-single">
                          <Button
                            className="detail-media-back"
                            icon={<LeftOutlined />}
                            onClick={() => setGridViewMode('grid')}
                          >
                            返回
                          </Button>
                          {hasPackageMonitorSlot(gridActiveIdx) ? (
                            <>
                              <Tag
                                bordered={false}
                                className="detail-media-tile-monitor-tag detail-media-tile-monitor-tag--single"
                              >
                                {packageVideoSampleMonitorNames[gridActiveIdx] ??
                                  `監視器 ${gridActiveIdx + 1}`}
                              </Tag>
                              {ytApiReady ? (
                                <PackageYoutubeHost
                                  monitorIndex={gridActiveIdx}
                                  videoId={PACKAGE_DETAIL_YOUTUBE_IDS[gridActiveIdx]}
                                  variant="single"
                                  apiReady={ytApiReady}
                                  onRegister={registerGridPlayer}
                                  onUnregister={unregisterGridPlayer}
                                />
                              ) : (
                                <div className="detail-video-schematic detail-video-schematic--single">
                                  <span className="detail-video-schematic-text">載入播放器…</span>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="detail-media-placeholder">尚無監視器</div>
                          )}
                        </div>
                      ) : (
                        <div className="detail-media-grid detail-media-grid--v2">
                          {Array.from({ length: 9 }).map((_, idx) => {
                            const hasSlot = hasPackageMonitorSlot(idx)
                            const monitorName = hasSlot
                              ? packageVideoSampleMonitorNames[idx] ?? `監視器 ${idx + 1}`
                              : null
                            const isActive = idx === gridActiveIdx
                            return (
                              <div
                                key={idx}
                                className={`detail-media-tile detail-media-tile-live${isActive ? ' is-active' : ''}`}
                                onClick={() => {
                                  setGridActiveIdx(idx)
                                  setGridViewMode('single')
                                }}
                                onDoubleClick={() => {
                                  if (!hasSlot) return
                                  setIsGridPlayerZoomOpen(true)
                                }}
                              >
                                {monitorName ? (
                                  <Tag bordered={false} className="detail-media-tile-monitor-tag">
                                    {monitorName}
                                  </Tag>
                                ) : null}
                                {hasSlot ? (
                                  ytApiReady ? (
                                    <PackageYoutubeHost
                                      monitorIndex={idx}
                                      videoId={PACKAGE_DETAIL_YOUTUBE_IDS[idx]}
                                      variant="grid"
                                      apiReady={ytApiReady}
                                      onRegister={registerGridPlayer}
                                      onUnregister={unregisterGridPlayer}
                                    />
                                  ) : (
                                    <div className="detail-video-schematic">
                                      <span className="detail-video-schematic-text">載入播放器…</span>
                                    </div>
                                  )
                                ) : (
                                  <div className="detail-media-placeholder">尚無監視器</div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      <div className="detail-grid-playerbar">
                    <div className="gridbar-left">
                      <Tooltip title={gridAllPlaying ? '暫停全部' : '播放全部'}>
                        <Button
                          type="text"
                          className="gridbar-icon-btn"
                          icon={gridAllPlaying ? <PauseOutlined /> : <CaretRightOutlined />}
                          onClick={() => {
                            if (gridAllPlaying) pauseAllGridVideos()
                            else void playAllGridVideos()
                          }}
                        />
                      </Tooltip>

                      <Dropdown
                        trigger={['click']}
                        menu={{
                          items: [0.5, 1, 1.5, 2].map((rate) => ({
                            key: String(rate),
                            label: `${rate}x`,
                            onClick: () => applyGridPlaybackRate(rate),
                          })),
                        }}
                      >
                        <Button type="text" className="gridbar-pill">
                          x{gridPlaybackRate} <DownOutlined />
                        </Button>
                      </Dropdown>

                      <Typography.Text className="gridbar-time">
                        {formatTime(gridTime.current)}/{formatTime(gridTime.duration)}
                      </Typography.Text>
                    </div>

                    <div className="gridbar-center">
                      <Slider
                        min={0}
                        max={Math.max(0, Math.floor(gridTime.duration))}
                        value={Math.min(Math.max(0, gridTime.current), gridTime.duration || 0)}
                        tooltip={{ formatter: null }}
                        onChange={(v) => {
                          isSeekingRef.current = true
                          setGridTime((prev) => ({ ...prev, current: Number(v) }))
                        }}
                        onChangeComplete={(v) => {
                          const t = Number(v)
                          isSeekingRef.current = false
                          getYoutubePlayersForControls().forEach((p) => {
                            try {
                              p.seekTo(t, true)
                            } catch {
                              // ignore
                            }
                          })
                        }}
                      />
                    </div>

                    <div className="gridbar-right">
                      <Tooltip title={gridAllMuted ? '取消靜音' : '全部靜音'}>
                        <Button
                          type="text"
                          className="gridbar-icon-btn"
                          icon={gridAllMuted ? <AudioMutedOutlined /> : <SoundOutlined />}
                          onClick={() => applyGridMuted(!gridAllMuted)}
                        />
                      </Tooltip>

                      <Tooltip title="同步">
                        <Button type="text" className="gridbar-pill" onClick={syncAllGridVideos}>
                          同步
                        </Button>
                      </Tooltip>

                      <Dropdown
                        trigger={['click']}
                        disabled={downloadMonitorMenuItems.length === 0}
                        menu={{
                          items: downloadMonitorMenuItems,
                          onClick: ({ key }) => {
                            void downloadGridVideoByMonitorIndex(Number(key))
                          },
                        }}
                      >
                        <Tooltip title="於 YouTube 開啟（選擇監視器）">
                          <Button
                            type="text"
                            className="gridbar-icon-btn"
                            icon={<DownloadOutlined />}
                            disabled={downloadMonitorMenuItems.length === 0}
                          />
                        </Tooltip>
                      </Dropdown>

                      <Tooltip title="放大">
                        <Button
                          type="text"
                          className="gridbar-icon-btn"
                          icon={<ExpandOutlined />}
                          onClick={() => {
                            if (!hasPackageMonitorSlot(gridActiveIdx)) return
                            setIsGridPlayerZoomOpen(true)
                          }}
                        />
                      </Tooltip>
                    </div>
                  </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
          <div className="card">
            <Tabs
              activeKey={activeTab}
              className="main-tabs"
              onChange={(key) => {
                setActiveTab(key)
              }}
              items={[
                { key: TAB_PACKAGE, label: '包裹案件' },
                { key: TAB_KIOSK, label: '繳費機案件' },
                { key: TAB_LIVE, label: '即時查詢' },
              ]}
            />

            {activeTab === TAB_PACKAGE ? (
              <>
                <Form
                  form={packageForm}
                  className="filter-bar filter-fill-bar"
                  layout="vertical"
                  onFinish={(values) => {
                    const range = values.dateRange as [unknown, unknown] | undefined
                    const fromMs =
                      range && range[0] && typeof (range[0] as any).valueOf === 'function'
                        ? Number((range[0] as any).valueOf())
                        : null
                    const toMs =
                      range && range[1] && typeof (range[1] as any).valueOf === 'function'
                        ? Number((range[1] as any).valueOf())
                        : null
                    setPackageFilters({
                      caseId: values.caseId,
                      trackingNo: values.trackingNo,
                      dateRange: [fromMs, toMs],
                    })
                    setCurrentPage(1)
                  }}
                >
                  <Row gutter={[16, 16]} align="bottom" wrap className="filter-fill-row">
                    <Col flex="1 1 160px" className="filter-fill-col">
                      <Form.Item label="案件編號" name="caseId" className="filter-item">
                        <Input
                          placeholder="用半形逗號分隔，中間不留空白"
                          allowClear
                          onPressEnter={() => packageForm.submit()}
                        />
                      </Form.Item>
                    </Col>
                    <Col flex="1 1 160px" className="filter-fill-col">
                      <Form.Item label="包裹配送編號" name="trackingNo" className="filter-item">
                        <Input
                          placeholder="請輸入包裹配送編號"
                          allowClear
                          onPressEnter={() => packageForm.submit()}
                        />
                      </Form.Item>
                    </Col>
                    <Col flex="1.35 1 240px" className="filter-fill-col filter-fill-col--date">
                      <Form.Item label="案件建立時間" name="dateRange" className="filter-item">
                        <RangePicker
                          style={{ width: '100%' }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') packageForm.submit()
                          }}
                        />
                      </Form.Item>
                    </Col>
                    <Col flex="none" className="filter-fill-actions">
                      <Form.Item
                        label=" "
                        className="filter-actions filter-item filter-actions-item"
                      >
                        <Space wrap={false} size={8} className="filter-search-actions">
                          <Button type="default" className="filter-submit-btn" htmlType="submit">
                            搜尋
                          </Button>
                          <Button
                            className="filter-reset-btn"
                            onClick={() => {
                              packageForm.resetFields()
                              setPackageFilters({})
                              setCurrentPage(1)
                            }}
                          >
                            重置
                          </Button>
                        </Space>
                      </Form.Item>
                    </Col>
                  </Row>
                </Form>

                {filteredPackageRows.length === 0 ? (
                  <div className="empty-state">
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={
                        <span>
                          尚無資料
                        </span>
                      }
                    />
                  </div>
                ) : (
                  <Table
                    size="middle"
                    columns={packageColumnsFromCsv}
                    dataSource={packagePageRows}
                    scroll={{ x: 'max-content' }}
                    pagination={false}
                    className="case-table case-table--subtle"
                  />
                )}
              </>
            ) : null}

            {activeTab === TAB_KIOSK ? (
              <>
                <Form
                  form={kioskForm}
                  className="filter-bar filter-fill-bar"
                  layout="vertical"
                  onFinish={(values) => {
                    const range = values.dateRange as [unknown, unknown] | undefined
                    const fromMs =
                      range && range[0] && typeof (range[0] as any).valueOf === 'function'
                        ? Number((range[0] as any).valueOf())
                        : null
                    const toMs =
                      range && range[1] && typeof (range[1] as any).valueOf === 'function'
                        ? Number((range[1] as any).valueOf())
                        : null
                    setKioskFilters({
                      store: values.store,
                      taskId: values.taskId,
                      vendor: values.vendor,
                      abnormal: values.abnormal,
                      dateRange: [fromMs, toMs],
                    })
                    setCurrentPage(1)
                  }}
                >
                  <Row gutter={[16, 16]} align="bottom" wrap className="filter-fill-row">
                    <Col flex="1 1 160px" className="filter-fill-col">
                      <Form.Item label="門市編號/名稱" name="store" className="filter-item">
                        <Input
                          placeholder="請輸入門市編號或門市名稱..."
                          allowClear
                          onPressEnter={() => kioskForm.submit()}
                        />
                      </Form.Item>
                    </Col>
                    <Col flex="1 1 160px" className="filter-fill-col">
                      <Form.Item label="任務編號" name="taskId" className="filter-item">
                        <Input
                          placeholder="請輸入任務編號..."
                          allowClear
                          onPressEnter={() => kioskForm.submit()}
                        />
                      </Form.Item>
                    </Col>
                    <Col flex="1 1 160px" className="filter-fill-col">
                      <Form.Item label="廠商" name="vendor" className="filter-item">
                        <Select
                          allowClear
                          placeholder="請選擇廠商..."
                          options={vendorFilterOptions}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') kioskForm.submit()
                          }}
                        />
                      </Form.Item>
                    </Col>
                    <Col flex="1 1 160px" className="filter-fill-col">
                      <Form.Item label="異常狀況" name="abnormal" className="filter-item">
                        <Select
                          allowClear
                          placeholder="請選擇異常狀況..."
                          options={abnormalFilterOptions}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') kioskForm.submit()
                          }}
                        />
                      </Form.Item>
                    </Col>
                    <Col flex="1.35 1 240px" className="filter-fill-col filter-fill-col--date">
                      <Form.Item label="異常發生時間" name="dateRange" className="filter-item">
                        <RangePicker
                          style={{ width: '100%' }}
                          placeholder={['請輸入', '請輸入']}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') kioskForm.submit()
                          }}
                        />
                      </Form.Item>
                    </Col>
                    <Col flex="none" className="filter-fill-actions">
                      <Form.Item
                        label=" "
                        className="filter-actions filter-item filter-actions-item"
                      >
                        <Space wrap={false} size={8} className="filter-search-actions">
                          <Button type="default" className="filter-submit-btn" htmlType="submit">
                            搜尋
                          </Button>
                          <Button
                            className="filter-reset-btn"
                            onClick={() => {
                              kioskForm.resetFields()
                              setKioskFilters({})
                              setCurrentPage(1)
                            }}
                          >
                            重置
                          </Button>
                        </Space>
                      </Form.Item>
                    </Col>
                  </Row>
                </Form>

                <Table
                  size="middle"
                  columns={kioskColumnsFromCsv}
                  dataSource={kioskPageRows}
                  scroll={{ x: 'max-content' }}
                  pagination={false}
                  className="case-table case-table--subtle"
                />
              </>
            ) : null}

            {activeTab === TAB_LIVE ? (
              <>
                <Form
                  form={liveForm}
                  className="filter-bar filter-fill-bar"
                  layout="vertical"
                  onFinish={(values) => {
                    const raw = normalizeText(values.trackingNos)
                    const trackingNos = raw
                      ? raw
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean)
                      : []
                    const range = values.dateRange as [unknown, unknown] | undefined
                    const fromMs =
                      range && range[0] && typeof (range[0] as any).valueOf === 'function'
                        ? Number((range[0] as any).valueOf())
                        : null
                    const toMs =
                      range && range[1] && typeof (range[1] as any).valueOf === 'function'
                        ? Number((range[1] as any).valueOf())
                        : null
                    setLiveFilters({
                      trackingNos,
                      dateRange: [fromMs, toMs],
                    })
                    setCurrentPage(1)
                  }}
                >
                  <Row gutter={[16, 16]} align="bottom" wrap className="filter-fill-row">
                    <Col flex="1 1 160px" className="filter-fill-col">
                      <Form.Item label="包裹配送編號" name="trackingNos" className="filter-item">
                        <Input.TextArea
                          autoSize={{ minRows: 1, maxRows: 4 }}
                          placeholder={LIVE_TRACKING_PLACEHOLDER}
                          allowClear
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              liveForm.submit()
                            }
                          }}
                        />
                      </Form.Item>
                    </Col>
                    <Col flex="1.35 1 240px" className="filter-fill-col filter-fill-col--date">
                      <Form.Item label="查詢建立時間" name="dateRange" className="filter-item">
                        <RangePicker
                          style={{ width: '100%' }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') liveForm.submit()
                          }}
                        />
                      </Form.Item>
                    </Col>
                    <Col flex="none" className="filter-fill-actions">
                      <Form.Item
                        label=" "
                        className="filter-actions filter-item filter-actions-item"
                      >
                        <Space wrap={false} size={8} className="filter-search-actions">
                          <Button type="default" className="filter-submit-btn" htmlType="submit">
                            搜尋
                          </Button>
                          <Button
                            className="filter-reset-btn"
                            onClick={() => {
                              liveForm.resetFields()
                              setLiveFilters({})
                              setCurrentPage(1)
                            }}
                          >
                            重置
                          </Button>
                        </Space>
                      </Form.Item>
                    </Col>
                  </Row>
                </Form>

                <div className="live-query-actions-strip" aria-label="即時查詢操作">
                  <Space wrap>
                    <Button
                      type="primary"
                      onClick={() => {
                        setLiveCreateDuplicate(null)
                        liveCreateForm.resetFields()
                        setIsLiveCreateOpen(true)
                      }}
                    >
                      新增查詢
                    </Button>
                    <Button className="btn-batch-query">批次新增查詢</Button>
                  </Space>
                </div>

                {filteredLiveRows.length === 0 ? (
                  <div className="empty-state">
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={
                        <span>
                          尚無資料，請點選搜尋區與列表之間的{' '}
                          <Typography.Link
                            onClick={() => {
                              setLiveCreateDuplicate(null)
                              liveCreateForm.resetFields()
                              setIsLiveCreateOpen(true)
                            }}
                          >
                            新增查詢
                          </Typography.Link>{' '}
                          新增特定包裹資訊與 CCTV
                        </span>
                      }
                    />
                  </div>
                ) : (
                  <Table
                    size="middle"
                    columns={liveColumnsFromCsv}
                    dataSource={livePageRows}
                    scroll={{ x: 'max-content' }}
                    pagination={false}
                    className="case-table case-table--subtle"
                  />
                )}
              </>
            ) : null}

            <div className="pagination-wrapper">
              <span className="pagination-total-text">
                第 {start}-{end} 筆，共 {listTotalFiltered} 筆
              </span>
              <Pagination
                total={listTotalFiltered}
                pageSize={pageSize}
                current={currentPage}
                showSizeChanger={false}
                showQuickJumper={false}
                onChange={(page) => setCurrentPage(page)}
              />
            </div>
          </div>
          )}
        </Content>
      </Layout>
      </Layout>
    </Layout>
  )
}

export default App

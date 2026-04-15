/** 載入 YouTube IFrame API（單例 Promise，供多處 await） */
declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void
  }
}

let loadPromise: Promise<void> | null = null

export function loadYoutubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.YT?.Player) return Promise.resolve()
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve()
    }
    const tag = document.createElement('script')
    tag.async = true
    tag.src = 'https://www.youtube.com/iframe_api'
    const first = document.getElementsByTagName('script')[0]
    first.parentNode?.insertBefore(tag, first)
  })
  return loadPromise
}

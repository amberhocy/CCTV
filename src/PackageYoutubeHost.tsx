import { useEffect, useId, useRef } from 'react'
import type { Player } from 'youtube'

type Props = {
  monitorIndex: number
  videoId: string
  variant: 'grid' | 'single' | 'modal'
  apiReady: boolean
  onRegister: (index: number, player: Player) => void
  onUnregister: (index: number) => void
}

export function PackageYoutubeHost({
  monitorIndex,
  videoId,
  variant,
  apiReady,
  onRegister,
  onUnregister,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<Player | null>(null)
  const domId = useId().replace(/:/g, '')

  useEffect(() => {
    const YT = window.YT
    if (!apiReady || !containerRef.current || !YT?.Player) return

    const origin = window.location.origin
    const player = new YT.Player(containerRef.current, {
      videoId,
      width: '100%',
      height: '100%',
      playerVars: {
        controls: 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        enablejsapi: 1,
        origin,
        disablekb: 1,
      },
      events: {
        onReady: (e: { target: Player }) => {
          playerRef.current = e.target
          onRegister(monitorIndex, e.target)
        },
      },
    })
    playerRef.current = player

    return () => {
      try {
        player.destroy()
      } catch {
        // ignore
      }
      playerRef.current = null
      onUnregister(monitorIndex)
    }
  }, [apiReady, videoId, monitorIndex, onRegister, onUnregister])

  const cls =
    variant === 'modal'
      ? 'detail-youtube-host detail-youtube-host--modal'
      : variant === 'single'
        ? 'detail-youtube-host detail-youtube-host--single'
        : 'detail-youtube-host detail-youtube-host--grid'

  return <div id={domId} ref={containerRef} className={cls} />
}

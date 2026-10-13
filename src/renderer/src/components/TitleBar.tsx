import React from 'react'
import { Minus, Square, X, Snowflake } from 'lucide-react'

interface TitleBarProps {
  title?: string
}

declare const __APP_VERSION__: string | undefined

export const TitleBar: React.FC<TitleBarProps> = ({ title = 'draft-one' }) => {
  const [version, setVersion] = React.useState<string>(
    typeof __APP_VERSION__ !== 'undefined' ? `v${__APP_VERSION__}` : 'v1.0.2'
  )
  const [preview, setPreview] = React.useState(false)
  const [displayTitle, setDisplayTitle] = React.useState(title)

  React.useEffect(() => {
    // @ts-ignore
    window.api?.getAppVersion?.().then((ver: string) => {
      if (ver) setVersion(`v${ver}`)
    })
    window.api?.isPreviewInstance?.().then((flag) => {
      if (flag) {
        setPreview(true)
        setDisplayTitle('draft-one (Preview)')
      }
    })
  }, [])

  const handleMinimize = () => {
    // @ts-ignore
    window.api?.minimizeWindow()
  }

  const handleMaximize = () => {
    // @ts-ignore
    window.api?.maximizeWindow()
  }

  const handleClose = () => {
    // @ts-ignore
    window.api?.closeWindow()
  }

  return (
    <div className="h-10 bg-fx-elevated flex items-center justify-between select-none px-3 drag-region">
      <style>{`
        .drag-region { -webkit-app-region: drag; }
        .no-drag { -webkit-app-region: no-drag; }
      `}</style>
      <div className="flex items-center space-x-2 text-sm font-semibold text-fx-text">
        <div className="p-1 rounded-lg bg-fx-accent-dim text-fx-accent shadow-[0_0_14px_rgba(56,189,248,0.35)]">
          <Snowflake className="w-4 h-4" />
        </div>
        <span>{displayTitle}</span>
        {preview && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-200">
            仅预览
          </span>
        )}
        <span className="text-[10px] font-normal px-1.5 py-0.5 rounded-md bg-fx-surface text-fx-muted font-mono">
          {version}
        </span>
      </div>

      <div className="flex items-center space-x-1 no-drag">
        <button
          type="button"
          onClick={handleMinimize}
          className="p-1.5 rounded-lg hover:bg-fx-surface text-fx-muted hover:text-fx-text transition duration-fx"
          aria-label="最小化"
          title="最小化"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleMaximize}
          className="p-1.5 rounded-lg hover:bg-fx-surface text-fx-muted hover:text-fx-text transition duration-fx"
          aria-label="最大化"
          title="最大化"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="p-1.5 rounded-lg hover:bg-fx-danger/20 text-fx-muted hover:text-fx-danger transition duration-fx"
          aria-label="最小化至托盘"
          title="最小化至托盘"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

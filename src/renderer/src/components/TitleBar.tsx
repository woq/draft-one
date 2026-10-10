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

  React.useEffect(() => {
    // @ts-ignore
    window.api?.getAppVersion?.().then((ver: string) => {
      if (ver) setVersion(`v${ver}`)
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
    <div className="h-10 bg-slate-900/90 backdrop-blur border-b border-slate-800/80 flex items-center justify-between select-none px-3 drag-region">
      <style>{`
        .drag-region { -webkit-app-region: drag; }
        .no-drag { -webkit-app-region: no-drag; }
      `}</style>
      <div className="flex items-center space-x-2 text-sm font-semibold text-slate-200">
        <div className="p-1 rounded bg-blue-600/20 text-blue-400">
          <Snowflake className="w-4 h-4" />
        </div>
        <span>{title}</span>
        <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
          {version}
        </span>
      </div>

      <div className="flex items-center space-x-1 no-drag">
        <button
          onClick={handleMinimize}
          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          title="最小化"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          title="最大化"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleClose}
          className="p-1.5 rounded hover:bg-red-600/80 text-slate-400 hover:text-white transition-colors"
          title="最小化至托盘"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

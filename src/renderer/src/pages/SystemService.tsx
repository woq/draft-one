import React, { useState, useEffect } from 'react'
import {
  Wrench,
  Power,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  Layers,
  FileText,
  RefreshCw,
  X,
  Cpu
} from 'lucide-react'

interface ServiceStatus {
  installed: boolean
  running: boolean
  statusText: string
}

interface TaskStatus {
  exists: boolean
  taskName: string
}

export const SystemService: React.FC = () => {
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>({
    installed: false,
    running: false,
    statusText: '检测中...'
  })
  const [taskStatus, setTaskStatus] = useState<TaskStatus>({
    exists: false,
    taskName: ''
  })

  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [actionFeedback, setActionFeedback] = useState<{
    success: boolean
    message: string
  } | null>(null)
  const [serviceLogs, setServiceLogs] = useState<string | null>(null)
  const [showLogViewer, setShowLogViewer] = useState(false)
  const [loadingLogs, setLoadingLogs] = useState(false)


  const refreshAllStatus = async () => {
    try {
      // @ts-ignore
      const s = await window.api?.getServiceStatus()
      if (s) setServiceStatus(s)
      // @ts-ignore
      const t = await window.api?.getTaskStatus()
      if (t) setTaskStatus(t)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    refreshAllStatus()
  }, [])

  const executeAction = async (actionKey: string, fn: () => Promise<{ success: boolean; message: string }>) => {
    setLoadingAction(actionKey)
    setActionFeedback(null)
    try {
      const res = await fn()
      setActionFeedback(res)
      await refreshAllStatus()
      setTimeout(() => setActionFeedback(null), 4000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setActionFeedback({ success: false, message: `操作异常: ${msg}` })
    } finally {
      setLoadingAction(null)
    }
  }

  const handleFetchServiceLogs = async () => {
    setLoadingLogs(true)
    setShowLogViewer(true)
    try {
      // @ts-ignore
      const logs = await window.api?.getServiceLogs()
      setServiceLogs(logs || '暂无服务日志记录')
    } catch (e: any) {
      setServiceLogs(`读取日志失败: ${e.message}`)
    } finally {
      setLoadingLogs(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div>
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-fx-accent" />
          <h2 className="text-lg font-bold text-fx-text">系统服务与工具</h2>
        </div>
        <p className="text-xs text-fx-muted mt-1">
          开机由 Windows 服务拉起内核。用户登录后，服务在当前桌面创建托盘。下面的登录任务只是托盘备份，不是默认启动方式。
        </p>
      </div>

      {actionFeedback && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2 border ${ actionFeedback.success ? 'bg-fx-accent-dim text-fx-accent' : 'bg-rose-500/10 text-rose-300' }`}
        >
          {actionFeedback.success ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{actionFeedback.message}</span>
        </div>
      )}

      {/* 1. Windows System Service Mode */}
      <div className="p-5 rounded-2xl fx-panel space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-fx-accent-dim text-fx-accent">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-fx-text">Windows 系统服务模式 (Service Mode)</h3>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${ serviceStatus.running ? 'bg-fx-accent-dim text-fx-accent ' : serviceStatus.installed ? 'bg-amber-500/10 text-amber-400 ' : 'bg-fx-surface text-fx-muted ' }`}
                >
                  {serviceStatus.statusText}
                </span>
              </div>
              <div className="text-xs text-fx-muted mt-0.5">
                服务名: <code className="text-fx-accent font-mono">DraftOneService</code> · 开机启动内核，登录后在当前桌面创建托盘
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!serviceStatus.installed ? (
              <button
                onClick={() =>
                  executeAction('install-service', () =>
                    // @ts-ignore
                    window.api?.installService()
                  )
                }
                disabled={loadingAction === 'install-service'}
                className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-cyan-400 text-xs font-semibold text-white shadow transition"
              >
                {loadingAction === 'install-service' ? '正在注册...' : '注册并安装服务'}
              </button>
            ) : (
              <>
                {serviceStatus.running ? (
                  <button
                    onClick={() =>
                      executeAction('stop-service', () =>
                        // @ts-ignore
                        window.api?.stopService()
                      )
                    }
                    disabled={loadingAction === 'stop-service'}
                    className="px-3 py-1.5 rounded-lg bg-fx-surface hover:bg-fx-surface-hover text-xs font-medium text-fx-text transition"
                  >
                    {loadingAction === 'stop-service' ? '停止中...' : '停止服务'}
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      executeAction('start-service', () =>
                        // @ts-ignore
                        window.api?.startService()
                      )
                    }
                    disabled={loadingAction === 'start-service'}
                    className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-emerald-500 text-xs font-medium text-white shadow transition"
                  >
                    {loadingAction === 'start-service' ? '启动中...' : '启动服务'}
                  </button>
                )}

                <button
                  onClick={() =>
                    executeAction('uninstall-service', () =>
                      // @ts-ignore
                      window.api?.uninstallService()
                    )
                  }
                  disabled={loadingAction === 'uninstall-service'}
                  className="px-3 py-1.5 rounded-lg bg-rose-600/10 hover:bg-rose-600/20 text-xs font-medium text-rose-400 transition"
                >
                  {loadingAction === 'uninstall-service' ? '卸载中...' : '卸载服务'}
                </button>

                <button
                  onClick={handleFetchServiceLogs}
                  disabled={loadingLogs}
                  className="px-3 py-1.5 rounded-lg bg-fx-accent-dim hover:bg-fx-accent/20 text-xs font-medium text-fx-accent transition flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{loadingLogs ? '读取日志...' : '查看服务日志'}</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 fx-divider text-xs text-fx-muted">
          <div className="p-3 rounded-xl bg-fx-bg /50">
            <span className="font-semibold text-fx-text/90">开机即运行内核</span>
            <p className="mt-1 text-[11px] leading-relaxed">
              内核作为 Windows 服务启动，无需等待用户登录。托盘要等用户登录后，由服务在当前桌面拉起。
            </p>
          </div>
          <div className="p-3 rounded-xl bg-fx-bg /50">
            <span className="font-semibold text-fx-text/90">🛡️ SYSTEM 原生特权</span>
            <p className="mt-1 text-[11px] leading-relaxed">
              运行于 LocalSystem 安全上下文，TUN 虚拟网卡与路由表调度具备天然权限，彻底免除普通程序的 UAC 提权确认。
            </p>
          </div>
        </div>

        {showLogViewer && (
          <div className="p-4 rounded-xl bg-fx-bg space-y-2 mt-3 animate-fadeIn">
            <div className="flex items-center justify-between text-xs pb-2">
              <div className="flex items-center gap-2 text-fx-accent font-semibold">
                <FileText className="w-4 h-4" />
                <span>DraftOneService 运行与输出日志 (service.log)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleFetchServiceLogs}
                  disabled={loadingLogs}
                  className="px-2 py-1 bg-fx-surface hover:bg-fx-surface-hover text-fx-text/90 rounded text-[11px] flex items-center gap-1 transition"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingLogs ? 'animate-spin' : ''}`} />
                  <span>刷新</span>
                </button>
                <button
                  onClick={() => setShowLogViewer(false)}
                  className="p-1 hover:bg-fx-surface text-fx-muted hover:text-fx-text rounded text-xs transition"
                  title="收起"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <pre className="font-mono text-[11px] text-fx-text/90 max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text p-2.5 bg-black/50 rounded-lg">
              {serviceLogs || '正在读取 service.log ...'}
            </pre>
          </div>
        )}
      </div>

      {/* 2. High-Priority Task Scheduler */}
      <div className="p-5 rounded-2xl fx-panel space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-fx-accent-dim text-fx-accent">
              <Power className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-fx-text">交互式登录启动（可选）</h3>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${ taskStatus.exists ? 'bg-fx-accent-dim text-fx-accent ' : 'bg-fx-surface text-fx-muted ' }`}
                >
                  {taskStatus.exists ? '已配置' : '未配置'}
                </span>
              </div>
              <div className="text-xs text-fx-muted mt-0.5">
                任务名: <code className="text-fx-accent font-mono">DraftOne_AutoStart</code> · 当前用户登录时以最高权限补托盘
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => executeAction('open-scheduler', () => window.api.openTaskScheduler())}
              disabled={loadingAction === 'open-scheduler'}
              className="px-3 py-1.5 rounded-lg bg-fx-surface hover:bg-fx-surface-hover text-xs font-medium text-fx-text transition"
            >
              {loadingAction === 'open-scheduler' ? '正在打开...' : '打开任务计划程序'}
            </button>
            {!taskStatus.exists ? (
              <button
                onClick={() => executeAction('install-task', () => window.api.installTask())}
                disabled={loadingAction === 'install-task'}
                className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-cyan-400 text-xs font-semibold text-white shadow transition"
              >
                {loadingAction === 'install-task' ? '创建中...' : '创建登录启动'}
              </button>
            ) : (
              <>
                <button
                  onClick={() => executeAction('install-task', () => window.api.installTask())}
                  disabled={loadingAction === 'install-task'}
                  className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-cyan-400 text-xs font-semibold text-white shadow transition"
                >
                  {loadingAction === 'install-task' ? '更新中...' : '更新任务参数'}
                </button>
                <button
                  onClick={() =>
                    executeAction('uninstall-task', () =>
                      // @ts-ignore
                      window.api?.uninstallTask()
                    )
                  }
                  disabled={loadingAction === 'uninstall-task'}
                  className="px-3 py-1.5 rounded-lg bg-fx-surface hover:bg-fx-surface-hover text-xs font-medium text-fx-text/90 transition"
                >
                  {loadingAction === 'uninstall-task' ? '移除中...' : '移除自启任务'}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-fx-bg /50 text-xs text-fx-muted">
          托盘必须跑在已登录用户的桌面上。任务在该用户登录时启动，勾选最高权限，不限制必须使用交流电源，配置为 Windows 10，并带{' '}
          <code className="text-fx-accent font-mono">--silent</code>。已有旧任务时点「更新任务参数」覆盖。点「打开任务计划程序」在{' '}
          <code className="text-fx-accent font-mono">taskschd.msc</code> 里查看{' '}
          <code className="text-fx-accent font-mono">DraftOne_AutoStart</code>。内核仍由服务启动。
        </div>
      </div>

      {/* 3. Core process cleanup */}
      <div className="p-5 rounded-2xl fx-panel space-y-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-fx-text">内核管理</h3>
        </div>
        <p className="text-xs text-fx-muted leading-relaxed">
          结束本机所有 <code className="text-amber-300 font-mono">mihomo.exe</code>
          ，包括其他客户端拉起的进程。若系统代理开着，会一并关掉。Windows 服务保持注册，结束后要再启动内核才恢复代理。
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const ok = window.confirm(
                '结束本机所有 mihomo.exe？其他代理客户端的内核也会退出，系统代理会关闭。'
              )
              if (!ok) return
              void executeAction('kill-mihomo', () => window.api.killAllMihomo(false))
            }}
            disabled={loadingAction === 'kill-mihomo' || loadingAction === 'kill-restart-mihomo'}
            className="px-3.5 py-1.5 rounded-lg bg-rose-600/15 hover:bg-rose-600/25 text-xs font-semibold text-rose-300 transition"
          >
            {loadingAction === 'kill-mihomo' ? '正在结束...' : '结束全部 mihomo'}
          </button>
          <button
            type="button"
            onClick={() => {
              const ok = window.confirm(
                '先结束本机所有 mihomo.exe，再启动本程序的内核？系统代理会关闭，需要之后手动再打开。'
              )
              if (!ok) return
              void executeAction('kill-restart-mihomo', () => window.api.killAllMihomo(true))
            }}
            disabled={loadingAction === 'kill-mihomo' || loadingAction === 'kill-restart-mihomo'}
            className="px-3.5 py-1.5 rounded-lg bg-fx-surface hover:bg-fx-surface-hover text-xs font-medium text-fx-text transition"
          >
            {loadingAction === 'kill-restart-mihomo' ? '正在处理...' : '结束并重新启动'}
          </button>
        </div>
      </div>

      {/* 4. System & Network Repair Utilities */}
      <div className="p-5 rounded-2xl fx-panel space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-fx-accent" />
          <h3 className="text-sm font-bold text-fx-text">系统网络与驱动修复工具箱</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Flush DNS */}
          <div className="p-4 rounded-xl bg-fx-bg flex items-center justify-between">
            <div className="space-y-1 pr-3">
              <div className="text-xs font-bold text-fx-text">刷新 Windows DNS 缓存</div>
              <div className="text-[11px] text-fx-muted font-mono">ipconfig /flushdns</div>
              <div className="text-[11px] text-fx-muted">清理本地陈旧 DNS 解析记录，解决网页打不开</div>
            </div>
            <button
              onClick={() =>
                executeAction('flush-dns', () =>
                  // @ts-ignore
                  window.api?.flushDns()
                )
              }
              disabled={loadingAction === 'flush-dns'}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-fx-surface hover:bg-fx-surface-hover text-xs font-medium text-fx-text transition"
            >
              {loadingAction === 'flush-dns' ? '刷新中...' : '一键刷新'}
            </button>
          </div>

          {/* Fix Firewall */}
          <div className="p-4 rounded-xl bg-fx-bg flex items-center justify-between">
            <div className="space-y-1 pr-3">
              <div className="text-xs font-bold text-fx-text">配置 Windows 防火墙放行</div>
              <div className="text-[11px] text-fx-muted font-mono">netsh advfirewall</div>
              <div className="text-[11px] text-fx-muted">为客户端和内核添加入站放行</div>
            </div>
            <button
              onClick={() =>
                executeAction('fix-firewall', () =>
                  // @ts-ignore
                  window.api?.fixFirewall()
                )
              }
              disabled={loadingAction === 'fix-firewall'}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-fx-surface hover:bg-fx-surface-hover text-xs font-medium text-fx-text transition"
            >
              {loadingAction === 'fix-firewall' ? '配置中...' : '一键放行'}
            </button>
          </div>

          {/* Reset Winsock */}
          <div className="p-4 rounded-xl bg-fx-bg flex items-center justify-between">
            <div className="space-y-1 pr-3">
              <div className="text-xs font-bold text-fx-text">重置网络栈 (Winsock / 代理)</div>
              <div className="text-[11px] text-fx-muted font-mono">netsh winsock reset</div>
              <div className="text-[11px] text-fx-muted">恢复系统代理并重置 Winsock。完成后需要重启计算机</div>
            </div>
            <button
              onClick={() =>
                executeAction('reset-winsock', () =>
                  // @ts-ignore
                  window.api?.resetWinsock()
                )
              }
              disabled={loadingAction === 'reset-winsock'}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-fx-surface hover:bg-fx-surface-hover text-xs font-medium text-fx-text transition"
            >
              {loadingAction === 'reset-winsock' ? '重置中...' : '一键重置'}
            </button>
          </div>

          {/* Clean Wintun */}
          <div className="p-4 rounded-xl bg-fx-bg flex items-center justify-between">
            <div className="space-y-1 pr-3">
              <div className="text-xs font-bold text-fx-text">清理僵死 Wintun 网卡残留</div>
              <div className="text-[11px] text-fx-muted font-mono">Disable/Remove DraftOneTun</div>
              <div className="text-[11px] text-fx-muted">清理 TUN 重复开启可能遗留的多余虚拟适配器</div>
            </div>
            <button
              onClick={() =>
                executeAction('fix-wintun', () =>
                  // @ts-ignore
                  window.api?.fixWintun()
                )
              }
              disabled={loadingAction === 'fix-wintun'}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-fx-surface hover:bg-fx-surface-hover text-xs font-medium text-fx-text transition"
            >
              {loadingAction === 'fix-wintun' ? '清理中...' : '一键清理'}
            </button>
          </div>

          <div className="p-4 rounded-xl bg-fx-bg flex items-center justify-between">
            <div className="space-y-1 pr-3">
              <div className="text-xs font-bold text-fx-text">放行 Microsoft Store 应用回环</div>
              <div className="text-[11px] text-fx-muted font-mono">CheckNetIsolation LoopbackExempt</div>
              <div className="text-[11px] text-fx-muted">让 UWP 应用走本机系统代理。需要管理员确认</div>
            </div>
            <button
              type="button"
              onClick={() =>
                executeAction('uwp-loopback', () => window.api.allowUwpLoopback())
              }
              disabled={loadingAction === 'uwp-loopback'}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-fx-surface hover:bg-fx-surface-hover text-xs font-medium text-fx-text transition"
            >
              {loadingAction === 'uwp-loopback' ? '处理中...' : '一键放行'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

# draft-one 🧊

<p align="center">
  <img src="resources/icon.png" width="128" height="128" alt="draft-one Logo" />
</p>

<p align="center">
  <strong>现代化 Windows 代理客户端</strong><br>
  融合 <strong>v2rayN 自由直观的节点路由编辑</strong> 与 <strong>Clash Verge Rev 般优雅现代 UI</strong>。<br>
  由 <code>mihomo</code> (Clash.Meta) 内核驱动，以节点为中心，面向 24/7 长期不间断运行深度优化。
</p>

<p align="center">
  <a href="#-核心特性">核心特性</a> •
  <a href="#-技术架构">技术架构</a> •
  <a href="#-快速开始">快速开始</a> •
  <a href="#-247-长期运行稳定性保障">长期运行稳定性</a> •
  <a href="#6-windows-系统服务与登录托盘">系统服务与自启</a> •
  <a href="#-开源许可">开源许可</a>
</p>

---

## ⚠️ 免责与项目声明 (Disclaimer)

> **"Draft One" —— 一份自用的思路草案与概念实现。**

- **个人创意自用**：本项目纯属个人日常使用场景下的灵感试验与自用工具，核心思路是将直观的节点路由控制与现代化 UI 进行组合实现。
- **无维护计划 (No Maintenance)**：本项目为阶段性自用产物，**不承诺、亦无后续长期维护计划**。不对任何环境下的运行状况、兼容性或更新负责。
- **不接收 PR 与 Issues**：**不开放/不处理 Pull Request 及 Issues**，请勿提交功能建议、Bug 反馈或合并请求。如需二次开发或修改，请自行 Fork 探索。

---

## 🙏 致谢与开源基石 (Acknowledgments)

本项目站在了巨人的肩膀上。**没有以下优秀的开源项目与核心开发者的付出，就没有本项目的诞生**。在此致以诚挚的感谢与崇高的敬意：

- **[mihomo (Clash.Meta)](https://github.com/MetaCubeX/mihomo)**：提供了强悍、稳健且高度可扩展的底层代理核心驱动。
- **[v2rayN](https://github.com/2dust/v2rayN)**：为本项目带来了“以真实节点为中心”与自由路由控制的直观交互灵感。
- **[Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev)**：极具美感且优雅的现代桌面客户端交互典范。

---

## ✨ 核心特性

### 1. 节点中心化设计 (Node-Centric)
- 抛弃复杂抽象的 Clash 嵌套分组（Proxy Group 树），以**真实代理节点**为主视图。
- 节点列表支持按订阅分组过滤、批量/单个测速、实时上/下行速率与累计用量显示。
- 点击任意节点直接秒级切换活动出站节点，零感无缝切换。

### 2. 多订阅并发管理与配额监控 (Multi-Subscription)
- 支持同时绑定管理多个机场订阅，独立存储在本地，互不覆盖。
- 自动抓取并解析 `Subscription-Userinfo` 套餐配额：直观展示已用/总流量进度条与到期时间。
- 支持单个订阅启用/禁用开关、单订阅刷新、一键更新所有订阅、修改订阅备注与链接。
- **智能节点聚合**：自动聚合所有已启用订阅的节点，同名节点自动注入订阅前缀防冲突。

### 3. 手动导入分享链接 (Share Links & Batch Import)
- 支持主流协议单条/多条链接导入：
  - **VMess** (`vmess://` Base64 JSON，支持 ws/grpc/tls)
  - **VLESS** (`vless://`，完整支持 Reality public-key/short-id、TLS、Flow)
  - **Shadowsocks** (`ss://`，支持 SIP002 与标准 Base64 格式)
  - **Trojan** (`trojan://`，支持 SNI 与 WebSocket)
  - **Hysteria 2** (`hysteria2://` / `hy2://`)
- 支持一键从系统剪贴板粘贴多行链接或整段 Base64 订阅文本自动逆解码解析。

### 4. 自由分流路由与指定网站绑定 (Custom Routing & GeoData)
- 自定义分流规则：域名后缀、域名关键字、进程名、IP-CIDR、GeoSite、GeoIP、外部规则集、兜底 MATCH。一条规则的载荷可用逗号、分号或换行拆成多条 mihomo 规则；禁用的规则不会写入配置。
- 路由页分成三块：自定义规则、广告拦截、直连。自定义在最前。直连里有游戏下载、局域网、微信、中国大陆，以及 `geosite:cn` 和中国 IP。内核每 24 小时用直连更新那四条远程名单。
- 出站目标支持 `DIRECT`、`REJECT`、`PROXY`，以及任意具体节点名称（如 `GEOSITE,openai,Singapore-S1`）。
- 添加规则后，载荷停顿 400ms 再写入配置并热重载；增删、排序和开关立刻保存。规则库页和路由页的「更新规则库」下载地理库、anti-AD 和四条直连名单。每条操作对应的 IPC 见 [ARCHITECTURE.md 第 6 节](./ARCHITECTURE.md#6-模块链路)。
- 设置里的自动更新开关只保存偏好，当前版本没有 24 小时或每周的后台拉取任务。内核自己的 anti-AD `interval` 仍是 86400 秒。

### 5. 全面流量统计与审计 (Traffic Analytics)
- 实时全局上行/下行速率监测与动态图表。
- 单节点流量消耗统计。流量页每 2 秒向内核取连接表，按连接增量刷新域名和 IP。累计记在 `data\traffic-stats.json`，重启和升级后还在。`DIRECT` 算国内直连，其余非拦截节点算海外。
- Top 50 域名 / IP 访问流量排行与匹配规则下钻分析。
- 主机表超过 1500 条时保留流量最高的 800 条。节点累计超过 600 个时保留流量最高的 400 个。界面日志从 `data\logs\app.log` 装回最近 2000 条。`app.log` 和 `service.log` 各自最多 4 个文件，每个 4MB。

### 6. Windows 系统服务与登录托盘
- **安装范围**是全体用户。安装包要求管理员权限，默认目录是 `C:\Program Files\draft-one`。没有单独的当前用户安装模式。可执行文件在这个目录里。配置、规则和日志在旁边的 `data\`。`app.log` 和 `service.log` 各自最多 4 个文件，每个 4MB。浏览器缓存、GPU 缓存和 TEMP 仍放在系统常规位置。卸载会删掉 `data\`、服务、登录项、计划任务和本程序加过的防火墙规则。
- **Windows 服务**是开机路径。安装时注册 `DraftOneService`，以本地系统账户启动旁边的 `mihomo.exe`。用户登录后，服务在该用户的桌面里启动 `draft-one.exe --silent`，由这个进程创建托盘。服务进程自己在 Session 0，不能创建托盘。
- **登录启动项**：安装器写入 `HKCU\...\Run`，参数 `--silent`，作为托盘的备份。设置页可以开关这一项。
- 系统服务页可以手动创建 `DraftOne_AutoStart`。它在当前用户登录时以最高权限运行，只在该用户已登录时启动，不限制必须使用交流电源，任务配置是 Windows 10。页面可以打开 `taskschd.msc` 查看这条任务。没有交互登录限制的旧最高权限任务，界面启动后仍会删掉。安装器升级和轻量升级都保留这条任务。卸载才会删掉它。
- **内核管理**：确认后结束本机所有 `mihomo.exe`，并关闭系统代理。也可以结束后立即重新启动本程序的内核。
- **网络修复工具箱**：刷新 DNS 缓存（`ipconfig /flushdns`）、重置 Winsock（先恢复系统代理，完成后需要重启计算机）、修复防火墙入站规则（`DraftOne_App`、`DraftOne_Core`）、只清理名为 `DraftOneTun` 的网卡、为 Microsoft Store 应用写入回环豁免。

---

## 🛡️ 24/7 长期运行稳定性保障

针对家庭软路由旁路、开发机、办公电脑等长期开机不间断运行场景做了针对性深度优化：

1. **内核守护与单次拉起**：
   - 主进程监听 `mihomo` 子进程退出。非手动停止且不是端口冲突时，**只自动重启 1 次**，间隔 1 秒。再次失败后停止重试，界面弹出内核异常条，并只发一次系统通知。端口 7890/9090 被占用时不循环重启，弹出确认框；能认出监听进程时，确认后只结束那个 PID。`DraftOneService` 拉起的内核按 1 秒、2 秒、4 秒退避，最多 5 次。
   - 每 10 秒探测 `127.0.0.1:9090`。探测成功会清掉异常条。
2. **睡眠唤醒探测**：
   - `powerMonitor` 的 `resume` 事件会再做一次控制端口健康检查。健康检查失败时，只结束本进程自己启动的内核，并走上面的异常提示。服务托管的内核不会被这个检查杀掉。
3. **退出与未捕获异常时还原系统代理**：
   - `before-quit`、`will-quit`、`exit`、`SIGINT`、`SIGTERM` 和 `uncaughtException` 会把系统代理和 PAC 恢复成打开之前的设置，并通知 Windows 重新读取，然后停止内核。没有备份时只把 `ProxyEnable` 写回 `0`。
   - 内核掉线但主程序仍在运行时，**不会**自动关掉系统代理。界面给出手动关闭代理或重启内核的操作。
4. **内存上限**：
   - 域名流量表超过 1500 条时保留流量最高的 800 条，节点累计超过 600 个时保留流量最高的 400 个，并写在 `data\traffic-stats.json`。连接结束后丢掉该连接的字节读数，已经累计的流量保留。界面只展示流量最高的 50 个主机。内核日志从 `app.log` 装回最近 2000 条。`app.log` 和 `service.log` 各自最多 4 个文件、每个 4MB，启动后每 10 分钟再清一次多余的旧文件。

---

## 🛠️ 技术架构

- **代理内核**：`mihomo` (Clash.Meta) Windows x64
- **桌面应用**：`Electron 33` + `electron-vite`
- **前端界面**：`React 18` + `TypeScript` + `Tailwind CSS` + `lucide-react` + `@dnd-kit`。界面状态放在 `App.tsx`，经 preload IPC 交给主进程；`zustand` 在依赖里，当前页面没有使用。
- **构建测试**：`Node.js test runner`。`test/src-modules.test.mjs` 直接 import `src/main`。`test/unit-test.mjs` 仍有一份平行实现。打包用 `electron-builder`
- **界面分页**：控制面板、节点中心、流量统计、路由分流、规则库、DNS 策略、内核日志、系统服务与工具、应用设置。系统代理和 TUN 只在控制面板。广告域名在路由规则里，RULE-SET 载荷是 `anti-ad`，默认关闭。各页到内核的链路见 [ARCHITECTURE.md 第 6 节](./ARCHITECTURE.md#6-模块链路)。

---

## 🚀 快速开始

### 运行环境准备
- Windows 10 / 11 64位操作系统（或 WSL2 环境下协同开发）
- Node.js >= 20.x，pnpm >= 9.x
- 内核文件名是 `resources/binaries/mihomo.exe`。`pnpm build:win` 会先跑 `scripts/prepare-binaries.mjs`，缺文件时下载 mihomo `v1.19.32`（可用环境变量 `MIHOMO_VERSION` 覆盖），并准备 `geoip.dat`、`geosite.dat`、`country.mmdb` 和 `anti-ad.yaml`。发布 CI 强制重新下载这些文件，并在 `anti-ad.yaml` 缺失或小于 100KB 时失败。安装包内置这份名单，首次启动再拷到安装目录的 `data\`。
- TUN 偏好保存在 `user-settings.json`。`DraftOneService` 正在运行时才会把 `tun.enable: true` 写进正在使用的 `config.yaml`。仓库不单独提交 `wintun.dll`；`prepare-binaries.mjs` 也只复制内核 exe，并在旁边写下 `mihomo.sha256`。若当前 mihomo 构建没有内嵌 Wintun，需要自行把 x64 `wintun.dll` 放到 `resources/binaries/`。

### 本地开发与调试
```bash
# 1. 安装依赖
pnpm install

# 2. 运行自动化全套类型检查与单元测试
pnpm test

# 3. 启动开发服务器并拉起桌面窗口
pnpm dev
```

### 从 Linux / WSL 环境直接一键调度 Windows
针对 WSL 开发者提供了自动化免切环境脚本：
```bash
./scripts/install.sh   # 在 Windows 宿主环境执行 pnpm install
./scripts/test.sh      # 自动化执行类型检查与单元测试
./scripts/dev.sh       # 启动开发服务器并在 Windows 桌面弹出原生窗口
./scripts/build.sh     # 生产打包构建
```

### 构建与打包
```bash
# NSIS 安装包 + x64 zip。会先准备内核与规则库文件。
pnpm build:win

# 同上，并额外打增量更新包
pnpm build:release
```
输出目录位于 `dist/`。本地 `pnpm run build:pack` 打全量加增量。升级时会按进程名结束本机的 `mihomo`。

### 发布
Git 标签去掉 `v` 之后必须等于 `package.json` 的 `version`。

- 开发版标签带 `-dev`，例如 `v1.0.23-dev.1`。CI 标成预发布，附件是 `draft-one-Setup-<版本>-Update.exe` 和 `draft-one-Windows-<版本>-Update-x64.zip`。
- 正式版标签不带 `-dev`，例如 `v1.0.23`。CI 另外附上 `draft-one-Setup-<版本>.exe` 和 `draft-one-Windows-<版本>-x64.zip`。

配置和日志写在程序目录的 `data\`。缓存和 TEMP 仍用系统常规位置。关闭窗口只会隐藏到托盘，退出时才停内核。

---

## 📄 开源许可

本项目基于 [MIT License](./LICENSE) 开源。

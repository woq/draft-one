# draft-one 架构设计与技术方案规范

本文描述当前代码的实际结构与行为。产品介绍见 [README.md](./README.md)。

## 1. 项目定位

**draft-one** 是面向 Windows 的代理客户端：

- 以真实节点为主视图，而不是多层 Clash 策略组树。多个订阅聚合成一个 `PROXY` select 组，当前选中节点排在组内第一位。
- 路由按 mihomo `rules` 数组自上而下匹配，首条命中即生效。编辑器支持拖拽排序。
- 默认单个 Mixed 端口（`7890`）同时接受 HTTP 与 SOCKS5。TUN 作为可选配置写入同一份 `config.yaml`。
- 开机内核走 Windows 服务。托盘由服务在用户登录后的桌面里启动，或由 `HKCU` 登录项备份。可选的计划任务只使用交互式、当前用户权限。

## 2. 技术选型

### 2.1 内核：`mihomo`

| 评估维度 | sing-box | xray-core | mihomo (Clash.Meta) |
| :--- | :--- | :--- | :--- |
| API 与热重载 | gRPC/REST | 统计用 gRPC，改配置通常要重启进程 | 本项目使用 `PUT /configs?force=true` 按文件路径热加载 |
| TUN | 内置 | 不内置 TUN | 配置里直接写 `tun` 段 |
| Mixed 代理 | 支持 | 通常要分开配 HTTP 与 SOCKS 端口 | `mixed-port` |
| 规则 | 版本间变更较多 | 稳定，高级规则较少 | `DOMAIN-*` / `GEOSITE` / `GEOIP` / `PROCESS-NAME` / `MATCH` |

内核文件固定为 `resources/binaries/mihomo.exe`。开发与打包前由 `scripts/prepare-binaries.mjs` 准备，默认版本 `v1.19.32`（环境变量 `MIHOMO_VERSION` 可覆盖）。同一脚本下载 `anti-ad.yaml` 到 `resources/binaries/`。压缩包里如果有 `wintun.dll`，会一起放到 `resources/binaries/`。主进程只结束自己启动的内核 PID。发布工作流用 `FORCE_DOWNLOAD=true` 跑这个脚本，并在打包前检查 `anti-ad.yaml` 存在且不小于 100KB。这些文件经 `extraResources` 打进安装包的 `binaries/`，不提交进 git。

控制面：

- 地址 `127.0.0.1:9090`
- `secret` 写在安装目录 `data\controller-secret`。已有 `config.yaml` 里的密钥会先被沿用，避免和正在跑的服务内核不匹配
- 热加载失败时，主进程只重启自己启动的那份内核。服务托管时不另起进程

生成配置的固定项（`src/main/config-generator.ts`）：

```yaml
port: 0
socks-port: 0
mixed-port: 7890          # 来自设置，默认 7890
allow-lan: false
mode: rule
log-level: info
ipv6: false
external-controller: 127.0.0.1:9090
secret: <data/controller-secret>
geodata-mode: true
geo-auto-update: false    # 规则库由应用自己下载，不交给内核自动更新
```

TUN 开关打开时同一文件包含：

```yaml
tun:
  enable: true
  stack: mixed
  device: DraftOneTun
  auto-route: true
  auto-detect-interface: true
  dns-hijack:
    - tcp://any:53
    - udp://any:53
  strict-route: true
```

仓库不提交 `wintun.dll`，准备脚本也只抽出 zip 里的 exe。内核构建若未内嵌 Wintun，需把 x64 `wintun.dll` 放进 `resources/binaries/`。

### 2.2 外壳

- Electron 33 + electron-vite
- React 18 + TypeScript + Tailwind CSS + lucide-react + `@dnd-kit/sortable`
- 包管理器 pnpm
- 渲染进程没有 `shadcn/ui` 组件目录。`zustand` 在 `package.json` 中，页面未引用。配置状态在 `App.tsx`，持久化走 IPC。
- 代码放在 `/mnt/d/code/draft-one`（即 `D:\code\draft-one`）。安装、`pnpm dev` 和 `pnpm build:win` 在 Windows 宿主执行。WSL 用 `scripts/*.sh`，它们转到 `win.sh`。

环境：Windows 10/11 x64，Node.js 20 及以上，pnpm 9 及以上。

## 3. 运行时行为

### 3.1 进程与窗口

- `app.requestSingleInstanceLock()`。第二实例只把已有窗口拉到前台。
- 关闭窗口调用 `hide()`，进程留在托盘。真正退出走 `before-quit`。
- 启动参数含 `--silent` 时不 `show()` 主窗口。托盘始终创建。
- 可执行文件在安装目录。配置、订阅、规则库和日志在旁边的 `data\`。打包后是 `draft-one.exe` 旁边的 `data\`，开发时是项目目录的 `data\`。HTTP 缓存、GPU 缓存、着色器缓存、崩溃转储和 TEMP 仍用 Electron 与 Windows 的常规位置。
- 持久化文件：
  - `user-settings.json`：应用配置（订阅、节点、规则、DNS、端口、开关）
  - `window-state.json`：窗口位置和大小
  - `controller-secret`：控制面密钥
  - `config.yaml`：交给 mihomo 的生成结果
  - `subscriptions/<subId>.json`：每个订阅的节点列表
  - `geoip.dat`、`geosite.dat`、`country.mmdb`、`providers\anti-ad.yaml`
  - `logs\app.log`、`logs\service.log`
  - `traffic-stats.json`：节点、主机和总流量累计
  - `system-proxy-backup.json`：打开系统代理前的注册表值

### 3.2 配置热加载

保存配置时主进程重写 `config.yaml`，然后：

```http
PUT http://127.0.0.1:9090/configs?force=true
Authorization: Bearer <controller-secret>
Content-Type: application/json

{"path": "<data>\\config.yaml"}
```

### 3.3 路由编辑器

规则类型：`GEOSITE`、`GEOIP`、`DOMAIN-SUFFIX`、`DOMAIN-KEYWORD`、`IP-CIDR`、`PROCESS-NAME`、`MATCH`。

载荷按 `,`、`;` 或换行拆开，每段生成一条 `TYPE,payload,target`。`MATCH` 不拆载荷。`enabled === false` 的规则跳过。结果里若没有 `MATCH,` 开头的行，生成器补上 `MATCH,PROXY`。

目标可以是 `DIRECT`、`REJECT`、`PROXY` 或某个节点名。规则类型还包括 `RULE-SET`。路由页分成三块，匹配顺序是自定义规则、广告拦截、直连，最后是 `MATCH`。默认没有手写局域网网段。广告块是关闭的 `anti-ad` 和 `geosite:category-ads-all`。直连块是 `direct-lan`、Windows NCSI、`direct-game`、`direct-wechat`、`direct-china`、`geosite:cn` 和 `GEOIP,CN`。四条直连规则集来自 blackmatrix7，行为是 `classical`、格式 `text`，内核用 `DIRECT` 每 86400 秒更新。旧配置缺少这四条时会补上，已经存在的开关保持原样。id 为 `rule-lan` 的旧网段会在读取时去掉。anti-AD 只跟这条路由规则走。启用的 `RULE-SET` 才写出对应的 `rule-providers`。旧配置里 DNS 的 `enableAntiAd: true` 会在读取时变成这条规则并打开。

排序使用 `@dnd-kit/sortable`。载荷文本停顿 400ms 后才保存并热重载。添加、删除、拖拽、开关、改类型和改目标会立刻保存。空载荷在生成时被丢掉。

### 3.4 订阅与分享链接

- 订阅请求头 `User-Agent: Clash.Meta; mihomo; ClashVerge/1.7.0`，超时 15 秒。先走 Mixed 代理，失败再直连（`NetClient`）。
- 响应头 `subscription-userinfo` 解析 `upload`、`download`、`total`、`expire`。
- 正文优先按 Clash YAML 的 `proxies` 数组读取，并保留每条的 `raw`。
- 不是 Clash YAML 时交给 `LinkParser`。支持 `vmess://`、`vless://`、`ss://`（含 SIP002）、`trojan://`、`hysteria2://`、`hy2://`，以及整段 Base64。这样节点带有可写入 mihomo 的 `raw`。手动导入走同一解析器。
- `aggregateNodes` 只合并 `enabled` 的订阅。节点名冲突时改成 `[订阅名] 原名`。
- 手动节点存在 `manualNodes`，聚合时放在订阅节点前面。
- 设置里的 `autoUpdateSub` / `autoUpdateGeo` 会写入 `user-settings.json`。主进程没有读取它们的定时器，更新仍是节点中心和规则库页面上的手动操作。

只有带 `raw` 的节点会进入生成配置的 `proxies`。`DIRECT` / `REJECT` 不作为代理条目写出，只出现在 `PROXY` 组的列表里。

### 3.5 DNS

DNS 页写入 `config.yaml` 的 `dns` 段。缺省为：

- `enhanced-mode: fake-ip`，`fake-ip-range: 198.18.0.1/16`，监听 `127.0.0.1:1053`
- 直连解析：`system`、`223.5.5.5`、`119.29.29.29`
- 代理解析：`8.8.8.8#PROXY`、`1.1.1.1#PROXY`、`https://8.8.8.8/dns-query#PROXY`
- `nameserver-policy`：`geosite:cn` 走直连 DNS，`geosite:gfw,geolocation-!cn` 走代理 DNS
- `fallback-filter.geoip-code: CN`
- DNS 页只保留模式、端口和三个开关。直连 DNS、代理 DNS、Fake-IP 过滤各自是一块 JSON 数组，点保存才写入。anti-AD 不在这一页。

### 3.6 规则库

`GeoDataManager` 管理 `geoip.dat`、`geosite.dat`、`country.mmdb`、`providers/anti-ad.yaml`，以及四条直连名单 `providers/direct-lan.list`、`direct-game.list`、`direct-wechat.list`、`direct-china.list`。前三个地理文件在首次启动时从安装资源拷到用户数据目录。`anti-ad.yaml` 由打包脚本内置；用户目录里还没有这份文件时，界面和服务都会从安装目录的 `binaries/anti-ad.yaml` 拷到 `providers/anti-ad.yaml`，已有文件不覆盖。规则库页面和路由页的「更新规则库」先把地理库和 anti-AD 下载到内存，每个文件失败会再试一次；地理库就绪后才替换正在使用的文件。四条直连名单同时下载，某一条失败只保留该条的旧文件。下载中途失败不会留下半截地理库。替换后对已加载的 `anti-ad` 和四条直连规则集请求 `PUT /providers/rules/<名称>`。生成配置里的 `geox-url` 指向同一镜像，同时 `geo-auto-update: false`。规则库只负责下载和展示文件状态。

### 3.7 流量与日志

- `TrafficManager` 轮询 `GET /connections`。连接上的 upload/download 是累计值，按连接 ID 记下一次读数，只把增量加到节点和主机。连接结束后丢掉该 ID 的读数，已经累计的流量保留。全局上下行按内核计数器的增量累加，并和节点、主机一起写入 `data\traffic-stats.json`。重启或升级后从这份文件继续累加。内核计数器变小视为内核已重启，旧累计保留，只加上新进程里的字节。界面上的「清空」才删除这份文件。返回全局上下行、速率、按节点的流量与连接数，以及按流量排序的前 50 个主机。流量页把 `DIRECT` 算国内直连，其余非 `REJECT` 节点算海外代理。
- 主机表超过 1500 条时只留流量最高的 800 条。节点累计超过 600 个时只留流量最高的 400 个。裁完写回 `traffic-stats.json`。
- `LogManager` 启动时把 `data\logs\app.log` 末尾装回内存，最多 2000 条，分类为 routing、dns、system、error。新日志再追加到这个文件。界面上的「清空」会清空缓冲并截断 `app.log`。`app.log` 和 `service.log` 各自最多 4 个文件（当前文件加 `.1` `.2` `.3`），每个不超过 4MB，一份日志合计不超过 16MB。写入越过 4MB 时把当前文件滚成 `.1`。启动时，以及界面之后每 10 分钟，删掉序号大于等于 4 的旧文件，并把已经超过 4MB 的文件裁成末尾 4MB。服务在启动和继续写入时对 `service.log` 做同样的事。重连间隔为固定的 2 秒或 3 秒，不是退避序列。

### 3.8 内核守护

`CoreProcessManager`：

1. 界面启动时先探测 `127.0.0.1:9090`。控制端口已在监听就接管，并把当前 `config.yaml` 热重载进去，不另起 `mihomo`，也不等待端口而卡住开窗。
2. 服务在跑但端口还没开时，界面继续启动，后台再等几秒。等到就接管。服务托管期间热重载失败也不会再 `spawn` 一份内核。
3. 只有确认没有可接管的内核时才启动自己的子进程。子进程因端口占用退出时，再探测一次控制端口：能连上就改为接管；连不上就停止重试，并弹出确认框。能从 `netstat` 认出监听进程时，确认后只结束那个 PID，然后重新启动本程序的内核。服务正在运行且占用者是 `mihomo.exe` 时不结束它。其他非手动退出仍是 **1 秒后重启 1 次**。
4. 每 10 秒 `healthCheck` 访问控制端口。成功则通知界面恢复。失败则杀掉无响应进程并报异常。
5. `powerMonitor` 的 `resume` 只再调用一次 `healthCheck`。

内核异常且主程序还活着时，不改系统代理。界面提供「关闭系统代理」和「重启内核」。系统服务页的「结束全部 mihomo」在用户确认后按进程名结束 `mihomo.exe`，并关闭系统代理。自动重启和健康检查仍然只结束本程序记下的 PID。端口冲突确认框只结束当时仍在监听的那个 PID。系统通知每种异常只弹一次，直到健康检查恢复。

系统代理改之前，把 `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings` 的 `ProxyEnable`、`ProxyServer`、`ProxyOverride`、`AutoConfigURL` 记到 `data\system-proxy-backup.json`。打开时写入 `127.0.0.1:<mixedPort>`，删掉 `AutoConfigURL`，再通知 WinINet。退出、关闭和 Winsock 重置按这份备份写回。没有备份时只把 `ProxyEnable` 置 0。当前值已经是本程序的代理时，备份记为关闭。内核未运行时拒绝打开系统代理。`before-quit`、`will-quit`、`exit`、`SIGINT`、`SIGTERM`、`uncaughtException` 会按上述方式恢复并停止内核。

### 3.9 启动方式

安装包是全体用户模式，要求管理员权限，默认装到 `C:\Program Files\draft-one`。安装程序注册 `DraftOneService`。不提供安装到 `%LOCALAPPDATA%\Programs` 的单用户模式。可执行文件留在安装目录，`mihomo.exe` 和服务程序在 `resources\binaries`。配置、订阅、地理库、anti-AD、密钥和日志写在安装目录的 `data\`。HTTP 缓存、GPU 缓存、着色器缓存、崩溃转储和 TEMP 仍走系统和 Electron 的常规目录，不改这些路径。安装程序给 Users 组 `data\` 的修改权限。卸载时删掉 `data\`、登录项、计划任务、服务，以及名为 `DraftOne_App` 和 `DraftOne_Core` 的防火墙规则，并让安装器清掉旧版本留在 `%APPDATA%` 的目录。登录项和系统代理仍是 Windows 注册表项，不是程序自己的文件。

1. **服务** `DraftOneService` 是开机路径。它在 Session 0 只启动与 `DraftOneService.exe` 同目录的 `mihomo.exe`，不创建托盘。同目录的 `mihomo.sha256` 与文件不符时拒绝启动；文件不存在时记一条警告并继续。内核异常退出按 1 秒、2 秒、4 秒退避，最多 5 次，稳定运行约 15 秒后计数清零。查询服务状态不改 `binPath`。用户登录时 `OnSessionChange(SessionLogon)` 用该用户的令牌在 `winsta0\default` 启动 `draft-one.exe --silent`。服务只结束自己拉起的内核进程。
2. **HKCU Run** 仍写入 `"draft-one.exe" --silent`，作为交互式桌面上的托盘备份。安装器不再删掉 `DraftOne_AutoStart`。没有“仅在用户登录时运行”的旧最高权限任务仍由界面启动后删掉，那种任务进不了通知区域。
3. 系统服务页仍可手动注册同名计划任务。它不是默认安装项。任务定义是 Windows 10（XML 版本 1.4）：当前用户的登录触发器、`InteractiveToken`、`HighestAvailable`，并取消“仅在使用交流电源时才启动”。页面上的「打开任务计划程序」打开 `taskschd.msc`。启动时只删除「最高权限且不是交互式登录」的旧任务。安装器升级和轻量升级都不删掉这条任务，也不删除 `data\`。卸载才删除。

系统工具页还调用：`ipconfig /flushdns`、Winsock 重置（先恢复系统代理，完成后需要重启计算机）、入站防火墙规则 `DraftOne_App` 与 `DraftOne_Core`、只清理名为 `DraftOneTun` 的网卡、为 Microsoft Store 应用写入回环豁免。

## 4. 目录

```
draft-one/
├── resources/
│   ├── binaries/                 # mihomo.exe、mihomo.sha256、规则库、DraftOneService.cs/.exe
│   ├── windows/                  # 通知 WinINet、UWP 回环、提权、清理 DraftOneTun
│   ├── icon.ico / icon.png
│   └── installer.nsh
├── scripts/                      # prepare-binaries、增量包、WSL 转发到 win.sh
├── src/
│   ├── main/                     # 生命周期、托盘、内核、订阅、路由生成、代理、服务、流量、日志
│   ├── preload/index.ts          # window.api
│   └── renderer/src/
│       ├── App.tsx               # 分页与配置状态
│       ├── components/TitleBar.tsx
│       ├── pages/                # Dashboard Proxies Routing RuleProviders Dns Traffic Logs SystemService Settings
│       └── types/index.ts
├── test/unit-test.mjs            # 独立复刻解析与 YAML 生成，不 import src
├── test/windows-hardening.test.mjs
├── electron.vite.config.ts
├── electron-builder.yml          # NSIS + zip；extraResources 打包 binaries、图标和 windows/*.ps1
└── package.json
```

`pnpm build:win` = 准备二进制 + `electron-vite build` + `electron-builder --win --x64`。`pnpm build:release` 再跑 `scripts/build-incremental.mjs`。产物在 `dist/`。

## 5. 与界面文案、测试的已知差距

- `test/src-modules.test.mjs` 直接 import `src/main/config-generator.ts` 和 `link-parser.ts`。`test/windows-hardening.test.mjs` 直接 import 代理备份、服务哈希和端口解析。`test/unit-test.mjs` 里仍有一份平行实现，不能当作生成配置的证明。
- 设置页两个自动更新开关只保存布尔值，没有 24 小时或每周任务。
- 发布工作流里的 `pnpm test` 步骤仍被注释。本地和文档要求的检查是 `pnpm test`。

## 6. 模块链路

配置类修改的公共后半段是 `window.api.saveConfig` → `app:save-config`：写入 `user-settings.json`，`generateMihomoConfig` 重写 `config.yaml`，再 `PUT /configs?force=true`。下面只写各模块到这一步之前的差异。同一时刻只挂载当前侧栏页，所以各页自己的 2 秒轮询不会叠在一起。

### 6.1 控制面板

系统代理：开关 → `setSystemProxy` → `sys:set-proxy`。内核未运行时拒绝打开。打开前备份四项注册表值，写入代理并删掉 PAC，再通知 WinINet。关闭和退出按备份恢复。

TUN：开关写入 `user-settings.json`。`DraftOneService` 正在运行时，生成配置的 `tun.enable` 才为 true。服务未运行时偏好保留，正在使用的配置里 TUN 保持关闭。安装或启动服务前按服务已运行来写配置。

当前节点测速：按钮 → `testNodeDelay` → `node:test-delay` → `CoreProcessManager.testNodeDelay`。`DIRECT` 由本进程请求 `generate_204`。其他节点请求 `GET /proxies/<名称>/delay`，依次试 Cloudflare、gstatic、Google。失败返回 `-1`。结果写入 `user-settings.json` 的 `nodeDelays`，按节点名记住延迟和时间。

开机状态：`getAutoStartStatus` → `sys:get-autostart`，汇总注册表登录项、计划任务是否存在、服务是否在跑。界面把已存在的任务显示为交互式登录任务，它同时勾选最高权限。

### 6.2 节点中心

选中节点：`selectNode` → `node:select`。先把 `activeNode` 写入配置，再 `PUT /proxies/PROXY` 立刻切换，不等下一次整文件重载。

单节点测速与控制面板同一条 `node:test-delay`。全部测速是 `testAllNodes` → `node:test-all`，按每批 5 个并发调用同一测速函数。测完把 `nodeDelays` 写入 `user-settings.json`，不热重载内核。节点列表可以按延迟排序。

添加订阅：`addSubscription` → `sub:add`。更新一个或全部：`sub:update` / `sub:update-all`，`NetClient` 先走本地混合端口，失败再直连。正文是 Clash YAML 就读 `proxies` 并保留 `raw`；否则 `LinkParser` 解析分享链接。

手动导入和剪贴板：`importShareLinks` → `sub:import-links` → `LinkParser`。只有带 `raw` 的节点进入生成配置。

### 6.3 流量统计

流量页每 2 秒，控制面板每 2 秒，节点中心每 3 秒，各自在页面打开时调用 `getTrafficSummary` → `traffic:get-summary` → `GET /connections`。连接字节是累计值，主进程按连接 ID 只累加增量，所以域名和目标 IP 会跟着刷新。累计写入 `data\traffic-stats.json`。手动检查走同一个 IPC。`resetTrafficStats` → `traffic:reset` 清空节点、主机、总流量和这份文件。`DIRECT` 归国内直连，其余非 `REJECT` 归海外代理。

### 6.4 添加分流规则

路由页「添加分流规则」在第一条 `MATCH` 之前插入一条启用的 `DOMAIN-SUFFIX`，目标 `PROXY`，载荷为空，并立刻 `saveConfig`。

改载荷只改本地输入，停止输入 400ms 后才 `saveConfig`。拖拽排序、启用开关、删除、改类型、改目标、恢复默认、右上角保存都立刻 `saveConfig`。

生成器按列表顺序写出规则。用户列表非空时替换内置默认规则。没有 `MATCH` 时补 `MATCH,PROXY`。启用的 `RULE-SET` / `anti-ad` 写在它自己的位置，并带上 `rule-providers.anti-ad`。关闭或删掉这条规则就不会写。

路由页「更新规则库」不改路由表，链路与下一节相同。

### 6.5 规则库更新

打开规则库：`getGeoDataStatus` → `geo:get-status`，读用户目录里 `geoip.dat`、`geosite.dat`、`country.mmdb`、`providers/anti-ad.yaml` 和四条 `providers/direct-*.list` 的大小与修改时间。

「一键更新全部规则库」和路由页「更新规则库」都是 `updateGeoData` → `geo:update` → `GeoDataManager.updateRules`：

1. `NetClient` 下载 GeoIP、GeoSite、Country MMDB、anti-AD 和四条直连名单。
2. 文件先下载到内存。单个文件失败会再请求一次。GeoIP 或 GeoSite 最终失败时，磁盘上的旧文件保持不动。
3. 地理库和 anti-AD 下完后替换对应文件。四条直连名单各自成功才替换自己的文件。然后对 `anti-ad`、`direct-lan`、`direct-game`、`direct-wechat`、`direct-china` 请求 `PUT /providers/rules/<名称>`。内核还没加载该规则集时这一步跳过。

首次启动若用户目录没有这些文件，界面从安装目录 `binaries/` 复制。服务在拉起内核前，也会把同目录的 `anti-ad.yaml` 复制到该用户的 `providers/`。已有文件不覆盖。

### 6.6 DNS 与 anti-AD 开关

DNS 页的编辑先留在页面状态。只有「保存并应用 DNS」才把 `config.dns` 送进 `saveConfig`。「恢复推荐预设」只改页面状态，仍要点保存。刷新系统 DNS 是 `flushDns` → `util:flush-dns`，不改 mihomo 配置。

DNS 不控制 anti-AD。三个名单在保存时按 JSON 数组解析。

### 6.7 内核日志

`log:get-history` 读主进程缓冲。启动时缓冲从 `data\logs\app.log` 末尾装入。页面另外每 2 秒拉一次历史，并听 `core:new-log`。内存和页面都只留最近 2000 条。清空是 `log:clear`，清掉缓冲并截断 `app.log`。`app.log` 与 `service.log` 各自最多 4 个文件、每个 4MB。启动和每 10 分钟会删掉多余分卷，并裁掉超长文件的前部。

### 6.8 系统服务与工具

服务安装、卸载、启动、停止：`service:install` / `service:uninstall` / `service:start` / `service:stop`。状态和日志：`service:get-status`、`service:get-logs`。

可选登录任务：`task:install` 用当前用户写出 Windows 10 任务 XML（版本 1.4），触发器是该用户登录，运行级别 `HighestAvailable`，登录类型 `InteractiveToken`，`DisallowStartIfOnBatteries` 和 `StopIfGoingOnBatteries` 都是 false。`task:uninstall` 删除它。`task:open-scheduler` 用系统关联打开 `taskschd.msc`。界面启动约 1.5 秒后 `retireNonInteractiveTask` 只删除「最高可用且不是交互令牌」的旧 `DraftOne_AutoStart`。

工具：`util:flush-dns`、`util:reset-winsock`（先恢复系统代理，再 `netsh winsock reset`，提示重启）、`util:fix-firewall`（入站规则 `DraftOne_App`、`DraftOne_Core`）、`util:fix-wintun`（只处理名为 `DraftOneTun` 的网卡）、`util:allow-uwp-loopback`。端口冲突确认是 `core:resolve-port-conflict`。

### 6.9 应用设置

开机自启：`setAutoStart` → `sys:set-autostart`，写 `HKCU\...\Run` 的 `--silent`。这是托盘备份，不是服务本身。

混合端口输入停顿 400ms 后 `saveConfig`。订阅自动更新和规则库自动更新只把布尔值写入配置，没有定时器读取。系统代理和 TUN 不在这一页。

### 6.10 发布 CI

`v*` 标签或手动运行 `.github/workflows/release.yml`：

1. `pnpm install --draft-one-lockfile`。
2. `node scripts/prepare-binaries.mjs`，`FORCE_DOWNLOAD=true`，`MIHOMO_VERSION=v1.19.32`。下载内核、在 Windows 上编译服务、下载三个地理库和 `anti-ad.yaml`。anti-AD 下载失败或小于 100KB 时这一步失败。
3. 再检查 `resources/binaries/anti-ad.yaml` 存在且不小于 100KB。
4. 标签必须和 `package.json` 的 `version` 一致，前面加 `v`。带 `-dev` 的标签（例如 `v1.0.23-dev.1`）是开发版，只打增量包，GitHub Release 标成预发布。不带 `-dev` 的正式标签打全量加增量。
5. 开发版执行 `pnpm run build`、`electron-builder --win --x64 --dir` 和 `scripts/build-incremental.mjs`。正式版执行 `pnpm run build:pack`：`electron-builder` 把 `resources/binaries` 打进安装包的 `binaries/`，`nsis.differentialPackage` 保持 `false`，然后同样打增量包。
6. 增量包是 `draft-one-Windows-<版本>-Update-x64.zip` 和 `draft-one-Setup-<版本>-Update.exe`。包内是 `resources/app.asar`、`DraftOneService.exe` 和图标。升级程序按进程名结束 `draft-one` 和 `mihomo`，停掉服务，盖上这些文件后再启动。正式版另外附上 `draft-one-Setup-<版本>.exe` 和 `draft-one-Windows-<版本>-x64.zip`。
7. 发布说明只列文件名。正式版附件还有 blockmap 和 `latest.yml`。开发版只附两个增量文件。本地 `pnpm run build:pack` 仍会打全量加增量。

工作流里的 `pnpm test` 仍是注释。这些大文件不进 git。

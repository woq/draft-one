# 依赖二进制与规则库

`pnpm run prepare:binaries`（`pnpm build:win` 会先执行它）会补齐下面这些文件。已存在且未设置 `FORCE_DOWNLOAD=true` 时会跳过下载。

1. `mihomo.exe`：Windows x64 内核。默认版本 `v1.19.32`，可用环境变量 `MIHOMO_VERSION` 覆盖。发布包来自 MetaCubeX/mihomo 的 `mihomo-windows-amd64-compatible-*.zip`。同目录的 `mihomo.sha256` 由本脚本写下，安装系统服务时会按当时的文件再写一次。服务启动时，摘要不符就拒绝启动；文件不存在则记一条警告并继续。
2. `geoip.dat`、`geosite.dat`、`country.mmdb`：来自 MetaCubeX/meta-rules-dat。
3. `anti-ad.yaml`：来自 `https://anti-ad.net/clash.yaml`。打包进 `resources/binaries/`，首次启动拷到用户数据目录的 `providers/anti-ad.yaml`。已有文件不会被覆盖。发布流程在 `FORCE_DOWNLOAD=true` 时必须下到这份名单，文件小于 100KB 会让准备步骤失败。
4. `DraftOneService.cs` / `DraftOneService.exe`：Windows 服务。在 Windows 上若 exe 比源文件旧，会用 `csc.exe` 重编译。服务启动内核前，若用户目录还没有 `providers/anti-ad.yaml`，会从内核同目录复制内置名单。
5. `wintun.dll`：本脚本不下载。TUN 段由应用写入 mihomo 配置。若所用内核没有内嵌 Wintun，把 x64 `wintun.dll` 放在本目录。

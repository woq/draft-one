$ErrorActionPreference = 'Stop'
$adapter = Get-NetAdapter -Name 'DraftOneTun' -ErrorAction SilentlyContinue
if (-not $adapter) {
  Write-Output '没有名为 DraftOneTun 的适配器。'
  exit 0
}

Disable-NetAdapter -Name 'DraftOneTun' -Confirm:$false -ErrorAction SilentlyContinue
Remove-NetAdapter -Name 'DraftOneTun' -Confirm:$false
Write-Output '已移除 DraftOneTun。'
exit 0

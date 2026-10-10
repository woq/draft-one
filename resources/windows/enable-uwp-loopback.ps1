$ErrorActionPreference = 'Continue'
$tool = Join-Path $env:SystemRoot 'System32\CheckNetIsolation.exe'
if (-not (Test-Path -LiteralPath $tool)) {
  Write-Output 'CheckNetIsolation.exe 不存在。'
  exit 1
}

$packages = @(Get-AppxPackage)
$ok = 0
$fail = 0
foreach ($package in $packages) {
  $name = [string]$package.PackageFamilyName
  if ([string]::IsNullOrWhiteSpace($name)) { continue }
  & $tool 'LoopbackExempt' '-a' "-n=$name" | Out-Null
  if ($LASTEXITCODE -eq 0) { $ok++ } else { $fail++ }
}

Write-Output "已添加 $ok 个 Microsoft Store 应用的回环豁免，失败 $fail 个。"
if ($ok -eq 0 -and $fail -gt 0) { exit 1 }
exit 0

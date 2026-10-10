param(
  [Parameter(Mandatory = $true)]
  [string]$Script
)

if (-not (Test-Path -LiteralPath $Script)) {
  Write-Output '找不到要提权运行的脚本。'
  exit 2
}

try {
  $proc = Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Verb RunAs -Wait -PassThru -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $Script
  )
} catch {
  Write-Output $_.Exception.Message
  exit 1223
}

if ($null -eq $proc) { exit 1223 }
exit $proc.ExitCode

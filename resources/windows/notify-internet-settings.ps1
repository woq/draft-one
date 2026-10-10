$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class DraftOneWinInet {
  [DllImport("wininet.dll", SetLastError = true)]
  public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
}
"@
[void][DraftOneWinInet]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0)
[void][DraftOneWinInet]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0)

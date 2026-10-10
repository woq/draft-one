export interface LogonTaskInput {
  userId: string
  command: string
  arguments: string
}

export interface LogonTaskDetails {
  trigger: string
  userId: string
  logonType: string
  runLevel: string
  command: string
  interactive: boolean
  highest: boolean
  acOnly: boolean
  compatibility: string
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
}

function xmlTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'))
  return match ? decodeXml(match[1].trim()) : ''
}

/**
 * Task Scheduler shows version 1.2 as "Windows Vista, Windows Server 2008".
 * Version 1.4 is the Windows 10 task definition. schtasks /Create cannot set this.
 */
export function buildLogonTaskXml(input: LogonTaskInput): string {
  const user = escapeXml(input.userId.trim())
  const command = escapeXml(input.command)
  const args = escapeXml(input.arguments)
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>draft-one interactive logon tray</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>${user}</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${user}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>true</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <DisallowStartOnRemoteAppSession>false</DisallowStartOnRemoteAppSession>
    <UseUnifiedSchedulingEngine>true</UseUnifiedSchedulingEngine>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${command}</Command>
      <Arguments>${args}</Arguments>
    </Exec>
  </Actions>
</Task>
`
}

export function describeLogonTaskXml(xml: string): LogonTaskDetails {
  const version = /<Task\b[^>]*\bversion="([^"]+)"/i.exec(xml)?.[1] || ''
  const userId = xmlTag(xml, 'UserId')
  const logonType = xmlTag(xml, 'LogonType') || '未知'
  const runLevel = xmlTag(xml, 'RunLevel') || '未知'
  const command = [xmlTag(xml, 'Command'), xmlTag(xml, 'Arguments')].filter(Boolean).join(' ')
  const hasLogon = /<LogonTrigger\b/i.test(xml)
  const triggerEnabled = !/<LogonTrigger\b[^>]*>[\s\S]*?<Enabled>\s*false\s*<\/Enabled>/i.test(xml)
  const acOnly = xmlTag(xml, 'DisallowStartIfOnBatteries').toLowerCase() !== 'false'
  return {
    trigger: hasLogon && triggerEnabled ? `登录时${userId ? `（${userId}）` : ''}` : '未设置触发器',
    userId,
    logonType,
    runLevel,
    command,
    interactive: /Interactive/i.test(logonType),
    highest: /HighestAvailable/i.test(runLevel),
    acOnly,
    compatibility: taskCompatibility(version)
  }
}

function taskCompatibility(version: string): string {
  if (version === '1.4') return 'Windows 10'
  if (version === '1.3') return 'Windows 7'
  if (version === '1.2') return 'Windows Vista / Windows Server 2008'
  if (version) return `版本 ${version}`
  return '未知'
}

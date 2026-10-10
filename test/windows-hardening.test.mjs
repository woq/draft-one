import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import { generateMihomoConfig } from '../src/main/config-generator.ts'
import {
  backupForEnable,
  dwordFromReg,
  firewallDeleteArgs,
  firewallRuleArgs,
  parseRegQuery,
  regAddDwordArgs,
  regAddStringArgs,
  regDeleteValueArgs,
  scCreateArgs,
  snapshotIsOurs
} from '../src/main/system-proxy-state.ts'
import { formatHashFile, hashAccepts, hashFileHex, coreBesideService } from '../src/main/service-core.ts'
import { kernelDelta, parseTrafficSnapshot, pruneTrafficSnapshot, writeTrafficSnapshot, readTrafficSnapshot } from '../src/main/traffic-stats.ts'
import { parseAppLogLine, tailLines } from '../src/main/log-history.ts'
import { enforceLogRetention, rotateLogFile } from '../src/main/log-retention.ts'
import { killAllowed, parseNetstatListeners, parseTasklistImage } from '../src/main/port-listeners.ts'

const baseConfig = {
  mixedPort: 7890,
  tunEnabled: true,
  systemProxy: false,
  autoStart: false,
  silentStart: true,
  activeNode: '',
  autoUpdateSub: false,
  autoUpdateGeo: false,
  subscriptions: [],
  nodes: [],
  rules: []
}

test('TUN preference stays out of the running config until the service is up', () => {
  const held = YAML.parse(generateMihomoConfig(baseConfig, 'unit-test-secret-value', { applyTun: false }))
  assert.equal(held.tun.enable, false)
  assert.equal(held.tun.device, 'DraftOneTun')
  const applied = YAML.parse(generateMihomoConfig(baseConfig, 'unit-test-secret-value', { applyTun: true }))
  assert.equal(applied.tun.enable, true)
})

test('proxy backup keeps the previous PAC and global values', () => {
  const current = {
    proxyEnable: 1,
    proxyServer: '10.0.0.8:8080',
    proxyOverride: '<local>',
    autoConfigUrl: 'http://127.0.0.1/proxy.pac'
  }
  const backup = backupForEnable(current, 7890)
  assert.deepEqual(backup, current)
  assert.equal(snapshotIsOurs(current, 7890), false)
  const ours = backupForEnable(
    { proxyEnable: 1, proxyServer: '127.0.0.1:7890', proxyOverride: 'x', autoConfigUrl: null },
    7890
  )
  assert.equal(ours.proxyEnable, 0)
  assert.equal(ours.autoConfigUrl, null)
})

test('registry and firewall commands stay in argument arrays', () => {
  assert.deepEqual(regAddDwordArgs('ProxyEnable', 1).slice(0, 4), [
    'add',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
    '/v',
    'ProxyEnable'
  ])
  assert.ok(regAddStringArgs('ProxyServer', '127.0.0.1:7890').includes('/d'))
  assert.equal(regDeleteValueArgs('AutoConfigURL')[0], 'delete')
  assert.equal(parseRegQuery('    ProxyEnable    REG_DWORD    0x1')?.data, '0x1')
  assert.equal(dwordFromReg('0x1'), 1)
  const created = scCreateArgs('DraftOneService', 'C:\\Program Files\\draft-one\\DraftOneService.exe')
  assert.equal(created[0], 'create')
  assert.ok(created.includes('binPath='))
  assert.ok(created.includes('C:\\Program Files\\draft-one\\DraftOneService.exe'))
  const rule = firewallRuleArgs('DraftOne_Core', 'in', 'C:\\Program Files\\draft-one\\mihomo.exe')
  assert.equal(rule[0], 'advfirewall')
  assert.ok(rule.includes('dir=in'))
  assert.ok(rule.includes('program="C:\\Program Files\\draft-one\\mihomo.exe"'))
  assert.deepEqual(firewallDeleteArgs('DraftOne_Core').slice(0, 4), [
    'advfirewall',
    'firewall',
    'delete',
    'rule'
  ])
})

test('service core hash accepts only the sibling file digest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'draft-one-core-'))
  const exe = path.join(dir, 'mihomo.exe')
  fs.writeFileSync(exe, 'core-bytes')
  const hex = hashFileHex(exe)
  assert.equal(coreBesideService(path.join(dir, 'DraftOneService.exe')), exe)
  assert.equal(hashAccepts(formatHashFile(hex), hex), true)
  assert.equal(hashAccepts('deadbeef', hex), false)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('netstat listeners identify the pid and refuse system or self pids', () => {
  const text = [
    '  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       4',
    '  TCP    127.0.0.1:7890         0.0.0.0:0              LISTENING       4321',
    '  TCP    [::]:9090              [::]:0                 LISTENING       4321',
    '  UDP    0.0.0.0:7890           *:*                                    99'
  ].join('\n')
  assert.deepEqual(parseNetstatListeners(text, [7890, 9090]), [
    { port: 7890, pid: 4321 },
    { port: 9090, pid: 4321 }
  ])
  assert.equal(parseTasklistImage('"chrome.exe","4321","Console","1","20,000 K"'), 'chrome.exe')
  assert.equal(killAllowed(4, 100), false)
  assert.equal(killAllowed(100, 100), false)
  assert.equal(killAllowed(4321, 100), true)
})

test('traffic totals survive a kernel restart and a round trip', () => {
  assert.equal(kernelDelta(1000, 1250), 250)
  assert.equal(kernelDelta(1000, 30), 30)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'draft-one-traffic-'))
  const file = path.join(dir, 'traffic-stats.json')
  writeTrafficSnapshot(file, {
    totalUpload: 10,
    totalDownload: 20,
    kernelUpload: 10,
    kernelDownload: 20,
    nodeStats: { DIRECT: { upload: 1, download: 2, connections: 4 } },
    hostStats: {
      'example.com': { host: 'example.com', ip: '1.1.1.1', upload: 1, download: 2, rule: 'MATCH', lastSeen: 5 }
    }
  })
  const loaded = readTrafficSnapshot(file)
  assert.equal(loaded.writable, true)
  assert.equal(loaded.snapshot.totalDownload, 20)
  assert.equal(loaded.snapshot.nodeStats.DIRECT.connections, 0)
  assert.equal(loaded.snapshot.hostStats['example.com'].host, 'example.com')
  assert.equal(parseTrafficSnapshot('{'), null)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('app log history keeps the newest lines', () => {
  const parsed = parseAppLogLine('12:01:02.003 [info] [TCP] 127.0.0.1:1 --> a.com:443 match Match using PROXY')
  assert.equal(parsed?.type, 'info')
  assert.equal(parsed?.payload.includes('a.com'), true)
  assert.equal(parseAppLogLine('not a log'), null)
  assert.deepEqual(tailLines('a\n\nb\nc\n', 2), ['b', 'c'])
})

test('log files stay within four parts and the byte cap', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'draft-one-log-'))
  const active = path.join(dir, 'app.log')
  fs.writeFileSync(active, `keep-me\n${'x'.repeat(40)}`)
  fs.writeFileSync(`${active}.1`, 'archive')
  fs.writeFileSync(`${active}.4`, 'too-old')
  fs.writeFileSync(`${active}.12`, 'stray')
  enforceLogRetention(active, 16, 4)
  assert.equal(fs.existsSync(`${active}.4`), false)
  assert.equal(fs.existsSync(`${active}.12`), false)
  assert.equal(fs.existsSync(`${active}.1`), true)
  assert.ok(fs.statSync(active).size <= 16)
  assert.ok(fs.readFileSync(active, 'utf-8').includes('keep-me') === false)
  rotateLogFile(active, 4)
  assert.equal(fs.existsSync(active), false)
  assert.ok(fs.existsSync(`${active}.1`))
  fs.rmSync(dir, { recursive: true, force: true })
})

test('traffic history drops the smallest hosts and nodes', () => {
  const hostStats = {}
  for (let i = 0; i < 1501; i++) hostStats[`h${i}`] = { host: `h${i}`, ip: '', upload: i, download: 0, rule: '', lastSeen: 0 }
  const nodeStats = {}
  for (let i = 0; i < 601; i++) nodeStats[`n${i}`] = { upload: i, download: 0, connections: 0 }
  const snapshot = {
    totalUpload: 1,
    totalDownload: 1,
    kernelUpload: 1,
    kernelDownload: 1,
    nodeStats,
    hostStats
  }
  assert.equal(pruneTrafficSnapshot(snapshot), true)
  assert.equal(Object.keys(snapshot.hostStats).length, 800)
  assert.equal(snapshot.hostStats.h1500.host, 'h1500')
  assert.equal(snapshot.hostStats.h0, undefined)
  assert.equal(Object.keys(snapshot.nodeStats).length, 400)
  assert.equal(snapshot.nodeStats.n600.upload, 600)
  assert.equal(snapshot.nodeStats.n0, undefined)
})

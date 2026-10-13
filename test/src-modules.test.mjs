import assert from 'node:assert/strict'
import test from 'node:test'
import YAML from 'yaml'
import { generateMihomoConfig, insertMissingDirectRules, arrangeRuleSections } from '../src/main/config-generator.ts'
import { parseSchtasksCsv } from '../src/main/schtasks-csv.ts'
import { buildLogonTaskXml, describeLogonTaskXml } from '../src/main/logon-task-xml.ts'
import { LinkParser } from '../src/main/link-parser.ts'
import { resolvePreviewMode } from '../src/main/preview-mode.ts'

const baseConfig = {
  mixedPort: 7890,
  tunEnabled: false,
  systemProxy: false,
  autoStart: false,
  silentStart: true,
  activeNode: '',
  autoUpdateSub: false,
  autoUpdateGeo: false,
  subscriptions: [],
  nodes: [{ name: 'HK-01', type: 'ss', server: '1.2.3.4', port: 8388, raw: { name: 'HK-01', type: 'ss', server: '1.2.3.4', port: 8388 } }],
  rules: []
}

test('generateMihomoConfig writes the caller secret and info logs', () => {
  const parsed = YAML.parse(generateMihomoConfig(baseConfig, 'unit-test-secret-value'))
  assert.equal(parsed.secret, 'unit-test-secret-value')
  assert.equal(parsed['log-level'], 'info')
  assert.equal(parsed['allow-lan'], false)
  assert.equal(parsed['external-controller'], '127.0.0.1:9090')
  assert.equal(parsed.proxies[0].name, 'HK-01')
})

test('an enabled anti-ad routing rule writes the rule provider in list order', () => {
  const off = YAML.parse(generateMihomoConfig(baseConfig, 'unit-test-secret-value'))
  assert.equal(off['rule-providers']['anti-ad'], undefined)
  assert.equal(off.rules.some((rule) => String(rule).includes('anti-ad')), false)
  assert.equal(off['rule-providers']['direct-game'].behavior, 'classical')
  assert.equal(off['rule-providers']['direct-game'].format, 'text')
  assert.equal(off['rule-providers']['direct-game'].interval, 86400)
  assert.equal(off['rule-providers']['direct-game'].proxy, 'DIRECT')

  const on = YAML.parse(
    generateMihomoConfig(
      {
        ...baseConfig,
        rules: [
          { id: '1', type: 'DOMAIN-SUFFIX', payload: 'example.com', target: 'DIRECT', enabled: true },
          { id: '2', type: 'RULE-SET', payload: 'anti-ad', target: 'REJECT', enabled: true },
          { id: '3', type: 'GEOSITE', payload: 'cn', target: 'DIRECT', enabled: true },
          { id: '4', type: 'MATCH', payload: '', target: 'PROXY', enabled: true }
        ]
      },
      'unit-test-secret-value'
    )
  )
  assert.deepEqual(on.rules.slice(0, 4), [
    'DOMAIN-SUFFIX,example.com,DIRECT',
    'RULE-SET,anti-ad,REJECT',
    'GEOSITE,cn,DIRECT',
    'MATCH,PROXY'
  ])
  const provider = on['rule-providers']['anti-ad']
  assert.equal(provider.type, 'http')
  assert.equal(provider.behavior, 'domain')
  assert.equal(provider.format, 'yaml')
  assert.equal(provider.url, 'https://anti-ad.net/clash.yaml')
  assert.equal(provider.path, './providers/anti-ad.yaml')
  assert.equal(provider.interval, 86400)
  assert.equal(provider.proxy, 'DIRECT')

  const disabled = YAML.parse(
    generateMihomoConfig(
      {
        ...baseConfig,
        dns: { enableAntiAd: true },
        rules: [
          { id: '2', type: 'RULE-SET', payload: 'anti-ad', target: 'REJECT', enabled: false },
          { id: '4', type: 'MATCH', payload: '', target: 'PROXY', enabled: true }
        ]
      },
      'unit-test-secret-value'
    )
  )
  assert.equal(disabled['rule-providers'], undefined)
  assert.equal(disabled.rules.some((rule) => String(rule).includes('anti-ad')), false)
})

test('default rules emit the four direct rule sets before China geosite', () => {
  const parsed = YAML.parse(generateMihomoConfig(baseConfig, 'unit-test-secret-value'))
  const rules = parsed.rules.map(String)
  const game = rules.indexOf('RULE-SET,direct-game,DIRECT')
  const lan = rules.indexOf('RULE-SET,direct-lan,DIRECT')
  const wechat = rules.indexOf('RULE-SET,direct-wechat,DIRECT')
  const china = rules.indexOf('RULE-SET,direct-china,DIRECT')
  const geosite = rules.indexOf('GEOSITE,cn,DIRECT')
  const ads = rules.indexOf('GEOSITE,category-ads-all,REJECT')
  assert.ok(ads >= 0 && ads < lan && lan < game && game < wechat && wechat < china && china < geosite)
  assert.equal(rules.some((rule) => rule.startsWith('IP-CIDR,')), false)
  assert.equal(
    parsed['rule-providers']['direct-game'].url,
    'https://rawstatic.com/blackmatrix7/ios_rule_script/master/rule/Clash/Game/GameDownload/GameDownload.list'
  )
  assert.equal(
    parsed['rule-providers']['direct-lan'].url,
    'https://rawstatic.com/blackmatrix7/ios_rule_script/master/rule/Clash/Lan/Lan.list'
  )
  assert.equal(
    parsed['rule-providers']['direct-wechat'].url,
    'https://rawstatic.com/blackmatrix7/ios_rule_script/master/rule/Surge/WeChat/WeChat.list'
  )
  assert.equal(
    parsed['rule-providers']['direct-china'].url,
    'https://rawstatic.com/blackmatrix7/ios_rule_script/master/rule/Clash/China/China.list'
  )
  assert.equal(parsed['rule-providers']['direct-lan'].path, './providers/direct-lan.list')
})

test('insertMissingDirectRules keeps an existing disabled preset and fills the rest', () => {
  const rules = [
    { id: 'lan', type: 'IP-CIDR', payload: '192.168.0.0/16', target: 'DIRECT', enabled: true },
    { id: 'game', type: 'RULE-SET', payload: 'direct-game', target: 'DIRECT', enabled: false },
    { id: 'match', type: 'MATCH', payload: '', target: 'PROXY', enabled: true }
  ]
  assert.equal(insertMissingDirectRules(rules), true)
  assert.equal(rules.find((rule) => rule.payload === 'direct-game').enabled, false)
  assert.equal(insertMissingDirectRules(rules), false)
  const arranged = arrangeRuleSections([
    { id: 'rule-lan', type: 'IP-CIDR', payload: '10.0.0.0/8', target: 'DIRECT', enabled: true },
    ...rules,
    { id: 'ads', type: 'GEOSITE', payload: 'category-ads-all', target: 'REJECT', enabled: true }
  ])
  assert.equal(arranged.changed, true)
  assert.deepEqual(
    arranged.rules.map((rule) => rule.payload),
    ['192.168.0.0/16', 'category-ads-all', 'direct-lan', 'direct-game', 'direct-wechat', 'direct-china', '']
  )
})

test('logon task xml is a Windows 10 interactive highest-privilege logon task', () => {
  const xml = buildLogonTaskXml({
    userId: 'DESKTOP\\Ada & Bob',
    command: 'C:\\Program Files\\draft-one\\draft-one.exe',
    arguments: '--silent'
  })
  assert.match(xml, /<Task version="1\.4"/)
  assert.match(xml, /<LogonTrigger>/)
  assert.match(xml, /<UserId>DESKTOP\\Ada &amp; Bob<\/UserId>/)
  assert.match(xml, /<LogonType>InteractiveToken<\/LogonType>/)
  assert.match(xml, /<RunLevel>HighestAvailable<\/RunLevel>/)
  assert.match(xml, /<DisallowStartIfOnBatteries>false<\/DisallowStartIfOnBatteries>/)
  assert.match(xml, /<StopIfGoingOnBatteries>false<\/StopIfGoingOnBatteries>/)
  assert.match(xml, /<Command>C:\\Program Files\\draft-one\\draft-one.exe<\/Command>/)
  const described = describeLogonTaskXml(xml)
  assert.equal(described.trigger, '登录时（DESKTOP\\Ada & Bob）')
  assert.equal(described.highest, true)
  assert.equal(described.interactive, true)
  assert.equal(described.acOnly, false)
  assert.equal(described.compatibility, 'Windows 10')
  const vista = describeLogonTaskXml('<Task version="1.2"></Task>')
  assert.equal(vista.trigger, '未设置触发器')
  assert.equal(vista.compatibility, 'Windows Vista / Windows Server 2008')
  assert.equal(vista.acOnly, true)
})

test('parseSchtasksCsv keeps DraftOne task rows and quoted commas', () => {
  const rows = parseSchtasksCsv(
    '"TaskName","Next Run Time","Status"\n"\\DraftOne_AutoStart","N/A","Ready"\n"\\Other","N/A","Ready"\n'
  )
  assert.equal(rows.length, 2)
  assert.equal(rows[0].taskName, '\\DraftOne_AutoStart')
  assert.equal(rows[0].status, 'Ready')
})

test('LinkParser turns hy2 links into a hysteria2 outbound', () => {
  const nodes = LinkParser.parseLinks('hy2://pass@3.3.3.3:443#Node3', 'sub-1', '手动')
  assert.equal(nodes.length, 1)
  assert.equal(nodes[0].type, 'hysteria2')
  assert.equal(nodes[0].raw.type, 'hysteria2')
  assert.equal(nodes[0].raw.server, '3.3.3.3')
})

test('resolvePreviewMode defaults for unpack/dev and respects flags', () => {
  assert.equal(
    resolvePreviewMode({ argv: [], isPackaged: false, execPath: 'C:\\dev\\electron.exe' }),
    true
  )
  assert.equal(
    resolvePreviewMode({
      argv: [],
      isPackaged: true,
      execPath: 'D:\\Code\\draft-one\\dist\\win-unpacked\\draft-one.exe'
    }),
    true
  )
  assert.equal(
    resolvePreviewMode({
      argv: [],
      isPackaged: true,
      execPath: 'C:\\Program Files\\draft-one\\draft-one.exe'
    }),
    false
  )
  assert.equal(
    resolvePreviewMode({
      argv: ['--preview'],
      isPackaged: true,
      execPath: 'C:\\Program Files\\draft-one\\draft-one.exe'
    }),
    true
  )
  assert.equal(
    resolvePreviewMode({
      argv: ['--no-preview'],
      isPackaged: false,
      execPath: 'C:\\dev\\electron.exe'
    }),
    false
  )
})

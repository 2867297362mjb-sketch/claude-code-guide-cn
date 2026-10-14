<#
.SYNOPSIS
  Claude Code 第三方 API 一键配置（Windows PowerShell 5.1+ / PowerShell 7+）

.DESCRIPTION
  交互输入 Base URL、Key 和主模型，写入 %USERPROFILE%\.claude\settings.json 的 "env" 字段。

  安全约定：
    - settings.json 已存在时，先备份为 settings.json.bak.<时间戳>，再只合并 env 里的几个键；
      其它字段和 env 里的其它变量原样保留，不删除任何已有字段。
    - 优先用 node 合并（装 Claude Code 时一般已有），没有时用 Python 3；
      两者都没有时只打印需要手动添加的 JSON，不改任何文件。
    - Key 输入时不回显，不打印到屏幕，不出现在任何命令行参数里。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\setup.ps1

.NOTES
  本文件以 UTF-8 BOM 保存，Windows PowerShell 5.1 才能正确读取中文。
#>
[CmdletBinding()]
param()

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$DefaultBaseUrl   = 'https://api.teamorouter.com'
$DefaultModel     = 'claude-opus-5-5'
$OpusModel        = 'claude-opus-5-5'
$SonnetModel      = 'claude-sonnet-5-5'
$HaikuModel       = 'claude-haiku-4-5'
$MinNodeMajor     = 22
$MinClaudeVersion = [version]'2.1.284'

# Claude Code 在 Windows 上用 %USERPROFILE%；其它系统上的 pwsh 退回 $HOME
$UserHome    = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
$ClaudeDir    = Join-Path $UserHome '.claude'
$SettingsFile = Join-Path $ClaudeDir 'settings.json'

$AnthropicVars = @(
  'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL'
)

function Write-Note([string]$Message) { Write-Host "[注意] $Message" -ForegroundColor Yellow }
function Stop-Setup([string]$Message, [int]$Code = 1) {
  Write-Host "[错误] $Message" -ForegroundColor Red
  exit $Code
}

# ---------------------------------------------------------------------------
# 合并脚本：从环境变量 CC_SETUP_* 读取要写入的值，参数是 settings.json 路径。
# 只输出机器可读的状态行；退出码 3=不是合法 JSON，4=顶层不是对象，
# 5=env 不是对象，6=读写失败。setup.sh 里有同一份代码。
# ---------------------------------------------------------------------------
$JsMerge = @'
const fs = require("fs");
const path = require("path");

const MAPPING = [
  ["ANTHROPIC_BASE_URL", "CC_SETUP_BASE_URL"],
  ["ANTHROPIC_AUTH_TOKEN", "CC_SETUP_TOKEN"],
  ["ANTHROPIC_MODEL", "CC_SETUP_MODEL"],
  ["ANTHROPIC_DEFAULT_OPUS_MODEL", "CC_SETUP_OPUS"],
  ["ANTHROPIC_DEFAULT_SONNET_MODEL", "CC_SETUP_SONNET"],
  ["ANTHROPIC_DEFAULT_HAIKU_MODEL", "CC_SETUP_HAIKU"],
];

function fail(code, msg) {
  process.stderr.write(String(msg).replace(/[^\x20-\x7e]/g, "?") + "\n");
  process.exit(code);
}

const file = process.argv[process.argv.length - 1];
let target = file;
try { target = fs.realpathSync(file); } catch (e) { /* 文件还不存在 */ }

let data = {};
if (fs.existsSync(target)) {
  let raw = "";
  try { raw = fs.readFileSync(target, "utf8"); } catch (e) { fail(6, "io_error: " + e.message); }
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  if (raw.trim() !== "") {
    try { data = JSON.parse(raw); } catch (e) { fail(3, "invalid_json: " + e.message); }
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) fail(4, "top_level_not_object");
}

if (!Object.prototype.hasOwnProperty.call(data, "env")) data.env = {};
const env = data.env;
if (env === null || typeof env !== "object" || Array.isArray(env)) fail(5, "env_not_object");

for (const [key, name] of MAPPING) {
  const value = process.env[name];
  if (value) env[key] = value;
}

const text = JSON.stringify(data, null, 2) + "\n";
const tmp = path.join(path.dirname(target), ".settings.json." + process.pid + ".tmp");
try {
  fs.writeFileSync(tmp, text, { encoding: "utf8", mode: 0o600 });
  try {
    fs.renameSync(tmp, target);
  } catch (e) {
    fs.writeFileSync(target, text, { encoding: "utf8" });
    fs.unlinkSync(tmp);
  }
  try { fs.chmodSync(target, 0o600); } catch (e) { /* Windows 上忽略 */ }
} catch (e) {
  try { fs.unlinkSync(tmp); } catch (e2) { /* 忽略 */ }
  fail(6, "io_error: " + e.message);
}

if (Object.prototype.hasOwnProperty.call(env, "ANTHROPIC_API_KEY")) console.log("warn:api_key_in_settings");
console.log("ok");
'@

$PyMerge = @'
import json
import os
import sys
import tempfile

MAPPING = [
    ("ANTHROPIC_BASE_URL", "CC_SETUP_BASE_URL"),
    ("ANTHROPIC_AUTH_TOKEN", "CC_SETUP_TOKEN"),
    ("ANTHROPIC_MODEL", "CC_SETUP_MODEL"),
    ("ANTHROPIC_DEFAULT_OPUS_MODEL", "CC_SETUP_OPUS"),
    ("ANTHROPIC_DEFAULT_SONNET_MODEL", "CC_SETUP_SONNET"),
    ("ANTHROPIC_DEFAULT_HAIKU_MODEL", "CC_SETUP_HAIKU"),
]


def fail(code, msg):
    sys.stderr.write(msg.encode("ascii", "backslashreplace").decode("ascii") + "\n")
    sys.exit(code)


target = os.path.realpath(sys.argv[-1])
data = {}
if os.path.exists(target):
    try:
        with open(target, "r", encoding="utf-8-sig") as f:
            raw = f.read()
    except (OSError, UnicodeDecodeError) as e:
        fail(6, "io_error: %s" % e)
    if raw.strip():
        try:
            data = json.loads(raw)
        except ValueError as e:
            fail(3, "invalid_json: %s" % e)
    if not isinstance(data, dict):
        fail(4, "top_level_not_object")

if "env" not in data:
    data["env"] = {}
env = data["env"]
if not isinstance(env, dict):
    fail(5, "env_not_object")

for key, name in MAPPING:
    value = os.environ.get(name, "")
    if value:
        env[key] = value

text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
tmp = None
try:
    fd, tmp = tempfile.mkstemp(prefix=".settings.json.", suffix=".tmp",
                               dir=os.path.dirname(target) or ".")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    try:
        os.replace(tmp, target)
    except OSError:
        with open(target, "w", encoding="utf-8") as f:
            f.write(text)
        os.unlink(tmp)
    tmp = None
    try:
        os.chmod(target, 0o600)
    except OSError:
        pass
except OSError as e:
    if tmp and os.path.exists(tmp):
        os.unlink(tmp)
    fail(6, "io_error: %s" % e)

if "ANTHROPIC_API_KEY" in env:
    print("warn:api_key_in_settings")
print("ok")
'@

# ---------------------------------------------------------------------------

# 运行外部程序取第一行输出；出错或不存在都返回空字符串
function Get-FirstLine([string]$Exe, [string[]]$Arguments) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & $Exe @Arguments 2>$null | Select-Object -First 1
    if ($null -eq $out) { return '' }
    return [string]$out
  } catch {
    return ''
  } finally {
    $ErrorActionPreference = $old
  }
}

function Test-Prerequisites {
  $node = Get-Command node -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($node) {
    $v = Get-FirstLine $node.Source @('-v')
    if ($v -match '^v?(\d+)\.') {
      if ([int]$Matches[1] -lt $MinNodeMajor) {
        Write-Note "Node.js 版本是 $v，Claude Code 需要 $MinNodeMajor 以上，请先升级。"
      }
    }
  } else {
    Write-Note "没有检测到 Node.js。Claude Code 需要 Node.js $MinNodeMajor+，装好后执行：npm i -g @anthropic-ai/claude-code"
  }

  $claude = Get-Command claude -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($claude) {
    $v = Get-FirstLine $claude.Source @('--version')
    if ($v -match '^(\d+\.\d+\.\d+)') {
      if ([version]$Matches[1] -lt $MinClaudeVersion) {
        Write-Note "Claude Code 版本是 $($Matches[1])，Sonnet 5.5 需要 $MinClaudeVersion 以上，建议先执行 claude update。"
      }
    }
  } else {
    Write-Note '没有检测到 claude 命令。配置可以先写，装好 Claude Code 后生效：npm i -g @anthropic-ai/claude-code'
  }
}

function Read-BaseUrl {
  $u = Read-Host -Prompt "Base URL（直接回车使用 $DefaultBaseUrl）"
  if ($null -eq $u) { $u = '' }
  $u = $u.Trim()
  if (-not $u) { $u = $DefaultBaseUrl }
  $u = $u.TrimEnd('/')
  if ($u -match '/v1$') {
    $u = $u.Substring(0, $u.Length - 3).TrimEnd('/')
    Write-Note '已去掉末尾的 /v1：Claude Code 会自己拼 /v1/messages，多写会 404。'
  }
  if ($u -notmatch '^https?://\S+$') {
    Stop-Setup "Base URL 格式不对，应以 https:// 开头，例如 $DefaultBaseUrl"
  }
  if ($u -match '["''\\]') {
    Stop-Setup 'Base URL 里不能有引号或反斜杠。'
  }
  if ($u -match '^http://' -and $u -notmatch '^http://(localhost|127\.0\.0\.1)([:/]|$)') {
    Write-Note '这是 http 明文地址，Key 会以明文传输，请确认是可信的内网地址。'
  }
  return $u
}

function Read-ApiKey {
  for ($i = 0; $i -lt 3; $i++) {
    $plain = ''
    try {
      $secure = Read-Host -Prompt 'API Key（输入时不显示）' -AsSecureString
      if ($null -ne $secure) {
        $plain = [System.Net.NetworkCredential]::new('', $secure).Password
      }
    } catch {
      $plain = ''
    }
    if ($null -eq $plain) { $plain = '' }
    $plain = $plain.Trim()
    if ($plain) {
      if ($plain -match '\s') { Stop-Setup 'Key 中间有空白字符，请检查是否复制完整。未改动任何文件。' }
      return $plain
    }
  }
  Stop-Setup '没有读到 Key，已退出，未改动任何文件。'
}

function Read-MainModel {
  $m = Read-Host -Prompt "主模型（直接回车使用 $DefaultModel）"
  if ($null -eq $m) { $m = '' }
  $m = $m.Trim()
  if (-not $m) { $m = $DefaultModel }
  if ($m -notmatch '^[A-Za-z0-9._:/@-]+$') {
    Stop-Setup '模型 ID 只能包含字母、数字和 . _ : / @ -'
  }
  if ($m -match '^claude-.*\d\.\d') {
    Write-Note "Claude 模型 ID 一般用短横线（如 claude-opus-5-5），你填的是 $m，请确认平台支持这个写法。"
  }
  return $m
}

# 终端 / 用户环境变量的优先级高于 settings.json（Claude Code 2.1.284 实测），提前提醒
function Test-Overrides {
  $inProcess = @($AnthropicVars | Where-Object { [Environment]::GetEnvironmentVariable($_) })
  $inUser = @()
  try {
    $inUser = @($AnthropicVars | Where-Object { [Environment]::GetEnvironmentVariable($_, 'User') })
  } catch {
    $inUser = @()
  }
  if ($inProcess.Count -gt 0) {
    Write-Note ("当前终端已设置：" + ($inProcess -join ' '))
  }
  if ($inUser.Count -gt 0) {
    Write-Note ("Windows 用户环境变量里有：" + ($inUser -join ' '))
    Write-Note '删除示例（逐个执行后重开终端）：'
    foreach ($n in $inUser) {
      Write-Host "    [Environment]::SetEnvironmentVariable('$n', `$null, 'User')"
    }
  }
  if ($inProcess.Count -gt 0 -or $inUser.Count -gt 0) {
    Write-Note '环境变量优先于 settings.json，会盖掉本次写入的值。建议只保留 settings.json 一处配置。'
  }
}

function Find-Merger {
  $node = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($node) {
    return @{ Kind = 'node'; Exe = $node.Source; Prefix = @(); Ext = '.js'; Code = $JsMerge }
  }
  $candidates = @(
    @{ Name = 'py';      Prefix = @('-3', '-I') },
    @{ Name = 'python3'; Prefix = @('-I') },
    @{ Name = 'python';  Prefix = @('-I') }
  )
  foreach ($c in $candidates) {
    $cmd = Get-Command $c.Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $cmd) { continue }
    # 排除 Windows 应用商店的 python 占位程序，以及 Python 2
    $probeArgs = @($c.Prefix) + @('-c', 'import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)')
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $ok = $false
    try {
      & $cmd.Source @probeArgs 2>$null | Out-Null
      $ok = ($LASTEXITCODE -eq 0)
    } catch {
      $ok = $false
    } finally {
      $ErrorActionPreference = $old
    }
    if ($ok) {
      return @{ Kind = 'python'; Exe = $cmd.Source; Prefix = @($c.Prefix); Ext = '.py'; Code = $PyMerge }
    }
  }
  return $null
}

function Show-ManualJson([string]$BaseUrl, [string]$MainModel) {
  Write-Host ''
  Write-Host '没有找到 node 或 Python 3，脚本不会改动任何文件。'
  Write-Host "请手动把下面的键合并进 $SettingsFile 的 `"env`" 字段（已有 env 就逐项添加，不要整个覆盖），并把 <你的 Key> 换成你的 Key："
  Write-Host ''
  Write-Host '{'
  Write-Host '  "env": {'
  Write-Host "    `"ANTHROPIC_BASE_URL`": `"$BaseUrl`","
  Write-Host '    "ANTHROPIC_AUTH_TOKEN": "<你的 Key>",'
  Write-Host "    `"ANTHROPIC_MODEL`": `"$MainModel`","
  Write-Host "    `"ANTHROPIC_DEFAULT_OPUS_MODEL`": `"$OpusModel`","
  Write-Host "    `"ANTHROPIC_DEFAULT_SONNET_MODEL`": `"$SonnetModel`","
  Write-Host "    `"ANTHROPIC_DEFAULT_HAIKU_MODEL`": `"$HaikuModel`""
  Write-Host '  }'
  Write-Host '}'
}

function Backup-Settings {
  if (-not (Test-Path -LiteralPath $SettingsFile)) { return '' }
  $ts = Get-Date -Format 'yyyyMMdd-HHmmss'
  $candidate = "$SettingsFile.bak.$ts"
  $n = 0
  while (Test-Path -LiteralPath $candidate) {
    $n++
    $candidate = "$SettingsFile.bak.$ts-$n"
  }
  Copy-Item -LiteralPath $SettingsFile -Destination $candidate
  Write-Host "已备份原配置：$candidate"
  return $candidate
}

function Invoke-Merge($Merger, [string]$BaseUrl, [string]$ApiKey, [string]$MainModel, [string]$Backup) {
  $tmpScript = Join-Path ([System.IO.Path]::GetTempPath()) ('cc-setup-' + [guid]::NewGuid().ToString('N') + $Merger.Ext)
  [System.IO.File]::WriteAllText($tmpScript, $Merger.Code, (New-Object System.Text.UTF8Encoding($false)))

  $values = [ordered]@{
    CC_SETUP_BASE_URL = $BaseUrl
    CC_SETUP_TOKEN    = $ApiKey
    CC_SETUP_MODEL    = $MainModel
    CC_SETUP_OPUS     = $OpusModel
    CC_SETUP_SONNET   = $SonnetModel
    CC_SETUP_HAIKU    = $HaikuModel
  }
  $argList = @($Merger.Prefix) + @($tmpScript, $SettingsFile)
  $out = @()
  $code = 1
  $old = $ErrorActionPreference
  try {
    foreach ($k in $values.Keys) { [Environment]::SetEnvironmentVariable($k, [string]$values[$k], 'Process') }
    $ErrorActionPreference = 'Continue'
    $out = @(& $Merger.Exe @argList)
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $old
    foreach ($k in $values.Keys) { [Environment]::SetEnvironmentVariable($k, $null, 'Process') }
    Remove-Item -LiteralPath $tmpScript -Force -ErrorAction SilentlyContinue
  }

  if ($code -ne 0) {
    switch ($code) {
      3 { Write-Note "$SettingsFile 不是合法的 JSON（可能有注释或多余的逗号）。" }
      4 { Write-Note "$SettingsFile 的顶层不是 JSON 对象。" }
      5 { Write-Note "$SettingsFile 里的 `"env`" 不是 JSON 对象。" }
      default { Write-Note "读写 $SettingsFile 失败。" }
    }
    if ($Backup) {
      Stop-Setup "原文件未改动（备份在 $Backup）。请修好后重新运行，或按 README 第 3.3 节手动添加。"
    }
    Stop-Setup '未写入任何内容。请按 README 第 3.3 节手动添加。'
  }

  if (($out -join "`n") -match 'warn:api_key_in_settings') {
    Write-Note 'settings.json 的 env 里还有 ANTHROPIC_API_KEY，它和 ANTHROPIC_AUTH_TOKEN 同时存在容易用错 Key。脚本不删除已有字段，请手动删掉它。'
  }
}

# ---------------------------------------------------------------------------

Write-Host 'Claude Code 第三方 API 配置'
Write-Host "会写入：$SettingsFile（已有文件会先备份，只合并 env 字段）"
Write-Host ''

Test-Prerequisites
$baseUrl   = Read-BaseUrl
$apiKey    = Read-ApiKey
$mainModel = Read-MainModel

$merger = Find-Merger
if ($null -eq $merger) {
  Show-ManualJson -BaseUrl $baseUrl -MainModel $mainModel
  Test-Overrides
  exit 2
}

[System.IO.Directory]::CreateDirectory($ClaudeDir) | Out-Null
$backup = Backup-Settings
Invoke-Merge -Merger $merger -BaseUrl $baseUrl -ApiKey $apiKey -MainModel $mainModel -Backup $backup
$apiKey = $null

Write-Host ''
Write-Host "已写入 $SettingsFile 的 env（用 $($merger.Kind) 合并，其它字段未改动）："
Write-Host "  ANTHROPIC_BASE_URL             = $baseUrl"
Write-Host '  ANTHROPIC_AUTH_TOKEN           = （已写入，不显示）'
Write-Host "  ANTHROPIC_MODEL                = $mainModel"
Write-Host "  ANTHROPIC_DEFAULT_OPUS_MODEL   = $OpusModel"
Write-Host "  ANTHROPIC_DEFAULT_SONNET_MODEL = $SonnetModel"
Write-Host "  ANTHROPIC_DEFAULT_HAIKU_MODEL  = $HaikuModel"
Test-Overrides
Write-Host ''
Write-Host '下一步：关掉并重新打开 PowerShell，运行 claude，输入 /status 确认 Anthropic base URL。'

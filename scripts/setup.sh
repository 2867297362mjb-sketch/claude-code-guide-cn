#!/usr/bin/env bash
# Claude Code 第三方 API 一键配置（macOS / Linux / WSL）
#
# 交互输入 Base URL、Key 和主模型，写入 ~/.claude/settings.json 的 "env" 字段。
#
# 安全约定：
#   - settings.json 已存在时，先备份为 settings.json.bak.<时间戳>，再只合并 env 里的几个键；
#     其它字段（permissions、hooks、model 等）和 env 里的其它变量原样保留，不删除任何已有字段。
#   - 优先用 python3 合并，没有时用 node；两者都没有时只打印需要手动添加的 JSON，不改任何文件。
#   - Key 输入时不回显，不打印到屏幕，不出现在任何命令行参数里。
#
# 用法：bash scripts/setup.sh
# 兼容 macOS 自带的 bash 3.2。

set -euo pipefail
umask 077

readonly DEFAULT_BASE_URL="https://api.teamorouter.com"
readonly DEFAULT_MODEL="claude-opus-5-5"
readonly OPUS_MODEL="claude-opus-5-5"
readonly SONNET_MODEL="claude-sonnet-5-5"
readonly HAIKU_MODEL="claude-haiku-4-5"
readonly MIN_NODE_MAJOR=22
readonly MIN_CLAUDE_VERSION="2.1.284"

: "${HOME:?HOME 未设置}"
CLAUDE_DIR="${HOME}/.claude"
SETTINGS_FILE="${CLAUDE_DIR}/settings.json"

BASE_URL=""
API_KEY=""
MAIN_MODEL=""
BACKUP_FILE=""

say()  { printf '%s\n' "$*"; }
warn() { printf '[注意] %s\n' "$*" >&2; }
die()  { printf '[错误] %s\n' "$*" >&2; exit 1; }

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

# 版本比较：$1 < $2 时返回 0
version_lt() {
  local -a a b
  local i x y
  IFS=. read -r -a a <<< "$1"
  IFS=. read -r -a b <<< "$2"
  for i in 0 1 2; do
    x="${a[i]:-0}"
    y="${b[i]:-0}"
    [[ "$x" =~ ^[0-9]+$ ]] || x=0
    [[ "$y" =~ ^[0-9]+$ ]] || y=0
    if (( 10#$x < 10#$y )); then return 0; fi
    if (( 10#$x > 10#$y )); then return 1; fi
  done
  return 1
}

# ---------------------------------------------------------------------------
# 合并脚本：从环境变量 CC_SETUP_* 读取要写入的值，参数是 settings.json 路径。
# 只输出机器可读的状态行；退出码 3=不是合法 JSON，4=顶层不是对象，
# 5=env 不是对象，6=读写失败。setup.ps1 里有同一份代码。
# ---------------------------------------------------------------------------
IFS= read -r -d '' PY_MERGE <<'PY' || true
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
PY

IFS= read -r -d '' JS_MERGE <<'JS' || true
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
JS

# ---------------------------------------------------------------------------

check_prereqs() {
  local v major
  if command -v node >/dev/null 2>&1; then
    v="$(node -v 2>/dev/null || true)"
    v="${v#v}"
    major="${v%%.*}"
    if [[ "$major" =~ ^[0-9]+$ ]] && (( major < MIN_NODE_MAJOR )); then
      warn "Node.js 版本是 ${v}，Claude Code 需要 ${MIN_NODE_MAJOR} 以上，请先升级。"
    fi
  else
    warn "没有检测到 Node.js。Claude Code 需要 Node.js ${MIN_NODE_MAJOR}+，装好后执行：npm i -g @anthropic-ai/claude-code"
  fi

  if command -v claude >/dev/null 2>&1; then
    v="$(claude --version 2>/dev/null | head -n 1 || true)"
    v="${v%% *}"
    if [[ "$v" =~ ^[0-9]+(\.[0-9]+)*$ ]] && version_lt "$v" "$MIN_CLAUDE_VERSION"; then
      warn "Claude Code 版本是 ${v}，Sonnet 5.5 需要 ${MIN_CLAUDE_VERSION} 以上，建议先执行 claude update。"
    fi
  else
    warn "没有检测到 claude 命令。配置可以先写，装好 Claude Code 后生效：npm i -g @anthropic-ai/claude-code"
  fi
}

prompt_base_url() {
  local input=""
  read -r -p "Base URL（直接回车使用 ${DEFAULT_BASE_URL}）: " input || true
  input="$(trim "$input")"
  if [[ -z "$input" ]]; then input="$DEFAULT_BASE_URL"; fi
  while [[ "$input" == */ ]]; do input="${input%/}"; done
  if [[ "$input" == */v1 ]]; then
    input="${input%/v1}"
    while [[ "$input" == */ ]]; do input="${input%/}"; done
    warn "已去掉末尾的 /v1：Claude Code 会自己拼 /v1/messages，多写会 404。"
  fi
  if [[ ! "$input" =~ ^https?://[^[:space:]]+$ ]]; then
    die "Base URL 格式不对，应以 https:// 开头，例如 ${DEFAULT_BASE_URL}"
  fi
  case "$input" in
    *\"*|*\'*|*\\*) die "Base URL 里不能有引号或反斜杠。" ;;
  esac
  case "$input" in
    http://localhost|http://localhost[:/]*|http://127.0.0.1|http://127.0.0.1[:/]*) ;;
    http://*) warn "这是 http 明文地址，Key 会以明文传输，请确认是可信的内网地址。" ;;
  esac
  BASE_URL="$input"
}

prompt_key() {
  local key="" tries=0
  while [[ -z "$key" ]]; do
    tries=$((tries + 1))
    if (( tries > 3 )); then die "没有读到 Key，已退出，未改动任何文件。"; fi
    if [[ -t 0 ]]; then
      read -r -s -p "API Key（输入时不显示）: " key || true
      printf '\n' >&2
    else
      read -r key || true
    fi
    key="$(trim "$key")"
  done
  if [[ "$key" =~ [[:space:]] ]]; then
    die "Key 中间有空白字符，请检查是否复制完整。未改动任何文件。"
  fi
  API_KEY="$key"
}

prompt_model() {
  local m=""
  read -r -p "主模型（直接回车使用 ${DEFAULT_MODEL}）: " m || true
  m="$(trim "$m")"
  if [[ -z "$m" ]]; then m="$DEFAULT_MODEL"; fi
  if [[ ! "$m" =~ ^[A-Za-z0-9._:/@-]+$ ]]; then
    die "模型 ID 只能包含字母、数字和 . _ : / @ -"
  fi
  if [[ "$m" =~ ^claude-.*[0-9]\.[0-9] ]]; then
    warn "Claude 模型 ID 一般用短横线（如 claude-opus-5-5），你填的是 ${m}，请确认平台支持这个写法。"
  fi
  MAIN_MODEL="$m"
}

# 终端环境变量的优先级高于 settings.json（Claude Code 2.1.284 实测），提前提醒
check_overrides() {
  local name rc
  local -a found=()
  local -a rc_hits=()
  for name in ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN ANTHROPIC_API_KEY ANTHROPIC_MODEL \
              ANTHROPIC_DEFAULT_OPUS_MODEL ANTHROPIC_DEFAULT_SONNET_MODEL ANTHROPIC_DEFAULT_HAIKU_MODEL; do
    if [[ -n "${!name:-}" ]]; then found+=("$name"); fi
  done
  for rc in "$HOME/.zshrc" "$HOME/.zprofile" "$HOME/.zshenv" "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile"; do
    if [[ -f "$rc" ]] && grep -Eq '^[[:space:]]*(export[[:space:]]+)?ANTHROPIC_[A-Z_]+=' "$rc"; then
      rc_hits+=("$rc")
    fi
  done
  if (( ${#found[@]} > 0 )); then
    warn "当前终端已设置：${found[*]}"
    warn "终端环境变量优先于 settings.json，会盖掉本次写入的值。"
  fi
  if (( ${#rc_hits[@]} > 0 )); then
    warn "这些文件里有 ANTHROPIC_* 配置，新开终端后同样会盖掉 settings.json：${rc_hits[*]}"
  fi
  if (( ${#found[@]} > 0 || ${#rc_hits[@]} > 0 )); then
    warn "建议删掉上面这些 export（或 unset），只保留 settings.json 一处配置。"
  fi
}

print_manual_json() {
  say ""
  say "没有找到 python3 或 node，脚本不会改动任何文件。"
  say "请手动把下面的键合并进 ${SETTINGS_FILE} 的 \"env\" 字段（已有 env 就逐项添加，不要整个覆盖），并把 <你的 Key> 换成你的 Key："
  say ""
  cat <<EOF
{
  "env": {
    "ANTHROPIC_BASE_URL": "${BASE_URL}",
    "ANTHROPIC_AUTH_TOKEN": "<你的 Key>",
    "ANTHROPIC_MODEL": "${MAIN_MODEL}",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "${OPUS_MODEL}",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "${SONNET_MODEL}",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "${HAIKU_MODEL}"
  }
}
EOF
}

backup_settings() {
  local ts candidate n=0
  BACKUP_FILE=""
  if [[ ! -e "$SETTINGS_FILE" ]]; then return 0; fi
  ts="$(date +%Y%m%d-%H%M%S)"
  candidate="${SETTINGS_FILE}.bak.${ts}"
  while [[ -e "$candidate" ]]; do
    n=$((n + 1))
    candidate="${SETTINGS_FILE}.bak.${ts}-${n}"
  done
  cp -p "$SETTINGS_FILE" "$candidate"
  chmod 600 "$candidate" 2>/dev/null || true
  BACKUP_FILE="$candidate"
  say "已备份原配置：${BACKUP_FILE}"
}

run_merge() {
  local merger="$1" out="" status=0
  if [[ "$merger" == "python3" ]]; then
    out="$(CC_SETUP_BASE_URL="$BASE_URL" CC_SETUP_TOKEN="$API_KEY" CC_SETUP_MODEL="$MAIN_MODEL" \
           CC_SETUP_OPUS="$OPUS_MODEL" CC_SETUP_SONNET="$SONNET_MODEL" CC_SETUP_HAIKU="$HAIKU_MODEL" \
           python3 -I -c "$PY_MERGE" "$SETTINGS_FILE")" || status=$?
  else
    out="$(CC_SETUP_BASE_URL="$BASE_URL" CC_SETUP_TOKEN="$API_KEY" CC_SETUP_MODEL="$MAIN_MODEL" \
           CC_SETUP_OPUS="$OPUS_MODEL" CC_SETUP_SONNET="$SONNET_MODEL" CC_SETUP_HAIKU="$HAIKU_MODEL" \
           node -e "$JS_MERGE" "$SETTINGS_FILE")" || status=$?
  fi

  if (( status != 0 )); then
    case "$status" in
      3) warn "${SETTINGS_FILE} 不是合法的 JSON（可能有注释或多余的逗号）。" ;;
      4) warn "${SETTINGS_FILE} 的顶层不是 JSON 对象。" ;;
      5) warn "${SETTINGS_FILE} 里的 \"env\" 不是 JSON 对象。" ;;
      *) warn "读写 ${SETTINGS_FILE} 失败。" ;;
    esac
    if [[ -n "$BACKUP_FILE" ]]; then
      die "原文件未改动（备份在 ${BACKUP_FILE}）。请修好后重新运行，或按 README 第 3.3 节手动添加。"
    fi
    die "未写入任何内容。请按 README 第 3.3 节手动添加。"
  fi

  if [[ "$out" == *"warn:api_key_in_settings"* ]]; then
    warn "settings.json 的 env 里还有 ANTHROPIC_API_KEY，它和 ANTHROPIC_AUTH_TOKEN 同时存在容易用错 Key。脚本不删除已有字段，请手动删掉它。"
  fi
}

main() {
  say "Claude Code 第三方 API 配置"
  say "会写入：${SETTINGS_FILE}（已有文件会先备份，只合并 env 字段）"
  say ""

  check_prereqs
  prompt_base_url
  prompt_key
  prompt_model

  local merger=""
  if command -v python3 >/dev/null 2>&1; then
    merger="python3"
  elif command -v node >/dev/null 2>&1; then
    merger="node"
  fi

  if [[ -z "$merger" ]]; then
    print_manual_json
    check_overrides
    exit 2
  fi

  mkdir -p "$CLAUDE_DIR"
  backup_settings
  run_merge "$merger"

  say ""
  say "已写入 ${SETTINGS_FILE} 的 env（用 ${merger} 合并，其它字段未改动）："
  say "  ANTHROPIC_BASE_URL             = ${BASE_URL}"
  say "  ANTHROPIC_AUTH_TOKEN           = （已写入，不显示）"
  say "  ANTHROPIC_MODEL                = ${MAIN_MODEL}"
  say "  ANTHROPIC_DEFAULT_OPUS_MODEL   = ${OPUS_MODEL}"
  say "  ANTHROPIC_DEFAULT_SONNET_MODEL = ${SONNET_MODEL}"
  say "  ANTHROPIC_DEFAULT_HAIKU_MODEL  = ${HAIKU_MODEL}"
  check_overrides
  say ""
  say "下一步：新开一个终端，运行 claude，输入 /status 确认 Anthropic base URL。"
}

main "$@"

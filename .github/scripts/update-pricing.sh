#!/usr/bin/env bash
# 拉取 TeamoRouter 价格接口，只保留 claude-* 模型的官方价（list_cost）和 TeamoRouter 价（cost），
# 写入 docs/data/pricing.json。模型价格没变时不改文件，避免每天产生空提交。
#
# 用法：bash .github/scripts/update-pricing.sh [输出文件]
# 在 GitHub Actions 里运行时，会往 $GITHUB_OUTPUT 写 changed=true/false。
set -euo pipefail

SOURCE_URL="https://api.teamorouter.com/v1/models/pricing"
OUT="${1:-docs/data/pricing.json}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

curl -fsSL --connect-timeout 15 --max-time 60 --retry 3 --retry-delay 5 \
  "$SOURCE_URL" -o "$tmp/raw.json"

# context_tier_pricing 一并保留：部分模型（如 claude-haiku-5-5）超过上下文门槛后整次请求按倍率计价
jq -S '
  [ .models[]
    | select((.id | type) == "string" and (.id | startswith("claude-")))
    | { id, display_name, list_cost, cost, context_tier_pricing } ]
  | sort_by(.id)
  # 官方价校正：Anthropic 官方价格页（platform.claude.com/docs/en/about-claude/pricing，2026-10-14）
  # Sonnet 5.5 缓存读为 $0.10/MTok（输入价的 5%），接口里的 list_cost 仍是 $0.20，这里按官方页覆盖；
  # cost（TeamoRouter 实际价）不动。
  | map(if .id == "claude-sonnet-5-5"
        then .list_cost.cache_read = 0.1 | .list_cost.cached_input = 0.1
        else . end)
' "$tmp/raw.json" > "$tmp/models.json"

# 基本校验：至少有一个模型，且每个模型的官方价输入 / 输出都是数字，防止接口异常时把空数据写进去
count="$(jq 'length' "$tmp/models.json")"
if [ "$count" -lt 1 ]; then
  echo "接口里没有 claude-* 模型，放弃更新" >&2
  exit 1
fi
jq -e 'all(.[]; (.list_cost.input | type) == "number" and (.list_cost.output | type) == "number")' \
  "$tmp/models.json" > /dev/null || { echo "价格字段不完整，放弃更新" >&2; exit 1; }

changed=true
if [ -f "$OUT" ] && jq -S '.models' "$OUT" > "$tmp/old.json" 2>/dev/null \
   && cmp -s "$tmp/old.json" "$tmp/models.json"; then
  changed=false
fi

if [ "$changed" = true ]; then
  mkdir -p "$(dirname "$OUT")"
  jq -n \
    --slurpfile models "$tmp/models.json" \
    --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg src "$SOURCE_URL" \
    '{
      source: $src,
      updated_at: $now,
      unit: "USD per 1M tokens",
      fields: { list_cost: "Anthropic 官方价", cost: "TeamoRouter 价" },
      models: $models[0]
    }' > "$OUT"
  echo "已更新 $OUT（$count 个 claude-* 模型）"
else
  echo "价格没有变化，不改文件"
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "changed=$changed" >> "$GITHUB_OUTPUT"
fi

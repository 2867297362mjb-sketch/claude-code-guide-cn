#!/usr/bin/env python3
"""生成 docs/errors/ 下的报错速查页。改报错内容只改这个文件里的 ERRORS，然后重跑：

    python3 scripts/build_error_pages.py

会重写 docs/errors/**/index.html 和 docs/sitemap.xml。
"""
from __future__ import annotations

import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
SITE = "https://2867297362mjb-sketch.github.io/claude-code-guide-cn/"
UPDATED = "2026 年 10 月"

CURL_TEST = """curl -sS "$ANTHROPIC_BASE_URL/v1/messages" \\
  -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{"model":"claude-opus-5-5","max_tokens":16,"messages":[{"role":"user","content":"hi"}]}'"""

ENV_CHECK = """# macOS / Linux：只列变量名，不打印 Key
env | grep ^ANTHROPIC_ | cut -d= -f1

# Windows PowerShell
(Get-ChildItem Env:ANTHROPIC*).Name"""

# 每条：slug、报错原文、一句话结论、含义、原因、排查步骤（可含代码块）、相关页
ERRORS = [
    {
        "slug": "unable-to-connect",
        "title": "Unable to connect to Anthropic services",
        "seo": "Claude Code 报错 Unable to connect to Anthropic services 怎么解决",
        "raw": "Unable to connect to Anthropic services\nFailed to connect to api.anthropic.com: ERR_BAD_REQUEST",
        "variants": "冒号后面也可能是 ECONNRESET、ETIMEDOUT 等网络错误。",
        "answer": "Claude Code 连不上 api.anthropic.com。国内最常见的原因是直连官方不通，或者设置的第三方地址没有被 Claude Code 读到，它还在连官方。",
        "meaning": "Claude Code 启动时要连接模型服务。没有设置 <code>ANTHROPIC_BASE_URL</code> 时，它连的是官方的 <code>api.anthropic.com</code>；这一步失败就会出现这条报错。",
        "causes": [
            "所在网络连不上 <code>api.anthropic.com</code>，或者出口地区不在 Anthropic 支持的范围内。",
            "已经配置了第三方平台，但环境变量没生效：在旧终端里启动、VS Code 没整个重启，或者写错了变量名，Claude Code 仍在连官方。",
            "开了代理，但 Claude Code 没走代理：Node.js 只认 <code>HTTPS_PROXY</code> 这类环境变量，不认系统代理设置。",
            "冒号后是 ECONNRESET 时，多是公司防火墙、代理或安全软件中途断开了连接。",
        ],
        "steps": [
            ("先确认 Claude Code 读到了哪些变量：", ENV_CHECK),
            ("用第三方平台时，列表里必须有 <code>ANTHROPIC_BASE_URL</code> 和 <code>ANTHROPIC_AUTH_TOKEN</code>。没有就新开一个终端再试；VS Code 用户要完全退出 VS Code 再打开。也可以把这两个变量写进 <code>~/.claude/settings.json</code> 的 <code>env</code>，不依赖终端。", None),
            ("用官方账号时，需要能连上 <code>api.anthropic.com</code> 的网络，并让 Claude Code 走代理：", "export HTTPS_PROXY=http://127.0.0.1:7890   # 换成你的代理地址和端口"),
            ("还不行，在 Claude Code 里输入 <code>/status</code>，看它实际连接的地址和使用的凭据。", None),
        ],
        "related": ["403-request-not-allowed", "401-invalid-api-key", "404-not-found"],
    },
    {
        "slug": "403-request-not-allowed",
        "title": "API Error: 403 Request not allowed",
        "seo": "Claude Code 报错 API Error: 403 Request not allowed 怎么解决",
        "raw": "Failed to authenticate. API Error: 403 Request not allowed",
        "variants": "有时出现在压缩上下文时：Error during compaction: Failed to authenticate. API Error: 403 Request not allowed",
        "answer": "请求被服务端直接拒绝了。用官方账号时，多半是网络出口地区或账号状态的问题；用第三方平台时，多半是 Key 没有这个模型的权限。",
        "meaning": "403 表示服务端收到了请求、认出了你是谁，但不允许这次访问。它和 401（凭据不对）不同，换一个 Key 字符串通常解决不了。",
        "causes": [
            "用官方订阅或官方 API 时，网络出口 IP 所在地区不在 Anthropic 支持的范围内。",
            "官方账号被风控或封禁，或者登录态失效。",
            "用第三方平台时，这个 Key 没有开通当前模型，或者所在分组不能用这个模型。",
        ],
        "steps": [
            ("先确认请求发去了哪里：在 Claude Code 里输入 <code>/status</code>。", None),
            ("如果发去的是官方：检查代理出口所在地区；在 Claude Code 里执行 <code>/logout</code> 再 <code>/login</code> 重新登录。账号被封只能找 Anthropic 申诉。", None),
            ("如果发去的是第三方平台：用下面的命令绕开 Claude Code 直接请求一次，看平台返回的原始错误，再对照平台的模型列表和 Key 权限：", CURL_TEST),
        ],
        "related": ["unable-to-connect", "401-invalid-api-key", "model-not-found"],
    },
    {
        "slug": "401-invalid-api-key",
        "title": "Invalid API key · Please run /login",
        "seo": "Claude Code 报错 Invalid API key · Please run /login 怎么解决",
        "raw": "Invalid API key · Please run /login",
        "variants": "也可能显示为 API Error: 401，或返回体里有 authentication_error、invalid_api_key。",
        "answer": "发出去的 Key 不对。最常见的原因是机器上同时留着 ANTHROPIC_API_KEY 和 ANTHROPIC_AUTH_TOKEN，Claude Code 用了你没想到的那一个。",
        "meaning": "401 表示服务端不认这个凭据。Claude Code 有两种发 Key 的方式：<code>ANTHROPIC_AUTH_TOKEN</code> 发 <code>Authorization: Bearer</code> 请求头，<code>ANTHROPIC_API_KEY</code> 发 <code>x-api-key</code> 请求头。两个都设时，很容易发错。",
        "causes": [
            "机器上还留着旧的 <code>ANTHROPIC_API_KEY</code>（以前用官方 API 时设的），和新平台的 Key 冲突。",
            "Key 复制不全，或者首尾多了空格、换行。",
            "终端里的环境变量和 <code>settings.json</code> 里的值不一样，终端里的优先级更高。",
            "官方 Key 发给了第三方地址，或者第三方 Key 发给了官方地址。",
        ],
        "steps": [
            ("列出所有 ANTHROPIC_ 开头的变量名，看有没有重复或残留：", ENV_CHECK),
            ("删掉不用的那个，用第三方平台时推荐只保留 <code>ANTHROPIC_AUTH_TOKEN</code>：", "unset ANTHROPIC_API_KEY\n# 再到 ~/.zshrc、~/.bashrc 等文件里删掉对应的 export 行"),
            ("重新从平台控制台复制 Key，新开终端后再启动 Claude Code。", None),
            ("还不行，用下面的命令直接请求一次。返回 401 说明 Key 本身有问题；能正常返回说明问题在 Claude Code 的配置：", CURL_TEST),
        ],
        "related": ["unable-to-connect", "403-request-not-allowed", "credit-balance-too-low"],
    },
    {
        "slug": "529-overloaded",
        "title": "API Error: 529 Overloaded",
        "seo": "Claude Code 报错 API Error: 529 Overloaded 怎么办",
        "raw": "API Error: 529 Overloaded",
        "variants": "新版本会接着提示：This is a server-side issue, usually temporary — try again in a moment. If it persists, check https://status.claude.com.",
        "answer": "模型服务端暂时过载，不是你的配置问题。等一会儿重试，或者先换一个模型。",
        "meaning": "529（overloaded_error）表示上游当前容量不足，无法处理这次请求。Claude Code 会自动重试几次，重试也失败才把这条报错显示出来。",
        "causes": [
            "官方在高峰期容量紧张，新模型刚发布那几天尤其常见。",
            "用第三方平台时，平台把上游的 529 透传了过来，或者平台自己的线路容量不足。",
        ],
        "steps": [
            ("等一两分钟再发。", None),
            ("急着用的话，用 <code>/model</code> 先切到另一个模型，比如从 Opus 切到 Sonnet。", None),
            ("打开 <a href=\"https://status.claude.com\">status.claude.com</a> 看官方有没有故障公告。", None),
            ("用第三方平台时，如果官方状态正常、只有你这边一直 529，把报错时间和 request_id 发给平台客服。", None),
        ],
        "related": ["429-rate-limit", "model-not-found", "unable-to-connect"],
    },
    {
        "slug": "credit-balance-too-low",
        "title": "Credit balance is too low",
        "seo": "Claude Code 报错 Credit balance is too low 怎么解决",
        "raw": "Credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
        "variants": "",
        "answer": "Claude Code 在用官方 Console 的 API Key 计费，而这个账户的余额用完了。很多人其实想用订阅，却因为机器上设了 ANTHROPIC_API_KEY，被按 API 余额扣费。",
        "meaning": "这条报错来自 Anthropic 官方 API，说明请求用的是 Console 里创建的 API Key，按 API 余额计费，和 Pro / Max 订阅额度无关。",
        "causes": [
            "机器上设了 <code>ANTHROPIC_API_KEY</code>，Claude Code 优先用它，没走你的订阅。",
            "Console 账户的 API 余额确实用完了。",
        ],
        "steps": [
            ("想用 Pro / Max 订阅：删掉 <code>ANTHROPIC_API_KEY</code>，在 Claude Code 里 <code>/login</code> 用订阅账号登录。", "unset ANTHROPIC_API_KEY"),
            ("就是想用官方 API：到 Console 的 Plans &amp; Billing 页面充值。", None),
            ("用第三方平台时不会出现这句原文。平台余额不足时一般返回 402 或平台自己的提示，充值后重试即可。", None),
        ],
        "related": ["401-invalid-api-key", "429-rate-limit", "unable-to-connect"],
    },
    {
        "slug": "400-thinking-signature",
        "title": "API Error: 400 Invalid signature in thinking block",
        "seo": "Claude Code 报错 API Error: 400 Invalid signature in thinking block 怎么解决",
        "raw": "API Error: 400 {\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"messages.1.content.0: Invalid `signature` in `thinking` block\"}}",
        "variants": "同类报错：If an assistant message contains any thinking blocks, the first block must be 'thinking' or 'redacted_thinking'. Found 'text'.",
        "answer": "会话历史里的思考块对不上当前的服务端。最常见的原因是在同一个会话里换了平台或模型。新开一个会话就能恢复。",
        "meaning": "开启思考的模型会给每段思考内容附一个签名，后续请求要把这些思考块原样带回去，只有生成它的服务端认得这个签名。历史里的思考块被换过后端、被改写或顺序被打乱，服务端就会拒绝整个请求。",
        "causes": [
            "会话中途改了 <code>ANTHROPIC_BASE_URL</code>（比如从官方换到第三方，或者换了一家平台），然后继续或 <code>--resume</code> 原来的会话。",
            "会话中途切换了模型。",
            "中间的代理或网关改写、删减了思考块。",
        ],
        "steps": [
            ("执行 <code>/clear</code>，或者退出后新开一个会话，不要恢复报错的旧会话。", None),
            ("以后同一个会话里不要切换平台。要换平台，先结束当前会话。", None),
            ("全新的会话里第一次调用工具就报这个错，说明是平台或网关的问题，带上报错里的 request_id 去找平台。", None),
        ],
        "related": ["model-not-found", "unable-to-connect", "529-overloaded"],
    },
    {
        "slug": "model-not-found",
        "title": "There's an issue with the selected model",
        "seo": "Claude Code 报错 There's an issue with the selected model 怎么解决",
        "raw": "There's an issue with the selected model (claude-opus-5-5). It may not exist or you may not have access to it.",
        "variants": "括号里是你当前选的模型 ID。",
        "answer": "当前选的模型 ID 请求失败了。先检查 ID 拼写和平台模型列表；如果都没问题，用 curl 直接请求一次，看真实的报错是什么。",
        "meaning": "Claude Code 请求某个模型失败时会显示这条提示。它不一定真的表示模型不存在：上游的其他错误有时也会被显示成这句话，所以要看原始返回才能确定原因。",
        "causes": [
            "模型 ID 写错了，比如写成了点号 <code>claude-opus-5.5</code>，正确的是短横线 <code>claude-opus-5-5</code>。",
            "所用平台没有上架这个模型，或者你的 Key 没有这个模型的权限。",
            "Claude Code 版本太旧，不认识新模型。",
            "上游的其他错误被显示成了这句话。",
        ],
        "steps": [
            ("核对 <code>ANTHROPIC_MODEL</code> 和 <code>ANTHROPIC_DEFAULT_OPUS_MODEL</code>、<code>ANTHROPIC_DEFAULT_SONNET_MODEL</code>、<code>ANTHROPIC_DEFAULT_HAIKU_MODEL</code> 里的 ID，和平台模型列表逐字对照。", None),
            ("升级 Claude Code：", "claude update"),
            ("直接请求一次，看平台返回的原始错误（把 model 换成你在用的 ID）：", CURL_TEST),
        ],
        "related": ["404-not-found", "403-request-not-allowed", "400-thinking-signature"],
    },
    {
        "slug": "429-rate-limit",
        "title": "API Error: 429 rate_limit_error",
        "seo": "Claude Code 报错 API Error: 429 rate_limit_error 怎么解决",
        "raw": "API Error: 429 {\"type\":\"error\",\"error\":{\"type\":\"rate_limit_error\", ...}}",
        "variants": "用订阅时，类似的情况会显示为用量已达上限、几点重置。",
        "answer": "请求太快或用量到了上限。官方 API 按账户等级限速，订阅按时间窗口限额，第三方平台按 Key 限速。等一会儿，或者降低并发。",
        "meaning": "429 表示在一段时间内的请求数或 token 数超过了允许的上限，和 Key 对不对无关。",
        "causes": [
            "官方 API 的账户等级较低，每分钟请求数或 token 数有上限。",
            "订阅的用量窗口或每周额度用完了。",
            "同时开了很多子代理或多个会话，瞬时并发太高。",
            "第三方平台对单个 Key 有限速。",
        ],
        "steps": [
            ("等几分钟再试。订阅用户看提示里的重置时间。", None),
            ("减少同时跑的会话和子代理数量。", None),
            ("长期不够用：官方 API 可以提升账户等级；订阅可以升级套餐，或者改用按量计费的 API。", None),
            ("用第三方平台时，问清楚平台对单个 Key 的限速是多少。", None),
        ],
        "related": ["529-overloaded", "credit-balance-too-low", "unable-to-connect"],
    },
    {
        "slug": "404-not-found",
        "title": "API Error: 404",
        "seo": "Claude Code 配置第三方 API 后报 404 怎么解决",
        "raw": "API Error: 404",
        "variants": "",
        "answer": "多半是 ANTHROPIC_BASE_URL 多写了 /v1。Claude Code 会自己在地址后面拼 /v1/messages，地址只写到域名即可。",
        "meaning": "404 表示请求的路径在服务端不存在。地址写成 <code>https://平台域名/v1</code> 时，实际请求会变成 <code>/v1/v1/messages</code>。",
        "causes": [
            "<code>ANTHROPIC_BASE_URL</code> 末尾多了 <code>/v1</code> 或其他路径。",
            "平台不支持 Anthropic 原生协议，只提供 OpenAI 兼容接口（<code>/v1/chat/completions</code>）。Claude Code 只能接 Anthropic 原生协议。",
        ],
        "steps": [
            ("把地址改成只到域名（以平台文档为准）：", "export ANTHROPIC_BASE_URL=https://api.example.com   # 不要带 /v1"),
            ("确认平台提供 Anthropic 原生协议的 <code>/v1/messages</code> 接口。只有 OpenAI 兼容接口的平台不能直接给 Claude Code 用。", None),
        ],
        "related": ["model-not-found", "401-invalid-api-key", "unable-to-connect"],
    },
]

BY_SLUG = {e["slug"]: e for e in ERRORS}


def esc(s: str) -> str:
    return html.escape(s, quote=False)


def utm(slug: str) -> str:
    return (
        "https://teamorouter.com/zh/docs/install-claude-code?utm_source=github"
        f"&amp;utm_medium=tool&amp;utm_campaign=cc_error_pages&amp;utm_content={slug}"
    )


def head(title: str, desc: str, url: str, depth: int, jsonld: dict) -> str:
    up = "../" * depth
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <title>{esc(title)}</title>
  <meta name="description" content="{html.escape(desc)}">
  <link rel="canonical" href="{url}">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:title" content="{html.escape(title)}">
  <meta property="og:description" content="{html.escape(desc)}">
  <meta property="og:url" content="{url}">
  <meta name="theme-color" content="#0e6b62">
  <link rel="icon" href="{up}favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="{up}assets/style.css">
  <script src="{up}assets/site.js" defer></script>
  <script type="application/ld+json">
{json.dumps(jsonld, ensure_ascii=False, indent=2)}
  </script>
</head>
<body>
  <header class="site-header">
    <div class="wrap">
      <a class="brand" href="{up}">Claude Code <span>国内指南</span></a>
      <nav class="nav" aria-label="主导航">
        <a href="{up}">指南</a>
        <a href="{up}cowork/">Cowork</a>
        <a href="{up}errors/"{' aria-current="page"' if depth == 1 else ''}>报错速查</a>
        <a href="{up}calculator/">账单计算器</a>
        <a href="{up}config/">配置生成器</a>
        <a href="https://github.com/2867297362mjb-sketch/claude-code-guide-cn">GitHub</a>
      </nav>
    </div>
  </header>
  <main class="wrap">
"""


FOOT = f"""  </main>

  <footer class="site-footer">
    <div class="wrap">
      <p>利益相关：本站由 TeamoRouter 团队维护。内容以 <a href="https://github.com/2867297362mjb-sketch/claude-code-guide-cn">GitHub 仓库</a> 为准，欢迎提 Issue / PR 勘误。</p>
      <p>MIT License · 内容更新于 {UPDATED}</p>
    </div>
  </footer>
</body>
</html>
"""


def code_block(text: str, wrap: bool = False) -> str:
    cls = "code wrap" if wrap else "code"
    return f'<div class="{cls}"><pre><code>{esc(text)}</code></pre></div>'


def error_page(e: dict) -> str:
    url = f"{SITE}errors/{e['slug']}/"
    desc = e["answer"]
    jsonld = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": e["seo"],
                "acceptedAnswer": {"@type": "Answer", "text": html.unescape(_strip_tags(e["answer"]))},
            }
        ],
    }
    out = [head(f"{e['seo']}（原因与排查）| Claude Code 国内指南", desc, url, 2, jsonld)]
    out.append(f"""    <nav class="small muted" aria-label="位置"><a href="../../">指南</a> / <a href="../">报错速查</a></nav>
    <section class="hero">
      <h1>{esc(e['seo'])}</h1>
      <p class="lead">{e['answer']}</p>
    </section>

    <section class="card">
      <h2>报错原文</h2>
      {code_block(e['raw'], wrap=True)}
""")
    if e["variants"]:
        out.append(f"      <p class=\"small muted\">{esc(e['variants'])}</p>\n")
    out.append(f"""    </section>

    <section class="card">
      <h2>这条报错是什么意思</h2>
      <p>{e['meaning']}</p>
    </section>

    <section class="card">
      <h2>常见原因</h2>
      <ol>
""")
    for c in e["causes"]:
        out.append(f"        <li>{c}</li>\n")
    out.append("""      </ol>
    </section>

    <section class="card">
      <h2>怎么排查</h2>
      <ol>
""")
    for text, code in e["steps"]:
        out.append(f"        <li><p>{text}</p>{code_block(code) if code else ''}</li>\n")
    out.append("      </ol>\n")
    if any(code == CURL_TEST for _, code in e["steps"]):
        out.append('      <p class="small muted">curl 命令里用的是 Claude Code 的同名环境变量，在设好变量的终端里直接运行即可，Key 不会显示出来。Windows 用户可以在 Git Bash 或 WSL 里运行。</p>\n')
    out.append("    </section>\n")
    out.append("""
    <section class="card">
      <h2>相关报错</h2>
      <ul>
""")
    for r in e["related"]:
        rel = BY_SLUG[r]
        out.append(f"        <li><a href=\"../{r}/\">{esc(rel['title'])}</a></li>\n")
    out.append(f"""      </ul>
    </section>

    <section class="card">
      <h2>配置有问题？</h2>
      <p>用 <a href="../../config/">配置生成器</a> 重新生成一份环境变量或 <code>settings.json</code>，Key 只在本地拼接。</p>
      <p class="note">需要国内能直接连接的 Anthropic 原生协议地址，可以看 <a href="{utm(e['slug'])}">TeamoRouter 的 Claude Code 接入文档</a>（利益相关：本站由 TeamoRouter 团队维护，它不是 Anthropic 官方渠道）。</p>
    </section>
""")
    out.append(FOOT)
    return "".join(out)


def _strip_tags(s: str) -> str:
    import re

    return re.sub(r"<[^>]+>", "", s)


def hub_page() -> str:
    url = f"{SITE}errors/"
    desc = "Claude Code 常见报错速查：Unable to connect to Anthropic services、403 Request not allowed、Invalid API key、529 Overloaded、thinking 签名 400、模型不存在、429、404 等，逐条给出原因和排查步骤。"
    jsonld = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "url": f"{SITE}errors/{e['slug']}/", "name": e["seo"]}
            for i, e in enumerate(ERRORS)
        ],
    }
    out = [head("Claude Code 报错速查（2026）：原因与排查步骤 | Claude Code 国内指南", desc, url, 1, jsonld)]
    out.append("""    <section class="hero">
      <h1>Claude Code 报错速查</h1>
      <p class="lead">把终端里的报错和下面的原文对一下，点进去看原因和排查步骤。内容对任何支持 Anthropic 原生协议的平台通用。</p>
    </section>

    <section class="card">
      <ul class="error-list">
""")
    for e in ERRORS:
        out.append(f"        <li><a href=\"{e['slug']}/\"><code>{esc(e['title'])}</code></a><p>{e['answer']}</p></li>\n")
    out.append("""      </ul>
      <p class="small muted">没找到你的报错？到 <a href="https://github.com/2867297362mjb-sketch/claude-code-guide-cn/issues">GitHub Issues</a> 贴出报错原文（记得删掉 Key）。</p>
    </section>
""")
    out.append(FOOT)
    return "".join(out)


def sitemap() -> str:
    urls = ["", "cowork/", "errors/", "calculator/", "config/"] + [f"errors/{e['slug']}/" for e in ERRORS]
    body = "\n".join(f"  <url><loc>{SITE}{u}</loc></url>" for u in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{body}\n</urlset>\n'


def main() -> None:
    for e in ERRORS:
        for r in e["related"]:
            assert r in BY_SLUG, (e["slug"], r)
        d = DOCS / "errors" / e["slug"]
        d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(error_page(e), encoding="utf-8")
    (DOCS / "errors" / "index.html").write_text(hub_page(), encoding="utf-8")
    (DOCS / "sitemap.xml").write_text(sitemap(), encoding="utf-8")
    print(f"wrote {len(ERRORS)} error pages + hub + sitemap")


if __name__ == "__main__":
    main()

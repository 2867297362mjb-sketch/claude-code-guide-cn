# Claude Code 国内使用指南（2026 版）

> **在线工具**：[指南网页版](https://2867297362mjb-sketch.github.io/claude-code-guide-cn/) · [Claude Code 账单计算器](https://2867297362mjb-sketch.github.io/claude-code-guide-cn/calculator/)（估算月花费，或本地解析会话文件看缓存命中率） · [配置生成器](https://2867297362mjb-sketch.github.io/claude-code-guide-cn/config/)（一键生成环境变量 / settings.json）

Claude Code 国内如何使用、第三方 API 怎么配、模型 ID 怎么填、账单为什么比预期高、报错怎么查，这一页按顺序讲清楚。内容对应 Claude Code 2.1.284，数据截至 2026 年 10 月。

## 一句话答案

装好 **Node.js 22+** 和 **Claude Code**，把 `ANTHROPIC_BASE_URL` 指向一个支持 Anthropic 原生协议的 API 平台，Key 填进 `ANTHROPIC_AUTH_TOKEN`，就能用。真正决定体验和账单的是另外两件事：**钉住模型 ID**，**别让缓存断掉**。

```bash
npm i -g @anthropic-ai/claude-code                      # 需要 Node.js 22+
export ANTHROPIC_BASE_URL=https://api.teamorouter.com   # 换成你的平台地址，不要带 /v1
export ANTHROPIC_AUTH_TOKEN=你的Key
export ANTHROPIC_MODEL=claude-opus-5-5
claude
```

上面只在当前终端生效。永久生效、Windows、`settings.json` 写法和一键脚本见 [第 3 节](#3-5-分钟配置)。

> **利益相关**：本仓库由 [TeamoRouter](https://teamorouter.com/?utm_source=github&utm_medium=guide&utm_campaign=cc_guide_cn) 团队维护，示例地址用的是我们的，[第 9 节](#9-推荐的-api-来源)把它列为推荐来源之一。所有配置对任何支持 Anthropic 原生协议的平台通用，换成你自己的地址和 Key 即可。

## 目录

1. [几种用法怎么选](#1-几种用法怎么选)
2. [安装 Claude Code](#2-安装-claude-code)
3. [5 分钟配置](#3-5-分钟配置)：macOS / Linux、Windows、settings.json、一键脚本
4. [钉住模型别名](#4-钉住模型别名)
5. [省钱：账单主要看缓存](#5-省钱账单主要看缓存)
6. [常见报错](#6-常见报错)
7. [其他工具接入](#7-其他工具接入)：cc-switch、WorkBuddy、CodeBuddy、OpenCode
8. [验货清单](#8-验货清单)
9. [推荐的 API 来源](#9-推荐的-api-来源)
10. [常见问题](#10-常见问题)

## 1. 几种用法怎么选

| 方式 | 怎么接入 Claude Code | 优点 | 缺点 | 适合 |
|---|---|---|---|---|
| 官方订阅（Pro / Max） | 启动后 `/login` | 官方渠道；包月，花多少心里有数 | 需要支持地区的账号和付款方式；有用量上限，用满要等 | 有海外账号和支付方式的个人 |
| 官方 API（Claude Console） | `ANTHROPIC_API_KEY` | 官方渠道；按量计费，用多少付多少 | 同样需要支持地区的账号和付款方式；按官方价 | 有海外主体的团队 |
| 云厂商（AWS Bedrock / Google Vertex AI） | `CLAUDE_CODE_USE_BEDROCK=1` 或 `CLAUDE_CODE_USE_VERTEX=1`，细节见官方文档 | 企业合规好处理，走现有云账单 | 需要海外区域的云账号；权限和配额配置较繁琐 | 已有海外云账号的企业 |
| 免费 / 公益站 | `ANTHROPIC_BASE_URL` + Key | 零成本试用 | 额度和稳定性没保障；模型真伪、数据去向难核实；可能随时关停 | 先体验一下 |
| 付费第三方 API 平台 | `ANTHROPIC_BASE_URL` + Key | 国内网络可直连；价格通常低于官方；付款方便 | 不是官方渠道，代码和对话经过第三方；质量参差，要自己验货；有的只给 OpenAI 兼容接口，吃不到缓存 | 国内个人和团队 |

几点说明：

- Anthropic 官方服务的支持地区不包括中国大陆。官方订阅和官方 API 都需要在支持地区注册、付款，并且能稳定访问 Anthropic 的服务。
- 第三方平台，不论免费还是付费，都**不是 Anthropic 官方渠道**。你发给 Claude Code 的代码和对话会经过平台方的服务器。敏感代码先看清平台的数据政策，或者走官方、云厂商渠道。
- 第三方平台之间差别最大的是三件事：有没有 Anthropic 原生协议（决定能不能吃到缓存）、给的是不是你请求的模型、缓存读怎么计价。[第 8 节](#8-验货清单)有验货方法。

## 2. 安装 Claude Code

1. 安装 [Node.js](https://nodejs.org/zh-cn/download/) 22 或更新版本，终端里 `node -v` 确认。
2. Windows 另外安装 [Git for Windows](https://git-scm.com/download/win)。
3. 安装 Claude Code：

   ```bash
   npm i -g @anthropic-ai/claude-code
   ```

   npm 下载慢，可以临时指定国内镜像：

   ```bash
   npm i -g @anthropic-ai/claude-code --registry=https://registry.npmmirror.com
   ```

4. `claude --version` 确认版本。**Sonnet 5.5 需要 2.1.284 以上**，旧版本先执行 `claude update`，或重新跑一遍上面的 npm 命令。

> macOS / Linux 安装时报 `EACCES` 权限错误，建议用 nvm 这类版本管理器重装 Node，不要给 npm 加 sudo。

## 3. 5 分钟配置

下面三种写法选**一种**，不要混用：

| 写法 | 适合 | 说明 |
|---|---|---|
| [3.1 shell 环境变量](#31-macos--linux写进-shell-配置) | macOS / Linux 终端用户 | 从终端启动的程序都能读到 |
| [3.2 Windows 用户环境变量](#32-windowspowershell) | Windows | 新开的终端才生效 |
| [3.3 `~/.claude/settings.json`](#33-settingsjson推荐三平台通用) | 三个平台通用，**推荐** | Claude Code 自己读取，不依赖从哪个终端启动 |

> **优先级提醒**：同一个变量既在系统 / 终端环境变量里、又在 `settings.json` 的 `env` 里时，**环境变量优先**（Claude Code 2.1.284 实测）。改了 `settings.json` 不生效，多半是 `~/.zshrc` 或 Windows 用户环境变量里还留着旧值。

### 3.1 macOS / Linux：写进 shell 配置

先把下面的「你的Key」换成自己的，再整段粘贴到终端：

```bash
cat >> ~/.zshrc <<'EOF'
# ---- Claude Code ----
unset ANTHROPIC_API_KEY
export ANTHROPIC_BASE_URL=https://api.teamorouter.com
export ANTHROPIC_AUTH_TOKEN=你的Key
export ANTHROPIC_MODEL=claude-opus-5-5
export ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-5-5
export ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-5-5
export ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-4-5
EOF
source ~/.zshrc
```

用 bash 的把 `~/.zshrc` 换成 `~/.bashrc`，`echo $SHELL` 可以看自己用的是哪个。

### 3.2 Windows：PowerShell

```powershell
setx ANTHROPIC_BASE_URL "https://api.teamorouter.com"
setx ANTHROPIC_AUTH_TOKEN "你的Key"
setx ANTHROPIC_MODEL "claude-opus-5-5"
setx ANTHROPIC_DEFAULT_OPUS_MODEL "claude-opus-5-5"
setx ANTHROPIC_DEFAULT_SONNET_MODEL "claude-sonnet-5-5"
setx ANTHROPIC_DEFAULT_HAIKU_MODEL "claude-haiku-4-5"
# 删掉以前留下的 ANTHROPIC_API_KEY（没有也不会报错）
[Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", $null, "User")
```

- `setx` 写的是用户级环境变量，**当前窗口不生效**。关掉 PowerShell 重新打开，再运行 `claude`。
- 在 VS Code 内置终端里用的，要重启整个 VS Code 才会读到新变量。
- 只想在当前窗口临时试一下：

  ```powershell
  $env:ANTHROPIC_BASE_URL = "https://api.teamorouter.com"
  $env:ANTHROPIC_AUTH_TOKEN = "你的Key"
  ```

### 3.3 settings.json（推荐，三平台通用）

文件位置：macOS / Linux 是 `~/.claude/settings.json`，Windows 是 `C:\Users\<用户名>\.claude\settings.json`。

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.teamorouter.com",
    "ANTHROPIC_AUTH_TOKEN": "你的Key",
    "ANTHROPIC_MODEL": "claude-opus-5-5",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-5-5",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-5-5",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-haiku-4-5",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  }
}
```

- 文件已经存在时，只把这几项合并进 `env`，**不要整个覆盖**，里面可能有你的权限、hooks 等设置。下面的一键脚本会自动备份再合并。
- 值一律写成带引号的字符串。
- Key 只放在用户目录下的 `~/.claude/settings.json`。项目里的 `.claude/settings.json` 通常会提交进仓库，不要往里写 Key。
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` 是可选项，用来关掉遥测、错误上报这类非必要请求。它同时会关掉自动更新，开了以后记得隔段时间手动 `claude update`。

### 3.4 一键脚本

克隆本仓库后运行：

```bash
# macOS / Linux / WSL
bash scripts/setup.sh
```

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

脚本会问三件事：Base URL（直接回车用 `https://api.teamorouter.com`，换成任何 Anthropic 兼容地址都行）、Key（输入不显示）、主模型。然后写进 `~/.claude/settings.json` 的 `env`：

- 已有 `settings.json` 时先备份为 `settings.json.bak.<时间戳>`，再用 python3 或 node 只合并 `env` 里的几个键，其它字段一个不动；
- python3 和 node 都没有时，只打印需要手动添加的 JSON，不改任何文件；
- 不在屏幕上打印 Key。

细节见 [scripts/README.md](scripts/README.md)。

### 3.5 验证是否配好

1. 新开终端运行 `claude`，不再要求登录 Anthropic 账号，说明 Key 已被读到。
2. 输入 `/status`，`Anthropic base URL` 一项应该是你填的地址。
3. 输入 `/model`，opus / sonnet / haiku 应该指向你钉住的 ID。
4. 随便问一句，能正常回复就通了。

## 4. 钉住模型别名

Claude Code 里的 `opus`、`sonnet`、`haiku` 是别名。不钉住时，它按自己版本内置的默认 ID 去请求；平台没有这个 ID 就报 400 / 404，或者落到旧模型上。

| 变量 | 作用 | 建议值 |
|---|---|---|
| `ANTHROPIC_MODEL` | 启动时默认用的模型 | `claude-opus-5-5` |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | `/model` 里 opus 指向的 ID | `claude-opus-5-5` |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | sonnet 指向的 ID | `claude-sonnet-5-5` |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | haiku 指向的 ID。Claude Code 用它做会话标题、摘要这类后台小任务，**最容易被忽略** | `claude-haiku-4-5` |
| `CLAUDE_CODE_SUBAGENT_MODEL` | 子代理用的模型 | `claude-sonnet-5-5`（省钱，见第 5 节） |

常用模型 ID 和官方价（美元 / 每百万 token）：

| 模型 | 模型 ID | 输入 / 输出 | 缓存读 | 说明 |
|---|---|---|---|---|
| Opus 5.5 | `claude-opus-5-5` | $4 / $20 | $0.20 | 主力：规划、难题、长链路任务 |
| Sonnet 5.5 | `claude-sonnet-5-5` | $2 / $10 | $0.10 | 单价是 Opus 5.5 的一半，适合子代理和日常；需 Claude Code 2.1.284+ |
| Fable 5.1 | `claude-fable-5-1` | 以平台价格页为准 | | 用的话加一行 `ANTHROPIC_DEFAULT_FABLE_MODEL=claude-fable-5-1` |
| Haiku 5.5 | `claude-haiku-5-5` | 以平台价格页为准 | | 轻量任务 |
| Haiku 4.5 | `claude-haiku-4-5` | 以平台价格页为准 | | 适合钉给 haiku 别名 |
| Opus 5（上一代） | 以平台模型列表为准 | $5 / $25 | | 官方价比 Opus 5.5 高，不建议新用 |

注意三点：

- ID 用短横线：`claude-opus-5-5`，不是 `claude-opus-5.5`。
- 不同平台的 ID 可能有差异，以平台的模型列表为准。
- 新模型要新版本客户端才认，`claude --version` 看一眼，旧了先升级。

## 5. 省钱：账单主要看缓存

### 5.1 钱花在哪：20.6 万次真实请求

> 数据来源：TeamoRouter 平台 2026 年 10 月 7 日至 13 日，Claude Code 客户端的成功请求。金额按 Anthropic **官方价**折算，与任何平台的实际售价无关。

| | Opus 5.5 | Opus 5 |
|---|---|---|
| 用户数 | 399 | 62 |
| 请求数 | 约 20.6 万 | |
| 每次请求平均花费（官方价折算） | $0.179 | $0.283 |
| 平均输出 | 2,110 token | 1,514 token |
| 平均上下文 | 约 24 万 token | |
| 缓存读占全部输入 | 92.1% | |

两个结论：

1. **账单的大头是每一轮重发的上下文，缓存命中率决定账单。** Claude Code 每一轮都会把系统提示、CLAUDE.md、工具定义和历史对话整段重发。平均约 24 万 token 的上下文里，92.1% 按缓存读计价，而缓存读只要输入价的 5%。粗算一下：这 24 万 token 如果全按 Opus 5.5 的输入价 $4 / 百万计，光输入就是 $0.96，是实际平均每次 $0.179 的五倍多。
2. **新模型不一定更贵。** Opus 5.5 的官方价低于 Opus 5，每次请求的平均花费也更低（两组用户和任务不同，仅作参考）。还在用 Opus 5 的，把别名钉到 `claude-opus-5-5` 是最省事的一步。

### 5.2 七个省钱习惯

1. **会话中途别改 CLAUDE.md，别增删 MCP 工具。** 重发内容的开头一变，下一轮整段都按全价输入算。要改，在开新会话之前改好。
2. **一个会话只用一个模型。** 缓存按模型分开，`/model` 来回切，每次切完的第一轮都是全价。不同的活开不同的会话，或者交给子代理。
3. **haiku 别名钉一个便宜的小模型**：`ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-4-5`。不设的话，后台小任务会去请求平台可能没有的 ID，表现为偶发报错。
4. **子代理用 Sonnet 5.5，主线程用 Opus 5.5。** 搜代码、跑测试、读日志这类子任务交给 Sonnet 5.5，单价只有 Opus 5.5 的一半：

   ```bash
   export CLAUDE_CODE_SUBAGENT_MODEL=claude-sonnet-5-5
   ```

5. **思考档按任务调，不要常驻最高档。** 思考 token 按输出价计费。改一行配置这类小活用 low / medium 就够；重构、疑难 bug 再开 high 以上。可以在会话里用 `/effort` 调，启动时用 `claude --effort medium`，或在 `settings.json` 里写 `"effortLevel": "medium"` 作为默认值。档位有 low、medium、high、xhigh、max，尽量在会话开始时选好。
6. **及时 `/compact`，任务做完就 `/clear` 或开新会话。** 上下文越长，每一轮重发的 token 越多，即使大部分命中缓存也会反映在账单上。
7. **长时间、多轮的编码任务，放在走 Anthropic 原生协议的工具里做**，原因见下一小节。

### 5.3 协议决定缓存：OpenAI 兼容接入要多算一笔

Claude 的提示缓存是 Anthropic 原生协议（`/v1/messages`）的能力。WorkBuddy、CodeBuddy 和 OpenCode 桌面版的自定义模型只支持 OpenAI 兼容协议，走这条路调 Claude 通常吃不到缓存。

我们平台的数据：WorkBuddy 通过 OpenAI 兼容协议调用 Claude，**缓存命中 0%，每次请求平均 $0.55**（官方价折算）；对比上面 Claude Code 走原生协议调用 Opus 5.5 是每次 $0.179。两边的任务不一样，不能一比一换算，但方向很清楚：

- 短对话、一次性的小任务，在这些工具里用 Claude 问题不大；
- 长时间、多轮的编码任务放到 Claude Code 里做；
- 在这些工具里尽量常开新对话，别让一个会话无限变长。

### 5.4 自查：缓存有没有断

- 响应 `usage` 里的 `cache_read_input_tokens`：长会话里它应该远大于 `input_tokens`。
- 平台账单逐条看缓存读数量。突然掉到 0 的那几条，往前找你做了什么操作（改了 CLAUDE.md、切了模型、加了 MCP 工具）。

## 6. 常见报错

每条报错的原文、原因和排查步骤，见站点上的 [报错速查](https://2867297362mjb-sketch.github.io/claude-code-guide-cn/errors/)（Unable to connect、403、401、529、thinking 签名 400、模型不存在、429、404 等）。

| 现象 | 常见原因 | 怎么办 |
|---|---|---|
| 启动后仍要求登录 Anthropic 账号 | 环境变量没被读到 | 新开终端；VS Code 内置终端要重启整个 VS Code；或者改用 settings.json |
| 改了 settings.json 不生效 | 系统 / 终端环境变量里有同名旧值，优先级更高 | macOS / Linux：`env \| grep ^ANTHROPIC_ \| cut -d= -f1` 列出变量名，到 `~/.zshrc` 等文件里删掉；Windows：`(Get-ChildItem Env:ANTHROPIC*).Name` |
| 401 / Invalid API key | Key 复制不全或多了空格；机器上还留着旧的 `ANTHROPIC_API_KEY` | 重新复制 Key；`unset ANTHROPIC_API_KEY`，只保留 `ANTHROPIC_AUTH_TOKEN` |
| 404 | `ANTHROPIC_BASE_URL` 多写了 `/v1` | 只写到域名，Claude Code 会自己拼 `/v1/messages` |
| 400 / 模型不存在 | ID 写成了点号；客户端太旧不认新模型；平台没有这个 ID | 用短横线 `claude-opus-5-5`；`claude update`；对照平台模型列表 |
| 偶发报错，会话标题、摘要生成失败 | `haiku` 别名没钉住，后台小任务请求了平台没有的 ID | 设置 `ANTHROPIC_DEFAULT_HAIKU_MODEL` |
| 长任务转了很久后断开 | 高思考档在第一个字出来前可能要想好几分钟，客户端、公司代理、网关任何一层超时都会断 | 调大 `API_TIMEOUT_MS`（单位毫秒）；让网管放宽代理对流式请求的读超时；或调低思考档 |
| 账单比预期高很多 | 缓存断了 | 见 [第 5 节](#5-省钱账单主要看缓存) |
| 402 / 余额不足 | 平台余额用完 | 充值后重试 |
| 429 | 请求太快或触发平台限流 | 稍等重试；持续出现就联系平台 |
| npm 安装或启动时报语法错误、引擎版本不符 | Node.js 低于 22 | 升级 Node.js |
| WorkBuddy / CodeBuddy 报 404 | 接口地址路径不对 | WorkBuddy 写到 `/v1`；CodeBuddy 写完整的 `/v1/chat/completions` |

## 7. 其他工具接入

### 7.1 cc-switch：图形界面切换供应商

[cc-switch](https://github.com/farion1231/cc-switch) 是开源桌面应用，把 Claude Code、Claude Desktop、Codex 等工具的供应商配置放在一个面板里管理，适合在官方账号和第三方平台之间来回切换的人。

1. 安装 v3.16.5 及以上：macOS 用 `brew install --cask cc-switch`，其他平台到 [Releases](https://github.com/farion1231/cc-switch/releases) 下载。
2. 顶部切到 Claude Code，点右上角加号添加供应商。预设里已内置 TeamoRouter；用其他平台就选「自定义配置」，请求地址同样不带 `/v1`。
3. 填 Key，保存，在供应商卡片上点「启用」，然后重开 Claude Code。

另一个选择是 [Claude Code Router](https://github.com/musistudio/claude-code-router)：开源的本地路由工具，可以按任务类型把 Claude Code 的请求分给不同模型，也内置了 TeamoRouter 预设，用法见它的仓库说明。

### 7.2 WorkBuddy

1. 点左下角账号图标 → 设置 → 模型 → 添加模型，提供商选「自定义」。
2. 接口地址填 `https://api.teamorouter.cn/v1`（其他平台填它的 OpenAI 兼容地址），API 密钥填你的 Key，其他保持默认。
3. 模型名称填 `claude-opus-5-5`、`claude-sonnet-5-5` 或 `claude-haiku-5-5`，保存后在对话里选它。

WorkBuddy 只支持 OpenAI 兼容协议，Claude 的缓存用不上，成本见 [5.3](#53-协议决定缓存openai-兼容接入要多算一笔)。

### 7.3 CodeBuddy

先把 Key 写进环境变量 `TEAMOROUTER_API_KEY`，再编辑 `~/.codebuddy/models.json`（项目级放在 `<项目根目录>/.codebuddy/models.json`，优先级更高）：

```json
{
  "models": [
    {
      "id": "claude-opus-5-5",
      "name": "Claude Opus 5.5",
      "vendor": "Anthropic",
      "apiKey": "${TEAMOROUTER_API_KEY}",
      "url": "https://api.teamorouter.cn/v1/chat/completions",
      "maxInputTokens": 1000000,
      "supportsToolCall": true,
      "supportsImages": true,
      "supportsReasoning": true
    }
  ],
  "availableModels": ["claude-opus-5-5"]
}
```

- `url` 必须写完整路径，以 `/chat/completions` 结尾，只写到 `/v1` 会失败。
- `apiKey` 支持 `${环境变量名}`，不用把 Key 明文写进文件；改了环境变量要重开终端。
- 保存后自动生效，用 `/model` 切换，或 `codebuddy --model claude-opus-5-5` 启动。
- 同样只走 OpenAI 兼容协议，长任务建议放到 Claude Code。

### 7.4 OpenCode

OpenCode 桌面版：设置 → 服务器 → 提供商 → 自定义提供商，点「连接」：

- 提供商 ID：`teamorouter`；显示名称随意
- 基础 URL：`https://api.teamorouter.cn/v1`
- API 密钥：你的 Key
- 模型：点「添加模型」，填模型 ID 和显示名称

自定义提供商走的是 OpenAI 兼容协议，Claude 会丢缓存，长任务不建议在这里跑 Claude。OpenCode 的配置文件能否改走 Anthropic 原生协议，本指南还没有实测，欢迎 PR 补充。

## 8. 验货清单

选第三方平台前，逐条过一遍：

- [ ] 提供 Anthropic 原生协议地址，Claude Code 直接填进 `ANTHROPIC_BASE_URL` 能用，而不是只有 OpenAI 兼容接口
- [ ] 响应里的 `model` 字段就是你请求的 ID
- [ ] 账单逐条可查，输入、缓存读、输出分开列
- [ ] 缓存读单价是官方比例（Opus 5.5、Sonnet 5.5 是输入价的 5%）；长会话里缓存读数量远大于普通输入
- [ ] 先小额充值，跑一两天真实任务再决定
- [ ] 用同一个固定 prompt 隔几天测一次，输出长度、思考 token 数大幅波动就要警惕
- [ ] 看清是不是官方渠道、数据怎么处理、余额能不能退

快速看一眼 `model` 和 `usage`（macOS / Linux，沿用第 3 节设好的环境变量）：

```bash
curl -s "$ANTHROPIC_BASE_URL/v1/messages" \
  -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-opus-5-5","max_tokens":64,"messages":[{"role":"user","content":"你好"}]}' \
  | python3 -m json.tool
```

## 9. 推荐的 API 来源

> **利益相关**：本仓库由 TeamoRouter 团队维护，下面的 TeamoRouter 是我们自己的产品。排序按合规程度和官方程度，不按利益。

1. **能用官方就用官方。** 有支持地区的账号和付款方式，Claude 订阅或官方 API 最省心。
2. **企业已有海外云账号**：AWS Bedrock 或 Google Vertex AI，合规和发票最好处理。
3. **TeamoRouter**（利益相关）
   - Anthropic 原生协议地址：`https://api.teamorouter.com`，国内也可以用 `https://api.teamorouter.cn`；WorkBuddy 这类 OpenAI 兼容工具用 `https://api.teamorouter.cn/v1`
   - Opus 5.5 约为官方价的 2.8 折，价格随渠道成本小幅浮动，以价格页为准
   - 按量计费，没有包月
   - 不是 Anthropic 官方渠道
   - cc-switch、Claude Code Router 已内置 TeamoRouter 预设
   - 接入文档：<https://teamorouter.com/docs/api-integration?utm_source=github&utm_medium=guide&utm_campaign=cc_guide_cn>
4. **其他第三方平台**：用 [第 8 节](#8-验货清单) 的清单自己测，先小额充值。

## 10. 常见问题

**国内能直接用官方的 Claude 订阅吗？**

官方支持地区不包括中国大陆，需要支持地区的账号、付款方式，以及能稳定访问 Anthropic 服务的网络。条件不具备时可以用第三方 API 平台，但要接受它不是官方渠道。

**用第三方平台还要开代理吗？**

看平台。平台在国内能直连，Claude Code 的模型请求就不需要代理。Claude Code 还会访问遥测、更新相关的地址，可以设 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` 关掉，代价是要手动 `claude update`。

**`ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_API_KEY` 有什么区别？**

请求头不同：`ANTHROPIC_AUTH_TOKEN` 发 `Authorization: Bearer`，`ANTHROPIC_API_KEY` 发 `x-api-key`。两个同时设，或者机器上留着以前官方账号的 `ANTHROPIC_API_KEY`，容易出现「填了新 Key 用的却是旧 Key」。只留一个，推荐 `ANTHROPIC_AUTH_TOKEN`。

**Opus 5.5 和 Sonnet 5.5 怎么搭配？**

主线程用 Opus 5.5 做规划和难题，子代理用 Sonnet 5.5（`CLAUDE_CODE_SUBAGENT_MODEL`），单价是 Opus 5.5 的一半。上一代 Opus 5 的官方价反而更高，没有特别原因不必继续用。

**Claude Code 说自己是另一个模型，是不是被换了？**

模型对自己身份的描述并不可靠，看响应里的 `model` 字段和账单更准。另外后台小任务本来就走 haiku 别名，日志里出现小模型是正常的。

**VS Code、JetBrains 里的 Claude Code 怎么配？**

写进 `~/.claude/settings.json` 最省事。用环境变量的话，改完要重启整个 IDE 才能读到。

**官方账号和第三方 Key 能来回切吗？**

能。最省事的是用 [cc-switch](#71-cc-switch图形界面切换供应商) 管理，切换时不用手改变量。

**Key 泄露了怎么办？**

马上到平台控制台删除旧 Key、新建一个。再检查有没有把 Key 写进项目里的 `.claude/settings.json`、`.env` 并提交进了仓库。

## 贡献与勘误

- 价格和数据截至 2026 年 10 月。Claude Code 更新很快，发现过时或错误的内容，欢迎提 Issue 或 PR。
- 请附上可验证的依据：Claude Code 版本号、复现步骤或官方文档链接。
- 在第 9 节新增推荐来源，请附上第 8 节验货清单的实测结果，并写明利益关系。

## License

[MIT](LICENSE)

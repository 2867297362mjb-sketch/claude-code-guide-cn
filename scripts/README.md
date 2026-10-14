# 一键配置脚本

把 Claude Code 的第三方 API 配置写进 `~/.claude/settings.json` 的 `env` 字段。

| 脚本 | 平台 | 运行方式 |
|---|---|---|
| `setup.sh` | macOS / Linux / WSL（兼容 macOS 自带的 bash 3.2） | `bash scripts/setup.sh` |
| `setup.ps1` | Windows PowerShell 5.1+ / PowerShell 7+ | `powershell -ExecutionPolicy Bypass -File scripts\setup.ps1` |

## 会问什么

1. **Base URL**：直接回车使用 `https://api.teamorouter.com`，填任何支持 Anthropic 原生协议的地址都可以。末尾多写的 `/` 和 `/v1` 会被自动去掉。
2. **API Key**：输入时不显示。
3. **主模型**：直接回车使用 `claude-opus-5-5`。

## 写入哪些键

| 键 | 值 |
|---|---|
| `ANTHROPIC_BASE_URL` | 你输入的地址 |
| `ANTHROPIC_AUTH_TOKEN` | 你输入的 Key |
| `ANTHROPIC_MODEL` | 你输入的主模型 |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | `claude-opus-5-5` |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | `claude-sonnet-5-5` |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | `claude-haiku-4-5` |

想改别名指向的模型，直接编辑脚本开头的常量，或者跑完后手动改 `settings.json`。

## 安全约定

- **先备份**：`settings.json` 已存在时，先复制为 `settings.json.bak.<时间戳>`（如 `settings.json.bak.20261014-153000`），再改。
- **只合并、不删除**：只更新 `env` 里上表这几个键，其它字段（`permissions`、`hooks`、`model` 等）和 `env` 里的其它变量原样保留。
- **合并工具**：`setup.sh` 优先用 python3，没有就用 node；`setup.ps1` 优先用 node，没有就用 Python 3。两者都没有时，只打印需要手动添加的 JSON（Key 用占位符代替），不改任何文件，退出码 2。
- **原文件有问题就停下**：`settings.json` 不是合法 JSON（比如带注释、多余逗号）、顶层不是对象、或者 `env` 不是对象时，不做任何修改，提示你修好后重跑。
- **不泄露 Key**：Key 输入不回显，不打印到屏幕，只通过环境变量传给合并用的 python3 / node 子进程，不出现在命令行参数里。写入后 `settings.json` 和备份文件的权限设为仅本人可读写（macOS / Linux）。
- **写入方式**：先写临时文件再整体替换，避免写到一半留下损坏的文件；`settings.json` 是软链接时，写入软链接指向的真实文件。

## 两个提醒

- **环境变量优先于 settings.json**（Claude Code 2.1.284 实测）。脚本发现终端里、`~/.zshrc` 等 shell 配置文件里或 Windows 用户环境变量里已经有 `ANTHROPIC_*` 时会提示你，但不会替你删。
- `settings.json` 的 `env` 里已有 `ANTHROPIC_API_KEY` 时，脚本会提醒你手动删掉，避免和 `ANTHROPIC_AUTH_TOKEN` 同时存在。

## 退出码

| 退出码 | 含义 |
|---|---|
| 0 | 写入成功 |
| 1 | 输入不合法，或 `settings.json` 无法安全合并（原文件未改动） |
| 2 | 没有 python3 / node，只打印了手动配置的 JSON |

## 恢复

把备份文件改回原名即可，例如：

```bash
cp ~/.claude/settings.json.bak.20261014-153000 ~/.claude/settings.json
```

> 说明：`setup.sh` 已在 macOS（bash 3.2）下用临时 HOME 自测通过；`setup.ps1` 目前只做过人工审查，**还没有在 Windows 上实际运行过**，用之前请先备份 `%USERPROFILE%\.claude\settings.json`，遇到问题欢迎提 issue。

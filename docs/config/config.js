/*
 * Claude Code 配置生成器。
 * Key 只存在于输入框和内存里的生成文本中：不发请求（页面 CSP connect-src 'none'）、不写 URL、不写任何浏览器存储。
 */
(function () {
  'use strict';

  var DEFAULT_BASE = 'https://api.teamorouter.com';
  var KEY_PLACEHOLDER = '你的Key';
  var fullText = ''; // 含完整 Key 的文本，仅供复制按钮使用

  function $(id) {
    return document.getElementById(id);
  }

  function radio(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }

  // ---------- 输入校验 ----------

  function normalizeBase(raw, warn) {
    var v = (raw || '').trim();
    if (!v) {
      warn('Base URL 为空，已使用默认地址 ' + DEFAULT_BASE + '。');
      return DEFAULT_BASE;
    }
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) {
      v = 'https://' + v;
      warn('Base URL 缺少 https://，已自动补上。');
    }
    var url;
    try {
      url = new URL(v);
    } catch (e) {
      warn('Base URL 看起来不是合法网址，请检查。', true);
      return v;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      warn('Base URL 只能是 http 或 https 地址。', true);
    }
    if (url.search || url.hash) {
      warn('Base URL 不需要 ? 或 # 后面的参数，已去掉。');
    }
    var path = url.pathname.replace(/\/+$/, '');
    var stripped = path.replace(/\/v1(\/messages)?$/i, '');
    if (stripped !== path) {
      warn('ANTHROPIC_BASE_URL 不要带 ' + path.slice(stripped.length) + '，Claude Code 会自己拼 /v1/messages，已自动去掉。');
    }
    if (url.protocol === 'http:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname)) {
      warn('这是明文 http 地址，Key 会在网络上明文传输，建议用 https。');
    }
    return url.protocol + '//' + url.host + stripped;
  }

  function normalizeModel(label, raw, warn) {
    var v = (raw || '').trim();
    if (!v) return '';
    if (/\s/.test(v)) {
      warn(label + ' 的模型 ID 里有空格，请检查。', true);
    }
    if (/\d\.\d/.test(v) && !/[:/]/.test(v)) {
      warn(label + ' 的模型 ID「' + v + '」用了点号。Claude 模型 ID 一般用短横线，例如 ' +
        v.replace(/(\d)\.(\d)/g, '$1-$2') + '，以平台模型列表为准。');
    }
    return v;
  }

  // ---------- 各写法生成 ----------

  function shQuote(v) {
    return /^[A-Za-z0-9_\-.:\/@%+=,]+$/.test(v) ? v : "'" + v.replace(/'/g, "'\\''") + "'";
  }

  function psQuote(v) {
    return "'" + v.replace(/'/g, "''") + "'";
  }

  function buildEnv(cfg) {
    var env = [
      ['ANTHROPIC_BASE_URL', cfg.base],
      ['ANTHROPIC_AUTH_TOKEN', cfg.key]
    ];
    if (cfg.model) env.push(['ANTHROPIC_MODEL', cfg.model]);
    if (cfg.opus) env.push(['ANTHROPIC_DEFAULT_OPUS_MODEL', cfg.opus]);
    if (cfg.sonnet) env.push(['ANTHROPIC_DEFAULT_SONNET_MODEL', cfg.sonnet]);
    if (cfg.haiku) env.push(['ANTHROPIC_DEFAULT_HAIKU_MODEL', cfg.haiku]);
    if (cfg.sub) env.push(['CLAUDE_CODE_SUBAGENT_MODEL', cfg.sub]);
    if (cfg.quiet) env.push(['CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', '1']);
    return env;
  }

  function genSettings(env) {
    var obj = {};
    env.forEach(function (kv) { obj[kv[0]] = kv[1]; });
    return JSON.stringify({ env: obj }, null, 2);
  }

  function genUnix(env, shell) {
    var rc = shell === 'bash' ? '~/.bashrc' : '~/.zshrc';
    var lines = ['cat >> ' + rc + " <<'EOF'", '# ---- Claude Code ----', 'unset ANTHROPIC_API_KEY'];
    env.forEach(function (kv) { lines.push('export ' + kv[0] + '=' + shQuote(kv[1])); });
    lines.push('EOF', 'source ' + rc);
    return lines.join('\n');
  }

  function genWindows(env) {
    var lines = env.map(function (kv) { return 'setx ' + kv[0] + ' ' + psQuote(kv[1]); });
    lines.push('# 删掉以前留下的 ANTHROPIC_API_KEY（没有也不会报错）');
    lines.push('[Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", $null, "User")');
    return lines.join('\n');
  }

  function maskKey(key) {
    if (key.length <= 12) return '********';
    return key.slice(0, 4) + '********' + key.slice(-4);
  }

  // ---------- 渲染 ----------

  function li(text, html) {
    var e = document.createElement('li');
    if (html) e.innerHTML = text; else e.textContent = text;
    return e;
  }

  function render() {
    var warnings = [];
    function warn(msg, isErr) { warnings.push({ msg: msg, err: !!isErr }); }

    var os = radio('os') || 'settings';
    var shell = radio('shell') || 'zsh';
    $('g-shell').hidden = os !== 'unix';

    var rawKey = $('c-key').value;
    var key = rawKey.trim();
    if (key !== rawKey && key) warn('Key 首尾有空格，已自动去掉。');
    if (/\s/.test(key)) warn('Key 中间有空格或换行，可能复制不完整，请重新复制。', true);
    var hasKey = key.length > 0;

    var cfg = {
      base: normalizeBase($('c-base').value, warn),
      key: hasKey ? key : KEY_PLACEHOLDER,
      model: normalizeModel('主模型', $('c-model').value, warn),
      opus: normalizeModel('Opus 别名', $('c-opus').value, warn),
      sonnet: normalizeModel('Sonnet 别名', $('c-sonnet').value, warn),
      haiku: normalizeModel('Haiku 别名', $('c-haiku').value, warn),
      sub: normalizeModel('子代理模型', $('c-sub').value, warn),
      quiet: $('c-quiet').checked
    };
    if (!cfg.haiku) warn('没有钉住 Haiku 别名：后台小任务可能请求平台没有的模型 ID，表现为会话标题、摘要偶发失败。');

    var env = buildEnv(cfg);
    var reveal = $('c-reveal').checked;
    // 预览默认遮住 Key：用遮罩后的 Key 单独生成一份展示文本，复制按钮用含完整 Key 的 fullText
    var shownEnv = hasKey && !reveal ? buildEnv(Object.assign({}, cfg, { key: maskKey(key) })) : env;
    var where = '';
    var next = [];
    var shown;
    if (os === 'settings') {
      fullText = genSettings(env);
      shown = genSettings(shownEnv);
      where = '写进 macOS / Linux 的 ~/.claude/settings.json，或 Windows 的 C:\\Users\\<用户名>\\.claude\\settings.json。文件已存在时，只把 env 里这几项合并进去，不要整个覆盖（里面可能有你的权限、hooks 等设置）。';
      next.push(li('Key 只放在用户目录下的 settings.json。项目里的 <code>.claude/settings.json</code> 通常会提交进仓库，不要往里写 Key。', true));
      next.push(li('系统 / 终端环境变量比 settings.json 优先。先确认没有同名旧变量，尤其是旧的 <code>ANTHROPIC_API_KEY</code>：macOS / Linux 运行 <code>env | grep ^ANTHROPIC_ | cut -d= -f1</code>，Windows 运行 <code>(Get-ChildItem Env:ANTHROPIC*).Name</code>，有的话到 <code>~/.zshrc</code> 或 Windows 用户环境变量里删掉。', true));
    } else if (os === 'unix') {
      var rc = shell === 'bash' ? '~/.bashrc' : '~/.zshrc';
      fullText = genUnix(env, shell);
      shown = genUnix(shownEnv, shell);
      where = '整段粘贴到终端运行，会追加到 ' + rc + ' 并立即生效。';
      next.push(li('如果 ' + rc + ' 里以前写过 ANTHROPIC_ 开头的配置，打开文件删掉旧的那几行，避免新旧打架。'));
    } else {
      fullText = genWindows(env);
      shown = genWindows(shownEnv);
      where = '整段粘贴到 PowerShell 运行。setx 写的是用户级环境变量，当前窗口不生效。';
      next.push(li('关掉 PowerShell 重新打开，再运行 claude。在 VS Code 内置终端里用的，要重启整个 VS Code。'));
    }
    next.push(li('新开终端运行 <code>claude</code>：不再要求登录 Anthropic 账号，说明 Key 已被读到。', true));
    next.push(li('输入 <code>/status</code>，Anthropic base URL 应该是 <code>' + escapeHtml(cfg.base) + '</code>；输入 <code>/model</code>，opus / sonnet / haiku 应该指向上面钉住的 ID。', true));
    if (cfg.quiet) next.push(li('开了关闭非必要流量后自动更新也会停掉，隔段时间手动运行 <code>claude update</code>。', true));
    if (hasKey) warn('生成的文本里有完整 Key，别贴进群聊、截图或提交到代码仓库。');
    else warn('还没填 Key，生成的配置里是占位符「' + KEY_PLACEHOLDER + '」，粘贴前记得换成自己的。');

    $('out-text').textContent = shown;
    $('c-reveal-wrap').hidden = !hasKey;
    $('out-where').textContent = where;

    var ul = $('c-warnings');
    ul.textContent = '';
    warnings.forEach(function (w) {
      var e = li(w.msg);
      if (w.err) e.className = 'err';
      ul.appendChild(e);
    });
    var ol = $('out-next');
    ol.textContent = '';
    next.forEach(function (e) { ol.appendChild(e); });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    // 有的浏览器会在返回 / 刷新时自动恢复输入框内容，Key 一律清空
    $('c-key').value = '';
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) {
        $('c-key').value = '';
        render();
      }
    });

    var inputs = document.querySelectorAll('main input');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].addEventListener('input', render);
      inputs[i].addEventListener('change', render);
    }

    $('c-key-toggle').addEventListener('click', function () {
      var k = $('c-key');
      var show = k.type === 'password';
      k.type = show ? 'text' : 'password';
      this.textContent = show ? '隐藏' : '显示';
      this.setAttribute('aria-pressed', show ? 'true' : 'false');
    });

    window.CCSite.attachCopy($('out-code'), function () { return fullText; });
    render();
  });
})();

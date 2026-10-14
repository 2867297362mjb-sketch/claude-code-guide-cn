/*
 * Claude 客户端（Claude Desktop 3P）Gateway 配置文件生成器。
 * Key 只存在于输入框和内存里：不发请求（CSP connect-src 'none'）、不写 URL、不写浏览器存储。
 * 输出 Anthropic 官方 bootstrap-config-v1 扁平格式，供 Configure Third-Party Inference → Import configuration 导入。
 */
(function () {
  'use strict';

  var DEFAULT_BASE = 'https://api.teamorouter.com';
  var KEY_PLACEHOLDER = 'YOUR_API_KEY';
  var fullText = '';

  function $(id) {
    return document.getElementById(id);
  }

  function normalizeBase(raw) {
    var v = (raw || '').trim();
    if (!v) return DEFAULT_BASE;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = 'https://' + v;
    v = v.replace(/\/+$/, '');
    v = v.replace(/\/v1$/i, '');
    return v;
  }

  function selectedModels() {
    var boxes = document.querySelectorAll('#w-models input[type="checkbox"]');
    var out = [];
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (!b.checked) continue;
      var entry = { name: b.value, anthropicFamilyTier: b.getAttribute('data-tier'), isFamilyDefault: true };
      if (b.getAttribute('data-1m') === '1') entry.supports1m = true;
      out.push(entry);
    }
    return out;
  }

  function build(maskKey) {
    var key = ($('w-key').value || '').trim();
    var schemeEl = document.querySelector('input[name="scheme"]:checked');
    var cfg = {
      $schemaVersion: 1,
      inferenceProvider: 'gateway',
      inferenceGatewayBaseUrl: normalizeBase($('w-base').value),
      inferenceCredentialKind: 'static',
      inferenceGatewayApiKey: key || KEY_PLACEHOLDER,
      inferenceGatewayAuthScheme: schemeEl ? schemeEl.value : 'bearer'
    };
    var models = selectedModels();
    if (models.length) cfg.inferenceModels = models;
    var text = JSON.stringify(cfg, null, 2);
    if (maskKey && key) {
      var masked = key.length > 10 ? key.slice(0, 6) + '…' + key.slice(-4) : '••••';
      text = text.replace(JSON.stringify(key), JSON.stringify(masked));
    }
    return text;
  }

  function render() {
    fullText = build(false);
    $('w-out').textContent = build(true);
  }

  function download() {
    render();
    var blob = new Blob([fullText + '\n'], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'claude-desktop-gateway.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  document.addEventListener('DOMContentLoaded', function () {
    ['w-base', 'w-key'].forEach(function (id) { $(id).addEventListener('input', render); });
    var inputs = document.querySelectorAll('#w-scheme input, #w-models input');
    for (var i = 0; i < inputs.length; i++) inputs[i].addEventListener('change', render);
    $('w-key-toggle').addEventListener('click', function () {
      var el = $('w-key');
      var show = el.type === 'password';
      el.type = show ? 'text' : 'password';
      this.textContent = show ? '隐藏' : '显示';
      this.setAttribute('aria-pressed', show ? 'true' : 'false');
    });
    $('w-download').addEventListener('click', download);
    if (window.CCSite) window.CCSite.attachCopy($('w-out-code'), function () { return fullText; });
    render();
  });
})();

/* 站点公用脚本：代码块复制按钮。不发任何网络请求。 */
(function () {
  'use strict';

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('copy failed'));
      } catch (e) {
        reject(e);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  function flash(btn, msg) {
    var old = btn.getAttribute('data-label') || btn.textContent;
    btn.setAttribute('data-label', old);
    btn.textContent = msg;
    clearTimeout(btn._t);
    btn._t = setTimeout(function () {
      btn.textContent = old;
    }, 1600);
  }

  /** 给 .code 里的 pre 加复制按钮；getText 可自定义复制内容（配置生成器用它复制含 Key 的原文） */
  function attachCopy(wrapper, getText) {
    var pre = wrapper.querySelector('pre');
    if (!pre || wrapper.querySelector('.copy-btn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = '复制';
    btn.addEventListener('click', function () {
      var text = getText ? getText() : pre.textContent;
      copyText(text).then(
        function () { flash(btn, '已复制'); },
        function () { flash(btn, '复制失败，请手动选择'); }
      );
    });
    wrapper.appendChild(btn);
  }

  window.CCSite = { copyText: copyText, attachCopy: attachCopy };

  document.addEventListener('DOMContentLoaded', function () {
    var blocks = document.querySelectorAll('.code:not([data-custom-copy])');
    for (var i = 0; i < blocks.length; i++) attachCopy(blocks[i]);
  });
})();

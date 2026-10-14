/* Claude Code 账单计算器页面逻辑。只向本站请求 pricing.json 和示例文件；用户选择的文件只在本地读取。 */
(function () {
  'use strict';

  var C = window.CCUsage;
  var DAYS_PER_MONTH = 30;
  var MAIN_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1', 'claude-haiku-5-5'];
  var MISS_LABEL = { write5m: '缓存写入 5 分钟', write1h: '缓存写入 1 小时', input: '普通输入' };

  var pricing = null;
  var priceMap = {};

  function $(id) {
    return document.getElementById(id);
  }

  // ---------- 格式化 ----------

  function usd(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    var abs = Math.abs(v);
    var digits = abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 3 : abs > 0 ? 4 : 2;
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function rate(v) {
    // 价格表里的单价，最多保留 4 位小数并去掉多余的 0
    return '$' + Number(v.toFixed(4)).toString();
  }

  function tokens(v) {
    if (v >= 1e8) return (v / 1e8).toFixed(2) + ' 亿';
    if (v >= 1e4) return (v / 1e4).toFixed(1) + ' 万';
    return Math.round(v).toLocaleString('en-US');
  }

  function pct(v) {
    return v === null || v === undefined ? '—' : (v * 100).toFixed(1) + '%';
  }

  function discount(ours, list) {
    if (!(list > 0) || !(ours >= 0)) return null;
    return (ours / list * 10).toFixed(1);
  }

  function dateStr(ts) {
    var d = new Date(ts);
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function stat(label, value, sub, cls) {
    var box = el('div', 'stat' + (cls ? ' ' + cls : ''));
    box.appendChild(el('div', 'label', label));
    box.appendChild(el('div', 'value', value));
    if (sub) box.appendChild(el('div', 'sub', sub));
    return box;
  }

  function readNum(id, min, max, fallback) {
    var v = parseFloat($(id).value);
    if (!isFinite(v)) return fallback;
    if (v < min) v = min;
    if (max !== undefined && v > max) v = max;
    return v;
  }

  // ---------- 价格 ----------

  function loadPricing() {
    return fetch('../data/pricing.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.models) || !data.models.length) throw new Error('价格数据为空');
        pricing = data;
        priceMap = C.indexPricing(data);
        var when = data.updated_at ? data.updated_at.replace('T', ' ').replace(/:\d\dZ$/, ' UTC') : '未知';
        $('price-meta').textContent = '价格数据每日同步（最近更新：' + when + '），以官网价格页为准。';
        renderPriceTable();
        // 价格表里没有的模型，从下拉框里去掉，避免算出空结果
        var sel = $('e-model');
        for (var i = sel.options.length - 1; i >= 0; i--) {
          if (!priceMap[sel.options[i].value]) sel.remove(i);
        }
      });
  }

  function renderPriceTable() {
    var tbody = $('price-tbody');
    tbody.textContent = '';
    var ids = MAIN_MODELS.filter(function (id) { return priceMap[id]; });
    pricing.models.forEach(function (m) {
      if (ids.indexOf(m.id) === -1) ids.push(m.id);
    });
    var tierNotes = [];
    ids.forEach(function (id) {
      var m = priceMap[id];
      var l = m.list_cost || {};
      var tr = el('tr');
      var td = el('td');
      td.appendChild(el('code', null, id));
      tr.appendChild(td);
      [l.input, l.output, l.cache_creation, l.cache_read].forEach(function (v) {
        tr.appendChild(el('td', 'num', typeof v === 'number' ? rate(v) : '—'));
      });
      var d = m.cost ? discount(m.cost.input, l.input) : null;
      tr.appendChild(el('td', 'num', d ? d + ' 折' : '—'));
      tbody.appendChild(tr);
      var t = m.context_tier_pricing;
      if (t && t.threshold_tokens) {
        tierNotes.push(id + '：单次上下文超过 ' + t.threshold_tokens.toLocaleString('en-US') + ' token 时，整次请求输入侧 ×' +
          t.input_multiplier + '、输出 ×' + t.output_multiplier + '。');
      }
    });
    $('price-tier-note').textContent = tierNotes.length ? '阶梯计价：' + tierNotes.join(' ') + ' 计算器已按此计算。' : '';
  }

  // ---------- 估算 ----------

  function estimate() {
    var model = priceMap[$('e-model').value];
    if (!model) return;
    var l = model.list_cost;
    $('e-model-price').textContent = '官方价：输入 ' + rate(l.input) + ' / 输出 ' + rate(l.output) + ' / 缓存读 ' +
      rate(l.cache_read) + '（每百万 token）';

    var reqs = readNum('e-req', 0, undefined, 0);
    var ctx = readNum('e-ctx', 0, undefined, 0);
    var hit = readNum('e-hit', 0, 100, 0) / 100;
    var out = readNum('e-out', 0, undefined, 0);
    var miss = $('e-miss').value;
    var tier = model.context_tier_pricing;

    var t = C.estimateTokens(ctx, hit, out, miss);
    var list = C.requestCost(t, l, tier);
    var broken = C.requestCost(C.estimateTokens(ctx, 0, out, miss), l, tier);
    var ours = model.cost ? C.requestCost(t, model.cost, tier) : null;

    $('r-list-month').textContent = usd(list.total * reqs * DAYS_PER_MONTH);
    $('r-list-sub').textContent = '每天 ' + usd(list.total * reqs) + ' · 每次 ' + usd(list.total);

    $('r-broken-month').textContent = usd(broken.total * reqs * DAYS_PER_MONTH);
    var times = list.total > 0 ? broken.total / list.total : null;
    $('r-broken-sub').textContent = '每天 ' + usd(broken.total * reqs) +
      (times && times >= 1.05 ? ' · 是正常的 ' + times.toFixed(1) + ' 倍' : '');

    if (ours) {
      var d = discount(ours.total, list.total);
      $('r-ours-label').textContent = '第三方平台价' + (d ? '（约 ' + d + ' 折）' : '') + ' · 每月';
      $('r-ours-month').textContent = usd(ours.total * reqs * DAYS_PER_MONTH);
      $('r-ours-sub').textContent = '每天 ' + usd(ours.total * reqs) + ' · 按 TeamoRouter 当前价';
      var save = (list.total - ours.total) * reqs * DAYS_PER_MONTH;
      $('e-save').textContent = usd(save);
      $('e-cta').hidden = !(save > 0);
    } else {
      $('r-ours-month').textContent = '—';
      $('r-ours-sub').textContent = '该模型暂无第三方价格数据';
      $('e-cta').hidden = true;
    }

    $('r-breakdown').textContent = '每次请求官方价拆分：缓存读 ' + usd(list.cacheRead) + '，没命中的输入 ' +
      usd(list.cacheWrite + list.input) + '（按' + MISS_LABEL[miss] + '），输出 ' + usd(list.output) + '。';

    var tierEl = $('r-tier');
    if (list.tiered) {
      tierEl.hidden = false;
      tierEl.textContent = '注意：单次上下文超过 ' + tier.threshold_tokens.toLocaleString('en-US') + ' token，该模型整次请求输入侧按 ' +
        tier.input_multiplier + ' 倍、输出按 ' + tier.output_multiplier + ' 倍计价（见下方价格表）。';
    } else {
      tierEl.hidden = true;
    }
  }

  // ---------- 本地解析 ----------

  var busy = false;

  function setStatus(text, isError) {
    var s = $('p-status');
    s.textContent = text;
    s.className = 'status' + (isError ? ' error' : '');
  }

  function readFileText(file) {
    if (file.text) return file.text();
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
      r.readAsText(file);
    });
  }

  function tick() {
    return new Promise(function (r) { setTimeout(r, 0); });
  }

  function parseFiles(fileList, opts) {
    if (busy) return;
    if (!pricing) {
      setStatus('价格数据还没加载好，请稍后再试。', true);
      return;
    }
    var files = Array.prototype.filter.call(fileList, function (f) {
      return opts && opts.onlyJsonl ? /\.jsonl$/i.test(f.name) : true;
    });
    if (!files.length) {
      setStatus('没有找到 .jsonl 文件。请选择 ~/.claude/projects/ 下的文件或文件夹。', true);
      return;
    }
    busy = true;
    var parser = C.createParser();
    var bytes = 0;
    var failed = 0;
    var i = 0;

    function next() {
      if (i >= files.length) return Promise.resolve();
      var f = files[i++];
      setStatus('正在解析 ' + i + ' / ' + files.length + '：' + f.name);
      return readFileText(f)
        .then(function (text) {
          bytes += f.size || text.length;
          parser.addText(text);
        }, function () {
          failed++;
        })
        .then(tick)
        .then(next);
    }

    next()
      .then(function () {
        var result = parser.finish(pricing);
        renderParse(result, { files: files.length, bytes: bytes, failed: failed });
        setStatus('解析完成：' + files.length + ' 个文件，' + (bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB') + '，全部在本地完成。');
      })
      .catch(function (err) {
        setStatus('解析出错：' + (err && err.message ? err.message : err), true);
      })
      .then(function () {
        busy = false;
      });
  }

  function renderParse(r, meta) {
    var box = $('p-result');
    var t = r.total;
    if (!t.requests) {
      box.hidden = true;
      setStatus('没有在这些文件里找到模型用量记录（assistant 消息的 usage 字段）。确认选的是 ~/.claude/projects/ 下的会话文件。', true);
      return;
    }
    box.hidden = false;

    var days = Math.max(1, r.activeDays);
    var listPerDay = t.listCost / days;
    var oursPerDay = t.ourCost / days;
    var a = r.firstTs ? dateStr(r.firstTs) : '', b = r.lastTs ? dateStr(r.lastTs) : '';
    var sameYear = a.slice(0, 4) === b.slice(0, 4);
    var range = !a ? '—' : a === b ? a.slice(5) : sameYear ? a.slice(5) + ' ~ ' + b.slice(5) : a + ' ~ ' + b;
    var rangeSub = (a && sameYear ? a.slice(0, 4) + ' 年 · ' : '') + r.activeDays + ' 个活跃天';

    var stats = $('p-stats');
    stats.textContent = '';
    stats.appendChild(stat('时间范围', range, rangeSub));
    stats.appendChild(stat('请求数', t.requests.toLocaleString('en-US'), '来自 ' + meta.files + ' 个文件'));
    stats.appendChild(stat('缓存命中率', pct(t.cacheHitRate), '缓存读 ÷ 全部输入', 'accent'));
    stats.appendChild(stat('官方价合计', usd(t.listCost), '日均 ' + usd(listPerDay) + ' · 折合每月 ' + usd(listPerDay * DAYS_PER_MONTH)));
    var d = discount(t.ourCost, t.listCost);
    stats.appendChild(stat('TeamoRouter 价合计', usd(t.ourCost), d ? '约官方 ' + d + ' 折' : ''));

    var tbody = $('p-tbody');
    tbody.textContent = '';
    r.models.concat([t]).forEach(function (m) {
      var isTotal = m === t;
      var tr = el('tr', isTotal ? 'total' : null);
      var name = el('td');
      if (isTotal) name.textContent = '合计';
      else {
        name.appendChild(el('code', null, m.model));
        if (m.priceId && m.priceId !== m.model) name.appendChild(el('div', 'small muted', '按 ' + m.priceId + ' 计价'));
      }
      tr.appendChild(name);
      tr.appendChild(el('td', 'num', m.requests.toLocaleString('en-US')));
      tr.appendChild(el('td', 'num', tokens(m.input)));
      tr.appendChild(el('td', 'num', tokens(m.cacheWrite)));
      tr.appendChild(el('td', 'num', tokens(m.cacheRead)));
      tr.appendChild(el('td', 'num', tokens(m.output)));
      tr.appendChild(el('td', 'num', pct(m.cacheHitRate)));
      var priced = m.requests - m.unpriced;
      tr.appendChild(el('td', 'num', !isTotal && priced === 0 ? '无价格' : usd(m.listCost)));
      tr.appendChild(el('td', 'num', !isTotal && m.requests - m.ourUnpriced === 0 ? '无价格' : usd(m.ourCost)));
      tbody.appendChild(tr);
    });

    var notes = $('p-notes');
    notes.textContent = '';
    var s = r.stats;
    function note(text) { notes.appendChild(el('li', null, text)); }
    if (s.duplicates) note('去掉了 ' + s.duplicates + ' 条重复记录（同一条响应被拆成多行，或被复制进多个会话文件）。');
    if (s.sidechainReplays) note('去掉了 ' + s.sidechainReplays + ' 条子代理 / 旁支会话对主会话消息的重放。');
    if (s.badLines) note('跳过了 ' + s.badLines + ' 行无法解析的内容（文件写到一半等情况）。');
    if (meta.failed) note(meta.failed + ' 个文件读取失败，已跳过。');
    if (s.synthetic) note(s.synthetic + ' 条 Claude Code 本地生成的消息（<synthetic>）不计费，已排除。');
    r.models.forEach(function (m) {
      if (m.unpriced === m.requests) note('模型 ' + m.model + ' 不在价格表里，只统计了 token，没有计价。');
      else if (m.unpriced) note('模型 ' + m.model + ' 有 ' + m.unpriced + ' 次请求没有价格。');
    });
    if (t.tiered) note(t.tiered + ' 次请求的上下文超过模型的阶梯门槛，已按倍率计价。');
    if (t.cacheWrite1h) note('其中 ' + tokens(t.cacheWrite1h) + ' token 是 1 小时缓存写入，已按 1 小时缓存写入价计算。');
    if (s.fast) note(s.fast + ' 次请求使用了 fast 模式，实际单价更高，这里按标准价计算，结果偏低。');
    note('「折合每月」= 合计 ÷ 活跃天数 × 30。官方价按 Anthropic 标价折算，实际以平台账单为准。');

    var save = (listPerDay - oursPerDay) * DAYS_PER_MONTH;
    $('p-save').textContent = usd(save);
    $('p-cta').hidden = !(save > 0);
  }

  function initParse() {
    $('p-files').addEventListener('change', function (e) {
      parseFiles(e.target.files, { onlyJsonl: false });
      e.target.value = '';
    });
    $('p-dir').addEventListener('change', function (e) {
      parseFiles(e.target.files, { onlyJsonl: true });
      e.target.value = '';
    });
    $('p-sample').addEventListener('click', function () {
      if (busy) return;
      setStatus('正在加载示例文件……');
      fetch('sample.jsonl', { cache: 'no-cache' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then(function (text) {
          var f;
          try {
            f = new File([text], 'sample.jsonl', { type: 'text/plain' });
          } catch (e) {
            f = new Blob([text], { type: 'text/plain' });
            f.name = 'sample.jsonl';
          }
          parseFiles([f], { onlyJsonl: false });
        })
        .catch(function (err) {
          setStatus('示例文件加载失败：' + err.message, true);
        });
    });

    var drop = $('p-drop');
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault();
        drop.classList.add('over');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault();
        drop.classList.remove('over');
      });
    });
    drop.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files) parseFiles(e.dataTransfer.files, { onlyJsonl: true });
    });
    // 拖到页面其他地方时不要让浏览器直接打开文件
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) { e.preventDefault(); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initParse();
    ['e-req', 'e-model', 'e-ctx', 'e-hit', 'e-out', 'e-miss'].forEach(function (id) {
      $(id).addEventListener('input', estimate);
      $(id).addEventListener('change', estimate);
    });
    loadPricing()
      .then(estimate)
      .catch(function (err) {
        var m = $('price-meta');
        m.textContent = '价格数据加载失败（' + err.message + '），请刷新重试。直接双击打开本地 HTML 文件时浏览器会拦截读取，请通过网址访问。';
        m.className = 'small status error';
        $('price-tbody').textContent = '';
      });
  });
})();

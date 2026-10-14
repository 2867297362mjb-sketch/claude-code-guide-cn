/*
 * Claude Code 账单计算核心：价格计算 + 本地 .jsonl 会话文件解析。
 * 纯函数，不访问网络、不读写存储；浏览器里挂到 window.CCUsage，Node 里 module.exports。
 *
 * jsonl 解析规则参考 ccusage（https://github.com/ryoppippi/ccusage，rust/adapters/claude）：
 * - 只看带 message.usage 的行，input_tokens / output_tokens 必须是数字，timestamp 必须能解析；
 * - cache_creation 有 5m / 1h 明细时按明细计，否则全部按 5 分钟缓存写入计；
 * - 去重：有 requestId 时按 message.id + requestId（跨文件）；没有 requestId 时按
 *   message.id + sessionId，非 msg_ 开头的 ID 再加 timestamp；重复时优先保留非 sidechain、token 更多的那条；
 * - 子代理 / 旁支（isSidechain: true）重放父会话同一条消息时，丢掉重放副本；
 * - model 为 "<synthetic>" 的行不计；usage.iterations 里 type 为 advisor_message 的记录按自身模型单独计；
 * - 解析失败的行跳过并计数。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CCUsage = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var M = 1e6;

  function num(v) {
    return typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0;
  }

  // ---------- 价格 ----------

  /** 把 pricing.json 的 models 数组转成 { id: model } */
  function indexPricing(pricing) {
    var map = {};
    var list = (pricing && pricing.models) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && typeof list[i].id === 'string') map[list[i].id] = list[i];
    }
    return map;
  }

  /**
   * 把日志里的模型名对到价格表里的 ID。
   * 依次尝试：原样、去掉 [1m] 之类后缀、去掉 -20251001 日期后缀、点号版本改短横线、包含关系（取最长匹配）。
   */
  function resolveModel(name, priceMap) {
    if (typeof name !== 'string' || !name) return null;
    var tries = [];
    var n = name.trim();
    tries.push(n);
    n = n.replace(/\[[^\]]*\]$/, '');
    tries.push(n);
    n = n.toLowerCase();
    tries.push(n);
    tries.push(n.replace(/-\d{8}$/, ''));
    var dashed = n.replace(/(\d)\.(\d)/g, '$1-$2');
    tries.push(dashed, dashed.replace(/-\d{8}$/, ''));
    for (var i = 0; i < tries.length; i++) {
      if (priceMap[tries[i]]) return tries[i];
    }
    var best = null;
    Object.keys(priceMap).forEach(function (id) {
      if (dashed.indexOf(id) !== -1 && (!best || id.length > best.length)) {
        // 防止 claude-opus-5 误配 claude-opus-5-5x 之类：匹配后一个字符不能是数字
        var after = dashed.charAt(dashed.indexOf(id) + id.length);
        if (!/[0-9]/.test(after)) best = id;
      }
    });
    return best;
  }

  /**
   * 计算一次请求的花费（美元）。
   * tokens: { input, cacheWrite5m, cacheWrite1h, cacheRead, output }
   * rates: pricing.json 里的 list_cost 或 cost
   * tier: context_tier_pricing（可为 null）。上下文（输入 + 缓存写 + 缓存读）超过门槛时，
   *       整次请求的输入侧按 input_multiplier、输出按 output_multiplier 计价。
   */
  function requestCost(tokens, rates, tier) {
    if (!rates) return null;
    var ctx = num(tokens.input) + num(tokens.cacheWrite5m) + num(tokens.cacheWrite1h) + num(tokens.cacheRead);
    var mi = 1, mo = 1, tiered = false;
    if (tier && num(tier.threshold_tokens) > 0 && ctx > tier.threshold_tokens) {
      mi = num(tier.input_multiplier) || 1;
      mo = num(tier.output_multiplier) || 1;
      tiered = true;
    }
    var write1hRate = typeof rates.cache_creation_1h === 'number' ? rates.cache_creation_1h : num(rates.cache_creation);
    var parts = {
      input: num(tokens.input) * num(rates.input) * mi / M,
      cacheWrite: (num(tokens.cacheWrite5m) * num(rates.cache_creation) + num(tokens.cacheWrite1h) * write1hRate) * mi / M,
      cacheRead: num(tokens.cacheRead) * num(rates.cache_read) * mi / M,
      output: num(tokens.output) * num(rates.output) * mo / M
    };
    parts.total = parts.input + parts.cacheWrite + parts.cacheRead + parts.output;
    parts.tiered = tiered;
    return parts;
  }

  /**
   * 估算模式：一次请求的 token 拆分。
   * missAs: 'write5m' | 'write1h' | 'input' —— 没命中缓存的那部分输入按什么计价
   */
  function estimateTokens(contextTokens, cacheReadRatio, outputTokens, missAs) {
    var ctx = num(contextTokens);
    var r = Math.min(1, Math.max(0, num(cacheReadRatio)));
    var read = ctx * r;
    var miss = ctx - read;
    return {
      input: missAs === 'input' ? miss : 0,
      cacheWrite5m: missAs === 'write5m' || !missAs ? miss : 0,
      cacheWrite1h: missAs === 'write1h' ? miss : 0,
      cacheRead: read,
      output: num(outputTokens)
    };
  }

  // ---------- jsonl 解析 ----------

  function isObj(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function readUsage(u) {
    if (!isObj(u) || typeof u.input_tokens !== 'number' || typeof u.output_tokens !== 'number') return null;
    var w5 = num(u.cache_creation_input_tokens), w1 = 0;
    if (isObj(u.cache_creation)) {
      w5 = num(u.cache_creation.ephemeral_5m_input_tokens);
      w1 = num(u.cache_creation.ephemeral_1h_input_tokens);
    }
    return {
      input: num(u.input_tokens),
      cacheWrite5m: w5,
      cacheWrite1h: w1,
      cacheRead: num(u.cache_read_input_tokens),
      output: num(u.output_tokens),
      fast: u.speed === 'fast'
    };
  }

  function tokenTotal(t) {
    return t.input + t.cacheWrite5m + t.cacheWrite1h + t.cacheRead + t.output;
  }

  function nonEmpty(v) {
    return typeof v === 'string' && v.length > 0 ? v : null;
  }

  /** 创建一个累加器，逐个文件喂文本进去，最后 finish() 出汇总 */
  function createParser() {
    var entries = [];
    var exact = {}; // 去重键 -> entries 下标
    var stats = { files: 0, lines: 0, usageLines: 0, badLines: 0, duplicates: 0, sidechainReplays: 0, synthetic: 0, fast: 0 };

    function exactKey(e) {
      if (!e.messageId) return null;
      if (e.requestId) return 'r|' + e.messageId + '|' + e.requestId;
      if (/^msg_/.test(e.messageId)) return 's|' + e.messageId + '|' + (e.sessionId || '');
      return 't|' + e.messageId + '|' + (e.sessionId || '') + '|' + e.ts;
    }

    function shouldReplace(cand, old) {
      if (cand.sidechain !== old.sidechain) return old.sidechain;
      return tokenTotal(cand.tokens) > tokenTotal(old.tokens);
    }

    function push(e) {
      var key = exactKey(e);
      if (key !== null && Object.prototype.hasOwnProperty.call(exact, key)) {
        stats.duplicates++;
        var idx = exact[key];
        if (shouldReplace(e, entries[idx])) entries[idx] = e;
        return;
      }
      if (key !== null) exact[key] = entries.length;
      entries.push(e);
    }

    function addLine(line) {
      stats.lines++;
      // 和 ccusage 一样先粗筛，没有 usage 的行不 parse，大文件快很多
      if (line.indexOf('"usage"') === -1) return;
      var d;
      try {
        d = JSON.parse(line);
      } catch (err) {
        stats.badLines++;
        return;
      }
      if (!isObj(d) || !isObj(d.message)) return;
      var tokens = readUsage(d.message.usage);
      if (!tokens) return;
      var ts = typeof d.timestamp === 'string' ? Date.parse(d.timestamp) : NaN;
      if (!isFinite(ts)) return;
      // 与 ccusage 一致：显式给了空字符串的 ID 视为无效行
      if (d.requestId === '' || d.message.id === '' || d.sessionId === '' || d.message.model === '') return;
      stats.usageLines++;

      var model = typeof d.message.model === 'string' ? d.message.model : null;
      var base = {
        messageId: nonEmpty(d.message.id),
        requestId: nonEmpty(d.requestId),
        sessionId: nonEmpty(d.sessionId),
        sidechain: d.isSidechain === true,
        ts: ts
      };

      if (model === '<synthetic>') {
        stats.synthetic++;
      } else {
        if (tokens.fast) stats.fast++;
        push({
          messageId: base.messageId, requestId: base.requestId, sessionId: base.sessionId,
          sidechain: base.sidechain, ts: ts, model: model || '(未知模型)', tokens: tokens
        });
      }

      // advisor 用量记在 usage.iterations 里，按各自模型单独计
      var its = d.message.usage.iterations;
      if (Array.isArray(its)) {
        for (var i = 0; i < its.length; i++) {
          var it = its[i];
          if (!isObj(it) || it.type !== 'advisor_message' || !nonEmpty(it.model)) continue;
          var at = readUsage(it);
          if (!at) continue;
          push({
            messageId: base.messageId ? base.messageId + ':advisor:' + i : null,
            requestId: base.requestId, sessionId: base.sessionId,
            sidechain: base.sidechain, ts: ts, model: it.model, tokens: at, advisor: true
          });
        }
      }
    }

    function addText(text) {
      stats.files++;
      var start = 0, len = text.length;
      while (start < len) {
        var end = text.indexOf('\n', start);
        if (end === -1) end = len;
        var line = text.slice(start, end).trim();
        if (line) addLine(line);
        start = end + 1;
      }
    }

    function dropSidechainReplays(list) {
      // 同一条 message.id + timestamp 同时出现在主会话和 sidechain 里（requestId 不同），丢掉 sidechain 那份
      var main = {};
      list.forEach(function (e) {
        if (e.messageId && !e.sidechain) main[e.messageId + '|' + e.ts] = true;
      });
      return list.filter(function (e) {
        if (e.sidechain && e.messageId && main[e.messageId + '|' + e.ts]) {
          stats.sidechainReplays++;
          return false;
        }
        return true;
      });
    }

    function finish(pricing) {
      var priceMap = indexPricing(pricing);
      var kept = dropSidechainReplays(entries);
      var byModel = {};
      var days = {};
      var minTs = Infinity, maxTs = -Infinity;
      var total = newBucket('合计');

      kept.forEach(function (e) {
        var b = byModel[e.model] || (byModel[e.model] = newBucket(e.model));
        var pid = resolveModel(e.model, priceMap);
        var p = pid ? priceMap[pid] : null;
        b.priceId = pid;
        var list = p ? requestCost(e.tokens, p.list_cost, p.context_tier_pricing) : null;
        var ours = p && p.cost ? requestCost(e.tokens, p.cost, p.context_tier_pricing) : null;
        [b, total].forEach(function (x) {
          x.requests++;
          x.input += e.tokens.input;
          x.cacheWrite += e.tokens.cacheWrite5m + e.tokens.cacheWrite1h;
          x.cacheWrite1h += e.tokens.cacheWrite1h;
          x.cacheRead += e.tokens.cacheRead;
          x.output += e.tokens.output;
          if (list) x.listCost += list.total; else x.unpriced++;
          if (ours) x.ourCost += ours.total; else x.ourUnpriced++;
          if (list && list.tiered) x.tiered++;
        });
        var d = new Date(e.ts);
        days[d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()] = true;
        if (e.ts < minTs) minTs = e.ts;
        if (e.ts > maxTs) maxTs = e.ts;
      });

      var models = Object.keys(byModel).map(function (k) { return finalize(byModel[k]); });
      models.sort(function (a, b) { return b.listCost - a.listCost || b.requests - a.requests; });
      return {
        models: models,
        total: finalize(total),
        activeDays: Object.keys(days).length,
        firstTs: isFinite(minTs) ? minTs : null,
        lastTs: isFinite(maxTs) ? maxTs : null,
        stats: stats
      };
    }

    return { addText: addText, addLine: addLine, finish: finish, stats: stats };
  }

  function newBucket(model) {
    return { model: model, priceId: null, requests: 0, input: 0, cacheWrite: 0, cacheWrite1h: 0, cacheRead: 0, output: 0,
      listCost: 0, ourCost: 0, unpriced: 0, ourUnpriced: 0, tiered: 0 };
  }

  function finalize(b) {
    var allInput = b.input + b.cacheWrite + b.cacheRead;
    b.cacheHitRate = allInput > 0 ? b.cacheRead / allInput : null;
    return b;
  }

  return {
    indexPricing: indexPricing,
    resolveModel: resolveModel,
    requestCost: requestCost,
    estimateTokens: estimateTokens,
    createParser: createParser
  };
});

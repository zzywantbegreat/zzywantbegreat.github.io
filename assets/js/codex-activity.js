(function (root) {
  "use strict";

  var DAY = 86400000;
  var FIELDS = ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens"];
  var number = new Intl.NumberFormat("zh-CN");

  function dateKey(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function parseDay(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("日期格式不正确");
    var ms = Date.parse(value + "T00:00:00Z");
    if (!Number.isFinite(ms) || dateKey(ms) !== value) throw new Error("日期无效");
    return ms;
  }
  function todayInZone(now, timezone) {
    var parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    var values = {};
    parts.forEach(function (part) { values[part.type] = part.value; });
    return values.year + "-" + values.month + "-" + values.day;
  }
  function validateData(raw) {
    if (!raw || raw.schema_version !== 1 || typeof raw.timezone !== "string" || !Array.isArray(raw.days)) throw new Error("不支持的数据格式");
    new Intl.DateTimeFormat("en", { timeZone: raw.timezone }).format(new Date());
    if (["local_codex_sessions", "codex_activity"].indexOf(raw.source) === -1) throw new Error("未知的数据来源");
    parseDay(raw.coverage_start);
    if (typeof raw.updated_at !== "string" || !Number.isFinite(Date.parse(raw.updated_at))) throw new Error("更新时间无效");
    if (raw.lifetime_tokens != null && (!Number.isSafeInteger(raw.lifetime_tokens) || raw.lifetime_tokens < 0)) throw new Error("账户累计用量无效");
    var seen = new Set();
    var days = raw.days.map(function (entry) {
      if (!entry || typeof entry !== "object") throw new Error("日期记录无效");
      parseDay(entry.date);
      if (seen.has(entry.date) || entry.date < raw.coverage_start) throw new Error("日期记录重复或早于覆盖范围");
      seen.add(entry.date);
      var clean = { date: entry.date };
      FIELDS.forEach(function (field) {
        if (field !== "total_tokens" && entry[field] == null) return;
        if (!Number.isSafeInteger(entry[field]) || entry[field] < 0) throw new Error("Token 数量无效");
        clean[field] = entry[field];
      });
      return clean;
    }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    return { schema_version: 1, timezone: raw.timezone, source: raw.source, coverage_start: raw.coverage_start, updated_at: raw.updated_at, lifetime_tokens: raw.lifetime_tokens, days: days };
  }
  function sum(entries, field) { return entries.reduce(function (total, entry) { return total + entry[field || "total_tokens"]; }, 0); }
  function sunday(ms) { return ms - new Date(ms).getUTCDay() * DAY; }
  function displayCount(value) {
    if (value >= 100000000) return (value / 100000000).toLocaleString("zh-CN", { maximumFractionDigits: 2 }) + " 亿";
    if (value >= 10000) return (value / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 2 }) + " 万";
    return number.format(value);
  }
  function levelFor(value, maximum) {
    if (!value || !maximum) return 0;
    return Math.max(1, Math.min(4, Math.ceil(4 * value / maximum)));
  }
  function buildModel(data, today, mode) {
    var todayMs = parseDay(today);
    var current = new Date(todayMs);
    var first = Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 11, 1);
    var last = Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0);
    var start = sunday(first);
    var end = sunday(last) + 6 * DAY;
    var index = new Map(data.days.map(function (entry) { return [entry.date, entry]; }));
    var running = sum(data.days.filter(function (entry) { return entry.date < dateKey(start); }));
    var cells = [];
    for (var ms = start; ms <= end; ms += DAY) {
      var key = dateKey(ms);
      var entry = index.get(key);
      running += entry ? entry.total_tokens : 0;
      var state = ms < first || ms > last ? "outside" : ms > todayMs ? "future" : key < data.coverage_start ? "unknown" : "recorded";
      cells.push({ date: key, ms: ms, state: state, value: mode === "cumulative" ? running : entry ? entry.total_tokens : 0, entry: entry || null });
    }
    if (mode === "weekly") {
      var weeks = [];
      for (var offset = 0; offset < cells.length; offset += 7) {
        var group = cells.slice(offset, offset + 7);
        var visible = group.filter(function (cell) { return cell.state !== "outside" && cell.state !== "future"; });
        var recorded = visible.filter(function (cell) { return cell.state === "recorded"; });
        var entries = recorded.filter(function (cell) { return cell.entry; }).map(function (cell) { return cell.entry; });
        weeks.push({ date: group[0].date, end: group[6].date, ms: group[0].ms, state: !visible.length ? "future" : recorded.length ? "recorded" : "unknown", partial: recorded.length < 7, value: sum(entries), entries: entries });
      }
      cells = weeks;
    }
    var positives = cells.filter(function (cell) { return cell.state === "recorded" && cell.value > 0; }).map(function (cell) { return cell.value; }).sort(function (a, b) { return a - b; });
    var percentileIndex = (positives.length - 1) * 0.95;
    var lowerIndex = Math.floor(percentileIndex);
    var maximum = positives.length ? positives[lowerIndex] + (positives[Math.ceil(percentileIndex)] - positives[lowerIndex]) * (percentileIndex - lowerIndex) : 0;
    var months = [];
    for (var month = 0; month < 12; month += 1) {
      var monthMs = Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 11 + month, 1);
      months.push({ label: (new Date(monthMs).getUTCMonth() + 1) + "月", column: Math.floor((monthMs - start) / DAY / 7) + 1 });
    }
    return { cells: cells, months: months, weeks: Math.round((end - start + DAY) / DAY / 7), maximum: maximum };
  }
  function describe(cell, mode) {
    var date = mode === "weekly" ? cell.date + " 至 " + cell.end : cell.date;
    if (cell.state === "unknown") return date + "：未覆盖，暂无可用记录。";
    if (mode === "cumulative") return date + "：截至当日已记录累计 " + number.format(cell.value) + " tokens。";
    var entries = mode === "weekly" ? cell.entries : cell.entry ? [cell.entry] : [];
    if (!entries.length) return date + "：无已同步记录。";
    var description = date + (cell.partial ? "（当前可见范围内的部分周）" : "") + "：" + number.format(cell.value) + " tokens";
    if (entries.every(function (entry) { return entry.input_tokens != null && entry.output_tokens != null; })) {
      description += "；输入 " + number.format(sum(entries, "input_tokens"));
      if (entries.every(function (entry) { return entry.cached_input_tokens != null; })) description += "（含缓存 " + number.format(sum(entries, "cached_input_tokens")) + "）";
      description += "，输出 " + number.format(sum(entries, "output_tokens"));
    }
    return description + "。";
  }
  function mount(container) {
    if (container.dataset.initialized) return;
    container.dataset.initialized = "true";
    var status = container.querySelector("[data-status]");
    var grid = container.querySelector("[data-grid]");
    var detail = container.querySelector("[data-detail]");
    var mode = "daily";
    var data;
    var today;

    function render() {
      var model = buildModel(data, today, mode);
      grid.textContent = "";
      grid.dataset.mode = mode;
      grid.setAttribute("aria-label", (mode === "weekly" ? "每周" : mode === "cumulative" ? "累计" : "每日") + "用量；方向键可切换日期");
      container.style.setProperty("--ca-weeks", model.weeks);
      var monthRow = container.querySelector("[data-months]");
      monthRow.textContent = "";
      model.months.forEach(function (month) {
        var label = document.createElement("span");
        label.textContent = month.label;
        label.style.gridColumn = month.column;
        monthRow.appendChild(label);
      });
      var lastButton;
      model.cells.forEach(function (cell) {
        var interactive = cell.state !== "outside" && cell.state !== "future";
        var item = document.createElement(interactive ? "button" : "span");
        item.className = "codex-activity__cell";
        item.dataset.state = cell.state;
        if (cell.state === "recorded") item.dataset.level = levelFor(cell.value, model.maximum);
        if (interactive) {
          item.type = "button";
          item.tabIndex = -1;
          item.setAttribute("aria-pressed", "false");
          var description = describe(cell, mode);
          item.setAttribute("aria-label", description);
          item.title = description;
          function select() {
            grid.querySelectorAll('[tabindex="0"]').forEach(function (button) { button.tabIndex = -1; });
            var old = grid.querySelector('[aria-pressed="true"]');
            if (old) { old.setAttribute("aria-pressed", "false"); old.tabIndex = -1; }
            item.setAttribute("aria-pressed", "true");
            item.tabIndex = 0;
            detail.textContent = description;
          }
          item.addEventListener("mouseenter", select);
          item.addEventListener("focus", select);
          item.addEventListener("click", select);
          lastButton = item;
        } else item.setAttribute("aria-hidden", "true");
        grid.appendChild(item);
      });
      if (lastButton) lastButton.tabIndex = 0;
      container.querySelector("[data-mode-note]").textContent = mode === "weekly" ? "每格一周 · 周日至周六" : mode === "cumulative" ? "每格一天 · 截至当日已记录总量" : "每格一天 · 过去 12 个日历月";
      detail.textContent = "悬停、点击或用方向键选择格子，查看准确用量。";
    }
    grid.addEventListener("keydown", function (event) {
      var buttons = Array.from(grid.querySelectorAll("button"));
      var index = buttons.indexOf(document.activeElement);
      if (index < 0) return;
      var columns = mode === "weekly" ? 1 : 7;
      var steps = { ArrowLeft: -columns, ArrowRight: columns, ArrowUp: -1, ArrowDown: 1 };
      var target;
      if (Object.prototype.hasOwnProperty.call(steps, event.key)) target = Math.max(0, Math.min(buttons.length - 1, index + steps[event.key]));
      else if (event.key === "Home") target = 0;
      else if (event.key === "End") target = buttons.length - 1;
      else return;
      event.preventDefault();
      buttons[target].focus();
    });
    container.querySelectorAll("[data-mode]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (!data || button.dataset.mode === mode) return;
        mode = button.dataset.mode;
        container.querySelectorAll(".codex-activity__modes [data-mode]").forEach(function (tab) { tab.setAttribute("aria-pressed", String(tab === button)); });
        render();
      });
    });

    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timeout = controller ? setTimeout(function () { controller.abort(); }, 12000) : null;
    fetch(container.dataset.source, { cache: "no-cache", credentials: "same-origin", signal: controller ? controller.signal : undefined })
      .then(function (response) { if (!response.ok) throw new Error("无法读取用量数据"); return response.json(); })
      .then(function (raw) {
        data = validateData(raw);
        today = todayInZone(new Date(), data.timezone);
        var timezoneLabel = data.timezone === "Asia/Shanghai" ? "北京时间" : data.timezone;
        container.querySelector("[data-subtitle]").textContent = "每日 Token 用量 · 按 " + timezoneLabel + " 日期统计";
        var available = data.days.filter(function (entry) { return entry.date <= today; });
        var current = available.find(function (entry) { return entry.date === today; });
        var weekStart = dateKey(parseDay(today) - 6 * DAY);
        var metrics = { today: current ? current.total_tokens : null, week: sum(available.filter(function (entry) { return entry.date >= weekStart; })), total: data.lifetime_tokens != null ? data.lifetime_tokens : sum(available) };
        if (data.lifetime_tokens != null) container.querySelector("[data-total-label]").textContent = "累计用量";
        Object.keys(metrics).forEach(function (key) {
          var target = container.querySelector('[data-metric="' + key + '"]');
          target.textContent = metrics[key] == null ? "暂无记录" : displayCount(metrics[key]);
          target.title = metrics[key] == null ? "今日用量尚未更新，统计可能有延迟" : number.format(metrics[key]) + " tokens（已同步记录）";
        });
        var age = Date.now() - Date.parse(data.updated_at);
        var stale = age > 36 * 60 * 60 * 1000;
        container.dataset.state = stale ? "stale" : "ready";
        status.textContent = stale ? "数据超过 36 小时未更新；以下为最后一次同步的用量。" : !available.length ? "尚无已同步的使用记录。" : "";
        status.hidden = !status.textContent;
        var updated = new Intl.DateTimeFormat("zh-CN", { timeZone: data.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(data.updated_at));
        container.querySelector("[data-updated]").textContent = "更新于 " + updated + "（" + timezoneLabel + "）";
        container.querySelector("[data-footnote]").textContent = "近期用量可能延迟显示；空白日期表示暂无已同步记录。";
        render();
        container.querySelector("[data-visual]").hidden = false;
        var scroller = container.querySelector(".codex-activity__scroll");
        scroller.scrollLeft = scroller.scrollWidth;
      })
      .catch(function () { container.dataset.state = "error"; status.hidden = false; status.textContent = "暂时无法加载 Token 用量，请稍后刷新页面。"; })
      .finally(function () { if (timeout) clearTimeout(timeout); });
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { parseDay: parseDay, todayInZone: todayInZone, validateData: validateData, buildModel: buildModel, describe: describe, levelFor: levelFor, displayCount: displayCount };
  if (root.document) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { document.querySelectorAll("[data-codex-activity]").forEach(mount); });
    else document.querySelectorAll("[data-codex-activity]").forEach(mount);
  }
})(typeof window !== "undefined" ? window : globalThis);

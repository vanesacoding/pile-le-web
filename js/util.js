/* 工具集合（纯展示逻辑）—— 由 pile-le-mini/utils/util.js 复刻 */
window.U = (function () {
  // 金额（分）→ 展示字符串
  function formatYuan(fen, withSign) {
    if (withSign === undefined) withSign = true;
    const yuan = ((fen || 0) / 100).toLocaleString('zh-CN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    return withSign ? '¥ ' + yuan : yuan;
  }

  // ¥ 输入字符串 → 分
  function parseYuan(input) {
    const num = parseFloat(String(input).replace(/[^\d.]/g, ''));
    if (isNaN(num) || num < 0) return 0;
    return Math.round(num * 100);
  }

  function remainHours(deadlineAt) {
    const ms = new Date(deadlineAt).getTime() - Date.now();
    if (ms <= 0) return '已截止 · 等落章';
    const h = Math.floor(ms / 3.6e6);
    const m = Math.floor((ms % 3.6e6) / 6e4);
    return h > 0 ? '剩 ' + h + ' 小时' : '剩 ' + m + ' 分钟';
  }

  function remainClock(deadlineAt) {
    const ms = Math.max(0, new Date(deadlineAt).getTime() - Date.now());
    const h = Math.floor(ms / 3.6e6);
    const m = Math.floor((ms % 3.6e6) / 6e4);
    const s = Math.floor((ms % 6e4) / 1000);
    return [h, m, s].map(function (n) { return String(n).padStart(2, '0'); }).join(':');
  }

  function formatDeadline(ts) {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hh + ':' + mm;
  }

  // 状态码必须和 STATUS_TEXT 下标对齐
  const STATUS_TEXT = ['待送审', '审批中', '已批准', '已驳回', '已了结'];
  function statusText(status) {
    return STATUS_TEXT[status] || '';
  }

  function decisionText(d) {
    return ({ 1: '买了', 2: '算了' })[d] || '';
  }

  function visibilityText(v) {
    return v === 'court' ? '法庭' : '好友';
  }

  function formatNumber(n, digit) {
    return Number(n || 0).toLocaleString('zh-CN', {
      minimumFractionDigits: digit || 0,
      maximumFractionDigits: digit || 0,
    });
  }

  function checkComment(text) {
    if (!text) return { ok: true };
    if (String(text).length > 30) return { ok: false, reason: '吐槽不能超过 30 字' };
    return { ok: true };
  }

  // 生成「审批人甲/乙/丙」这类匿名代号，按该单已有投票数顺延
  const GANZHI = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  function voterAlias(existingCount) {
    return '审批人' + GANZHI[existingCount % GANZHI.length];
  }

  return {
    formatYuan, parseYuan, remainHours, remainClock, formatDeadline,
    statusText, decisionText, visibilityText, formatNumber, checkComment, voterAlias,
  };
})();

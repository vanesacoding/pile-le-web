/* ============================================================
   批了么 · 网页预览版 —— 路由 + 页面渲染 + 交互
   由 9 个微信小程序页面复刻成单页应用（hash 路由 + localStorage）
   ============================================================ */

window.App = (function () {
  const pageEl = document.getElementById('page');
  const tabbarEl = document.getElementById('tabbar');

  // ---------- 通用 helper ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(31,30,27,0.88);color:#F5F2EA;padding:10px 20px;border-radius:999px;font-size:14px;z-index:999;transition:opacity .2s;pointer-events:none;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.style.opacity = '0'; }, 1500);
  }

  function confirmDialog(title, text, onOk) {
    // 简单起见用原生 confirm；文案尽量贴近小程序 wx.showModal
    if (window.confirm((title ? title + '\n' : '') + text)) onOk();
  }

  // 公章
  const SEAL_MAP = {
    approved: { cn: '批准', en: 'APPROVED' },
    rejected: { cn: '驳回', en: 'REJECTED' },
    pending: { cn: '待批', en: 'PENDING' },
  };
  function sealHtml(type, size, animate) {
    const t = SEAL_MAP[type] || SEAL_MAP.pending;
    const cls = 'seal ' + type + (size === 'small' ? ' small' : '') + (animate ? ' seal-animate' : '');
    return '<div class="' + cls + '"><div class="seal-text">' + t.cn + '</div><div class="seal-en">' + t.en + '</div></div>';
  }

  function sealTypeOf(item) {
    if (item.status === 2) return 'approved';
    if (item.status === 3) return 'rejected';
    if (item.status === 4) return item.approveCnt > item.rejectCnt ? 'approved' : 'rejected';
    return 'pending';
  }

  function chipsHtml(item) {
    return '<div class="chips">' +
      '<span class="chip chip-approve">批<span class="chip-num">' + (item.approveCnt || 0) + '</span></span>' +
      '<span class="chip chip-reject">不批<span class="chip-num">' + (item.rejectCnt || 0) + '</span></span>' +
      '</div>';
  }

  function galleryHtml(gallery) {
    if (!gallery || !gallery.length) return '';
    const n = gallery.length;
    let imgs = '';
    gallery.forEach(function (src, i) {
      imgs += '<img class="g-img g' + i + '" src="' + esc(src) + '" alt="" />';
    });
    return '<div class="gallery n' + n + '">' + imgs + '</div>';
  }

  // 附件卡（图 + 理由 + 替代品），share/approve/result 复用
  function attachHtml(item, gallery) {
    return '<div class="card detail">' +
      galleryHtml(gallery) +
      '<div class="doc-field"><span class="lf">理由</span><span class="rg">' + esc(item.reason || '—') + '</span></div>' +
      (item.alternative ? '<div class="doc-field"><span class="lf">替代品</span><span class="rg">' + esc(item.alternative) + '</span></div>' : '') +
      '</div>';
  }

  // 意见列表（审批意见 / 陪审团意见）
  function commentsHtml(list) {
    if (!list || !list.length) return '<div class="empty-comments">还没有人审批</div>';
    return list.map(function (a) {
      const name = a.voterNick || a.voterAlias || '匿名';
      return '<div class="card cmt">' +
        '<div class="cmt-head">' +
        (a.voterAvatar ? '<img class="cmt-avatar" src="' + esc(a.voterAvatar) + '" alt="" />' : '') +
        '<span class="cmt-name">' + esc(name) + '</span>' +
        '<span class="cmt-tag ' + (a.vote === 1 ? 'y' : 'n') + '">' + (a.vote === 1 ? '批' : '不批') + '</span>' +
        '</div>' +
        (a.comment ? '<div class="cmt-text">' + esc(a.comment) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  // ---------- 路由 ----------
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const qIdx = h.indexOf('?');
    const path = qIdx >= 0 ? h.slice(0, qIdx) : h;
    const qs = qIdx >= 0 ? h.slice(qIdx + 1) : '';
    const segs = path.split('/').filter(Boolean);
    const query = {};
    if (qs) {
      qs.split('&').forEach(function (kv) {
        const eq = kv.indexOf('=');
        if (eq >= 0) query[kv.slice(0, eq)] = decodeURIComponent(kv.slice(eq + 1));
        else query[kv] = '';
      });
    }
    return { name: segs[0] || '', args: segs.slice(1), query: query };
  }

  // ---------- 状态 ----------
  const state = {
    list: { mode: 'mine', tab: 'pending' },
    pool: { scope: 'all' },
    apply: { title: '', priceText: '', reason: '', alternative: '', visibility: 'friends', duration: 24, images: [], focus: '' },
    approve: { id: '', isCourt: false, named: false, comment: '', me: null, draftNick: '', draftAvatar: '', avatarSrc: '' },
    me: { draftNick: '', draftAvatar: '', avatarSrc: '', dirty: false, saving: false },
  };

  let timers = [];
  function clearTimers() { timers.forEach(function (t) { clearInterval(t); }); timers = []; }

  function startClock(id, fmt) {
    const el = document.getElementById(id);
    if (!el) return;
    const tick = function () {
      const v = fmt();
      if (el.textContent !== v) el.textContent = v;
    };
    tick();
    timers.push(setInterval(tick, 1000));
  }

  // ---------- 渲染入口 ----------
  function render() {
    clearTimers();
    const route = parseHash();

    // 首次：没看过引导则先去引导页
    if (!route.name) {
      const target = S.isOnboardingSeen() ? '#/list' : '#/onboarding';
      location.replace(target);
      return;
    }

    let isTab = false;
    switch (route.name) {
      case 'onboarding': renderOnboarding(); break;
      case 'list': renderList(); isTab = true; break;
      case 'pool': renderPool(); isTab = true; break;
      case 'me': renderMe(); isTab = true; break;
      case 'apply': renderApply(); break;
      case 'share': renderShare(route.args[0]); break;
      case 'approve': renderApprove(route.args[0], route.query.from === 'court'); break;
      case 'result': renderResult(route.args[0]); break;
      case 'cooling': renderCooling(route.args[0]); break;
      default: location.replace('#/list'); return;
    }

    // tabbar 显隐 + 选中态
    tabbarEl.classList.toggle('hidden', !isTab);
    if (isTab) {
      const idx = { list: 0, pool: 1, me: 2 }[route.name];
      Array.prototype.forEach.call(tabbarEl.querySelectorAll('.tabbar-item'), function (it, i) {
        it.classList.toggle('on', i === idx);
      });
    }
    window.scrollTo(0, 0);
  }

  // ============================================================
  // 引导页 onboarding
  // ============================================================
  const OB_ICONS = {
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="#2F5D46" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M13.5 6.5l3 3"/></svg>',
    stamp: '<svg viewBox="0 0 24 24" fill="none" stroke="#2F5D46" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a3 3 0 0 0-3 3c0 1.5.8 2.6 1.3 3.5.4.7.7 1.4.7 2.5H13c0-1.1.3-1.8.7-2.5.5-.9 1.3-2 1.3-3.5a3 3 0 0 0-3-3z"/><path d="M5 14h14v3H5z"/><path d="M6 17h12v3H6z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="#2F5D46" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="#2F5D46" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="#2F5D46" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></svg>',
  };

  function renderOnboarding() {
    state.obStep = state.obStep || 0;
    const TOTAL = 5;
    let slides = '';

    // slide 1
    slides += '<div class="slide' + (state.obStep !== 0 ? ' hidden' : '') + '">' +
      '<div class="hero-ob"><div class="ob-icon">' + OB_ICONS.pen + '</div>' +
      '<div class="ob-title display">想买啥，先填张单</div>' +
      '<div class="ob-sub">五个空，三十秒。填到「家里有替代品吗」那格，很多人就自己不想买了。</div></div>' +
      '<div class="ob-body">' +
      '<div class="demo-tag">示例</div>' +
      '<div class="fieldbox"><span class="flabel">想买啥</span><div class="fval strong">空气炸锅</div></div>' +
      '<div class="fieldbox"><span class="flabel">多少钱</span><div class="fval money">¥ 299</div></div>' +
      '<div class="fieldbox"><span class="flabel">为什么想买</span><div class="fval">想做好吃的</div></div>' +
      '<div class="fieldbox on"><span class="flabel">家里有替代品吗</span><div class="fval">电煮锅算吗…</div></div>' +
      '<div class="fieldbox"><span class="flabel">有效期 · 谁来审批</span>' +
      '<div class="scope"><span class="on">24 小时</span><span>3 天</span><span>7 天</span></div>' +
      '<div class="scope" style="margin-top:4px;"><span class="on">好友</span><span>法庭</span></div></div>' +
      '</div></div>';

    // slide 2
    slides += '<div class="slide' + (state.obStep !== 1 ? ' hidden' : '') + '">' +
      '<div class="hero-ob"><div class="ob-icon">' + OB_ICONS.stamp + '</div>' +
      '<div class="ob-title display">发到群里，等朋友批</div>' +
      '<div class="ob-sub">朋友点开就能投，不登录不注册。批或不批，再补一句吐槽。</div></div>' +
      '<div class="ob-body">' +
      '<div class="demo-tag">示例</div>' +
      '<div class="block-sage demo-hero"><div class="row-between"><span class="remain">剩 23:41:07</span></div>' +
      '<div class="line"><span class="doc-title sage-title">空气炸锅</span><span class="doc-price">¥ 299</span></div></div>' +
      '<div class="cmt-label">审批意见</div>' +
      '<div class="cmt"><div class="cmt-head"><span class="cmt-name">审批人甲</span><span class="tag n">不批</span></div><div class="cmt-text">电煮锅真的够用了</div></div>' +
      '<div class="cmt"><div class="cmt-head"><span class="cmt-name">审批人乙</span><span class="tag y">批</span></div><div class="cmt-text">批！做好了叫我</div></div>' +
      '<div class="cmt"><div class="cmt-head"><span class="cmt-name">审批人丙</span><span class="tag n">不批</span></div><div class="cmt-text">上次买的酸奶机还在吃灰</div></div>' +
      '</div></div>';

    // slide 3
    slides += '<div class="slide' + (state.obStep !== 2 ? ' hidden' : '') + '">' +
      '<div class="hero-ob"><div class="ob-icon">' + OB_ICONS.clock + '</div>' +
      '<div class="ob-title display">章落之前，等 24 小时</div>' +
      '<div class="ob-sub">审批截止时才盖章。这一天里，冲动会自己退潮。</div></div>' +
      '<div class="ob-body">' +
      '<div class="demo-tag">示例</div>' +
      '<div class="block-sage demo-hero"><div class="line"><span class="doc-title sage-title">空气炸锅</span><span class="doc-price">¥ 299</span></div>' +
      '<div class="chips"><span class="chip chip-approve">批<span class="chip-num">1</span></span><span class="chip chip-reject">不批<span class="chip-num">2</span></span></div>' +
      '<div class="doc-seal">' + sealHtml('pending', false, false) + '</div></div>' +
      '<div class="clock-wrap"><div class="ob-clock display" id="ob-clock">22:17:40</div><div class="clock-label">距离盖章</div></div>' +
      '</div></div>';

    // slide 4
    slides += '<div class="slide' + (state.obStep !== 3 ? ' hidden' : '') + '">' +
      '<div class="hero-ob"><div class="ob-icon">' + OB_ICONS.check + '</div>' +
      '<div class="ob-title display">章落了，然后呢</div>' +
      '<div class="ob-sub">结果出来再过 24 小时，我们问你一句：现在还想买吗？</div></div>' +
      '<div class="ob-body">' +
      '<div class="demo-tag">示例</div>' +
      '<div class="card decide">' +
      '<div class="seal-row">' + sealHtml('rejected', false, false) + '</div>' +
      '<div class="saved-label">本月被拦下的金额</div>' +
      '<div class="saved-amount display">¥ 299</div>' +
      '<div class="vote-row"><div class="btn-reject flex1">还是买了</div><div class="btn-approve flex1">算 了</div></div></div>' +
      '<div class="foot-note">真正省下钱的不是朋友的投票，是这 24 小时。</div>' +
      '</div></div>';

    // slide 5
    slides += '<div class="slide' + (state.obStep !== 4 ? ' hidden' : '') + '">' +
      '<div class="hero-ob"><div class="ob-icon">' + OB_ICONS.eye + '</div>' +
      '<div class="ob-title display">去法庭当个陪审员</div>' +
      '<div class="ob-sub">给陌生人的单子投一票。陪审团的票不决定结果，但会被看见。</div></div>' +
      '<div class="ob-body">' +
      '<div class="demo-tag">示例</div>' +
      '<div class="card item"><div class="row-between"><span class="remain done">已驳回</span></div>' +
      '<div class="line"><span class="doc-title sm">露营帐篷</span><span class="doc-price">¥ 1,280</span></div>' +
      '<div class="doc-field"><span class="lf">理由</span><span class="rg">周末想去山里躺着</span></div>' +
      '<div class="chips"><span class="chip chip-approve">批<span class="chip-num">1</span></span><span class="chip chip-reject">不批<span class="chip-num">4</span></span><span class="chip chip-pending">最后算了</span></div></div>' +
      '<div class="card item"><div class="row-between"><span class="remain">剩 5 小时</span></div>' +
      '<div class="line"><span class="doc-title sm">机械键盘</span><span class="doc-price">¥ 599</span></div>' +
      '<div class="doc-field"><span class="lf">理由</span><span class="rg">现在这把键帽有点油</span></div>' +
      '<div class="chips"><span class="chip chip-approve">批<span class="chip-num">3</span></span><span class="chip chip-reject">不批<span class="chip-num">2</span></span></div></div>' +
      '</div></div>';

    let dots = '';
    for (let i = 0; i < TOTAL; i++) dots += '<span class="dot' + (i === state.obStep ? ' on' : '') + '"></span>';

    let footBtns;
    if (state.obStep < TOTAL - 1) {
      footBtns = '<div class="btn-primary" data-act="ob-next">下 一 步</div>';
    } else {
      footBtns = '<div class="btn-primary" data-act="ob-go-apply">提 交 第 一 单</div>' +
        '<div class="btn-ghost gap" data-act="ob-go-pool">先 去 法 庭 看 看</div>';
    }

    pageEl.innerHTML = '<div class="ob">' +
      '<div class="ob-head"><span class="demo-pill"><span class="demo-pill-strong">教你用</span><span class="demo-pill-sub">· 下面都是演示数据</span></span><span class="skip" data-act="ob-skip">跳过</span></div>' +
      '<div class="ob-swiper">' + slides + '</div>' +
      '<div class="ob-foot"><div class="dots">' + dots + '</div>' + footBtns + '</div>' +
      '</div>';

    if (state.obStep === 2) {
      let left = 22 * 3600 + 17 * 60 + 40;
      startClock('ob-clock', function () {
        left = Math.max(0, left - 1);
        const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;
        return [h, m, s].map(function (n) { return String(n).padStart(2, '0'); }).join(':');
      });
    }
  }

  // ============================================================
  // 首页 list
  // ============================================================
  function renderList() {
    const mode = state.list.mode;
    const tab = state.list.tab;
    const tabTextMap = { pending: '审批中', done: '已出结果', final: '已了结' };

    let body;
    if (mode === 'mine') {
      const res = S.listMyItems(tab);
      const savedYuan = U.formatYuan(res.savedAmount, false);
      let listHtml = '';
      if (res.list.length) {
        listHtml = res.list.map(function (it) {
          const img = it.imageFileID;
          const voted = (it.approveCnt || 0) + (it.rejectCnt || 0);
          const remain = it.status <= 1 ? U.remainHours(it.deadlineAt) : U.statusText(it.status);
          const remainDone = it.status > 1;
          return '<div class="card item" data-act="open" data-id="' + it._id + '">' +
            '<div class="row">' +
            (img ? '<div class="thumb"><img class="thumb-img" src="' + esc(img) + '" alt="" /></div>' : '') +
            '<div class="main">' +
            '<div class="doc-title ellipsis">' + esc(it.title) + '</div>' +
            '<div class="meta"><span class="doc-price">¥ ' + esc(U.formatYuan(it.price, false)) + '</span>' +
            '<span class="remain' + (remainDone ? ' done' : '') + '">' + esc(remain) + '</span></div>' +
            '<div class="doc-field"><span class="lf">理由</span><span class="rg ellipsis">' + esc(it.reason || '—') + '</span></div>' +
            '</div></div>' +
            '<div class="chips">' +
            '<span class="chip chip-approve">批<span class="chip-num">' + (it.approveCnt || 0) + '</span></span>' +
            '<span class="chip chip-reject">不批<span class="chip-num">' + (it.rejectCnt || 0) + '</span></span>' +
            (it.status <= 1 ? '<span class="chip chip-pending">已投<span class="chip-num">' + voted + '</span></span>' : '') +
            '</div></div>';
        }).join('');
      } else {
        listHtml = '<div class="empty"><div>暂无' + tabTextMap[tab] + '的单子</div><div class="empty-sub">下面提交一份，把剁手冲动先按下来。</div></div>';
      }
      body =
        '<div class="tabs">' +
        '<div class="tab' + (tab === 'pending' ? ' active' : '') + '" data-act="list-tab" data-tab="pending">审批中 ' + res.counts.pending + '</div>' +
        '<div class="tab' + (tab === 'done' ? ' active' : '') + '" data-act="list-tab" data-tab="done">已出结果 ' + res.counts.done + '</div>' +
        '<div class="tab' + (tab === 'final' ? ' active' : '') + '" data-act="list-tab" data-tab="final">已了结 ' + res.counts.final + '</div>' +
        '</div>' +
        '<div class="list">' + listHtml + '</div>';
    } else {
      const res = S.listMyApprovals();
      let listHtml = '';
      if (res.list.length) {
        listHtml = res.list.map(function (a) {
          const it = a.item;
          const pending = it.status <= 1;
          const statusText = pending ? U.remainHours(it.deadlineAt) : U.statusText(it.status);
          return '<div class="card item" data-act="open" data-id="' + it._id + '">' +
            '<div class="row">' +
            (it.imageFileID ? '<div class="thumb"><img class="thumb-img" src="' + esc(it.imageFileID) + '" alt="" /></div>' : '') +
            '<div class="main">' +
            '<div class="doc-title ellipsis">' + esc(it.title) + '</div>' +
            '<div class="meta"><span class="doc-price">¥ ' + esc(U.formatYuan(it.price, false)) + '</span>' +
            '<span class="remain' + (pending ? '' : ' done') + '">' + esc(statusText) + '</span></div>' +
            '<div class="mine">' +
            '<span class="tag ' + (a.vote === 1 ? 'y' : 'n') + '">我投了' + (a.vote === 1 ? '批' : '不批') + '</span>' +
            (a.source === 'court' ? '<span class="tag g">陪审团</span>' : '') +
            '</div>' +
            (a.comment ? '<div class="mine-text ellipsis">「' + esc(a.comment) + '」</div>' : '') +
            '</div></div>' +
            '<div class="chips">' +
            '<span class="chip chip-approve">批<span class="chip-num">' + (it.approveCnt || 0) + '</span></span>' +
            '<span class="chip chip-reject">不批<span class="chip-num">' + (it.rejectCnt || 0) + '</span></span>' +
            '</div></div>';
        }).join('');
      } else {
        listHtml = '<div class="empty"><div>还没审过别人的单子</div><div class="empty-sub">朋友发来的审批卡片，点开投一票就会记在这里。</div></div>';
      }
      body = '<div class="list" style="padding-top:10px;">' + listHtml + '</div>';
    }

    const me = S.getMe().me;
    pageEl.innerHTML = '<div class="page on-tab">' +
      '<div class="masthead"><div class="brand display">批 了 么</div><div class="saved">本月已拦下 ¥ ' + esc(U.formatYuan(me.savedAmount, false)) + '</div></div>' +
      '<div class="seg">' +
      '<div class="seg-item' + (mode === 'mine' ? ' on' : '') + '" data-act="list-mode" data-mode="mine">我的申请</div>' +
      '<div class="seg-item' + (mode === 'approved' ? ' on' : '') + '" data-act="list-mode" data-mode="approved">我审批的</div>' +
      '</div>' +
      body +
      '<div class="dock on-tab"><div class="btn-primary" data-act="go-apply">提 交 申 请</div></div>' +
      '</div>';
  }

  // ============================================================
  // 法庭 pool
  // ============================================================
  function pct(y, n) {
    const total = (y || 0) + (n || 0);
    return total ? Math.round((y || 0) / total * 100) : 0;
  }
  function decoratePool(it) {
    const voted = (it.approveCnt || 0) + (it.rejectCnt || 0);
    const jury = (it.juryApproveCnt || 0) + (it.juryRejectCnt || 0);
    return Object.assign({}, it, {
      _priceYuan: U.formatYuan(it.price, false),
      _remain: U.remainHours(it.deadlineAt),
      _statusText: U.statusText(it.status),
      _decisionText: U.decisionText(it.finalDecision),
      _voted: voted,
      _jury: jury,
      _imgCount: (it.imageFileIDs || []).length,
      _friendPct: pct(it.approveCnt, it.rejectCnt),
      _juryPct: pct(it.juryApproveCnt, it.juryRejectCnt),
      _votable: it.status === 1 && !it.isMine && it.deadlineAt > Date.now(),
    });
  }

  function renderPool() {
    const scope = state.pool.scope;
    const TABS = [
      { key: 'all', text: '大众的', empty: '法庭今天没有案子', sub: '你可以当第一个。' },
      { key: 'friends', text: '好友的', empty: '还没有人请你审批', sub: '朋友发到群里的卡片，你点开过的会记在这里。' },
      { key: 'mine', text: '我的', empty: '你还没有挂到法庭的单子', sub: '交单时「谁来审批」选「法庭」，就会出现在这里。' },
    ];
    const res = S.listPublicItems(scope);
    const list = res.list.map(decoratePool);

    let listHtml;
    if (list.length) {
      listHtml = list.map(function (it) {
        const showJury = scope === 'all' || (scope === 'mine' && it.visibility === 'court');
        return '<div class="card item" data-act="open-pool" data-id="' + it._id + '" data-votable="' + (it._votable ? '1' : '0') + '">' +
          '<div class="row">' +
          (it.imageFileID ? '<div class="thumb"><img class="thumb-img" src="' + esc(it.imageFileID) + '" alt="" />' + (it._imgCount > 1 ? '<span class="thumb-badge">' + it._imgCount + '</span>' : '') + '</div>' : '') +
          '<div class="main">' +
          '<div class="doc-title ellipsis">' + esc(it.title) + '</div>' +
          '<div class="meta"><span class="doc-price">¥ ' + esc(it._priceYuan) + '</span>' +
          '<span class="remain' + (it.status > 1 ? ' done' : '') + '">' + esc(it.status <= 1 ? it._remain : it._statusText) + '</span></div>' +
          '<div class="doc-field"><span class="lf">理由</span><span class="rg ellipsis">' + esc(it.reason || '—') + '</span></div>' +
          '</div></div>' +
          '<div class="bars">' +
          '<div class="bar-row thick"><span class="bar-lb">朋友</span>' +
          '<div class="bar-track' + (it._voted ? ' has' : '') + '"><div class="bar-fill" style="width:' + it._friendPct + '%"></div></div>' +
          (it._voted
            ? '<div class="bar-num"><span class="y">批 ' + (it.approveCnt || 0) + '</span><span class="dot">·</span><span class="n">不批 ' + (it.rejectCnt || 0) + '</span></div>'
            : '<span class="bar-num none">还没人投</span>') +
          '</div>' +
          (showJury
            ? '<div class="bar-row"><span class="bar-lb">陪审团</span>' +
              '<div class="bar-track' + (it._jury ? ' has' : '') + '"><div class="bar-fill" style="width:' + it._juryPct + '%"></div></div>' +
              (it._jury
                ? '<div class="bar-num"><span class="y">批 ' + (it.juryApproveCnt || 0) + '</span><span class="dot">·</span><span class="n">不批 ' + (it.juryRejectCnt || 0) + '</span></div>'
                : '<span class="bar-num none">还没人投</span>') +
              '</div>'
            : '') +
          (it.status === 4 ? '<span class="chip chip-pending final">最后' + it._decisionText + '</span>' : '') +
          '</div>' +
          (it._votable ? '<div class="cta">去投一票 ›</div>' : (it.isMine ? '<div class="cta mine">我的单子</div>' : '')) +
          '</div>';
      }).join('');
    } else {
      const cur = TABS.find(function (t) { return t.key === scope; });
      listHtml = '<div class="empty"><div>' + cur.empty + '</div><div class="empty-sub">' + cur.sub + '</div></div>';
    }

    pageEl.innerHTML = '<div class="page on-tab">' +
      '<div class="masthead"><div class="brand display">法 庭</div><div class="sub">围观大家的购物案，当个陪审员</div></div>' +
      '<div class="tabs">' +
      TABS.map(function (t) {
        return '<div class="tab' + (scope === t.key ? ' active' : '') + '" data-act="pool-scope" data-scope="' + t.key + '">' + t.text + '</div>';
      }).join('') +
      '</div>' +
      '<div class="list">' + listHtml + '</div>' +
      '<div class="dock on-tab"><div class="btn-primary" data-act="go-apply">我 也 交 一 份</div></div>' +
      '</div>';
  }

  // ============================================================
  // 申请页 apply
  // ============================================================
  function renderApply() {
    const a = state.apply;
    const deadlinePreview = U.formatDeadline(Date.now() + a.duration * 3600 * 1000);
    let pics = '';
    a.images.forEach(function (src, i) {
      pics += '<div class="pic"><img class="pic-img" src="' + esc(src) + '" alt="" /><div class="pic-x" data-act="apply-remove-img" data-index="' + i + '">×</div></div>';
    });
    if (a.images.length < 4) pics += '<div class="pic pic-add" data-act="apply-choose-img">＋</div>';

    pageEl.innerHTML = '<div class="page">' +
      '<div class="sheet-head"><div class="sheet-title display">购 物 申 请 单</div></div>' +
      '<div class="form">' +
      '<div class="fieldbox"><span class="form-label">想买啥</span><input class="form-input strong" maxlength="20" placeholder="空气炸锅" value="' + esc(a.title) + '" data-input="title" /></div>' +
      '<div class="fieldbox"><span class="form-label">多少钱</span><input class="form-input money" type="number" inputmode="decimal" placeholder="¥ 299" value="' + esc(a.priceText) + '" data-input="price" /></div>' +
      '<div class="fieldbox"><span class="form-label">为什么想买</span><input class="form-input" maxlength="40" placeholder="想做好吃的" value="' + esc(a.reason) + '" data-input="reason" /></div>' +
      '<div class="fieldbox sage"><span class="form-label">家里有替代品吗</span><input class="form-input" maxlength="40" placeholder="电煮锅算吗…" value="' + esc(a.alternative) + '" data-input="alternative" /></div>' +
      '<div class="fieldbox"><span class="form-label">来几张图（选填，' + a.images.length + '/4）</span><div class="pic-row">' + pics + '</div></div>' +
      '<div class="fieldbox"><span class="form-label">有效期</span>' +
      '<div class="scope-grid">' +
      [['24', '24 小时'], ['72', '3 天'], ['168', '7 天']].map(function (d) {
        return '<div class="scope-chip' + (a.duration === Number(d[0]) ? ' active' : '') + '" data-act="apply-duration" data-h="' + d[0] + '">' + d[1] + '</div>';
      }).join('') +
      '</div><div class="scope-hint">审批到 ' + deadlinePreview + '，到点自动落章</div></div>' +
      '<div class="fieldbox"><span class="form-label">谁来审批</span>' +
      '<div class="scope-grid">' +
      '<div class="scope-chip' + (a.visibility === 'friends' ? ' active' : '') + '" data-act="apply-visibility" data-v="friends">好友</div>' +
      '<div class="scope-chip' + (a.visibility === 'court' ? ' active' : '') + '" data-act="apply-visibility" data-v="court">法庭</div>' +
      '</div><div class="scope-hint">' + (a.visibility === 'court' ? '会挂到法庭大众池，陌生人也能当陪审员' : '只有拿到卡片的人能看到') + '</div></div>' +
      '</div>' +
      '<div class="dock"><div class="btn-primary" data-act="apply-submit">生 成 审 批 单</div></div>' +
      '</div>';
  }

  function submitApply() {
    const a = state.apply;
    const priceFen = U.parseYuan(a.priceText);
    if (!a.title.trim()) return toast('想买啥不能空');
    if (!priceFen) return toast('请填个金额');
    if (!a.reason.trim()) return toast('说服一下自己和朋友');

    const res = S.createItem({
      title: a.title.trim(),
      price: priceFen,
      reason: a.reason.trim(),
      alternative: a.alternative.trim(),
      visibility: a.visibility,
      duration: a.duration,
      imageFileIDs: a.images,
    });
    if (!res.ok) return toast(res.reason);
    // 清空表单
    state.apply = { title: '', priceText: '', reason: '', alternative: '', visibility: 'friends', duration: 24, images: [], focus: '' };
    location.hash = '#/share/' + res.item._id;
  }

  // ============================================================
  // 分享页 share
  // ============================================================
  function renderShare(id) {
    const res = S.getItem(id);
    if (!res.ok) { pageEl.innerHTML = '<div class="page"><div class="empty">' + esc(res.reason) + '</div></div>'; return; }
    const it = res.item;
    const gallery = (it.imageFileIDs && it.imageFileIDs.length) ? it.imageFileIDs.slice(0, 4) : (it.imageFileID ? [it.imageFileID] : []);

    pageEl.innerHTML = '<div class="page">' +
      '<div class="wrap">' +
      '<div class="block-sage hero">' +
      '<div class="doc-title sage-title">' + esc(it.title) + '</div>' +
      '<div class="pill-ink">申批金额 ¥ ' + esc(U.formatYuan(it.price, false)) + '</div>' +
      '</div>' +
      '<div class="card detail">' +
      galleryHtml(gallery) +
      '<div class="doc-field"><span class="lf">理由</span><span class="rg">' + esc(it.reason) + '</span></div>' +
      (it.alternative ? '<div class="doc-field"><span class="lf">替代品</span><span class="rg">' + esc(it.alternative) + '</span></div>' : '') +
      '<div class="doc-field"><span class="lf">截止</span><span class="rg">' + esc(U.formatDeadline(it.deadlineAt)) + '</span></div>' +
      '<div class="doc-seal">' + sealHtml('pending', 'small', false) + '</div>' +
      '</div>' +
      '<div class="muted-hint">灰章会在结果出来时变色</div>' +
      '</div>' +
      '<div class="dock">' +
      '<div class="btn-primary" data-act="share-copy" data-id="' + it._id + '">分 享 到 群 求 审 批</div>' +
      '<div class="remove-link" data-act="remove" data-id="' + it._id + '">删除这单</div>' +
      '</div>' +
      '</div>';
  }

  // ============================================================
  // 审批页 approve
  // ============================================================
  function renderApprove(id, isCourt) {
    const res = S.getItem(id);
    if (!res.ok) { pageEl.innerHTML = '<div class="page"><div class="empty">' + esc(res.reason) + '</div></div>'; return; }
    const it = res.item;
    state.approve.id = id;
    state.approve.isCourt = isCourt;
    state.approve.myVote = res.myVote;
    state.approve.isOwner = res.isOwner;

    const gallery = (it.imageFileIDs && it.imageFileIDs.length) ? it.imageFileIDs.slice(0, 4) : (it.imageFileID ? [it.imageFileID] : []);
    const sealType = sealTypeOf(it);
    const friends = res.approvals.filter(function (a) { return a.source !== 'court'; });
    const jury = res.approvals.filter(function (a) { return a.source === 'court'; });
    const expired = it.status !== 1 || it.deadlineAt <= Date.now();
    const canVote = !res.myVote && !expired && !res.isOwner;

    let askHtml;
    if (isCourt) askHtml = '<div class="ask court">法庭 · 陪审团席</div>';
    else if (it.ownerNick) askHtml = '<div class="ask owner">' + (it.ownerAvatar ? '<img class="mini-avatar" src="' + esc(it.ownerAvatar) + '" alt="" />' : '') + '<span>' + esc(it.ownerNick) + ' 请你审批</span></div>';
    else askHtml = '<div class="ask">有人请你审批</div>';

    // 投票区
    let voteArea = '';
    if (canVote) {
      voteArea =
        '<div class="named-row">' +
        '<div class="named-pill' + (!state.approve.named ? ' on' : '') + '" data-act="approve-named" data-named="0">匿名</div>' +
        '<div class="named-pill' + (state.approve.named ? ' on' : '') + '" data-act="approve-named" data-named="1">实名</div>' +
        '<span class="named-hint">' + (state.approve.named ? '会显示你的昵称头像' : '显示为「审批人甲」') + '</span>' +
        '</div>';
      if (state.approve.named) {
        voteArea += '<div class="card profile-inline">' +
          '<div class="avatar-btn">' + (state.approve.avatarSrc
            ? '<img class="avatar" src="' + esc(state.approve.avatarSrc) + '" alt="" />'
            : '<div class="avatar avatar-ph">?</div>') + '</div>' +
          '<input class="nick" maxlength="20" placeholder="点这里填昵称" value="' + esc(state.approve.draftNick) + '" data-input="approve-nick" />' +
          '</div>';
      }
      voteArea += '<div class="comment-label">说句话（选填，30 字内）</div>' +
        '<div class="card comment-card"><textarea class="comment" maxlength="30" placeholder="批！我也想吃" data-input="approve-comment">' + esc(state.approve.comment) + '</textarea>' +
        '<div class="counter" id="comment-counter">' + state.approve.comment.length + '/30</div></div>';
    } else {
      let reason;
      if (res.isOwner) reason = '这是你自己的单子';
      else if (res.myVote) reason = '你投了「' + (res.myVote === 1 ? '批' : '不批') + '」';
      else reason = '这单已经截止了';
      voteArea = '<div class="closed">' + reason + '</div>';
    }

    let juryHtml = '';
    if ((it.juryApproveCnt || 0) + (it.juryRejectCnt || 0) > 0) {
      juryHtml = '<div class="comments-title jury-title"><span>陪审团意见</span><span class="jury-cnt">批 ' + (it.juryApproveCnt || 0) + ' · 不批 ' + (it.juryRejectCnt || 0) + '</span></div>' + commentsHtml(jury);
    }

    let dockHtml = '';
    if (canVote) {
      dockHtml = '<div class="dock"><div class="vote-row">' +
        '<div class="btn-reject flex1" data-act="vote" data-vote="2">不 批</div>' +
        '<div class="btn-approve flex1" data-act="vote" data-vote="1">批</div>' +
        '</div><div class="muted-hint">' + (isCourt ? '陪审团的票不决定结果，但会被看见' : '投完就走，不用注册') + '</div></div>';
    } else if (res.isOwner) {
      dockHtml = '<div class="dock"><div class="btn-ghost" data-act="go-result" data-id="' + it._id + '">去处理这单</div></div>';
    }

    pageEl.innerHTML = '<div class="page approve-page">' +
      '<div class="head"><div class="brand display">批 了 么</div>' + askHtml + '</div>' +
      '<div class="wrap">' +
      '<div class="block-sage hero">' +
      '<div class="hero-top"><span class="deadline">截止 ' + esc(U.formatDeadline(it.deadlineAt)) + '</span>' +
      '<span class="clock" id="approve-clock">' + (expired ? '已截止' : U.remainClock(it.deadlineAt)) + '</span></div>' +
      '<div class="hero-line"><span class="doc-title sage-title">' + esc(it.title) + '</span><span class="hero-price">¥ ' + esc(U.formatYuan(it.price, false)) + '</span></div>' +
      chipsHtml(it) +
      '<div class="doc-seal">' + sealHtml(sealType, 'small', false) + '</div>' +
      '</div>' +
      attachHtml(it, gallery) +
      voteArea +
      '<div class="comments-title">审批意见</div>' + commentsHtml(friends) +
      juryHtml +
      '</div>' +
      dockHtml +
      '</div>';

    if (!expired) {
      startClock('approve-clock', function () {
        const left = it.deadlineAt - Date.now();
        if (left <= 0) { clearTimers(); return '已截止'; }
        return U.remainClock(it.deadlineAt);
      });
    }
  }

  // ============================================================
  // 结果页 result
  // ============================================================
  function renderResult(id) {
    const res = S.getItem(id);
    if (!res.ok) { pageEl.innerHTML = '<div class="page"><div class="empty">' + esc(res.reason) + '</div></div>'; return; }
    const it = res.item;
    const isOwner = res.isOwner;

    // 不是发起人、还在审批中 → 跳审批页
    if (!isOwner && it.status === 1) { location.replace('#/approve/' + it._id); return; }

    const gallery = (it.imageFileIDs && it.imageFileIDs.length) ? it.imageFileIDs.slice(0, 4) : (it.imageFileID ? [it.imageFileID] : []);
    const sealType = sealTypeOf(it);
    const friends = res.approvals.filter(function (a) { return a.source !== 'court'; });
    const jury = res.approvals.filter(function (a) { return a.source === 'court'; });
    const canDecide = isOwner && it.status !== 4;

    let ownerHtml = '';
    if (it.ownerNick) ownerHtml = '<div class="owner">' + (it.ownerAvatar ? '<img class="mini-avatar" src="' + esc(it.ownerAvatar) + '" alt="" />' : '') + '<span>' + esc(it.ownerNick) + '</span></div>';

    let juryHtml = '';
    if ((it.juryApproveCnt || 0) + (it.juryRejectCnt || 0) > 0) {
      juryHtml = '<div class="comments-title jury-title"><span>陪审团意见</span><span class="jury-cnt">批 ' + (it.juryApproveCnt || 0) + ' · 不批 ' + (it.juryRejectCnt || 0) + '</span></div>' + commentsHtml(jury);
    }

    let dockHtml = '';
    if (isOwner) {
      let voteRow = '';
      if (canDecide) {
        voteRow = '<div class="vote-row">' +
          '<div class="btn-reject flex1" data-act="decide" data-id="' + it._id + '" data-d="1">还是买了</div>' +
          '<div class="btn-approve flex1" data-act="decide" data-id="' + it._id + '" data-d="2">算 了</div>' +
          '</div>';
      }
      dockHtml = '<div class="dock">' + voteRow +
        '<div class="btn-ghost gap" data-act="result-save">保 存 这 张 · 发 群 里</div>' +
        '<div class="remove-link" data-act="remove" data-id="' + it._id + '">删除这单</div>' +
        '</div>';
    }

    pageEl.innerHTML = '<div class="page">' +
      '<div class="wrap">' +
      '<div class="block-sage hero">' +
      ownerHtml +
      (it.status === 1 ? '<div class="deadline">截止 ' + esc(U.formatDeadline(it.deadlineAt)) + '</div>' : '') +
      '<div class="hero-line"><span class="doc-title sage-title">' + esc(it.title) + '</span><span class="hero-price">¥ ' + esc(U.formatYuan(it.price, false)) + '</span></div>' +
      chipsHtml(it) +
      '<div class="doc-seal">' + sealHtml(sealType, false, sealType !== 'pending') + '</div>' +
      '</div>' +
      '<div class="card attach">' + galleryHtml(gallery) +
      '<div class="doc-field"><span class="lf">理由</span><span class="rg">' + esc(it.reason || '—') + '</span></div>' +
      (it.alternative ? '<div class="doc-field"><span class="lf">替代品</span><span class="rg">' + esc(it.alternative) + '</span></div>' : '') +
      '</div>' +
      '<div class="comments-title">审批意见</div>' + commentsHtml(friends) +
      juryHtml +
      '</div>' +
      dockHtml +
      '</div>';
  }

  // ============================================================
  // 冷静复盘 cooling
  // ============================================================
  function renderCooling(id) {
    let it = null;
    let savedAmount = S.getMe().me.savedAmount;
    if (id) {
      const res = S.getItem(id);
      if (res.ok) it = res.item;
    }
    if (!it) {
      // 取最近一条待了结（done：status 2/3）的单子
      const res = S.listMyItems('done');
      it = res.list.length ? res.list[0] : null;
    }

    let body;
    if (it) {
      const res = S.getItem(it._id);
      const approvals = res.approvals.filter(function (a) { return a.source !== 'court'; });
      const withText = approvals.filter(function (a) { return a.comment; });
      const pick = withText.find(function (a) { return a.vote === 2; }) || withText[0] || null;

      body =
        '<div class="lock">' +
        '<div class="lock-time" id="cooling-clock">--:--</div>' +
        '<div class="lock-date" id="cooling-date"></div>' +
        '<div class="notif"><div class="notif-app">批了么</div><div class="notif-title">昨天那个' + esc(it.title) + '</div><div class="notif-text">已经过去 24 小时了，现在还想买吗？</div></div>' +
        (pick ? '<div class="notif dim"><div class="notif-app">批了么</div><div class="notif-title">' + esc(pick.voterAlias || pick.voterNick) + '给你盖了个章</div><div class="notif-text">「' + esc(pick.comment) + '」</div></div>' : '') +
        '</div>' +
        '<div class="saved-card">' +
        '<div class="saved-label">本月被拦下的金额</div>' +
        '<div class="saved-amount" id="cooling-saved">¥ ' + esc(U.formatYuan(savedAmount, false)) + '</div>' +
        '<div class="vote-row">' +
        '<div class="btn-reject flex1" data-act="decide" data-id="' + it._id + '" data-d="1">还是买了</div>' +
        '<div class="btn-approve flex1" data-act="decide" data-id="' + it._id + '" data-d="2">算 了</div>' +
        '</div></div>' +
        '<div class="foot">真正省下钱的不是朋友的投票，是这 24 小时。</div>';
    } else {
      body =
        '<div class="empty"><div>暂时没有要复盘的单子</div><div class="empty-sub">本月已拦下 ¥ ' + esc(U.formatYuan(savedAmount, false)) + '</div></div>' +
        '<div class="dock"><div class="btn-ghost" data-act="go-list">回到列表</div></div>';
    }

    pageEl.innerHTML = '<div class="page cooling">' + body + '</div>';

    startClock('cooling-clock', function () {
      const d = new Date();
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    });
    const dateEl = document.getElementById('cooling-date');
    if (dateEl) {
      const d = new Date();
      const wk = ['日', '一', '二', '三', '四', '五', '六'];
      dateEl.textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + wk[d.getDay()];
    }
  }

  // ============================================================
  // 我的 me
  // ============================================================
  function renderMe() {
    const me = S.getMe().me;
    const s = state.me;
    s.draftNick = s.draftNick !== '' && s.dirty ? s.draftNick : me.nickName;
    const nick = s.dirty ? s.draftNick : me.nickName;
    const avatarSrc = s.dirty ? s.avatarSrc : me.avatarFileID;

    pageEl.innerHTML = '<div class="page on-tab">' +
      '<div class="wrap">' +
      '<div class="block-sage profile">' +
      '<div class="avatar-btn" data-act="me-avatar">' +
      (avatarSrc ? '<img class="avatar" src="' + esc(avatarSrc) + '" alt="" />' : '<div class="avatar avatar-ph">?</div>') +
      '</div>' +
      '<div class="profile-body">' +
      '<input class="nick" maxlength="20" placeholder="点这里填昵称" value="' + esc(nick) + '" data-input="me-nick" />' +
      '<div class="profile-hint">' + (me.nickName ? '头像昵称会出现在你的审批单上' : '设置后，朋友能看到是谁在纠结') + '</div>' +
      '</div></div>' +
      (s.dirty ? '<div class="btn-primary save" data-act="me-save">保 存</div>' : '') +
      '<div class="card stats">' +
      '<div class="row"><span class="lb">已拦下</span><span class="val red">¥ ' + esc(U.formatYuan(me.savedAmount, false)) + '</span></div>' +
      '<div class="row"><span class="lb">累计交了</span><span class="val">' + (me.docSeq || 0) + ' 单</span></div>' +
      '</div>' +
      '<div class="remove-link" style="margin-top:24px;" data-act="reset">重置演示数据</div>' +
      '</div>' +
      '</div>';
  }

  // ============================================================
  // 事件委托
  // ============================================================
  pageEl.addEventListener('click', function (e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.getAttribute('data-act');
    const data = function (k) { return t.getAttribute('data-' + k); };

    switch (act) {
      // ---- 引导页 ----
      case 'ob-next':
        state.obStep = Math.min(4, state.obStep + 1);
        render(); break;
      case 'ob-skip':
        S.markOnboardingSeen(); location.hash = '#/list'; break;
      case 'ob-go-apply':
        S.markOnboardingSeen(); location.hash = '#/apply'; break;
      case 'ob-go-pool':
        S.markOnboardingSeen(); location.hash = '#/pool'; break;

      // ---- 导航 ----
      case 'go-apply': location.hash = '#/apply'; break;
      case 'go-list': location.hash = '#/list'; break;
      case 'go-result': location.hash = '#/result/' + data('id'); break;

      // ---- 首页 ----
      case 'list-mode':
        state.list.mode = data('mode'); render(); break;
      case 'list-tab':
        state.list.tab = data('tab'); render(); break;
      case 'open': location.hash = '#/result/' + data('id'); break;

      // ---- 法庭 ----
      case 'pool-scope':
        state.pool.scope = data('scope'); render(); break;
      case 'open-pool': {
        const votable = data('votable') === '1';
        if (votable) {
          location.hash = state.pool.scope === 'all' ? '#/approve/' + data('id') + '?from=court' : '#/approve/' + data('id');
        } else {
          location.hash = '#/result/' + data('id');
        }
        break;
      }

      // ---- 申请页 ----
      case 'apply-duration':
        state.apply.duration = Number(data('h')); render(); break;
      case 'apply-visibility':
        state.apply.visibility = data('v'); render(); break;
      case 'apply-choose-img': chooseImages(); break;
      case 'apply-remove-img': {
        const i = Number(data('index'));
        state.apply.images.splice(i, 1); render(); break;
      }
      case 'apply-submit': submitApply(); break;

      // ---- 审批页 ----
      case 'approve-named': {
        state.approve.named = data('named') === '1';
        if (state.approve.named && !state.approve.me) {
          const r = S.getMe();
          state.approve.me = r.me;
          state.approve.draftNick = r.me.nickName;
          state.approve.draftAvatar = r.me.avatarFileID;
          state.approve.avatarSrc = r.me.avatarFileID;
        }
        render(); break;
      }
      case 'vote': doVote(Number(data('vote'))); break;

      // ---- 结果页 ----
      case 'decide': doDecide(data('id'), Number(data('d'))); break;
      case 'result-save': toast('小程序里会生成带二维码的卡片图存到相册'); break;

      // ---- 分享页 / 删除 ----
      case 'share-copy': {
        const url = location.origin + location.pathname + '#/approve/' + data('id');
        if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(function () { toast('审批链接已复制'); }, function () { toast(url); });
        } else {
          toast('审批链接：' + url);
        }
        break;
      }
      case 'remove': doRemove(data('id')); break;

      // ---- 我的 ----
      case 'me-avatar': chooseAvatar(); break;
      case 'me-save': saveProfile(); break;
      case 'reset':
        confirmDialog('重置演示数据？', '所有改动会清空，恢复成初始演示数据。', function () {
          S.reset(); state.me = { draftNick: '', draftAvatar: '', avatarSrc: '', dirty: false, saving: false };
          render(); toast('已重置');
        });
        break;
    }
  });

  // 输入事件委托
  pageEl.addEventListener('input', function (e) {
    const t = e.target;
    const field = t.getAttribute('data-input');
    if (!field) return;
    const v = t.value || '';
    switch (field) {
      case 'title': state.apply.title = v; break;
      case 'price': state.apply.priceText = v; break;
      case 'reason': state.apply.reason = v; break;
      case 'alternative': state.apply.alternative = v; break;
      case 'approve-nick': state.approve.draftNick = v.trim(); break;
      case 'approve-comment': {
        state.approve.comment = v;
        const c = document.getElementById('comment-counter');
        if (c) c.textContent = v.length + '/30';
        break;
      }
      case 'me-nick': {
        state.me.draftNick = v.trim();
        const me = S.getMe().me;
        state.me.dirty = v.trim() !== me.nickName || state.me.avatarSrc !== me.avatarFileID;
        break;
      }
    }
  });

  // 昵称失焦时重渲染，刷新保存按钮与 dirty 态
  pageEl.addEventListener('focusout', function (e) {
    if (e.target.getAttribute('data-input') === 'me-nick') render();
  });

  // ---- 投票 ----
  function doVote(v) {
    const ck = U.checkComment(state.approve.comment);
    if (!ck.ok) return toast(ck.reason);

    if (state.approve.named) {
      const nick = state.approve.draftNick.trim();
      if (!nick) return toast('实名要填个昵称，或者改回匿名');
      const me = S.getMe().me;
      if (nick !== me.nickName || state.approve.avatarSrc !== me.avatarFileID) {
        S.updateProfile({ nickName: nick, avatarFileID: state.approve.avatarSrc });
      }
    }

    const res = S.vote(state.approve.id, v, state.approve.comment, state.approve.isCourt ? 'court' : 'friend', !state.approve.named);
    if (!res.ok) return toast(res.reason);

    toast(v === 1 ? '已批' : '已驳回');
    state.approve.comment = '';
    render();
  }

  // ---- 了结 ----
  function doDecide(id, d) {
    const res = S.getItem(id);
    if (!res.ok) return toast(res.reason);
    const it = res.item;
    if (it.status === 1) {
      confirmDialog(d === 1 ? '还是买了？' : '算了？', '还在审批中，现在就了结的话朋友的投票会停在当前票数，章按现在的票数落。', function () {
        const r = S.decide(id, d);
        if (!r.ok) return toast(r.reason);
        toast(d === 2 ? '省下 ¥' + U.formatYuan(it.price, false) : '已记录');
        setTimeout(render, 600);
      });
    } else {
      const r = S.decide(id, d);
      if (!r.ok) return toast(r.reason);
      toast(d === 2 ? '本月又省一笔' : '已记录');
      setTimeout(function () { location.hash = '#/list'; }, 800);
    }
  }

  // ---- 删除 ----
  function doRemove(id) {
    const it = S.getItem(id).item;
    if (!it) return;
    const extra = it.status === 4 && it.finalDecision === 2 ? '，这单省下的 ¥' + U.formatYuan(it.price, false) + ' 也会从「已拦下」里扣掉' : '';
    confirmDialog('删掉这单？', '朋友的投票和吐槽会一起删掉' + extra + '。删了就找不回来了。', function () {
      const res = S.deleteItem(id);
      if (!res.ok) return toast(res.reason);
      toast('已删除');
      setTimeout(function () { location.hash = '#/list'; }, 500);
    });
  }

  // ---- 头像 ----
  function chooseAvatar() {
    pickImage(function (dataUrl) {
      state.me.draftAvatar = dataUrl;
      state.me.avatarSrc = dataUrl;
      state.me.dirty = true;
      render();
    });
  }
  function saveProfile() {
    const nick = state.me.draftNick.trim();
    if (!nick) return toast('昵称不能空');
    const res = S.updateProfile({ nickName: nick, avatarFileID: state.me.avatarSrc });
    if (!res.ok) return toast(res.reason);
    state.me = { draftNick: '', draftAvatar: '', avatarSrc: '', dirty: false, saving: false };
    toast('已保存');
    render();
  }

  // ---- 图片选择（FileReader → dataURL）----
  let _fileInput = null;
  function ensureFileInput() {
    if (!_fileInput) {
      _fileInput = document.createElement('input');
      _fileInput.type = 'file';
      _fileInput.accept = 'image/*';
      _fileInput.style.display = 'none';
      document.body.appendChild(_fileInput);
    }
    return _fileInput;
  }
  function pickImage(cb) {
    const input = ensureFileInput();
    input.removeAttribute('multiple');
    input.onchange = function () {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function () { cb(reader.result); };
      reader.readAsDataURL(f);
      input.value = '';
    };
    input.click();
  }
  function chooseImages() {
    const left = 4 - state.apply.images.length;
    if (left <= 0) return toast('最多 4 张');
    const input = ensureFileInput();
    input.setAttribute('multiple', '');
    input.onchange = function () {
      const files = Array.prototype.slice.call(input.files || []).slice(0, left);
      if (!files.length) return;
      let done = 0;
      files.forEach(function (f) {
        const reader = new FileReader();
        reader.onload = function () {
          state.apply.images.push(reader.result);
          done++;
          if (done === files.length) { render(); }
        };
        reader.readAsDataURL(f);
      });
      input.value = '';
    };
    input.click();
  }

  // ---------- tabbar 点击 ----------
  tabbarEl.addEventListener('click', function (e) {
    const item = e.target.closest('.tabbar-item');
    if (!item) return;
    const tab = item.getAttribute('data-tab');
    location.hash = '#/' + tab;
  });

  // ---------- 初始化 ----------
  let _inited = false;
  function init() {
    if (_inited) return;
    _inited = true;
    window.addEventListener('hashchange', render);
    if (!location.hash) {
      location.replace(S.isOnboardingSeen() ? '#/list' : '#/onboarding');
      return;
    }
    render();
  }

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();

  return { render };
})();

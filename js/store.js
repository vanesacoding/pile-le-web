/* 数据层 —— 由 pile-le-mini/utils/store.js 复刻
   微信云开发（云函数 + 云数据库）在这里用 localStorage 模拟。
   函数签名与返回结构尽量和云函数保持一致，方便对照小程序源码。 */

window.S = (function () {
  const KEY = 'pilele_web_v1';
  const ME_ID = 'me_demo';   // 当前用户 openid（演示固定一个身份）

  // ---- 持久化 ----
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return null;
  }
  function save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignore */ }
  }

  // ---- demo 数据（相对时间，保证打开时倒计时是活的）----
  function seed() {
    const now = Date.now();
    const H = 3600 * 1000;
    const me = {
      openid: ME_ID,
      nickName: '阿批',
      avatarFileID: '',
      savedAmount: 45900,   // ¥459
      docSeq: 4,
    };
    const items = [
      {
        _id: 'i1', ownerOpenid: ME_ID, ownerNick: '阿批', ownerAvatar: '',
        title: '空气炸锅', price: 29900, reason: '想做好吃的', alternative: '电煮锅算吗…',
        visibility: 'friends', duration: 24, status: 1,
        approveCnt: 1, rejectCnt: 1, juryApproveCnt: 0, juryRejectCnt: 0,
        finalDecision: 0, docSeq: 4,
        deadlineAt: now + 23 * H, createdAt: now - 1 * H,
      },
      {
        _id: 'i2', ownerOpenid: 'other_1', ownerNick: '阿丢', ownerAvatar: '',
        title: '露营帐篷', price: 128000, reason: '周末想去山里躺着', alternative: '',
        visibility: 'court', duration: 24, status: 3,
        approveCnt: 1, rejectCnt: 4, juryApproveCnt: 2, juryRejectCnt: 1,
        finalDecision: 0, docSeq: 9,
        deadlineAt: now - 2 * H, createdAt: now - 26 * H,
      },
      {
        _id: 'i3', ownerOpenid: 'other_2', ownerNick: '阿免', ownerAvatar: '',
        title: '机械键盘', price: 59900, reason: '现在这把键帽有点油', alternative: '',
        visibility: 'court', duration: 72, status: 1,
        approveCnt: 3, rejectCnt: 2, juryApproveCnt: 1, juryRejectCnt: 0,
        finalDecision: 0, docSeq: 5,
        deadlineAt: now + 5 * H, createdAt: now - 67 * H,
      },
      {
        _id: 'i4', ownerOpenid: ME_ID, ownerNick: '阿批', ownerAvatar: '',
        title: '咖啡机', price: 79900, reason: '想在家喝手冲', alternative: '挂耳凑合',
        visibility: 'friends', duration: 24, status: 4,
        approveCnt: 2, rejectCnt: 0, juryApproveCnt: 0, juryRejectCnt: 0,
        finalDecision: 1, docSeq: 2,
        deadlineAt: now - 48 * H, createdAt: now - 96 * H,
      },
      {
        _id: 'i5', ownerOpenid: ME_ID, ownerNick: '阿批', ownerAvatar: '',
        title: '蓝牙耳机', price: 45900, reason: '通勤听播客', alternative: '有线还能用',
        visibility: 'friends', duration: 24, status: 4,
        approveCnt: 0, rejectCnt: 3, juryApproveCnt: 0, juryRejectCnt: 0,
        finalDecision: 2, docSeq: 1,
        deadlineAt: now - 96 * H, createdAt: now - 120 * H,
      },
      {
        _id: 'i6', ownerOpenid: ME_ID, ownerNick: '阿批', ownerAvatar: '',
        title: 'switch 游戏卡带', price: 32900, reason: '想玩新游戏', alternative: '老游戏还没通关',
        visibility: 'court', duration: 24, status: 2,
        approveCnt: 3, rejectCnt: 1, juryApproveCnt: 0, juryRejectCnt: 0,
        finalDecision: 0, docSeq: 3,
        deadlineAt: now - 26 * H, createdAt: now - 50 * H,
      },
      {
        _id: 'i7', ownerOpenid: 'other_3', ownerNick: '阿圈', ownerAvatar: '',
        title: '投影仪', price: 299900, reason: '客厅看电影爽', alternative: '电视还能看',
        visibility: 'friends', duration: 72, status: 1,
        approveCnt: 2, rejectCnt: 1, juryApproveCnt: 0, juryRejectCnt: 0,
        finalDecision: 0, docSeq: 7,
        deadlineAt: now + 48 * H, createdAt: now - 20 * H,
      },
    ];
    const approvals = [
      // i1 空气炸锅（审批中）
      { _id: 'i1_f1', itemId: 'i1', voterOpenid: 'f1', vote: 1, comment: '批！做好了叫我', source: 'friend', voterAlias: '审批人甲' },
      { _id: 'i1_f2', itemId: 'i1', voterOpenid: 'f2', vote: 2, comment: '电煮锅真的够用了', source: 'friend', voterAlias: '审批人乙' },
      // i2 露营帐篷（已驳回，朋友 1 批 4 不批 + 陪审团 2 批 1 不批）
      { _id: 'i2_f1', itemId: 'i2', voterOpenid: 'f1', vote: 1, comment: '帐篷值得', source: 'friend', voterAlias: '审批人甲' },
      { _id: 'i2_f2', itemId: 'i2', voterOpenid: 'f2', vote: 2, comment: '太贵了', source: 'friend', voterAlias: '审批人乙' },
      { _id: 'i2_f3', itemId: 'i2', voterOpenid: 'f3', vote: 2, comment: '一年用不了几次', source: 'friend', voterAlias: '审批人丙' },
      { _id: 'i2_f4', itemId: 'i2', voterOpenid: 'f4', vote: 2, comment: '闲置警告', source: 'friend', voterAlias: '审批人丁' },
      { _id: 'i2_f5', itemId: 'i2', voterOpenid: 'f5', vote: 2, comment: '', source: 'friend', voterAlias: '审批人戊' },
      { _id: 'i2_c1', itemId: 'i2', voterOpenid: 'c1', vote: 1, comment: '买！', source: 'court', voterAlias: '陪审员甲' },
      { _id: 'i2_c2', itemId: 'i2', voterOpenid: 'c2', vote: 1, comment: '', source: 'court', voterAlias: '陪审员乙' },
      { _id: 'i2_c3', itemId: 'i2', voterOpenid: ME_ID, vote: 2, comment: '去年我也冲动买过', source: 'court', voterAlias: '陪审员丙' },
      // i3 机械键盘（审批中，法庭）
      { _id: 'i3_f1', itemId: 'i3', voterOpenid: 'f1', vote: 1, comment: '手感重要', source: 'friend', voterAlias: '审批人甲' },
      { _id: 'i3_f2', itemId: 'i3', voterOpenid: 'f2', vote: 1, comment: '批', source: 'friend', voterAlias: '审批人乙' },
      { _id: 'i3_f3', itemId: 'i3', voterOpenid: 'f3', vote: 1, comment: '', source: 'friend', voterAlias: '审批人丙' },
      { _id: 'i3_f4', itemId: 'i3', voterOpenid: 'f4', vote: 2, comment: '太奢侈', source: 'friend', voterAlias: '审批人丁' },
      { _id: 'i3_f5', itemId: 'i3', voterOpenid: 'f5', vote: 2, comment: '先清理旧的', source: 'friend', voterAlias: '审批人戊' },
      { _id: 'i3_c1', itemId: 'i3', voterOpenid: 'c1', vote: 1, comment: '换一把吧，提升幸福感', source: 'court', voterAlias: '陪审员甲' },
      // i4 咖啡机（已了结，买了）
      { _id: 'i4_f1', itemId: 'i4', voterOpenid: 'f1', vote: 1, comment: '早上提神', source: 'friend', voterAlias: '审批人甲' },
      { _id: 'i4_f2', itemId: 'i4', voterOpenid: 'f2', vote: 1, comment: '', source: 'friend', voterAlias: '审批人乙' },
      // i5 蓝牙耳机（已了结，算了）
      { _id: 'i5_f1', itemId: 'i5', voterOpenid: 'f1', vote: 2, comment: '有线挺好的', source: 'friend', voterAlias: '审批人甲' },
      { _id: 'i5_f2', itemId: 'i5', voterOpenid: 'f2', vote: 2, comment: '还能听', source: 'friend', voterAlias: '审批人乙' },
      { _id: 'i5_f3', itemId: 'i5', voterOpenid: 'f3', vote: 2, comment: '省点吧', source: 'friend', voterAlias: '审批人丙' },
      // i6 游戏卡带（已批准）
      { _id: 'i6_f1', itemId: 'i6', voterOpenid: 'f1', vote: 1, comment: '买', source: 'friend', voterAlias: '审批人甲' },
      { _id: 'i6_f2', itemId: 'i6', voterOpenid: 'f2', vote: 1, comment: '', source: 'friend', voterAlias: '审批人乙' },
      { _id: 'i6_f3', itemId: 'i6', voterOpenid: 'f3', vote: 1, comment: '可以', source: 'friend', voterAlias: '审批人丙' },
      { _id: 'i6_f4', itemId: 'i6', voterOpenid: 'f4', vote: 2, comment: '通关旧的先', source: 'friend', voterAlias: '审批人丁' },
      // i7 投影仪（好友分享，审批中，我投了批）
      { _id: 'i7_f1', itemId: 'i7', voterOpenid: ME_ID, vote: 1, comment: '客厅看电影很爽', source: 'friend', voterAlias: '审批人甲' },
      { _id: 'i7_f2', itemId: 'i7', voterOpenid: 'f1', vote: 1, comment: '值得', source: 'friend', voterAlias: '审批人乙' },
      { _id: 'i7_f3', itemId: 'i7', voterOpenid: 'f2', vote: 2, comment: '太贵', source: 'friend', voterAlias: '审批人丙' },
    ];
    return { me, items, approvals, onboardingSeen: false, version: 1 };
  }

  let db = load();
  if (!db) {
    db = seed();
    save(db);
  }

  function getDB() { return db; }
  function persist() { save(db); }
  function reset() {
    db = seed();
    save(db);
  }

  // ---- 工具 ----
  function itemById(id) {
    return db.items.find(function (it) { return it._id === id; }) || null;
  }
  function approvalsOf(itemId) {
    return db.approvals.filter(function (a) { return a.itemId === itemId; });
  }
  function myApproval(itemId) {
    return db.approvals.find(function (a) { return a.itemId === itemId && a.voterOpenid === ME_ID; }) || null;
  }

  // 写操作版本号（对应小程序 store.js 的 writeSeq，页面据此决定是否刷新）
  let writeSeq = 0;
  function bump() { writeSeq += 1; }
  function getWriteSeq() { return writeSeq; }

  // ---- 云函数模拟 ----

  // createItem
  function createItem(payload) {
    const now = Date.now();
    const seq = db.me.docSeq + 1;
    const item = {
      _id: 'i' + now.toString(36) + Math.random().toString(36).slice(2, 6),
      ownerOpenid: ME_ID,
      ownerNick: db.me.nickName || '',
      ownerAvatar: db.me.avatarFileID || '',
      title: payload.title,
      price: payload.price,
      reason: payload.reason,
      alternative: payload.alternative || '',
      imageFileIDs: payload.imageFileIDs || [],
      imageFileID: (payload.imageFileIDs && payload.imageFileIDs[0]) || '',
      visibility: payload.visibility || 'friends',
      duration: payload.duration || 24,
      status: 1,
      approveCnt: 0, rejectCnt: 0, juryApproveCnt: 0, juryRejectCnt: 0,
      finalDecision: 0,
      docSeq: seq,
      deadlineAt: now + (payload.duration || 24) * 3600 * 1000,
      createdAt: now,
    };
    db.items.unshift(item);
    db.me.docSeq = seq;
    persist();
    bump();
    return { ok: true, item: item };
  }

  // getItem（审批人和发起人共用）
  function getItem(id) {
    const it = itemById(id);
    if (!it) return { ok: false, reason: '单子不存在或已删除' };
    return {
      ok: true,
      item: it,
      approvals: approvalsOf(id),
      myVote: myApproval(id) ? myApproval(id).vote : null,
      isOwner: it.ownerOpenid === ME_ID,
    };
  }

  // listMyItems: tab = pending | done | final
  function listMyItems(tab) {
    let list = db.items.filter(function (it) { return it.ownerOpenid === ME_ID; });
    if (tab === 'pending') list = list.filter(function (it) { return it.status === 1; });
    else if (tab === 'done') list = list.filter(function (it) { return it.status === 2 || it.status === 3; });
    else list = list.filter(function (it) { return it.status === 4; });
    list.sort(function (a, b) { return b.createdAt - a.createdAt; });
    const counts = {
      pending: db.items.filter(function (it) { return it.ownerOpenid === ME_ID && it.status === 1; }).length,
      done: db.items.filter(function (it) { return it.ownerOpenid === ME_ID && (it.status === 2 || it.status === 3); }).length,
      final: db.items.filter(function (it) { return it.ownerOpenid === ME_ID && it.status === 4; }).length,
    };
    return { ok: true, list: list, counts: counts, savedAmount: db.me.savedAmount };
  }

  // listPublicItems: scope = all 大众的 / mine 我的 / friends 好友的
  function listPublicItems(scope) {
    let list;
    if (scope === 'all') {
      list = db.items.filter(function (it) { return it.visibility === 'court'; });
    } else if (scope === 'mine') {
      list = db.items.filter(function (it) { return it.ownerOpenid === ME_ID && it.visibility === 'court'; });
    } else {
      // friends：分享给我、我打开过的 → 简化：别人（非我）的单子，且我投过票（friend 来源）
      const myVotedIds = {};
      db.approvals.forEach(function (a) {
        if (a.voterOpenid === ME_ID && a.source === 'friend') myVotedIds[a.itemId] = true;
      });
      list = db.items.filter(function (it) { return it.ownerOpenid !== ME_ID && myVotedIds[it._id]; });
    }
    list.sort(function (a, b) { return b.createdAt - a.createdAt; });
    const decorated = list.map(function (it) {
      return Object.assign({}, it, { isMine: it.ownerOpenid === ME_ID });
    });
    return { ok: true, list: decorated, cursor: null, hasMore: false };
  }

  // getMe
  function getMe() {
    return { ok: true, me: db.me };
  }

  // listMyApprovals（我审过的）
  function listMyApprovals() {
    const myVotes = db.approvals.filter(function (a) { return a.voterOpenid === ME_ID; });
    const list = myVotes.map(function (a) {
      const it = itemById(a.itemId);
      return { vote: a.vote, comment: a.comment, source: a.source, item: it };
    }).filter(function (x) { return x.item; });
    list.sort(function (a, b) { return b.item.createdAt - a.item.createdAt; });
    return { ok: true, list: list };
  }

  // updateProfile
  function updateProfile(p) {
    db.me.nickName = p.nickName;
    if (p.avatarFileID !== undefined) db.me.avatarFileID = p.avatarFileID;
    // 同步更新自己单子上的 ownerNick/ownerAvatar 快照
    db.items.forEach(function (it) {
      if (it.ownerOpenid === ME_ID) {
        it.ownerNick = p.nickName;
        it.ownerAvatar = p.avatarFileID || it.ownerAvatar;
      }
    });
    persist();
    bump();
    return { ok: true };
  }

  // vote: vote 1 批 / 2 不批；source friend / court；anonymous true/false
  function vote(itemId, voteValue, comment, source, anonymous) {
    const it = itemById(itemId);
    if (!it) return { ok: false, reason: '单子不存在' };
    if (it.ownerOpenid === ME_ID) return { ok: false, reason: '不能投自己的单子' };
    if (myApproval(itemId)) return { ok: false, reason: '你已经投过了' };
    if (it.status !== 1) return { ok: false, reason: '这单已经截止了' };
    if (it.deadlineAt <= Date.now()) return { ok: false, reason: '这单已经截止了' };

    const sourceCount = approvalsOf(itemId).filter(function (a) { return a.source === source; }).length;
    const rec = {
      _id: itemId + '_' + ME_ID + '_' + Date.now(),
      itemId: itemId,
      voterOpenid: ME_ID,
      vote: voteValue,
      comment: comment || '',
      source: source,
      voterAlias: anonymous ? U.voterAlias(sourceCount) : (db.me.nickName || '审批人'),
    };
    if (!anonymous) {
      rec.voterNick = db.me.nickName;
      rec.voterAvatar = db.me.avatarFileID || '';
    }
    db.approvals.push(rec);
    if (source === 'court') {
      if (voteValue === 1) it.juryApproveCnt += 1; else it.juryRejectCnt += 1;
    } else {
      if (voteValue === 1) it.approveCnt += 1; else it.rejectCnt += 1;
    }
    persist();
    bump();
    return { ok: true };
  }

  // decide: decision 1 买了 / 2 算了
  function decide(itemId, decision) {
    const it = itemById(itemId);
    if (!it) return { ok: false, reason: '单子不存在' };
    if (it.ownerOpenid !== ME_ID) return { ok: false, reason: '这不是你的单子' };
    if (it.status === 4) return { ok: false, reason: '这单已经了结了' };
    if (decision === 2) {
      db.me.savedAmount += it.price;
    }
    it.finalDecision = decision;
    it.status = 4;
    persist();
    bump();
    return { ok: true, savedAmount: db.me.savedAmount };
  }

  // deleteItem
  function deleteItem(itemId) {
    const it = itemById(itemId);
    if (!it) return { ok: false, reason: '单子不存在' };
    if (it.ownerOpenid !== ME_ID) return { ok: false, reason: '这不是你的单子' };
    if (it.status === 4 && it.finalDecision === 2) {
      db.me.savedAmount = Math.max(0, db.me.savedAmount - it.price);
    }
    db.items = db.items.filter(function (x) { return x._id !== itemId; });
    db.approvals = db.approvals.filter(function (x) { return x.itemId !== itemId; });
    persist();
    bump();
    return { ok: true };
  }

  // getQrCode（web 版无小程序码，返回占位）
  function getQrCode() { return { ok: false, fileID: '' }; }

  // track 埋点（web 版空操作）
  function track() {}

  function markOnboardingSeen() { db.onboardingSeen = true; save(db); }
  function isOnboardingSeen() { return !!db.onboardingSeen; }

  return {
    getDB, reset, getWriteSeq, markOnboardingSeen, isOnboardingSeen,
    createItem, getItem, listMyItems, listPublicItems,
    getMe, updateProfile, listMyApprovals, getQrCode,
    vote, decide, deleteItem, track,
  };
})();

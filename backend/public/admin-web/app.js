(function () {
  'use strict';

  const MODERN_LOGIN_PATH = '/admin-web/login-modern.html';
  const STORAGE_OPENID = 'movieTicketWebAdminOpenid';
  const STORAGE_USER = 'movieTicketWebAdminUser';
  const STATUS_LABEL = {
    pending: '待支付',
    paid: '已支付',
    used: '已使用',
    cancelled: '已取消',
    refunded: '已退款',
    showing: '上映中',
    coming: '即将上映',
    off: '已下架'
  };

  function apiUrl(p) {
    if (p.startsWith('http')) return p;
    return p.startsWith('/') ? p : '/' + p;
  }

  function getOpenid() {
    try {
      return sessionStorage.getItem(STORAGE_OPENID) || '';
    } catch (e) {
      return '';
    }
  }

  function headersBase() {
    const h = { 'Content-Type': 'application/json' };
    const oid = getOpenid();
    if (oid) h['x-openid'] = oid;
    return h;
  }

  async function apiGet(path) {
    const h = {};
    const oid = getOpenid();
    if (oid) h['x-openid'] = oid;
    const res = await fetch(apiUrl(path), { headers: h });
    return res.json().catch(function () {
      return {};
    });
  }

  async function apiPost(path, body, timeoutMs) {
    const h = headersBase();
    const opts = { method: 'POST', headers: h, body: JSON.stringify(body || {}) };
    if (timeoutMs) {
      const ctrl = new AbortController();
      const t = setTimeout(function () {
        ctrl.abort();
      }, timeoutMs);
      opts.signal = ctrl.signal;
      try {
        const res = await fetch(apiUrl(path), opts);
        clearTimeout(t);
        return res.json().catch(function () {
          return {};
        });
      } catch (e) {
        clearTimeout(t);
        throw e;
      }
    }
    const res = await fetch(apiUrl(path), opts);
    return res.json().catch(function () {
      return {};
    });
  }

  async function apiPatch(path, body) {
    const h = headersBase();
    const res = await fetch(apiUrl(path), { method: 'PATCH', headers: h, body: JSON.stringify(body || {}) });
    return res.json().catch(function () {
      return {};
    });
  }

  async function apiDelete(path) {
    const h = headersBase();
    const res = await fetch(apiUrl(path), { method: 'DELETE', headers: h, body: '{}' });
    return res.json().catch(function () {
      return {};
    });
  }

  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.classList.remove('show');
    }, 2600);
  }

  function showLoginErr(msg) {
    var el = document.getElementById('login-err');
    if (!msg) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function showScreen(name) {
    document.getElementById('screen-login').classList.toggle('hidden', name !== 'login');
    document.getElementById('screen-dash').classList.toggle('hidden', name !== 'dash');
  }

  function setSession(openid, userInfo) {
    try {
      sessionStorage.setItem(STORAGE_OPENID, openid);
      sessionStorage.setItem(STORAGE_USER, JSON.stringify(userInfo || {}));
    } catch (e) {}
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(STORAGE_OPENID);
      sessionStorage.removeItem(STORAGE_USER);
    } catch (e) {}
  }

  function pickAvatarChar(name) {
    var s = String(name || '').trim();
    return s ? s.slice(0, 1) : '管';
  }

  function formatMoney(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return '0';
    if (Math.abs(x - Math.round(x)) < 0.05) return String(Math.round(x));
    return x.toFixed(1);
  }

  function formatCentsYuan(cents) {
    var c = Number(cents);
    if (!Number.isFinite(c)) return '0';
    return formatMoney(c / 100);
  }

  function statusClass(st) {
    var m = {
      pending: 'status-pending',
      paid: 'status-paid',
      used: 'status-used',
      cancelled: 'status-cancelled',
      refunded: 'status-refunded',
      showing: 'status-showing',
      coming: 'status-coming',
      off: 'status-off'
    };
    return m[st] || 'status-off';
  }

  /* —— 导航 —— */
  var loadedViews = {};
  var nextOrderViewOpts = null;
  var VIEW_TITLE = {
    overview: '今日概览',
    movies: '电影管理',
    users: '用户管理',
    cinemas: '影院管理',
    reports: '数据报表',
    orders: '订单管理',
    account: '账号与安全'
  };

  function updateBreadcrumb(name) {
    var el = document.getElementById('bc-current');
    if (el) el.textContent = VIEW_TITLE[name] || '数据概览';
    try {
      document.title = (VIEW_TITLE[name] || '概览') + ' · 电影票务管理控制台';
    } catch (e) {}
  }

  function setView(name) {
    updateBreadcrumb(name);
    document.querySelectorAll('.nav-item').forEach(function (btn) {
      var active = btn.getAttribute('data-view') === name;
      btn.classList.toggle('active', active);
      if (active) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    document.querySelectorAll('.view-section').forEach(function (sec) {
      var active = sec.id === 'view-' + name;
      sec.classList.toggle('active', active);
      if (active) {
        sec.classList.remove('slide-fade');
        void sec.offsetWidth;
        sec.classList.add('slide-fade');
      }
    });
    if (name === 'overview') {
      loadOverview();
      return;
    }
    if (name === 'account') {
      loadAccountView();
      return;
    }
    if (name === 'users') {
      loadUsersView(true);
      return;
    }
    if (name === 'orders') {
      if (!nextOrderViewOpts || !nextOrderViewOpts.keepUserOpenid) {
        ordState.userOpenid = '';
      }
      nextOrderViewOpts = null;
      loadOrdersView(true);
      return;
    }
    if (!loadedViews[name]) {
      loadedViews[name] = true;
      if (name === 'movies') loadMoviesView(true);
      else if (name === 'cinemas') loadCinemasView();
      else if (name === 'reports') loadReportsView();
    }
  }

  function renderDashUser() {
    try {
      var u = JSON.parse(sessionStorage.getItem(STORAGE_USER) || '{}');
      var name = u.nickName || '管理员';
      var phone = u.phone ? String(u.phone) : '';
      document.getElementById('dash-user-name').textContent = name;
      document.getElementById('dash-user-phone').textContent = phone ? '手机 ' + phone : '已登录';
      document.getElementById('dash-avatar').textContent = pickAvatarChar(name);
    } catch (e) {
      document.getElementById('dash-user-name').textContent = '—';
      document.getElementById('dash-user-phone').textContent = '';
      document.getElementById('dash-avatar').textContent = '管';
    }
  }

  async function tryRestoreSession() {
    var oid = getOpenid();
    if (!oid) {
      location.replace(MODERN_LOGIN_PATH);
      return;
    }
    var r = await apiGet('/api/admin/dashboard-stats');
    if (r && r.code === 0) {
      showScreen('dash');
      renderDashUser();
      loadedViews = {};
      setView('overview');
      return;
    }
    clearSession();
    location.replace(MODERN_LOGIN_PATH);
  }

  /* —— 概览 —— */
  async function loadOverview() {
    document.getElementById('stats-loading').classList.remove('hidden');
    document.getElementById('stats-grid').classList.add('hidden');
    document.getElementById('trend-loading').classList.remove('hidden');
    document.getElementById('trend-wrap').classList.add('hidden');
    document.getElementById('stats-updated').textContent = '正在拉取…';

    var stats = await apiGet('/api/admin/dashboard-stats');
    document.getElementById('stats-loading').classList.add('hidden');
    if (!stats || stats.code !== 0) {
      showLoginErr((stats && stats.message) || '会话失效');
      clearSession();
      showScreen('login');
      return;
    }
    var d = stats.data || {};
    animateCount('s-orders', Number(d.todayOrders != null ? d.todayOrders : 0), false);
    animateCount('s-revenue', Number(d.todayRevenue != null ? d.todayRevenue : 0), true);
    animateCount('s-users', Number(d.newUsers != null ? d.newUsers : 0), false);
    animateCount('s-movies', Number(d.activeMovies != null ? d.activeMovies : 0), false);
    document.getElementById('stats-grid').classList.remove('hidden');
    var now = new Date();
    document.getElementById('stats-updated').textContent =
      '已更新 · ' +
      String(now.getHours()).padStart(2, '0') +
      ':' +
      String(now.getMinutes()).padStart(2, '0');

    var rep = await apiGet('/api/admin/reports/overview?days=7');
    document.getElementById('trend-loading').classList.add('hidden');
    var tbody = document.getElementById('trend-body');
    tbody.innerHTML = '';
    if (rep && rep.code === 0 && rep.data && rep.data.trend) {
      rep.data.trend.forEach(function (row) {
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td class="td-muted">' +
          (row.date || '') +
          '</td><td class="td-num">' +
          (row.orderCount != null ? row.orderCount : 0) +
          '</td><td class="td-num">' +
          formatMoney(row.revenue != null ? row.revenue : 0) +
          '</td><td class="td-num">' +
          (row.activeUsers != null ? row.activeUsers : 0) +
          '</td>';
        tbody.appendChild(tr);
      });
      document.getElementById('trend-wrap').classList.remove('hidden');
    } else {
      tbody.innerHTML =
        '<tr><td colspan="4" class="td-muted" style="text-align:center;padding:20px">暂无数据</td></tr>';
      document.getElementById('trend-wrap').classList.remove('hidden');
    }
  }

  function mergeSessionUser(partial) {
    try {
      var u = JSON.parse(sessionStorage.getItem(STORAGE_USER) || '{}');
      Object.assign(u, partial || {});
      sessionStorage.setItem(STORAGE_USER, JSON.stringify(u));
      renderDashUser();
    } catch (e) {}
  }

  async function loadAccountView() {
    var p = await apiGet('/api/admin/me/profile');
    if (!p || p.code !== 0) {
      toast((p && p.message) || '读取管理员资料失败');
      return;
    }
    var d = p.data || {};
    var nickEl = document.getElementById('adm-me-nick');
    var avatarEl = document.getElementById('adm-me-avatar');
    var phoneEl = document.getElementById('adm-me-phone');
    if (nickEl) nickEl.value = d.nickName || '';
    if (avatarEl) avatarEl.value = d.avatarUrl || '';
    if (phoneEl) phoneEl.textContent = d.phoneMasked || '—';
    var cp = document.getElementById('adm-me-profile-cpwd');
    var nc1 = document.getElementById('adm-me-newpwd');
    var nc2 = document.getElementById('adm-me-newpwd2');
    var cc = document.getElementById('adm-me-cpwd');
    if (cp) cp.value = '';
    if (nc1) nc1.value = '';
    if (nc2) nc2.value = '';
    if (cc) cc.value = '';

    var lg = await apiGet('/api/admin/me/security-log?page=1&pageSize=80');
    var tb = document.getElementById('adm-me-log-tbody');
    if (!tb) return;
    tb.innerHTML = '';
    if (lg && lg.code === 0 && lg.data && lg.data.items && lg.data.items.length) {
      lg.data.items.forEach(function (row) {
        var tr = document.createElement('tr');
        var tds = [
          row.createTime || '',
          row.category || '',
          row.action || '',
          row.summary || '',
          row.ip || ''
        ];
        tds.forEach(function (txt, i) {
          var td = document.createElement('td');
          td.textContent = txt;
          if (i === 0) td.className = 'td-muted';
          if (i === 1) td.className = 'td-muted';
          if (i === 3) {
            td.className = 'td-muted';
            td.style.maxWidth = '360px';
            td.style.wordBreak = 'break-word';
          }
          if (i === 4) td.className = 'td-muted';
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
    } else {
      var tr0 = document.createElement('tr');
      var td0 = document.createElement('td');
      td0.colSpan = 5;
      td0.className = 'td-muted';
      td0.style.textAlign = 'center';
      td0.style.padding = '16px';
      td0.textContent = '暂无安全操作记录';
      tr0.appendChild(td0);
      tb.appendChild(tr0);
    }
  }

  function animateCount(id, target, isMoney) {
    var el = document.getElementById(id);
    if (!el) return;
    var t = Number.isFinite(target) ? target : 0;
    var start = performance.now();
    var dur = 680;
    function step(now) {
      var p = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = t * eased;
      el.textContent = isMoney ? formatMoney(val) : String(Math.round(val));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* —— 电影 —— */
  var mvState = {
    all: [],
    keyword: '',
    genre: '',
    status: '',
    sort: 'releaseDate',
    page: 1,
    pageSize: 12
  };

  function applyMoviePipeline() {
    var filtered = mvState.all.slice();
    if (mvState.genre) {
      filtered = filtered.filter(function (m) {
        return String(m.genre || '').indexOf(mvState.genre) !== -1;
      });
    }
    if (mvState.status) {
      filtered = filtered.filter(function (m) {
        return m.status === mvState.status;
      });
    }
    if (mvState.keyword) {
      var kw = mvState.keyword.toLowerCase();
      filtered = filtered.filter(function (m) {
        return String(m.title || '')
          .toLowerCase()
          .indexOf(kw) !== -1;
      });
    }
    filtered.sort(function (a, b) {
      if (mvState.sort === 'hot') return (b.hot || 0) - (a.hot || 0);
      if (mvState.sort === 'createTime') {
        return new Date(b.createTime || 0) - new Date(a.createTime || 0);
      }
      return new Date(b.releaseDate || 0) - new Date(a.releaseDate || 0);
    });
    var end = mvState.page * mvState.pageSize;
    return { rows: filtered.slice(0, end), hasMore: end < filtered.length, total: filtered.length };
  }

  function renderMovieRows() {
    var r = applyMoviePipeline();
    var tb = document.getElementById('movies-tbody');
    tb.innerHTML = '';
    r.rows.forEach(function (m) {
      var tr = document.createElement('tr');
      var poster = m.poster
        ? '<img class="thumb" src="' +
          String(m.poster).replace(/"/g, '&quot;') +
          '" alt="" loading="lazy"/>'
        : '';
      var st = m.status || '';
      tr.innerHTML =
        '<td>' +
        poster +
        '</td><td><strong>' +
        esc(m.title) +
        '</strong><div class="muted">' +
        esc(String(m._id)) +
        '</div></td><td>' +
        esc(String(m.genre || '—')) +
        '</td><td>' +
        esc(String(m.releaseDate || '—')) +
        '</td><td><span class="status-pill ' +
        statusClass(st) +
        '">' +
        esc(STATUS_LABEL[st] || st) +
        '</span></td><td class="td-num">' +
        formatMoney(m.price != null ? m.price : 0) +
        '</td><td class="td-actions">' +
        '<button type="button" class="btn btn-sm btn-ghost btn-toggle" data-id="' +
        escAttr(m._id) +
        '" data-status="' +
        escAttr(st) +
        '">' +
        (st === 'off' ? '上架' : '下架') +
        '</button>' +
        '<button type="button" class="btn btn-sm btn-danger btn-del-movie" data-id="' +
        escAttr(m._id) +
        '">删除</button></td>';
      tb.appendChild(tr);
    });
    document.getElementById('movies-meta').textContent =
      '共 ' + r.total + ' 条，本页展示 ' + r.rows.length + (r.hasMore ? '（可加载更多）' : '');
    document.getElementById('movies-loadmore').classList.toggle('hidden', !r.hasMore);

    tb.querySelectorAll('.btn-toggle').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-id');
        var st = btn.getAttribute('data-status');
        var next = st === 'off' ? 'showing' : 'off';
        var act = st === 'off' ? '上架' : '下架';
        openConfirm(act + '影片', '确定要「' + act + '」该影片吗？', function () {
          apiPatch('/api/admin/movies/' + encodeURIComponent(id) + '/status', { status: next }).then(function (body) {
            if (body && body.code === 0) {
              toast('已保存');
              loadMoviesView(true);
            } else toast((body && body.message) || '失败');
          });
        });
      };
    });
    tb.querySelectorAll('.btn-del-movie').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-id');
        openConfirm('删除影片', '删除后不可恢复，确定删除？', function () {
          apiDelete('/api/admin/movies/' + encodeURIComponent(id)).then(function (body) {
            if (body && body.code === 0) {
              toast('已删除');
              loadMoviesView(true);
            } else toast((body && body.message) || '失败');
          });
        });
      };
    });
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function escAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  async function loadMoviesView(reset) {
    if (reset) {
      mvState.page = 1;
      document.getElementById('movies-loading').classList.remove('hidden');
      document.getElementById('movies-table-wrap').classList.add('hidden');
      var res = await apiGet('/api/movies');
      document.getElementById('movies-loading').classList.add('hidden');
      document.getElementById('movies-table-wrap').classList.remove('hidden');
      mvState.all = (res && res.data && res.data.items) || [];
    }
    renderMovieRows();
  }

  function wireMoviesUi() {
    document.getElementById('mv-keyword').oninput = function (e) {
      mvState.keyword = e.target.value;
    };
    document.getElementById('mv-search').onclick = function () {
      mvState.page = 1;
      renderMovieRows();
    };
    document.getElementById('mv-genre').onchange = function (e) {
      mvState.genre = e.target.value;
      mvState.page = 1;
      renderMovieRows();
    };
    document.getElementById('mv-status').onchange = function (e) {
      mvState.status = e.target.value;
      mvState.page = 1;
      renderMovieRows();
    };
    document.getElementById('mv-sort').onchange = function (e) {
      mvState.sort = e.target.value;
      mvState.page = 1;
      renderMovieRows();
    };
    document.getElementById('movies-loadmore').onclick = function () {
      mvState.page += 1;
      renderMovieRows();
    };
  }

  /* —— 用户 —— */
  var usersPageState = { page: 1, pageSize: 20, total: 0 };
  var userDetailCtx = { userId: '', isAdmin: 0 };

  var USER_FLAG_LABEL = { watch: '观察', abnormal: '异常', spam: '垃圾/骚扰' };

  function buildUsersListQuery() {
    var qs = new URLSearchParams();
    qs.set('page', String(usersPageState.page));
    qs.set('pageSize', String(usersPageState.pageSize));
    function add(id, key) {
      var el = document.getElementById(id);
      if (!el) return;
      var v = (el.value || '').trim();
      if (v) qs.set(key, v);
    }
    add('users-q', 'q');
    add('users-phone', 'phone');
    add('users-date-from', 'dateFrom');
    add('users-date-to', 'dateTo');
    add('users-account-status', 'accountStatus');
    add('users-account-flag', 'accountFlag');
    add('users-activity', 'activity');
    var sortEl = document.getElementById('users-sort');
    if (sortEl && sortEl.value) qs.set('sort', sortEl.value);
    return '/api/admin/users?' + qs.toString();
  }

  function closeUserDetailModal() {
    document.getElementById('modal-user-detail').classList.remove('open');
  }

  async function openUserDetailModal(userId) {
    userDetailCtx.userId = userId;
    document.getElementById('modal-user-detail').classList.add('open');
    document.getElementById('user-detail-title').textContent = '用户详情';
    var bodyEl = document.getElementById('user-detail-body');
    bodyEl.textContent = '加载中…';
    var d = await apiGet('/api/admin/users/' + encodeURIComponent(userId) + '/detail');
    if (!d || d.code !== 0) {
      bodyEl.textContent = (d && d.message) || '加载失败';
      return;
    }
    var p = d.data.profile;
    var b = d.data.behavior;
    userDetailCtx.isAdmin = p.isAdmin ? 1 : 0;
    var o = await apiGet('/api/admin/users/' + encodeURIComponent(userId) + '/orders?page=1&pageSize=10');
    var c = await apiGet('/api/admin/users/' + encodeURIComponent(userId) + '/comments?page=1&pageSize=10');
    var ordItems = (o && o.data && o.data.items) || [];
    var comItems = (c && c.data && c.data.items) || [];

    var stLabel = p.accountStatus === 'disabled' ? '已禁用' : '正常';
    var flagTxt = p.accountFlag ? USER_FLAG_LABEL[p.accountFlag] || p.accountFlag : '无';

    var ordRows = ordItems
      .map(function (x) {
        return (
          '<tr><td class="td-muted">' +
          esc(String(x.createTime || '').slice(0, 16)) +
          '</td><td>' +
          esc(x.movieTitle || '') +
          '</td><td class="td-num">' +
          formatCentsYuan(x.totalPrice) +
          '</td><td><span class="status-pill ' +
          statusClass(x.status || '') +
          '">' +
          esc(STATUS_LABEL[x.status] || x.status || '') +
          '</span></td></tr>'
        );
      })
      .join('');
    if (!ordRows) {
      ordRows = '<tr><td colspan="4" class="td-muted" style="text-align:center;padding:12px">暂无订单</td></tr>';
    }

    var comRows = comItems
      .map(function (x) {
        var snippet = String(x.content || '').replace(/\s+/g, ' ').slice(0, 80);
        return (
          '<tr><td class="td-muted">' +
          esc(String(x.createTime || '').slice(0, 16)) +
          '</td><td>' +
          esc(x.movieId || '') +
          '</td><td class="td-num">' +
          esc(String(x.rating != null ? x.rating : '')) +
          '</td><td class="td-muted">' +
          esc(snippet) +
          '</td></tr>'
        );
      })
      .join('');
    if (!comRows) {
      comRows = '<tr><td colspan="4" class="td-muted" style="text-align:center;padding:12px">暂无评论</td></tr>';
    }

    var editBlock = '';
    if (!userDetailCtx.isAdmin) {
      editBlock =
        '<div class="panel" style="margin-top:12px">' +
        '<h4 style="margin:0 0 10px;font-size:0.95rem">账号状态与异常处理</h4>' +
        '<div class="form-grid" style="grid-template-columns:1fr 1fr">' +
        '<div><label for="ud-account-status">账号状态</label>' +
        '<select id="ud-account-status"><option value="active">正常</option><option value="disabled">禁用</option></select></div>' +
        '<div><label for="ud-account-flag">风险标记</label>' +
        '<select id="ud-account-flag"><option value="">无</option><option value="watch">观察</option><option value="abnormal">异常</option><option value="spam">垃圾/骚扰</option></select></div>' +
        '</div>' +
        '<div class="field" style="margin-top:10px"><label for="ud-admin-remark">运营备注（对内）</label>' +
        '<textarea id="ud-admin-remark" rows="2" maxlength="255" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border,#ddd)"></textarea></div>' +
        '<button type="button" class="btn btn-primary" style="width:auto;margin-top:10px" id="btn-user-detail-save">保存设置</button>' +
        '</div>';
    } else {
      editBlock =
        '<p class="muted" style="margin-top:12px">管理员账号请在数据库中维护，此处仅可查看。</p>';
    }

    bodyEl.innerHTML =
      '<div class="panel">' +
      '<h4 style="margin:0 0 8px;font-size:0.95rem">资料</h4>' +
      '<p style="margin:4px 0"><strong>' +
      esc(p.nickName || '—') +
      '</strong> <span class="muted">' +
      esc(p.level || '') +
      '</span></p>' +
      '<p class="muted" style="margin:4px 0;font-size:0.85rem">' +
      esc(p._id || '') +
      '</p>' +
      '<p style="margin:6px 0">手机 ' +
      esc(p.phone || '—') +
      '</p>' +
      '<p class="muted" style="margin:4px 0;font-size:0.85rem">注册 ' +
      esc(String(p.createTime || '')) +
      ' · 账号 ' +
      esc(stLabel) +
      ' · 标记 ' +
      esc(flagTxt) +
      '</p>' +
      (p.adminRemark ? '<p class="muted" style="margin:8px 0;font-size:0.85rem">备注：' + esc(p.adminRemark) + '</p>' : '') +
      '</div>' +
      '<div class="panel" style="margin-top:12px">' +
      '<h4 style="margin:0 0 8px;font-size:0.95rem">行为概览</h4>' +
      '<p style="margin:6px 0">活跃度：<strong>' +
      esc(b.activityLabel || '') +
      '</strong>（' +
      esc(b.activityTier || '') +
      '）</p>' +
      '<p class="muted" style="margin:4px 0;font-size:0.85rem">订单 ' +
      (b.orderCount != null ? b.orderCount : 0) +
      '（已付 ' +
      (b.paidOrderCount != null ? b.paidOrderCount : 0) +
      '）· 待付 ' +
      (b.pendingOrderCount != null ? b.pendingOrderCount : 0) +
      ' · 评论 ' +
      (b.commentCount != null ? b.commentCount : 0) +
      ' · 收藏 ' +
      (b.collectionCount != null ? b.collectionCount : 0) +
      ' · 积分 ' +
      (b.pointsBalance != null ? b.pointsBalance : 0) +
      '</p>' +
      '<p class="muted" style="margin:4px 0;font-size:0.85rem">累计实付 ' +
      formatMoney(b.totalSpentYuan != null ? b.totalSpentYuan : 0) +
      ' 元 · 最近下单 ' +
      esc(String(b.lastOrderTime || '—')) +
      ' · 最近评论 ' +
      esc(String(b.lastCommentTime || '—')) +
      '</p>' +
      '</div>' +
      '<div class="panel" style="margin-top:12px">' +
      '<h4 style="margin:0 0 8px;font-size:0.95rem">近期订单（前10条）</h4>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>时间</th><th>影片</th><th>金额</th><th>状态</th></tr></thead><tbody>' +
      ordRows +
      '</tbody></table></div></div>' +
      '<div class="panel" style="margin-top:12px">' +
      '<h4 style="margin:0 0 8px;font-size:0.95rem">近期影评（前10条）</h4>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>时间</th><th>影片ID</th><th>分</th><th>摘要</th></tr></thead><tbody>' +
      comRows +
      '</tbody></table></div></div>' +
      editBlock;

    if (!userDetailCtx.isAdmin) {
      var selSt = document.getElementById('ud-account-status');
      var selFg = document.getElementById('ud-account-flag');
      var txRm = document.getElementById('ud-admin-remark');
      if (selSt) selSt.value = p.accountStatus === 'disabled' ? 'disabled' : 'active';
      if (selFg) selFg.value = p.accountFlag || '';
      if (txRm) txRm.value = p.adminRemark || '';
      var saveBtn = document.getElementById('btn-user-detail-save');
      if (saveBtn) {
        saveBtn.onclick = function () {
          var payload = {
            accountStatus: selSt ? selSt.value : 'active',
            accountFlag: selFg ? selFg.value : '',
            adminRemark: txRm ? txRm.value.trim() : ''
          };
          openConfirm('确认保存', '将更新该用户账号状态/风险标记/备注，并写入安全审计日志。确定？', function () {
            apiPatch('/api/admin/users/' + encodeURIComponent(userDetailCtx.userId), payload).then(function (res) {
              if (res && res.code === 0) {
                toast('已保存');
                openUserDetailModal(userDetailCtx.userId);
                loadUsersView(false);
              } else toast((res && res.message) || '失败');
            });
          });
        };
      }
    }
  }

  async function loadUsersView(resetPage) {
    if (resetPage) usersPageState.page = 1;
    document.getElementById('users-loading').classList.remove('hidden');
    document.getElementById('users-table-wrap').classList.add('hidden');
    var body = await apiGet(buildUsersListQuery());
    document.getElementById('users-loading').classList.add('hidden');
    document.getElementById('users-table-wrap').classList.remove('hidden');
    var tb = document.getElementById('users-tbody');
    tb.innerHTML = '';
    if (!body || body.code !== 0) {
      toast((body && body.message) || '用户列表加载失败');
      return;
    }
    var items = (body && body.data && body.data.items) || [];
    usersPageState.total = body.data && body.data.total != null ? body.data.total : items.length;
    var info = document.getElementById('users-page-info');
    if (info) {
      var pages = Math.max(1, Math.ceil(usersPageState.total / usersPageState.pageSize));
      info.textContent = '共 ' + usersPageState.total + ' 人 · 第 ' + usersPageState.page + ' / ' + pages + ' 页';
    }
    items.forEach(function (u) {
      var tr = document.createElement('tr');
      var level = u.level || 'normal';
      var acc = u.accountStatus === 'disabled' ? '已禁用' : '正常';
      var flag = u.accountFlag ? USER_FLAG_LABEL[u.accountFlag] || u.accountFlag : '—';
      var reg = String(u.createTime || '').slice(0, 16);
      var act = esc(u.activityLabel || '—');
      var oc = u.orderCount != null ? u.orderCount : 0;
      var cc = u.commentCount != null ? u.commentCount : 0;
      tr.innerHTML =
        '<td><strong>' +
        esc(u.nickName || '—') +
        '</strong><div class="muted">' +
        esc(String(u._id || '')) +
        '</div></td><td>' +
        esc(u.phone || '—') +
        '</td><td>' +
        esc(level) +
        '</td><td class="td-muted">' +
        esc(reg) +
        '</td><td>' +
        act +
        '</td><td class="td-num">' +
        oc +
        ' / ' +
        cc +
        '</td><td class="td-num">' +
        formatMoney(u.totalSpent != null ? u.totalSpent : 0) +
        '</td><td><span class="status-pill ' +
        (u.accountStatus === 'disabled' ? 'status-off' : 'status-showing') +
        '">' +
        esc(acc) +
        '</span><div class="muted" style="font-size:0.75rem;margin-top:4px">' +
        esc(flag) +
        '</div></td><td class="td-actions">' +
        '<button type="button" class="btn btn-sm btn-ghost btn-user-detail" data-id="' +
        escAttr(u._id) +
        '">详情</button> ' +
        '<button type="button" class="btn btn-sm btn-danger btn-del-user" data-id="' +
        escAttr(u._id) +
        '">删除</button></td>';
      tb.appendChild(tr);
    });
    tb.querySelectorAll('.btn-user-detail').forEach(function (btn) {
      btn.onclick = function () {
        openUserDetailModal(btn.getAttribute('data-id'));
      };
    });
    tb.querySelectorAll('.btn-del-user').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-id');
        openConfirm('删除用户', '将删除该用户及相关数据，确定？', function () {
          apiDelete('/api/admin/users/' + encodeURIComponent(id)).then(function (res) {
            if (res && res.code === 0) {
              toast('已删除');
              loadUsersView(true);
            } else toast((res && res.message) || '失败');
          });
        });
      };
    });
  }

  /* —— 影院 —— */
  var cinemaForm = {};
  var hallsContext = { cinemaId: '', cinemaName: '', items: [] };
  var hallForm = {};

  async function loadCinemasView() {
    var kw = document.getElementById('cinema-keyword').value.trim();
    document.getElementById('cinemas-loading').classList.remove('hidden');
    document.getElementById('cinemas-table-wrap').classList.add('hidden');
    var path = '/api/admin/cinemas' + (kw ? '?keyword=' + encodeURIComponent(kw) : '');
    var body = await apiGet(path);
    document.getElementById('cinemas-loading').classList.add('hidden');
    document.getElementById('cinemas-table-wrap').classList.remove('hidden');
    var tb = document.getElementById('cinemas-tbody');
    tb.innerHTML = '';
    var items = (body && body.data && body.data.items) || [];
    items.forEach(function (c) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><strong>' +
        esc(c.name || '') +
        '</strong></td><td>' +
        esc(c.city || '') +
        '</td><td class="td-muted">' +
        esc(c.address || '') +
        '</td><td class="td-num">' +
        formatMoney(c.minPrice != null ? c.minPrice : 0) +
        '</td><td class="td-actions">' +
        '<button type="button" class="btn btn-sm btn-ghost btn-halls-cinema" data-id="' +
        escAttr(c._id) +
        '">影厅</button>' +
        '<button type="button" class="btn btn-sm btn-ghost btn-edit-cinema" data-id="' +
        escAttr(c._id) +
        '">编辑</button>' +
        '<button type="button" class="btn btn-sm btn-danger btn-del-cinema" data-id="' +
        escAttr(c._id) +
        '">删除</button></td>';
      tb.appendChild(tr);
    });
    tb.querySelectorAll('.btn-halls-cinema').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-id');
        var row = items.find(function (x) {
          return String(x._id) === id;
        });
        if (row) openHallsModal(row);
      };
    });
    tb.querySelectorAll('.btn-edit-cinema').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-id');
        var row = items.find(function (x) {
          return String(x._id) === id;
        });
        if (row) openCinemaModal(row);
      };
    });
    tb.querySelectorAll('.btn-del-cinema').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-id');
        openConfirm('删除影院', '将删除该影院、影厅、排片及座位相关数据，确定？', function () {
          apiDelete('/api/admin/cinemas/' + encodeURIComponent(id)).then(function (res) {
            if (res && res.code === 0) {
              toast('已删除');
              loadCinemasView();
            } else toast((res && res.message) || '失败');
          });
        });
      };
    });
  }

  async function refreshHallsList() {
    var id = hallsContext.cinemaId;
    if (!id) return;
    var body = await apiGet('/api/admin/cinemas/' + encodeURIComponent(id) + '/halls');
    hallsContext.items = (body && body.data && body.data.items) || [];
    var tb = document.getElementById('halls-tbody');
    tb.innerHTML = '';
    hallsContext.items.forEach(function (h) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><strong>' +
        esc(h.name || '') +
        '</strong></td><td>' +
        esc(h.hallType || '') +
        '</td><td class="td-num">' +
        esc(String(h.seatRows) + '×' + String(h.seatCols)) +
        '</td><td class="td-num">' +
        esc(String(h.sortOrder != null ? h.sortOrder : 0)) +
        '</td><td class="td-actions">' +
        '<button type="button" class="btn btn-sm btn-ghost btn-edit-hall" data-id="' +
        escAttr(h._id) +
        '">编辑</button>' +
        '<button type="button" class="btn btn-sm btn-danger btn-del-hall" data-id="' +
        escAttr(h._id) +
        '">删除</button></td>';
      tb.appendChild(tr);
    });
    tb.querySelectorAll('.btn-edit-hall').forEach(function (btn) {
      btn.onclick = function () {
        var hid = btn.getAttribute('data-id');
        var row = hallsContext.items.find(function (x) {
          return String(x._id) === hid;
        });
        if (row) openHallFormModal(row);
      };
    });
    tb.querySelectorAll('.btn-del-hall').forEach(function (btn) {
      btn.onclick = function () {
        var hid = btn.getAttribute('data-id');
        openConfirm('删除影厅', '删除后该影厅将不再参与新场次生成。确定？', function () {
          apiDelete(
            '/api/admin/cinemas/' + encodeURIComponent(hallsContext.cinemaId) + '/halls/' + encodeURIComponent(hid)
          ).then(function (res) {
            if (res && res.code === 0) {
              toast('已删除');
              refreshHallsList();
            } else toast((res && res.message) || '失败');
          });
        });
      };
    });
  }

  function openHallsModal(row) {
    hallsContext.cinemaId = String(row._id || '');
    hallsContext.cinemaName = row.name || '';
    document.getElementById('halls-modal-title').textContent = '影厅：' + (hallsContext.cinemaName || '');
    document.getElementById('modal-halls-list').classList.add('open');
    refreshHallsList();
  }

  function closeHallsModal() {
    document.getElementById('modal-halls-list').classList.remove('open');
    hallsContext.cinemaId = '';
    hallsContext.cinemaName = '';
    hallsContext.items = [];
  }

  function openHallFormModal(row) {
    hallForm = row
      ? {
          _id: row._id,
          name: row.name || '',
          hallType: row.hallType || '普通厅',
          seatRows: row.seatRows != null ? String(row.seatRows) : '8',
          seatCols: row.seatCols != null ? String(row.seatCols) : '12',
          sortOrder: row.sortOrder != null ? String(row.sortOrder) : '0'
        }
      : {
          _id: '',
          name: '',
          hallType: '普通厅',
          seatRows: '8',
          seatCols: '12',
          sortOrder: '0'
        };
    document.getElementById('hall-form-title').textContent = row ? '编辑影厅' : '新增影厅';
    document.getElementById('f-hall-name').value = hallForm.name;
    document.getElementById('f-hall-type').value = hallForm.hallType;
    document.getElementById('f-hall-rows').value = hallForm.seatRows;
    document.getElementById('f-hall-cols').value = hallForm.seatCols;
    document.getElementById('f-hall-order').value = hallForm.sortOrder;
    document.getElementById('modal-hall-form').classList.add('open');
  }

  function closeHallFormModal() {
    document.getElementById('modal-hall-form').classList.remove('open');
  }

  function saveHallFormModal() {
    var name = document.getElementById('f-hall-name').value.trim();
    if (!name) {
      toast('请填写影厅名称');
      return;
    }
    var payload = {
      name: name,
      hallType: document.getElementById('f-hall-type').value.trim() || '普通厅',
      seatRows: Number(document.getElementById('f-hall-rows').value || 8),
      seatCols: Number(document.getElementById('f-hall-cols').value || 12),
      sortOrder: Number(document.getElementById('f-hall-order').value || 0)
    };
    var cid = hallsContext.cinemaId;
    var isEdit = !!hallForm._id;
    var path = isEdit
      ? '/api/admin/cinemas/' + encodeURIComponent(cid) + '/halls/' + encodeURIComponent(hallForm._id)
      : '/api/admin/cinemas/' + encodeURIComponent(cid) + '/halls';
    var p = isEdit
      ? fetch(apiUrl(path), {
          method: 'PUT',
          headers: headersBase(),
          body: JSON.stringify(payload)
        }).then(function (r) {
          return r.json();
        })
      : apiPost(path, payload);
    p.then(function (body) {
      if (body && body.code === 0) {
        toast(isEdit ? '已更新' : '已创建');
        closeHallFormModal();
        refreshHallsList();
      } else toast((body && body.message) || '失败');
    });
  }

  function openCinemaModal(row) {
    cinemaForm = row
      ? {
          _id: row._id,
          name: row.name || '',
          city: row.city || '',
          address: row.address || '',
          phone: row.phone || '',
          latitude: row.latitude != null ? String(row.latitude) : '',
          longitude: row.longitude != null ? String(row.longitude) : '',
          minPrice: row.minPrice != null ? String(row.minPrice) : '',
          tagsText: Array.isArray(row.tags) ? row.tags.join(',') : ''
        }
      : {
          _id: '',
          name: '',
          city: '',
          address: '',
          phone: '',
          latitude: '',
          longitude: '',
          minPrice: '',
          tagsText: ''
        };
    document.getElementById('cinema-modal-title').textContent = row ? '编辑影院' : '新增影院';
    document.getElementById('f-cinema-name').value = cinemaForm.name;
    document.getElementById('f-cinema-city').value = cinemaForm.city;
    document.getElementById('f-cinema-address').value = cinemaForm.address;
    document.getElementById('f-cinema-phone').value = cinemaForm.phone;
    document.getElementById('f-cinema-lat').value = cinemaForm.latitude;
    document.getElementById('f-cinema-lng').value = cinemaForm.longitude;
    document.getElementById('f-cinema-price').value = cinemaForm.minPrice;
    document.getElementById('f-cinema-tags').value = cinemaForm.tagsText;
    document.getElementById('modal-cinema').classList.add('open');
  }

  function closeCinemaModal() {
    document.getElementById('modal-cinema').classList.remove('open');
  }

  function saveCinemaModal() {
    var payload = {
      name: document.getElementById('f-cinema-name').value.trim(),
      city: document.getElementById('f-cinema-city').value.trim(),
      address: document.getElementById('f-cinema-address').value.trim(),
      phone: document.getElementById('f-cinema-phone').value.trim(),
      latitude: Number(document.getElementById('f-cinema-lat').value || 0),
      longitude: Number(document.getElementById('f-cinema-lng').value || 0),
      minPrice: Number(document.getElementById('f-cinema-price').value || 0),
      tags: document
        .getElementById('f-cinema-tags')
        .value.split(/[,，]/)
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean)
        .join(',')
    };
    if (!payload.name || !payload.address) {
      toast('请填写名称与地址');
      return;
    }
    var isEdit = !!cinemaForm._id;
    var p = isEdit
      ? fetch(apiUrl('/api/admin/cinemas/' + encodeURIComponent(cinemaForm._id)), {
          method: 'PUT',
          headers: headersBase(),
          body: JSON.stringify(payload)
        }).then(function (r) {
          return r.json();
        })
      : apiPost('/api/admin/cinemas', payload);
    p.then(function (body) {
      if (body && body.code === 0) {
        toast(isEdit ? '已更新' : '已创建');
        closeCinemaModal();
        loadCinemasView();
      } else toast((body && body.message) || '失败');
    });
  }

  /* —— 报表 —— */
  var reportDays = 7;

  function exportReportCsv() {
    var d = window.__lastReportData;
    if (!d) {
      toast('请先加载报表');
      return;
    }
    var lines = [];
    lines.push('报表周期,最近' + reportDays + '天');
    lines.push('汇总,订单,' + (d.summary && d.summary.totalOrders) + ',收入,' + (d.summary && d.summary.totalRevenue));
    lines.push('');
    lines.push('日期,订单,收入,活跃用户');
    (d.trend || []).forEach(function (t) {
      lines.push([t.date, t.orderCount, t.revenue, t.activeUsers].join(','));
    });
    lines.push('');
    lines.push('状态,数量');
    (d.statusBreakdown || []).forEach(function (s) {
      lines.push((STATUS_LABEL[s.status] || s.status) + ',' + s.count);
    });
    lines.push('');
    lines.push('电影,订单,收入');
    (d.topMovies || []).forEach(function (m) {
      lines.push([m.title, m.orderCount, m.revenue].join(','));
    });
    lines.push('');
    lines.push('影院,订单,收入');
    (d.topCinemas || []).forEach(function (c) {
      lines.push([c.name, c.orderCount, c.revenue].join(','));
    });
    navigator.clipboard.writeText(lines.join('\n')).then(
      function () {
        toast('已复制到剪贴板');
      },
      function () {
        toast('复制失败，请手动选择');
      }
    );
  }

  async function loadReportsView() {
    document.getElementById('reports-loading').classList.remove('hidden');
    document.getElementById('reports-body').classList.add('hidden');
    var body = await apiGet('/api/admin/reports/overview?days=' + reportDays);
    document.getElementById('reports-loading').classList.add('hidden');
    document.getElementById('reports-body').classList.remove('hidden');
    if (!body || body.code !== 0) {
      document.getElementById('reports-summary').innerHTML = '<p class="muted">加载失败</p>';
      return;
    }
    window.__lastReportData = body.data;
    var d = body.data || {};
    var s = d.summary || {};
    document.getElementById('reports-summary').innerHTML =
      '<div class="summary-row">' +
      '<div class="summary-card"><div class="v">' +
      (s.totalOrders || 0) +
      '</div><div class="l">订单总数</div></div>' +
      '<div class="summary-card"><div class="v">' +
      formatMoney(s.totalRevenue || 0) +
      '</div><div class="l">总收入(元)</div></div>' +
      '<div class="summary-card"><div class="v">' +
      (s.totalUsers || 0) +
      '</div><div class="l">下单用户</div></div></div>';

    function fillTable(id, rows, fnRow) {
      var tb = document.getElementById(id);
      tb.innerHTML = '';
      (rows || []).forEach(function (row) {
        tb.appendChild(fnRow(row));
      });
    }
    fillTable('rep-trend', d.trend, function (t) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="td-muted">' +
        esc(t.date || '') +
        '</td><td class="td-num">' +
        (t.orderCount != null ? t.orderCount : 0) +
        '</td><td class="td-num">' +
        formatMoney(t.revenue != null ? t.revenue : 0) +
        '</td><td class="td-num">' +
        (t.activeUsers != null ? t.activeUsers : 0) +
        '</td>';
      return tr;
    });
    var tbSb = document.getElementById('rep-status');
    tbSb.innerHTML = '';
    (d.statusBreakdown || []).forEach(function (x) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' +
        esc(STATUS_LABEL[x.status] || x.status || '') +
        '</td><td class="td-num">' +
        (x.count != null ? x.count : 0) +
        '</td>';
      tbSb.appendChild(tr);
    });
    fillTable('rep-movies', d.topMovies, function (m) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' +
        esc(m.title || '') +
        '</td><td class="td-num">' +
        (m.orderCount != null ? m.orderCount : 0) +
        '</td><td class="td-num">' +
        formatMoney(m.revenue != null ? m.revenue : 0) +
        '</td>';
      return tr;
    });
    fillTable('rep-cinemas', d.topCinemas, function (c) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' +
        esc(c.name || '') +
        '</td><td class="td-num">' +
        (c.orderCount != null ? c.orderCount : 0) +
        '</td><td class="td-num">' +
        formatMoney(c.revenue != null ? c.revenue : 0) +
        '</td>';
      return tr;
    });
  }

  /* —— 订单 —— */
  var ordState = {
    page: 1,
    status: '',
    filter: '',
    orderNo: '',
    userKeyword: '',
    scheduleId: '',
    userOpenid: '',
    hasMore: true,
    pageSize: 20
  };
  var orderModalCtx = { orderId: '' };

  function readOrdersFiltersFromDom() {
    ordState.status = (document.getElementById('ord-status') && document.getElementById('ord-status').value) || '';
    ordState.filter = (document.getElementById('ord-filter') && document.getElementById('ord-filter').value) || '';
    ordState.orderNo = (document.getElementById('ord-order-no') && document.getElementById('ord-order-no').value.trim()) || '';
    ordState.userKeyword = (document.getElementById('ord-user-kw') && document.getElementById('ord-user-kw').value.trim()) || '';
    ordState.scheduleId = (document.getElementById('ord-schedule-id') && document.getElementById('ord-schedule-id').value.trim()) || '';
  }

  function resetOrdersFiltersDom() {
    var st = document.getElementById('ord-status');
    var fi = document.getElementById('ord-filter');
    if (st) st.value = '';
    if (fi) fi.value = '';
    ['ord-order-no', 'ord-user-kw', 'ord-schedule-id'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    readOrdersFiltersFromDom();
  }

  function closeOrderModal() {
    document.getElementById('modal-order').classList.remove('open');
    orderModalCtx.orderId = '';
  }

  function orderModalNote() {
    var tx = document.getElementById('modal-order-note');
    return tx ? String(tx.value || '').trim() : '';
  }

  async function openOrderModal(orderId) {
    orderModalCtx.orderId = orderId;
    var noteEl = document.getElementById('modal-order-note');
    if (noteEl) noteEl.value = '';
    document.getElementById('modal-order-body').innerHTML = '<p class="muted">加载中…</p>';
    document.getElementById('modal-order-actions').innerHTML = '';
    document.getElementById('modal-order').classList.add('open');
    var body = await apiGet('/api/admin/orders/' + encodeURIComponent(orderId));
    if (!body || body.code !== 0) {
      document.getElementById('modal-order-body').innerHTML =
        '<p class="muted">' + esc((body && body.message) || '加载失败') + '</p>';
      return;
    }
    var d = body.data || {};
    var st = d.status || '';
    var rq = d.refundRequestStatus || '';
    var seatsStr = (d.seats || [])
      .map(function (s) {
        return s.row + '排' + s.col + '座';
      })
      .join('、');
    document.getElementById('modal-order-body').innerHTML =
      '<p><strong>' +
      esc(d.orderNo || '') +
      '</strong> <span class="status-pill ' +
      statusClass(st) +
      '">' +
      esc(STATUS_LABEL[st] || st) +
      '</span></p>' +
      '<p class="muted">场次 ' +
      esc(d.scheduleId || '') +
      ' · ' +
      esc(String(d.date || '') + ' ' + String(d.startTime || '')) +
      '</p>' +
      '<p>' +
      esc(d.movieTitle || '') +
      ' · ' +
      esc(d.cinemaName || '') +
      ' ' +
      esc(d.hallName || '') +
      '</p>' +
      '<p>金额 <strong>' +
      formatCentsYuan(d.totalPrice) +
      '</strong> · 用户 ' +
      esc(d.userNick || '') +
      ' / ' +
      esc(d.userPhone || d._openid || '') +
      '</p>' +
      '<p class="muted">座位：' +
      esc(seatsStr || '—') +
      '</p>' +
      '<p class="muted">创建 ' +
      esc(String(d.createTime || '').slice(0, 19)) +
      (d.payTime ? ' · 支付 ' + esc(String(d.payTime || '').slice(0, 19)) : '') +
      '</p>' +
      (rq === 'pending'
        ? '<p class="muted" style="color:#c0392b">退款审批：待处理 · ' + esc(String(d.refundRequestTime || '').slice(0, 16)) + '</p><p class="muted">' + esc(d.refundRequestNote || '') + '</p>'
        : '');

    var act = document.getElementById('modal-order-actions');
    act.innerHTML = '';

    function addBtn(label, cls, path, postBody, reloadList) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-sm ' + (cls || 'btn-ghost');
      b.style.width = 'auto';
      b.textContent = label;
      b.onclick = function () {
        var payload = Object.assign({}, postBody || {}, { note: orderModalNote() });
        apiPost(path, payload).then(function (res) {
          if (res && res.code === 0) {
            if (path.indexOf('sync-alipay') !== -1) {
              var al = (res.data && res.data.alipay) || {};
              var ts = al.tradeStatus || al.trade_status || '';
              var sg = res.data && res.data.synced;
              toast(ts ? '支付宝状态：' + ts + (sg ? '（已补记账）' : '') : sg ? '已补记账为已支付' : '已核对');
            } else toast('已执行');
            if (reloadList) loadOrdersView(true);
            openOrderModal(orderId);
          } else toast((res && res.message) || '失败');
        });
      };
      act.appendChild(b);
    }

    addBtn('核对支付宝', 'btn-primary', '/api/admin/orders/' + encodeURIComponent(orderId) + '/sync-alipay', {}, true);

    if (st === 'pending') {
      var bc = document.createElement('button');
      bc.type = 'button';
      bc.className = 'btn btn-sm btn-ghost';
      bc.style.width = 'auto';
      bc.textContent = '取消待支付';
      bc.onclick = function () {
        openConfirm('取消待支付订单', '将释放座位与锁券，确定？', function () {
          apiPost('/api/admin/orders/' + encodeURIComponent(orderId) + '/cancel-pending', { note: orderModalNote() }).then(function (res) {
            if (res && res.code === 0) {
              toast('已取消');
              loadOrdersView(true);
              openOrderModal(orderId);
            } else toast((res && res.message) || '失败');
          });
        });
      };
      act.appendChild(bc);
      return;
    }

    if (st === 'paid') {
      if (rq !== 'pending') {
        addBtn('发起退款审批', 'btn-ghost', '/api/admin/orders/' + encodeURIComponent(orderId) + '/refund-request', { note: orderModalNote() }, true);
      }
      if (rq === 'pending') {
        addBtn('批准退款', 'btn-primary', '/api/admin/orders/' + encodeURIComponent(orderId) + '/refund-approve', { note: orderModalNote() }, true);
        addBtn('驳回退款', 'btn-ghost', '/api/admin/orders/' + encodeURIComponent(orderId) + '/refund-reject', { note: orderModalNote() }, true);
      }
      var bf = document.createElement('button');
      bf.type = 'button';
      bf.className = 'btn btn-sm btn-ghost';
      bf.style.width = 'auto';
      bf.style.borderColor = '#c0392b';
      bf.style.color = '#c0392b';
      bf.textContent = '强制退款';
      bf.onclick = function () {
        openConfirm('强制退款（跳过审批）', '仅用于支付异常等场景，将直接退款并释放座位。确定？', function () {
          apiPost('/api/admin/orders/' + encodeURIComponent(orderId) + '/refund-direct', { note: orderModalNote() }).then(function (res) {
            if (res && res.code === 0) {
              toast('已退款');
              loadOrdersView(true);
              openOrderModal(orderId);
            } else toast((res && res.message) || '失败');
          });
        });
      };
      act.appendChild(bf);
    }
  }

  async function loadOrdersView(reset) {
    if (reset) {
      ordState.page = 1;
      ordState.hasMore = true;
      document.getElementById('orders-tbody').innerHTML = '';
    }
    if (!ordState.hasMore && !reset) return;
    readOrdersFiltersFromDom();
    document.getElementById('orders-loading').classList.remove('hidden');
    var qs = ['page=' + ordState.page, 'pageSize=' + ordState.pageSize];
    if (ordState.status) qs.push('status=' + encodeURIComponent(ordState.status));
    if (ordState.filter) qs.push('filter=' + encodeURIComponent(ordState.filter));
    if (ordState.orderNo) qs.push('orderNo=' + encodeURIComponent(ordState.orderNo));
    if (ordState.userKeyword) qs.push('userKeyword=' + encodeURIComponent(ordState.userKeyword));
    if (ordState.scheduleId) qs.push('scheduleId=' + encodeURIComponent(ordState.scheduleId));
    if (ordState.userOpenid) qs.push('userOpenid=' + encodeURIComponent(ordState.userOpenid));
    var q = '/api/admin/orders?' + qs.join('&');
    var body = await apiGet(q);
    document.getElementById('orders-loading').classList.add('hidden');
    var hintEl = document.getElementById('orders-user-filter-hint');
    if (hintEl) {
      hintEl.classList.toggle('hidden', !ordState.userOpenid);
    }
    var totalEl = document.getElementById('orders-total-hint');
    if (totalEl) {
      var tot = body && body.data && body.data.total != null ? body.data.total : '—';
      totalEl.textContent = '共 ' + tot + ' 条（当前第 ' + ordState.page + ' 页）';
    }
    if (!body || body.code !== 0) {
      toast((body && body.message) || '订单列表加载失败');
      return;
    }
    var items = (body && body.data && body.data.items) || [];
    ordState.hasMore = items.length === ordState.pageSize;
    var tb = document.getElementById('orders-tbody');
    items.forEach(function (o) {
      var tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      var st = o.status || '';
      var rq = o.refundRequestStatus || '';
      tr.innerHTML =
        '<td class="td-muted">' +
        esc(String(o.createTime || '').slice(0, 16)) +
        '</td><td>' +
        esc(o.orderNo || o._id || '') +
        '</td><td>' +
        esc(o.userNick || '') +
        '<div class="muted">' +
        esc(o.userPhone || o._openid || '') +
        '</div></td><td>' +
        esc(o.movieTitle || '') +
        '</td><td class="td-muted" title="' +
        esc(o.scheduleId || '') +
        '">' +
        esc((o.scheduleId || '').length > 12 ? (o.scheduleId || '').slice(0, 10) + '…' : o.scheduleId || '—') +
        '</td><td class="td-muted">' +
        esc(o.cinemaName || '') +
        '</td><td class="td-num">' +
        formatCentsYuan(o.totalPrice) +
        '</td><td><span class="status-pill ' +
        statusClass(st) +
        '">' +
        esc(STATUS_LABEL[st] || st) +
        '</span></td><td>' +
        (rq === 'pending' ? '<span class="status-pill status-off">待审批</span>' : '—') +
        '</td>';
      tr.onclick = function () {
        openOrderModal(o._id);
      };
      tb.appendChild(tr);
    });
    document.getElementById('orders-loadmore').classList.toggle('hidden', !ordState.hasMore);
  }

  /* —— 确认弹窗 —— */
  var confirmCb = null;

  function openConfirm(title, text, onOk) {
    document.getElementById('modal-confirm-title').textContent = title;
    document.getElementById('modal-confirm-text').textContent = text;
    confirmCb = onOk;
    document.getElementById('modal-confirm').classList.add('open');
  }

  function closeConfirm() {
    document.getElementById('modal-confirm').classList.remove('open');
    confirmCb = null;
  }

  /* —— 登录 / 退出 —— */
  document.getElementById('btn-login').addEventListener('click', async function () {
    var phone = (document.getElementById('phone').value || '').trim();
    var password = document.getElementById('password').value || '';
    showLoginErr('');
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      showLoginErr('请输入正确的 11 位手机号');
      return;
    }
    if (!password || password.length < 6) {
      showLoginErr('密码至少 6 位');
      return;
    }
    var btn = document.getElementById('btn-login');
    btn.disabled = true;
    btn.textContent = '登录中…';
    try {
      var r = await fetch(apiUrl('/api/auth/login-phone-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone, password: password })
      });
      var body = await r.json().catch(function () {
        return {};
      });
      if (!body || body.code !== 0) {
        showLoginErr((body && body.message) || '登录失败');
        return;
      }
      var data = body.data || {};
      var user = data.userInfo || {};
      if (Number(user.isAdmin) !== 1 && user.isAdmin !== true) {
        showLoginErr('该账号不是管理员');
        return;
      }
      setSession(data.openid || user._id, user);
      showScreen('dash');
      renderDashUser();
      loadedViews = {};
      setView('overview');
    } catch (e) {
      showLoginErr('网络错误，请确认通过「' + location.origin + '」访问且后端已启动');
    } finally {
      btn.disabled = false;
      btn.textContent = '进入后台';
    }
  });

  document.getElementById('password').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('btn-login').click();
  });

  document.getElementById('btn-logout').addEventListener('click', function () {
    clearSession();
    showLoginErr('');
    location.replace(MODERN_LOGIN_PATH);
  });

  document.querySelectorAll('.nav-item').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setView(btn.getAttribute('data-view'));
    });
  });

  document.getElementById('modal-confirm-cancel').onclick = closeConfirm;
  document.getElementById('modal-confirm-ok').onclick = function () {
    if (confirmCb) confirmCb();
    closeConfirm();
  };

  document.getElementById('cinema-search').onclick = function () {
    loadCinemasView();
  };
  document.getElementById('btn-cinema-add').onclick = function () {
    openCinemaModal(null);
  };
  document.getElementById('cinema-modal-cancel').onclick = closeCinemaModal;
  document.getElementById('cinema-modal-save').onclick = saveCinemaModal;

  document.getElementById('halls-modal-close').onclick = closeHallsModal;
  document.getElementById('btn-hall-add').onclick = function () {
    openHallFormModal(null);
  };
  document.getElementById('hall-form-cancel').onclick = closeHallFormModal;
  document.getElementById('hall-form-save').onclick = saveHallFormModal;

  document.getElementById('rep-days').onchange = function (e) {
    reportDays = Number(e.target.value) || 7;
    loadReportsView();
  };
  document.getElementById('btn-export-csv').onclick = exportReportCsv;

  document.getElementById('ord-status').onchange = function () {
    readOrdersFiltersFromDom();
    loadOrdersView(true);
  };
  document.getElementById('ord-filter').onchange = function () {
    readOrdersFiltersFromDom();
    loadOrdersView(true);
  };
  document.getElementById('orders-search').onclick = function () {
    readOrdersFiltersFromDom();
    loadOrdersView(true);
  };
  document.getElementById('orders-reset-filters').onclick = function () {
    resetOrdersFiltersDom();
    ordState.userOpenid = '';
    loadOrdersView(true);
  };
  document.getElementById('modal-order-close').onclick = closeOrderModal;

  document.getElementById('orders-loadmore').onclick = function () {
    ordState.page += 1;
    loadOrdersView(false);
  };

  document.getElementById('btn-adm-me-save').onclick = function () {
    var cur = (document.getElementById('adm-me-profile-cpwd').value || '').trim();
    if (!cur) {
      toast('请填写当前密码以确认本次资料修改');
      return;
    }
    var nick = (document.getElementById('adm-me-nick').value || '').trim();
    if (!nick || nick.length > 32) {
      toast('昵称长度应为 1～32 个字符');
      return;
    }
    openConfirm('确认保存资料', '将更新管理员昵称/头像 URL，并写入安全审计日志。确定继续？', function () {
      var avatar = (document.getElementById('adm-me-avatar').value || '').trim();
      apiPost('/api/admin/me/profile', { currentPassword: cur, nickName: nick, avatarUrl: avatar }).then(function (body) {
        if (body && body.code === 0) {
          var du = body.data || {};
          mergeSessionUser({ nickName: du.nickName, avatarUrl: du.avatarUrl });
          toast('已保存');
          document.getElementById('adm-me-profile-cpwd').value = '';
          loadAccountView();
        } else toast((body && body.message) || '保存失败');
      });
    });
  };

  document.getElementById('btn-adm-me-pwd').onclick = function () {
    var cur = (document.getElementById('adm-me-cpwd').value || '').trim();
    var n1 = document.getElementById('adm-me-newpwd').value || '';
    var n2 = document.getElementById('adm-me-newpwd2').value || '';
    if (!cur || !n1 || !n2) {
      toast('请完整填写当前密码与两遍新密码');
      return;
    }
    if (n1 !== n2) {
      toast('两次新密码不一致');
      return;
    }
    openConfirm('确认修改登录密码', '修改后需使用新密码重新登录 Web 管理端。确定继续？', function () {
      apiPost('/api/admin/me/change-password', {
        currentPassword: cur,
        newPassword: n1,
        confirmNewPassword: n2
      }).then(function (body) {
        if (body && body.code === 0) {
          toast(body.message || '已更新');
          clearSession();
          showScreen('login');
        } else toast((body && body.message) || '修改失败');
      });
    });
  };

  document.getElementById('orders-clear-user-filter').onclick = function () {
    ordState.userOpenid = '';
    loadOrdersView(true);
  };

  document.getElementById('btn-users-search').onclick = function () {
    loadUsersView(true);
  };
  document.getElementById('btn-users-reset').onclick = function () {
    ['users-q', 'users-phone', 'users-date-from', 'users-date-to', 'users-account-status', 'users-account-flag', 'users-activity', 'users-sort'].forEach(
      function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (el.tagName === 'SELECT') el.selectedIndex = 0;
        else el.value = '';
      }
    );
    loadUsersView(true);
  };
  document.getElementById('users-prev-page').onclick = function () {
    if (usersPageState.page <= 1) return;
    usersPageState.page -= 1;
    loadUsersView(false);
  };
  document.getElementById('users-next-page').onclick = function () {
    var maxPage = Math.max(1, Math.ceil(usersPageState.total / usersPageState.pageSize));
    if (usersPageState.page >= maxPage) return;
    usersPageState.page += 1;
    loadUsersView(false);
  };
  document.getElementById('user-detail-close').onclick = closeUserDetailModal;
  document.getElementById('user-detail-btn-orders').onclick = function () {
    if (!userDetailCtx.userId) return;
    ordState.userOpenid = userDetailCtx.userId;
    nextOrderViewOpts = { keepUserOpenid: true };
    closeUserDetailModal();
    setView('orders');
  };

  document.getElementById('btn-quick-register').onclick = async function () {
    var phone = (document.getElementById('reg-phone').value || '').trim();
    var password = document.getElementById('reg-password').value || '';
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      toast('手机号格式不正确');
      return;
    }
    if (password.length < 6) {
      toast('密码至少 6 位');
      return;
    }
    try {
      var r = await fetch(apiUrl('/api/auth/register-phone-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone, password: password })
      });
      var body = await r.json().catch(function () {
        return {};
      });
      if (body && body.code === 0) {
        toast('注册成功');
        document.getElementById('reg-phone').value = '';
        document.getElementById('reg-password').value = '';
        setView('users');
      } else toast((body && body.message) || '注册失败');
    } catch (e) {
      toast('网络错误');
    }
  };

  document.querySelectorAll('.btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      var rect = btn.getBoundingClientRect();
      var ink = document.createElement('span');
      ink.className = 'ink-ripple';
      var size = Math.max(rect.width, rect.height);
      ink.style.width = size + 'px';
      ink.style.height = size + 'px';
      ink.style.left = e.clientX - rect.left - size / 2 + 'px';
      ink.style.top = e.clientY - rect.top - size / 2 + 'px';
      btn.appendChild(ink);
      setTimeout(function () { ink.remove(); }, 500);
    });
  });

  function initLoginMotion() {
    var hero = document.getElementById('login-hero');
    var panel = document.getElementById('login-panel');
    if (!hero || !panel) return;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    function onMove(e) {
      var rect = hero.getBoundingClientRect();
      var x = (e.clientX - rect.left) / rect.width - 0.5;
      var y = (e.clientY - rect.top) / rect.height - 0.5;
      hero.style.transform = 'rotateX(' + (-y * 2.2).toFixed(2) + 'deg) rotateY(' + (x * 2.8).toFixed(2) + 'deg)';
      panel.style.transform = 'translate(' + (-x * 5).toFixed(1) + 'px,' + (-y * 5).toFixed(1) + 'px)';
    }

    function onLeave() {
      hero.style.transform = '';
      panel.style.transform = '';
    }

    hero.addEventListener('mousemove', onMove);
    hero.addEventListener('mouseleave', onLeave);
  }

  initLoginMotion();
  wireMoviesUi();

  tryRestoreSession();
})();

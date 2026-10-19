(function () {
  'use strict';

  /* ---------- 유틸 ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uniq = (a) => Array.from(new Set(a));

  const KEY = {
    fav: 'bookstore.favoriteIds',
    visits: 'bookstore.visitRecords',
    courses: 'bookstore.savedCourses',
    prefs: 'bookstore.preferences',
    reviews: 'bookstore.userReviews',
    recent: 'bookstore.recentIds',
    settings: 'bookstore.settings',
    likes: 'bookstore.courseLikes'
  };
  const db = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('저장 공간을 사용할 수 없어요.'); } }
  };

  const AUTH_SESSION = 'bookbangteum.demoSession';
  const signedIn = () => sessionStorage.getItem(AUTH_SESSION) || '';
  const authButton = () => { const b = $('#headerLogin'); if (b) b.hidden = !!signedIn(); };

  const TITLES = {
    auth: '로그인 / 회원가입', home: '책방틈', list: '책방 탐색', detail: '책방 상세', reviews: '방문자 후기',
    my: '나의 책방', course: '코스', 'course-setup': '코스 만들기', map: '지도·코스 결과', edit: '코스 편집',
    taste: '나의 취향', 'done-course': '저장 완료'
  };
  const NAV_OF = {
    auth: 'home', home: 'home', taste: 'home', list: 'list', detail: 'list', reviews: 'list',
    course: 'course', 'course-setup': 'course', map: 'course', edit: 'course', 'done-course': 'course', my: 'my'
  };
  const GROUPS = [
    { key: 'region', label: '지역', get: (s) => [s.district] },
    { key: 'category', label: '취급 분야', get: (s) => s.categories },
    { key: 'theme', label: '테마', get: (s) => s.themes },
    { key: 'mood', label: '분위기', get: (s) => s.reviewTags },
    { key: 'facility', label: '시설', get: (s) => s.facilities }
  ];
  const REVIEW_OPTIONS = ['조용함', '아늑함', '활기참', '좌석 있음', '음료 제공'];
  const PAGE = 6;

  /* ---------- 상태 ---------- */
  const state = {
    status: 'loading', // loading | ready | error
    stores: [], places: [], shared: [],
    ctab: 'saved', psort: 'likes',
    query: '', applied: [], sort: 'name', visible: PAGE,
    currentId: null, tab: 'fav',
    course: blankCourse(null)
  };
  let current = null;
  let hist = [];
  const scrollMem = {};

  function blankCourse(storeId) {
    return { id: null, storeId, includeWalk: true, walkMinutes: 20, readingMinutes: 60, order: [], visibility: 'private' };
  }
  const getStore = (id) => state.stores.find((s) => s.id === id);
  const getPlace = (id) => state.places.find((p) => p.id === id);
  const favorites = () => db.get(KEY.fav, []).filter((id) => getStore(id));
  const isFav = (id) => db.get(KEY.fav, []).includes(id);
  const activeValues = (key) => state.applied.filter((a) => a.key === key).map((a) => a.value);
  const todayStr = () => {
    const d = new Date();
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  };

  /* ---------- 토스트 / 시트 ---------- */
  let toastTimer;
  function toast(msg, act) {
    const t = $('#toast');
    t.textContent = '';
    const s = document.createElement('span');
    s.textContent = msg;
    t.appendChild(s);
    t.classList.toggle('has-act', !!act);
    if (act) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = act.label; b.dataset.action = act.action;
      if (act.id) b.dataset.id = act.id;
      t.appendChild(b);
    }
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), act ? 5000 : 2000);
  }
  let lastFocus = null;
  let pendingConfirm = null;
  function openSheet(title, html) {
    if ($('#sheetWrap').hidden) lastFocus = document.activeElement;
    $('#sheetTitle').textContent = title;
    $('#sheetBody').innerHTML = html;
    $('#sheetBody').scrollTop = 0;
    $('#sheetWrap').hidden = false;
    $('.sheet').focus();
  }
  function closeSheet() {
    pendingConfirm = null;
    if ($('#sheetWrap').hidden) return;
    $('#sheetWrap').hidden = true;
    if (lastFocus && document.contains(lastFocus) && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }
  /* 브라우저 기본 confirm 대신 쓰는 확인 시트 (msg는 이미 이스케이프된 HTML) */
  function confirmSheet(title, msg, okLabel, fn) {
    openSheet(title, '<p class="para" style="color:var(--ink)">' + msg + '</p>' +
      '<div class="btn-row"><button type="button" class="btn light" data-action="closeSheet">취소</button>' +
      '<button type="button" class="btn danger" data-action="confirmOk">' + esc(okLabel) + '</button></div>');
    pendingConfirm = fn;
  }

  /* ---------- 화면 설정 / 최근 본 책방 ---------- */
  const settings = () => Object.assign({ fs: 'm', theme: 'auto' }, db.get(KEY.settings, {}));
  function applySettings() {
    const s = settings(), r = document.documentElement;
    r.setAttribute('data-fs', s.fs);
    if (s.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', s.theme);
  }
  const recent = () => db.get(KEY.recent, []).filter((id) => getStore(id));
  function pushRecent(id) {
    const r = db.get(KEY.recent, []).filter((x) => x !== id);
    r.unshift(id);
    db.set(KEY.recent, r.slice(0, 5));
  }
  function showDetail(id) { state.currentId = id; pushRecent(id); go('detail'); }

  /* ---------- 데이터 로드 ---------- */
  function load() {
    state.status = 'loading';
    renderList();
    Promise.all([
      fetch('data/bookstores.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch('data/places.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      /* 공유 코스는 없어도 앱이 동작하도록 실패 시 빈 목록 */
      fetch('data/sharedCourses.json').then((r) => (r.ok ? r.json() : [])).catch(() => [])
    ]).then(([stores, places, shared]) => {
      state.stores = stores;
      state.places = places;
      state.shared = Array.isArray(shared) ? shared : [];
      state.status = 'ready';
      if (current) renderScreen(current);
    }).catch(() => {
      state.status = 'error';
      if (current) renderScreen(current);
    });
  }
  function needReady(box) {
    if (state.status === 'ready') return true;
    box.innerHTML = state.status === 'loading'
      ? '<div class="state"><p>책방 정보를 불러오는 중이에요…</p></div>'
      : '<div class="state"><div class="icon">!</div><h3>데이터를 불러오지 못했어요</h3><p>잠시 후 다시 시도해 주세요.<br>(로컬 서버로 실행했는지 확인해 주세요)</p><button type="button" class="btn" data-action="retry">다시 시도</button></div>';
    return false;
  }

  /* ---------- 화면 전환 ---------- */
  function go(name, opts) {
    opts = opts || {};
    if (current) scrollMem[current] = $('#screens').scrollTop;
    if (opts.reset) hist = [];
    else if (opts.push !== false && current && current !== name) hist.push(current);
    current = name;
    $$('.screen').forEach((el) => { el.hidden = el.dataset.screen !== name; });
    $('#pageTitle').textContent = TITLES[name] || '책방틈';
    $$('.bottom button').forEach((b) => b.classList.toggle('on', b.dataset.nav === NAV_OF[name]));
    authButton();
    renderScreen(name);
    $('#screens').scrollTop = opts.restore ? (scrollMem[name] || 0) : 0;
  }
  function back() {
    const prev = hist.pop() || 'home';
    go(prev, { push: false, restore: true });
  }
  function renderScreen(name) {
    ({
      auth: () => {}, home: renderHome, list: renderList, detail: renderDetail, reviews: renderReviews, my: renderMy,
      course: renderCourseHub, 'course-setup': renderSetup, map: renderMap, edit: renderEdit, taste: renderTaste,
      'done-course': renderDoneCourse
    }[name] || (() => {}))();
  }
  function navTo(name) {
    if (name === 'course') {
      state.ctab = db.get(KEY.courses, []).length ? 'saved' : 'popular';
      go('course', { reset: true });
    } else if (name === 'course-new') {
      /* 새 코스는 항상 빈 상태에서 시작 (즐겨찾기 첫 책방이 있으면 미리 선택) */
      const f = favorites();
      state.course = blankCourse(f.length ? f[0] : null);
      go('course-setup', { reset: true });
    } else {
      if (name === 'list') { /* 책방 진입 시 기본 조건 초기화 */ state.applied = []; state.query = ''; state.visible = PAGE; }
      go(name, { reset: true });
    }
  }

  /* ---------- 목록 ---------- */
  function filterOptions(key) {
    const g = GROUPS.find((x) => x.key === key);
    return uniq(state.stores.flatMap((s) => g.get(s))).sort((a, b) => a.localeCompare(b, 'ko'));
  }
  function filteredStores() {
    const q = state.query.trim().toLowerCase();
    const r = state.stores.filter((s) => {
      if (q && !(s.title + ' ' + s.address + ' ' + s.district).toLowerCase().includes(q)) return false;
      return GROUPS.every((g) => {
        const sel = activeValues(g.key);
        return !sel.length || sel.some((v) => g.get(s).includes(v));
      });
    });
    r.sort(state.sort === 'reviews'
      ? (a, b) => reviewsOf(b.id).length - reviewsOf(a.id).length || a.title.localeCompare(b.title, 'ko')
      : (a, b) => a.title.localeCompare(b.title, 'ko'));
    return r;
  }
  function cardHTML(s, action, extra, cls, noHeart) {
    const fav = isFav(s.id);
    const tags = uniq([].concat(s.categories.slice(0, 1), s.reviewTags.slice(0, 1), s.facilities.slice(0, 1)));
    const hours = s.openingHours ? '영업 ' + s.openingHours.split(' ')[0] : '영업시간 정보 확인';
    return '<div class="book ' + (cls || '') + '" role="button" tabindex="0" data-action="' + action + '" data-id="' + s.id + '">' +
      '<div class="thumb" aria-hidden="true">' + esc(s.title[0]) + '</div>' +
      '<div class="bookbody"><b>' + esc(s.title) + '</b><small>' + esc(s.district) + ' · ' + esc(hours) + '</small>' +
      '<div class="chips mini">' + tags.map((t) => '<span class="chip">' + esc(t) + '</span>').join('') + '</div>' +
      (extra || '') + '<span class="textlink">상세보기 〉</span></div>' +
      (noHeart ? '' : '<button type="button" class="heart" data-action="cardFav" data-id="' + s.id + '" aria-pressed="' + fav + '" aria-label="' + esc(s.title) + ' 즐겨찾기">' + (fav ? '★' : '☆') + '</button>') +
      '</div>';
  }
  function renderList() {
    const input = $('#listQuery');
    if (document.activeElement !== input) input.value = state.query;
    $('#sortSelect').value = state.sort;

    $('#filterChips').innerHTML = GROUPS.map((g) => {
      const n = activeValues(g.key).length;
      return '<button type="button" class="chip' + (n ? ' on' : '') + '" data-action="openFilter" data-key="' + g.key + '">' + g.label + (n ? ' ' + n : '') + ' ▾</button>';
    }).join('');

    const sel = $('#selectedBox');
    const body = $('#listBody');
    const more = $('#moreBtn');
    more.hidden = true;

    const chips = [];
    if (state.query.trim()) chips.push('<span class="chip">“' + esc(state.query.trim()) + '” <button type="button" class="x" data-action="clearQuery" aria-label="검색어 지우기">×</button></span>');
    state.applied.forEach((a, i) => chips.push('<span class="chip">' + esc(a.value) + ' <button type="button" class="x" data-action="removeFilter" data-i="' + i + '" aria-label="' + esc(a.value) + ' 해제">×</button></span>'));
    sel.hidden = false;
    sel.innerHTML = chips.length
      ? '<span>선택 조건:</span>' + chips.join('') + '<button type="button" class="reset" data-action="resetAll">초기화</button>'
      : '<span class="muted">선택된 조건이 없어요. 필터를 눌러 조건을 추가해 보세요.</span>';

    if (state.status !== 'ready') {
      $('#resultMeta').textContent = '검색 결과';
      needReady(body);
      return;
    }
    const list = filteredStores();
    $('#resultMeta').textContent = '검색 결과 ' + list.length + '건';
    if (!list.length) {
      body.innerHTML = '<div class="state"><div class="icon">∅</div><h3>조건에 맞는 책방이 없어요</h3><p>선택한 조건을 줄이거나<br>다른 지역에서 찾아보세요.</p></div>' +
        '<button type="button" class="btn" data-action="removeLast"' + (state.applied.length ? '' : ' disabled') + '>마지막 필터 해제</button>' +
        '<button type="button" class="btn light" data-action="resetAll">전체 조건 초기화</button>';
      return;
    }
    body.innerHTML = list.slice(0, state.visible).map((s) => cardHTML(s, 'openDetail')).join('');
    more.hidden = list.length <= state.visible;
  }
  function openFilter(key) {
    const g = GROUPS.find((x) => x.key === key);
    const sel = activeValues(key);
    openSheet(g.label, filterOptions(key).map((o) =>
      '<label class="opt"><input type="checkbox" name="fopt" value="' + esc(o) + '"' + (sel.includes(o) ? ' checked' : '') + '> ' + esc(o) + '</label>').join('') +
      '<div class="sheet-foot"><div class="btn-row">' +
      '<button type="button" class="btn light" data-action="clearGroup" data-key="' + key + '">이 항목 해제</button>' +
      '<button type="button" class="btn" data-action="applyFilter" data-key="' + key + '">적용</button></div></div>');
  }

  /* ---------- 후기 ---------- */
  function reviewsOf(id) {
    const s = getStore(id);
    const mine = db.get(KEY.reviews, []).filter((r) => r.bookstoreId === id);
    return (s ? s.reviews : []).concat(mine.slice().reverse());
  }
  function tagCounts(id) {
    const rs = reviewsOf(id);
    const c = {};
    rs.forEach((r) => r.tags.forEach((t) => { c[t] = (c[t] || 0) + 1; }));
    return { total: rs.length, tags: Object.entries(c).sort((a, b) => b[1] - a[1]) };
  }

  /* ---------- 상세 ---------- */
  function renderDetail() {
    const box = $('#detailBody');
    if (!needReady(box)) return;
    const s = getStore(state.currentId);
    if (!s) { box.innerHTML = '<div class="state"><p>책방 정보를 찾을 수 없어요.</p><button type="button" class="btn" data-nav="list">책방 탐색으로</button></div>'; return; }
    const fav = isFav(s.id);
    const tc = tagCounts(s.id);
    const topTags = tc.tags.slice(0, 2).map((t) => '#' + t[0]).join(' ');
    const chipTags = uniq(s.categories.concat(s.themes.slice(0, 1), s.reviewTags.slice(0, 1)));
    const visits = db.get(KEY.visits, []).filter((v) => v.bookstoreId === s.id).length;
    const mapUrl = 'https://map.naver.com/p/search/' + encodeURIComponent(s.address);
    box.innerHTML =
      '<div class="hero"><span class="hero-letter" aria-hidden="true">' + esc(s.title[0]) + '</span><small>' + esc(s.district) + '</small></div>' +
      '<div class="title-row"><h2>' + esc(s.title) + '</h2>' +
      '<button type="button" class="heart" data-action="toggleFav" data-id="' + s.id + '" aria-pressed="' + fav + '" aria-label="즐겨찾기">' + (fav ? '★' : '☆') + '</button></div>' +
      '<div class="chips mini">' + chipTags.map((t) => '<span class="chip">' + esc(t) + '</span>').join('') + '</div>' +
      '<div class="fact"><span>주소</span><div class="val">' + esc(s.address) +
      '<div class="card-acts"><button type="button" class="mini-btn" data-action="copyAddr" data-id="' + s.id + '">주소 복사</button>' +
      '<a class="mini-btn" href="' + mapUrl + '" target="_blank" rel="noopener noreferrer">지도에서 보기 ↗</a></div></div></div>' +
      '<div class="fact"><span>운영</span><span class="val">' + esc(s.openingHours || '정보 확인') + '</span></div>' +
      '<div class="fact"><span>시설</span><span class="val">좌석 ' + (s.facilities.includes('좌석') ? '있음' : '정보 확인') + ' / 음료 ' + (s.facilities.includes('음료') ? '있음' : '정보 확인') + '</span></div>' +
      '<h3 class="section">큐레이션 · 공간 소개</h3><p class="para">' + esc(s.description) + '</p>' +
      '<div class="section"><button type="button" class="linkrow" data-action="openReviews"><span>방문자 후기·키워드</span><span>〉</span></button></div>' +
      '<p class="para">후기 ' + tc.total + '건' + (topTags ? ' · ' + esc(topTags) : '') + (visits ? ' · 내 방문 ' + visits + '회' : '') + '</p>' +
      '<div class="sticky"><button type="button" class="btn" data-action="startCourse" data-id="' + s.id + '">이 책방으로 코스 만들기</button>' +
      '<div class="btn-row"><button type="button" class="btn light" data-action="toggleFav" data-id="' + s.id + '">' + (fav ? '★ 즐겨찾기 해제' : '☆ 즐겨찾기 저장') + '</button>' +
      '<button type="button" class="btn light" data-action="addVisit" data-id="' + s.id + '">방문 기록 추가</button></div></div>';
    $('[data-screen="detail"]').classList.add('has-sticky');
  }
  /* 즐겨찾기: 화면을 넘기지 않고 그 자리에서 바꾸고, 토스트로 다음 행동/되돌리기를 제공 */
  function setFav(id, on) {
    let f = db.get(KEY.fav, []);
    if (on && !f.includes(id)) f.push(id);
    if (!on) f = f.filter((x) => x !== id);
    db.set(KEY.fav, f);
  }
  function syncHearts(id) {
    const on = isFav(id);
    $$('.heart[data-id="' + id + '"]').forEach((b) => { b.setAttribute('aria-pressed', on); b.textContent = on ? '★' : '☆'; });
  }
  function refreshFav(id) {
    if (current === 'detail') renderDetail();
    else if (current === 'my') renderMy();
    else syncHearts(id);
  }
  function toggleFav(id) {
    const was = isFav(id);
    setFav(id, !was);
    refreshFav(id);
    if (was) toast('즐겨찾기에서 해제했어요.', { label: '실행 취소', action: 'undoFav', id: id });
    else toast('즐겨찾기에 저장했어요.', { label: '나의 책방 보기', action: 'goMyFav' });
  }
  function addVisitFor(id) {
    const v = db.get(KEY.visits, []);
    const today = todayStr();
    if (v.some((x) => x.bookstoreId === id && x.date === today)) {
      toast('오늘 방문 기록이 이미 있어요.', { label: '기록 보기', action: 'goMyVisits' });
      return;
    }
    v.push({ id: 'v' + Date.now(), bookstoreId: id, date: today, memo: '' });
    db.set(KEY.visits, v);
    if (current === 'my') { state.tab = 'visits'; renderMy(); toast('방문 기록을 추가했어요. 메모를 남겨 보세요.'); }
    else { if (current === 'detail') renderDetail(); toast('방문 기록을 추가했어요.', { label: '기록 보기', action: 'goMyVisits' }); }
  }
  function copyText(text) {
    const done = () => toast('복사했어요.');
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('복사하지 못했어요.'); }
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }

  /* ---------- 홈 ---------- */
  function renderHome() {
    const box = $('#homeExtra');
    if (state.status !== 'ready') { box.innerHTML = ''; return; }
    let h = '';
    const rec = recent().slice(0, 2).map(getStore);
    if (rec.length) {
      h += '<div class="section section-row"><span>최근 본 책방</span><button type="button" class="textbtn" data-action="clearRecent">지우기</button></div>' +
        rec.map((s) => cardHTML(s, 'openDetail')).join('');
    }
    const p = db.get(KEY.prefs, { category: [], mood: [], facility: [] });
    if (p.category.length || p.mood.length || p.facility.length) {
      const r = state.stores.map((s) => ({ s: s, n: matchCount(s, p) })).filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n || a.s.title.localeCompare(b.s.title, 'ko')).slice(0, 2);
      if (r.length) {
        h += '<div class="section section-row"><span>내 취향 맞춤 추천</span><button type="button" class="textbtn" data-go="taste">취향 바꾸기</button></div>' +
          r.map((x) => cardHTML(x.s, 'openDetail', '<small>취향 일치 항목: ' + x.n + '개</small>')).join('');
      }
    }
    box.innerHTML = h;
  }

  /* ---------- 후기 화면 ---------- */
  function renderReviews() {
    const box = $('#reviewBody');
    if (!needReady(box)) return;
    const s = getStore(state.currentId);
    if (!s) return;
    const tc = tagCounts(s.id);
    const rs = reviewsOf(s.id);
    box.innerHTML =
      '<h3>' + esc(s.title) + '</h3>' +
      '<div class="section">방문자 키워드</div>' +
      '<div class="chips">' + (tc.tags.length ? tc.tags.map((t) => '<span class="chip">' + esc(t[0]) + ' ' + t[1] + '/' + tc.total + '</span>').join('') : '<span class="muted">아직 키워드가 없어요.</span>') + '</div>' +
      '<div class="section">후기 목록 · ' + rs.length + '건</div>' +
      (rs.filter((r) => r.comment).map((r) => '<div class="review">“' + esc(r.comment) + '”<small>' + esc(r.date) + ' · 방문자</small></div>').join('') || '<p class="para muted">등록된 한 줄 후기가 없어요.</p>') +
      '<div class="section">나의 방문 후기 작성</div>' +
      '<form id="reviewForm"><div class="chips">' + REVIEW_OPTIONS.map((o) => '<label class="chk"><input type="checkbox" name="rtag" value="' + o + '"><span>' + o + '</span></label>').join('') + '</div>' +
      '<textarea class="inputarea" id="reviewComment" maxlength="80" placeholder="한 줄 후기를 입력하세요 (선택)" aria-label="한 줄 후기"></textarea><div class="counter" id="rcount">0/80</div>' +
      '<div class="sticky"><button type="submit" class="btn">후기 등록</button></div></form>';
    $('[data-screen="reviews"]').classList.add('has-sticky');
  }
  function submitReview() {
    const tags = $$('input[name="rtag"]:checked').map((i) => i.value);
    const comment = $('#reviewComment').value.trim();
    if (!tags.length && !comment) { toast('키워드나 한 줄 후기를 입력해 주세요.'); return; }
    const all = db.get(KEY.reviews, []);
    all.push({ reviewId: 'r' + Date.now(), bookstoreId: state.currentId, tags: tags, comment: comment, date: todayStr() });
    db.set(KEY.reviews, all);
    toast('후기를 등록했어요.');
    renderReviews();
  }

  /* ---------- 나의 책방 ---------- */
  function renderMy() {
    const myTabs = $('[data-screen="my"] .tabs');
    myTabs.hidden = !signedIn();
    if (!signedIn()) { $('#myBody').innerHTML = '<div class="state"><h3>나의 책방</h3><p>로그인하거나 회원가입해 주세요.</p><button type="button" class="btn" data-action="openAuth">로그인 / 회원가입</button></div>'; return; }
    const labels = { fav: '즐겨찾기', visits: '방문 기록', courses: '저장 코스' };
    const counts = { fav: db.get(KEY.fav, []).length, visits: db.get(KEY.visits, []).length, courses: db.get(KEY.courses, []).length };
    $$('[data-screen="my"] .tabs button').forEach((b) => {
      const on = b.dataset.tab === state.tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on);
      b.textContent = labels[b.dataset.tab] + ' ' + counts[b.dataset.tab];
    });
    const box = $('#myBody');
    if (!needReady(box)) return;
    if (state.tab === 'fav') box.innerHTML = myFavHTML();
    else if (state.tab === 'visits') box.innerHTML = myVisitsHTML();
    else box.innerHTML = myCoursesHTML();
  }
  function myFavHTML() {
    const f = favorites().map(getStore);
    if (!f.length) return '<div class="state"><div class="icon">☆</div><h3>즐겨찾기한 책방이 없어요</h3><p>마음에 드는 책방의 ☆를 눌러 저장해 보세요.</p></div><button type="button" class="btn" data-nav="list">책방 탐색하기</button>';
    return '<h3 class="section first">즐겨찾기한 책방 ' + f.length + '곳</h3>' +
      f.map((s) => cardHTML(s, 'openDetail',
        '<div class="card-acts"><button type="button" class="btn sm" data-action="startCourse" data-id="' + s.id + '">코스 만들기</button>' +
        '<button type="button" class="btn light sm" data-action="addVisit" data-id="' + s.id + '">방문 기록</button>' +
        '<button type="button" class="btn light sm" data-action="unfav" data-id="' + s.id + '">해제</button></div>', '', true)).join('');
  }
  function myVisitsHTML() {
    const v = db.get(KEY.visits, []).filter((r) => getStore(r.bookstoreId));
    if (!v.length) return '<div class="state"><div class="icon">✎</div><h3>방문 기록이 없어요</h3><p>즐겨찾기 탭의 “방문 기록” 버튼이나<br>책방 상세의 “방문 기록 추가”를 눌러 보세요.</p></div>';
    return v.slice().reverse().map((r) => {
      const s = getStore(r.bookstoreId);
      return '<div class="card" data-id="' + r.id + '"><b>' + esc(s.title) + '</b> <small class="muted">' + esc(r.date) + ' 방문</small>' +
        '<textarea class="memo" maxlength="200" placeholder="메모를 남겨 보세요 (입력 후 바깥을 누르면 자동 저장)" aria-label="방문 메모">' + esc(r.memo) + '</textarea>' +
        '<div class="card-acts"><button type="button" class="btn sm" data-action="saveMemo" data-id="' + r.id + '">메모 저장</button>' +
        '<button type="button" class="btn light sm" data-action="delVisit" data-id="' + r.id + '">삭제</button></div></div>';
    }).join('');
  }
  function myCoursesHTML() {
    const c = db.get(KEY.courses, []);
    if (!c.length) return '<div class="state"><div class="icon">⌖</div><h3>저장한 코스가 없어요</h3><p>책방에서 코스를 만들어 저장해 보세요.</p></div><button type="button" class="btn" data-nav="course-new">코스 만들기</button>';
    return c.slice().reverse().map(courseCardHTML).join('');
  }

  /* ---------- 코스 ---------- */
  /* ---------- 코스 허브 (저장한 코스 · 인기 코스) ---------- */
  function routeText(x) {
    return x.order.map(itemInfo).filter(Boolean).map((it) => it.name).join(' → ');
  }
  function courseMeta(x) {
    return '장소 ' + x.order.length + '곳 · 독서 ' + fmtMin(x.readingMinutes) + (x.includeWalk ? ' · 산책 ' + x.walkMinutes + '분' : '');
  }
  /* 저장한 코스 카드 (코스 허브·나의 책방 공용) */
  function courseCardHTML(x) {
    const badge = x.from
      ? '<span class="badge">' + esc(x.from) + '님의 코스</span>'
      : '<span class="badge' + (x.visibility === 'public' ? ' on' : '') + '">' + (x.visibility === 'public' ? '공개' : '비공개') + '</span>';
    return '<div class="card"><b>' + esc(x.title) + '</b>' + badge +
      '<p class="para">' + courseMeta(x) + '<br>' + esc(routeText(x)) + '<br><span class="muted">' + esc(x.createdAt) + ' 저장</span></p>' +
      '<div class="card-acts"><button type="button" class="btn sm" data-action="openCourse" data-id="' + x.id + '" data-mode="map">확인</button>' +
      '<button type="button" class="btn light sm" data-action="openCourse" data-id="' + x.id + '" data-mode="edit">편집</button>' +
      (x.srcId ? '' : '<button type="button" class="btn light sm" data-action="toggleVis" data-id="' + x.id + '">' + (x.visibility === 'public' ? '비공개로 전환' : '공개로 전환') + '</button>') +
      '<button type="button" class="btn light sm" data-action="delCourse" data-id="' + x.id + '">삭제</button></div></div>';
  }
  /* 공개 범위 선택 (다른 사람의 코스를 담은 경우엔 표시하지 않음) */
  function visHTML(c) {
    if (c.srcId) return '';
    const v = c.visibility === 'public' ? 'public' : 'private';
    return '<h3 class="section">코스 공개 설정</h3>' +
      '<div class="choices">' + [['private', '비공개'], ['public', '공개']].map((x) =>
        '<button type="button" class="' + (v === x[0] ? 'active' : '') + '" data-action="setVis" data-v="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
      '<p class="para">' + (v === 'public' ? '저장하면 인기 코스 목록에 올라가 다른 사용자도 볼 수 있어요.' : '나만 볼 수 있어요. 저장한 코스에서 언제든 공개로 바꿀 수 있어요.') + '</p>';
  }
  function popularHTML() {
    const liked = db.get(KEY.likes, []);
    const saved = db.get(KEY.courses, []);
    const mine = saved.filter((x) => x.visibility === 'public' && !x.srcId)
      .map((x) => Object.assign({}, x, { author: '나', mine: true, likes: 0 }));
    const list = state.shared.concat(mine).filter((x) => getStore(x.bookstoreId));
    const cnt = (x) => x.likes + (liked.includes(x.id) ? 1 : 0);
    list.sort(state.psort === 'new'
      ? (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || cnt(b) - cnt(a)
      : (a, b) => cnt(b) - cnt(a) || String(b.createdAt).localeCompare(String(a.createdAt)));
    const seg = [['likes', '인기순'], ['new', '최신순']].map((x) =>
      '<button type="button" data-action="popSort" data-v="' + x[0] + '" aria-pressed="' + (state.psort === x[0]) + '">' + x[1] + '</button>').join('');
    if (!list.length) return '<div class="state"><div class="icon">⌖</div><h3>아직 공개된 코스가 없어요</h3><p>코스를 만들 때 “공개”를 선택하면<br>여기에 올라가요.</p></div>';
    return '<div class="rowline"><b>공개 코스 ' + list.length + '개</b><div class="seg sm" role="group">' + seg + '</div></div>' +
      list.map((x) => {
        const taken = saved.some((c) => c.srcId === x.id);
        const acts = x.mine
          ? '<button type="button" class="btn sm" data-action="openCourse" data-id="' + x.id + '" data-mode="map">확인</button>' +
            '<button type="button" class="btn light sm" data-action="toggleVis" data-id="' + x.id + '">비공개로 전환</button>'
          : '<button type="button" class="btn sm" data-action="openCourse" data-id="' + x.id + '" data-mode="map">확인</button>' +
            '<button type="button" class="btn light sm" data-action="takeCourse" data-id="' + x.id + '"' + (taken ? ' disabled' : '') + '>' + (taken ? '담음 ✓' : '내 코스로 담기') + '</button>' +
            '<button type="button" class="btn light sm" data-action="likeCourse" data-id="' + x.id + '" aria-pressed="' + liked.includes(x.id) + '" aria-label="좋아요">' + (liked.includes(x.id) ? '♥ ' : '♡ ') + cnt(x) + '</button>';
        return '<div class="card"><b>' + esc(x.title) + '</b>' + (x.mine ? '<span class="badge on">내 코스</span>' : '') +
          '<p class="para">' + esc(x.author) + '님 · ' + courseMeta(x) + '<br>' + esc(routeText(x)) +
          (x.desc ? '<br><span class="muted">' + esc(x.desc) + '</span>' : '') + '</p>' +
          '<div class="card-acts">' + acts + '</div></div>';
      }).join('');
  }
  function renderCourseHub() {
    const box = $('#courseBody');
    if (!needReady(box)) return;
    const saved = db.get(KEY.courses, []);
    const tabs = [['saved', '저장한 코스 ' + saved.length], ['popular', '인기 코스']];
    const body = state.ctab === 'saved'
      ? (saved.length
        ? saved.slice().reverse().map(courseCardHTML).join('')
        : '<div class="state"><div class="icon">⌖</div><h3>저장한 코스가 없어요</h3><p>직접 만들거나, 인기 코스에서<br>마음에 드는 코스를 담아 보세요.</p></div>')
      : popularHTML();
    box.innerHTML =
      '<button type="button" class="btn" data-nav="course-new">＋ 새 코스 만들기</button>' +
      '<div class="tabs" role="tablist">' + tabs.map((t) =>
        '<button type="button" role="tab" class="' + (state.ctab === t[0] ? 'on' : '') + '" aria-selected="' + (state.ctab === t[0]) + '" data-action="courseTab" data-tab="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' +
      body;
  }

  function startCourse(id) {
    if (!id) return;
    state.course = blankCourse(id);
    go('course-setup');
  }
  function renderSetup() {
    const box = $('#setupBody');
    if (!needReady(box)) return;
    const c = state.course;
    const s = getStore(c.storeId);
    const choice = (cur, val, label, action) => '<button type="button" class="' + (cur === val ? 'active' : '') + '" data-action="' + action + '" data-v="' + val + '">' + label + '</button>';
    box.innerHTML =
      '<h3 class="section first">선택한 책방</h3>' +
      '<button type="button" class="pick" data-action="pickStore"><b>' + (s ? esc(s.title) : '책방을 선택해 주세요') + '</b><span>책방 변경 〉</span></button>' +
      '<h3 class="section">산책을 포함할까요?</h3>' +
      '<div class="choices">' + choice(c.includeWalk, true, '포함', 'setWalkOn') + choice(c.includeWalk, false, '포함하지 않음', 'setWalkOn') + '</div>' +
      (c.includeWalk ? '<h3 class="section">산책 시간</h3><div class="choices">' + [10, 20, 30].map((m) => choice(c.walkMinutes, m, m + '분', 'setWalkMin')).join('') + '</div>' : '') +
      '<h3 class="section">책방 독서 체류 시간</h3>' +
      '<div class="choices">' + [[30, '30분'], [60, '1시간'], [120, '2시간']].map((x) => choice(c.readingMinutes, x[0], x[1], 'setReadMin')).join('') + '</div>' +
      visHTML(c) +
      '<h3 class="section">선택 조건 요약</h3>' +
      '<p class="para">' + (s ? '책방 1곳' : '책방 미선택') + (c.includeWalk ? ' · 산책 ' + c.walkMinutes + '분' : ' · 산책 없음') + ' · 독서 ' + fmtMin(c.readingMinutes) + (c.srcId ? '' : ' · ' + (c.visibility === 'public' ? '공개' : '비공개')) + '</p>' +
      '<div class="sticky"><button type="button" class="btn" data-action="makeCourse"' + (s ? '' : ' disabled') + '>' + (s ? '지도에서 코스 확인하기' : '책방을 먼저 선택해 주세요') + '</button></div>';
    $('[data-screen="course-setup"]').classList.add('has-sticky');
  }
  const fmtMin = (m) => (m >= 60 && m % 60 === 0 ? m / 60 + '시간' : m + '분');

  function dist(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function itemInfo(key) {
    const isStore = key[0] === 'S';
    const id = key.slice(2);
    const o = isStore ? getStore(id) : getPlace(id);
    if (!o) return null;
    return { key: key, isStore: isStore, name: isStore ? o.title : o.name, coords: o.coordinates, kind: isStore ? 'store' : o.type };
  }
  function nearest(from, type, excludeKeys) {
    return state.places
      .filter((p) => p.type === type && !excludeKeys.includes('P:' + p.id))
      .sort((a, b) => dist(from, a.coordinates) - dist(from, b.coordinates))[0];
  }
  function buildOrder() {
    const c = state.course;
    const s = getStore(c.storeId);
    const order = ['S:' + s.id];
    if (c.includeWalk) { const w = nearest(s.coordinates, 'walk', order); if (w) order.push('P:' + w.id); }
    const r = nearest(s.coordinates, 'rest', order);
    if (r) order.push('P:' + r.id);
    c.order = order;
  }
  function courseStats() {
    const c = state.course;
    const items = c.order.map(itemInfo).filter(Boolean);
    let meters = 0;
    for (let i = 1; i < items.length; i++) meters += dist(items[i - 1].coords, items[i].coords);
    const walkCount = items.filter((x) => x.kind === 'walk').length;
    return {
      items: items,
      walkCount: walkCount,
      walkTotal: walkCount ? c.walkMinutes : 0,
      moveMin: items.length > 1 ? Math.max(1, Math.round(meters * 1.3 / 67)) : null
    };
  }
  function itemLabel(it, st) {
    if (it.kind === 'store') return '독서 ' + fmtMin(state.course.readingMinutes);
    if (it.kind === 'walk') return '산책 ' + Math.round(st.walkTotal / st.walkCount) + '분';
    return '휴식 · 선택 가능';
  }
  function mapSVG(items) {
    const W = 340, H = 200, pad = 28;
    const lats = items.map((i) => i.coords[0]), lngs = items.map((i) => i.coords[1]);
    const minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
    const minLng = Math.min.apply(null, lngs), maxLng = Math.max.apply(null, lngs);
    const sx = (maxLng - minLng) || 0.004, sy = (maxLat - minLat) || 0.004;
    const pts = items.map((i) => [
      pad + ((i.coords[1] - minLng) / sx) * (W - pad * 2),
      H - pad - ((i.coords[0] - minLat) / sy) * (H - pad * 2)
    ]);
    const line = pts.length > 1 ? '<polyline points="' + pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ') + '" class="ln" fill="none" stroke="#444" stroke-width="2.5" stroke-dasharray="6 5" stroke-linecap="round"/>' : '';
    const dots = pts.map((p, i) => '<g><circle class="' + (items[i].isStore ? 'on-store' : 'on-place') + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="13" fill="' + (items[i].isStore ? '#2d2d2d' : '#fff') + '" stroke="#2d2d2d" stroke-width="2"/><text class="' + (items[i].isStore ? 't-store' : 't-place') + '" x="' + p[0].toFixed(1) + '" y="' + (p[1] + 4.5).toFixed(1) + '" text-anchor="middle" font-size="13" font-weight="700" fill="' + (items[i].isStore ? '#fff' : '#2d2d2d') + '">' + (i + 1) + '</text></g>').join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="코스 위치 약도">' + line + dots + '</svg>';
  }
  function renderMap() {
    const box = $('#mapBody');
    if (!needReady(box)) return;
    const c = state.course;
    if (!getStore(c.storeId)) { box.innerHTML = '<div class="state"><p>코스를 만들 책방을 먼저 선택해 주세요.</p><button type="button" class="btn" data-nav="course-new">코스 만들기</button></div>'; return; }
    if (!c.order.length) buildOrder();
    const st = courseStats();
    box.innerHTML =
      '<div class="map">' + mapSVG(st.items) + '<div class="legend">지도 API 연동 전 약도예요. 마커는 위치 관계만 보여줘요.</div></div>' +
      '<h3 class="section">코스 요약</h3>' +
      st.items.map((it, i) => '<div class="route"><span class="name">' + (i + 1) + '. ' + esc(it.name) + '</span><small>' + itemLabel(it, st) + '</small></div>').join('') +
      '<p class="para">예상 도보 시간: ' + (st.moveMin ? '약 ' + st.moveMin + '분 (직선거리 기준 추정)' : '표시할 값이 없어요') + '<br>총 소요시간: ' +
      (c.readingMinutes + st.walkTotal + (st.moveMin || 0)) + '분 (체류 ' + (c.readingMinutes + st.walkTotal) + '분' + (st.moveMin ? ' + 이동 약 ' + st.moveMin + '분' : '') + ')</p>' +
      visHTML(c) +
      '<div class="sticky"><button type="button" class="btn" data-action="editCourse">코스 편집</button>' +
      '<button type="button" class="btn light" data-action="saveCourse">' + (c.id ? '변경 내용 저장' : '현재 코스 저장') + '</button></div>';
    $('[data-screen="map"]').classList.add('has-sticky');
  }
  function renderEdit() {
    const box = $('#editBody');
    if (!needReady(box)) return;
    const c = state.course;
    if (!getStore(c.storeId)) { box.innerHTML = '<div class="state"><p>편집할 코스가 없어요.</p></div>'; return; }
    if (!c.order.length) buildOrder();
    const st = courseStats();
    const n = st.items.length;
    box.innerHTML =
      '<h3 class="section first">장소 목록 · 순서 변경</h3>' +
      st.items.map((it, i) =>
        '<div class="route"><span class="name">' + (i + 1) + '. ' + esc(it.name) + '<br><small>' + (it.isStore ? '기준 책방 · ' : '') + itemLabel(it, st) + '</small></span>' +
        '<span class="acts"><button type="button" data-action="moveItem" data-i="' + i + '" data-d="-1" aria-label="위로"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
        '<button type="button" data-action="moveItem" data-i="' + i + '" data-d="1" aria-label="아래로"' + (i === n - 1 ? ' disabled' : '') + '>▼</button>' +
        '<button type="button" data-action="removeItem" data-i="' + i + '" aria-label="삭제"' + (it.isStore ? ' disabled' : '') + '>×</button></span></div>').join('') +
      '<button type="button" class="btn light" data-action="addPlace">＋ 주변 장소 추가</button>' +
      '<h3 class="section">수정된 코스 요약</h3>' +
      '<p class="para">책방 1곳 · 산책 장소 ' + st.walkCount + '곳 · 기타 ' + (n - 1 - st.walkCount) + '곳<br>독서 ' + fmtMin(c.readingMinutes) + ' · 산책 ' + st.walkTotal + '분<br>도보 시간: ' + (st.moveMin ? '약 ' + st.moveMin + '분 (추정)' : '확인 필요') + '</p>' +
      visHTML(c) +
      '<div class="sticky"><button type="button" class="btn" data-action="saveCourse">코스 저장하기</button></div>';
    $('[data-screen="edit"]').classList.add('has-sticky');
  }
  function saveCourse() {
    const c = state.course;
    const s = getStore(c.storeId);
    if (!s || !c.order.length) return;
    const all = db.get(KEY.courses, []);
    const rec = {
      id: c.id || 'c' + Date.now(),
      title: s.title + ' 중심 ' + (c.includeWalk ? '산책 ' : '') + '코스',
      bookstoreId: s.id, includeWalk: c.includeWalk, walkMinutes: c.walkMinutes,
      readingMinutes: c.readingMinutes, order: c.order.slice(), createdAt: todayStr(),
      visibility: !c.srcId && c.visibility === 'public' ? 'public' : 'private'
    };
    if (c.srcId) { rec.srcId = c.srcId; rec.from = c.from || ''; }
    const i = all.findIndex((x) => x.id === rec.id);
    if (i >= 0) all[i] = rec; else all.push(rec);
    db.set(KEY.courses, all);
    c.id = rec.id;
    state.lastCourseTitle = rec.title;
    state.lastCourseVis = rec.visibility;
    go('done-course');
  }
  function renderDoneCourse() {
    $('#doneCourseBody').innerHTML =
      '<div class="state"><div class="icon">✓</div><h3>나만의 코스를 저장했어요</h3><p>' + esc(state.lastCourseTitle || '') + '<br>' + (state.lastCourseVis === 'public' ? '공개 코스로 저장했어요. 인기 코스 목록에서 볼 수 있어요.' : '저장한 코스에서 다시 열 수 있어요.') + '</p></div>' +
      '<button type="button" class="btn" data-action="goCourseSaved">저장한 코스 확인하기</button>' +
      '<button type="button" class="btn light" data-nav="home">홈으로 돌아가기</button>';
  }
  function pickStoreSheet() {
    const favIds = favorites();
    const list = state.stores.slice().sort((a, b) => (favIds.includes(b.id) ? 1 : 0) - (favIds.includes(a.id) ? 1 : 0) || a.title.localeCompare(b.title, 'ko'));
    openSheet('책방 선택', list.map((s) =>
      '<button type="button" class="opt-btn" data-action="chooseStore" data-id="' + s.id + '"><span>' + (favIds.includes(s.id) ? '★ ' : '') + esc(s.title) + '</span><small>' + esc(s.district) + '</small></button>').join(''));
  }
  function addPlaceSheet() {
    const c = state.course;
    const s = getStore(c.storeId);
    const list = state.places.filter((p) => !c.order.includes('P:' + p.id))
      .sort((a, b) => dist(s.coordinates, a.coordinates) - dist(s.coordinates, b.coordinates)).slice(0, 8);
    openSheet('주변 장소 추가', list.length ? list.map((p) =>
      '<button type="button" class="opt-btn" data-action="chooseAddPlace" data-id="' + p.id + '"><span>' + esc(p.name) + ' <small>' + (p.type === 'walk' ? '산책' : '휴식') + '</small></span><small>' + (dist(s.coordinates, p.coordinates) / 1000).toFixed(1) + 'km</small></button>').join('')
      : '<p class="para muted">추가할 수 있는 장소가 없어요.</p>');
  }

  /* ---------- 취향 ---------- */
  function renderTaste() {
    const box = $('#tasteBody');
    if (!needReady(box)) return;
    const p = db.get(KEY.prefs, { category: [], mood: [], facility: [] });
    const group = (title, name, opts, sel) => '<h3 class="section">' + title + '</h3><div class="chips">' +
      opts.map((o) => '<label class="chk"><input type="checkbox" name="' + name + '" value="' + esc(o) + '"' + (sel.includes(o) ? ' checked' : '') + '><span>' + esc(o) + '</span></label>').join('') + '</div>';
    box.innerHTML =
      group('선호하는 책 분야', 'pcategory', filterOptions('category'), p.category).replace('section"', 'section first"') +
      group('원하는 공간 분위기', 'pmood', filterOptions('mood'), p.mood) +
      group('원하는 시설', 'pfacility', filterOptions('facility'), p.facility) +
      '<button type="button" class="btn" data-action="savePrefs">취향 저장 및 추천 보기</button>' +
      '<div id="tasteResult">' + tasteResultHTML(p) + '</div>';
  }
  function matchCount(s, p) {
    return s.categories.filter((x) => p.category.includes(x)).length +
      s.reviewTags.filter((x) => p.mood.includes(x)).length +
      s.facilities.filter((x) => p.facility.includes(x)).length;
  }
  function tasteResultHTML(p) {
    if (!p.category.length && !p.mood.length && !p.facility.length) return '';
    const r = state.stores.map((s) => ({ s: s, n: matchCount(s, p) })).filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n || a.s.title.localeCompare(b.s.title, 'ko')).slice(0, 5);
    if (!r.length) return '<div class="state"><p>조건에 맞는 책방이 아직 없어요.<br>조건을 조금 줄여 보세요.</p></div>';
    return '<h3 class="section">조건에 맞는 책방</h3>' +
      r.map((x) => cardHTML(x.s, 'openDetail', '<small>취향 일치 항목: ' + x.n + '개</small>')).join('');
  }
  function savePrefs() {
    const vals = (n) => $$('input[name="' + n + '"]:checked').map((i) => i.value);
    const p = { category: vals('pcategory'), mood: vals('pmood'), facility: vals('pfacility') };
    if (!p.category.length && !p.mood.length && !p.facility.length) { toast('하나 이상 선택해 주세요.'); return; }
    db.set(KEY.prefs, p);
    $('#tasteResult').innerHTML = tasteResultHTML(p);
    toast('취향을 저장했어요.');
  }

  /* ---------- 더보기 메뉴 ---------- */
  function menuHTML() {
    const rec = recent().slice(0, 3).map(getStore).filter(Boolean);
    const main = [['home','홈'], ['list','책방 탐색'], ['course','코스'], ['my','나의 책방'], ['taste','나의 취향']];
    return '<div class="menu-sec"><h4>전체 메뉴</h4><div class="all-menu-grid">' +
      main.map(([key,label]) => '<button type="button" data-nav="' + key + '">' + label + '</button>').join('') +
      '</div></div>' +
      '<div class="menu-sec"><h4>나의 활동</h4><div class="all-menu-links">' +
      '<button type="button" data-action="menuMyTab" data-tab="fav">즐겨찾기한 책방</button>' +
      '<button type="button" data-action="menuMyTab" data-tab="visits">나의 방문 기록</button>' +
      '<button type="button" data-action="menuMyTab" data-tab="courses">저장 코스</button>' +
      '<button type="button" data-action="menuMyTab" data-tab="reviews">나의 후기</button>' +
      '</div></div>' +
      '<div class="menu-sec"><h4>책방 둘러보기</h4><div class="all-menu-links">' +
      '<button type="button" data-action="randomStore">오늘의 책방 뽑기</button>' +
      '</div></div>' +
      (rec.length ? '<div class="menu-sec"><h4>최근 본 책방</h4>' +
      rec.map((r) => '<button type="button" class="recent-item" data-action="openDetail" data-id="' + r.id + '"><span>' + esc(r.title) + '</span><small>' + esc(r.district) + '</small></button>').join('') + '</div>' : '') +
      '<div class="menu-sec"><details class="help"><summary>이용 안내</summary><ul>' +
      '<li>책방 카드의 ☆를 누르면 즐겨찾기에 저장돼요.</li>' +
      '<li>코스를 만들고 저장하거나 방문 기록을 남길 수 있어요.</li>' +
      '</ul></details></div>' +
      (signedIn() ? '<div class="menu-sec"><button type="button" class="btn light" data-action="signOut">로그아웃</button></div>' : '');
  }
  function refreshMenu() { $('#sheetBody').innerHTML = menuHTML(); }

  /* ---------- 백업 / 복원 ---------- */
  function exportData() {
    const out = { app: 'bookbangteum', version: 1, exportedAt: new Date().toISOString(), data: {} };
    ['fav', 'visits', 'courses', 'prefs', 'reviews', 'recent', 'likes'].forEach((k) => { out.data[KEY[k]] = db.get(KEY[k], null); });
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url; a.download = 'bookbangteum-backup-' + todayStr().replace(/\./g, '') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('백업 파일을 저장했어요.');
  }
  function sanitizeImport(d) {
    const arr = (v) => (Array.isArray(v) ? v : []);
    const str = (v) => (typeof v === 'string' ? v : '');
    const strs = (v) => arr(v).filter((x) => typeof x === 'string');
    const out = {};
    out[KEY.fav] = strs(d[KEY.fav]);
    out[KEY.recent] = strs(d[KEY.recent]).slice(0, 5);
    out[KEY.likes] = strs(d[KEY.likes]);
    out[KEY.visits] = arr(d[KEY.visits]).filter((x) => x && typeof x.id === 'string' && typeof x.bookstoreId === 'string')
      .map((x) => ({ id: x.id, bookstoreId: x.bookstoreId, date: str(x.date), memo: str(x.memo).slice(0, 200) }));
    out[KEY.reviews] = arr(d[KEY.reviews]).filter((x) => x && typeof x.bookstoreId === 'string' && Array.isArray(x.tags))
      .map((x) => ({ reviewId: str(x.reviewId) || 'r' + Date.now(), bookstoreId: x.bookstoreId, tags: strs(x.tags), comment: str(x.comment).slice(0, 80), date: str(x.date) }));
    out[KEY.courses] = arr(d[KEY.courses]).filter((x) => x && typeof x.id === 'string' && typeof x.bookstoreId === 'string' && Array.isArray(x.order))
      .map((x) => ({
        id: x.id, title: str(x.title), bookstoreId: x.bookstoreId, includeWalk: !!x.includeWalk,
        walkMinutes: Number(x.walkMinutes) || 20, readingMinutes: Number(x.readingMinutes) || 60,
        order: x.order.filter((o) => typeof o === 'string' && /^[SP]:/.test(o)), createdAt: str(x.createdAt),
        visibility: x.visibility === 'public' && !x.srcId ? 'public' : 'private',
        srcId: str(x.srcId) || undefined, from: str(x.from) || undefined
      }));
    const p = d[KEY.prefs] || {};
    out[KEY.prefs] = { category: strs(p.category), mood: strs(p.mood), facility: strs(p.facility) };
    return out;
  }
  function importFile(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast('파일이 너무 커요.'); return; }
    const r = new FileReader();
    r.onload = () => {
      let j;
      try { j = JSON.parse(r.result); } catch (e) { toast('백업 파일을 읽을 수 없어요.'); return; }
      if (!j || j.app !== 'bookbangteum' || !j.data || typeof j.data !== 'object') { toast('책방틈 백업 파일이 아니에요.'); return; }
      const c = sanitizeImport(j.data);
      confirmSheet('백업 가져오기',
        '현재 저장된 기록을 백업 파일의 내용으로 바꿀까요?<br><span class="muted">즐겨찾기 ' + c[KEY.fav].length + '곳 · 방문 기록 ' + c[KEY.visits].length + '건 · 저장 코스 ' + c[KEY.courses].length + '개</span>',
        '가져오기', () => {
          Object.keys(c).forEach((k) => db.set(k, c[k]));
          state.course = blankCourse(null);
          toast('백업을 가져왔어요.');
          renderScreen(current);
        });
    };
    r.readAsText(file);
  }

  /* ---------- 액션 ---------- */
  const actions = {
    back: back,
    retry: load,
    closeSheet: closeSheet,
    goHome() { closeSheet(); go('home', {reset:true}); },
    openMenu() { openSheet('전체 메뉴', menuHTML()); },
    menuMyTab(el) { state.tab = el.dataset.tab; closeSheet(); navTo('my'); },
    openAuth() { closeSheet(); go('auth'); },
    signOut() { sessionStorage.removeItem(AUTH_SESSION); closeSheet(); go('home', {reset:true}); toast('로그아웃했어요.'); },
    confirmOk() { const f = pendingConfirm; closeSheet(); if (f) f(); },
    goMyVisits() { state.tab = 'visits'; go('my'); },
    setFs(el) { db.set(KEY.settings, Object.assign(settings(), { fs: el.dataset.v })); applySettings(); refreshMenu(); },
    setTheme(el) { db.set(KEY.settings, Object.assign(settings(), { theme: el.dataset.v })); applySettings(); refreshMenu(); },
    randomStore() {
      if (state.status !== 'ready') { toast('책방 정보를 불러오는 중이에요.'); return; }
      const seen = recent();
      let pool = state.stores.filter((s) => !seen.includes(s.id));
      if (!pool.length) pool = state.stores;
      const s = pool[Math.floor(Math.random() * pool.length)];
      closeSheet(); showDetail(s.id); toast('오늘의 책방: ' + s.title);
    },
    clearRecent() { db.set(KEY.recent, []); if ($('#sheetWrap').hidden) renderHome(); else refreshMenu(); toast('최근 본 책방을 지웠어요.'); },
    exportData: exportData,
    pickImport() { $('#importFile').click(); },
    wipe() {
      confirmSheet('저장 데이터 지우기', '즐겨찾기·방문 기록·저장 코스·후기·취향을 모두 지울까요?<br><span class="muted">지운 데이터는 되돌릴 수 없어요. 필요하면 먼저 백업해 두세요.</span>', '모두 지우기', () => {
        [KEY.fav, KEY.visits, KEY.courses, KEY.prefs, KEY.reviews, KEY.recent, KEY.likes].forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
        state.course = blankCourse(null);
        toast('저장 데이터를 지웠어요.'); navTo('home');
      });
    },
    quickTopic(el) {
      state.query = ''; state.visible = PAGE;
      state.applied = [{ key: el.dataset.key, value: el.dataset.value }];
      go('list');
    },
    openFilter(el) { openFilter(el.dataset.key); },
    applyFilter(el) {
      const key = el.dataset.key;
      state.applied = state.applied.filter((a) => a.key !== key)
        .concat($$('input[name="fopt"]:checked').map((i) => ({ key: key, value: i.value })));
      state.visible = PAGE; closeSheet(); renderList();
    },
    clearGroup(el) {
      state.applied = state.applied.filter((a) => a.key !== el.dataset.key);
      state.visible = PAGE; closeSheet(); renderList();
    },
    removeFilter(el) { state.applied.splice(Number(el.dataset.i), 1); state.visible = PAGE; renderList(); },
    removeLast() { state.applied.pop(); renderList(); },
    clearQuery() { state.query = ''; renderList(); },
    resetAll() { state.applied = []; state.query = ''; state.visible = PAGE; renderList(); },
    loadMore() { state.visible += PAGE; renderList(); },
    openDetail(el) { closeSheet(); showDetail(el.dataset.id); },
    openReviews() { go('reviews'); },
    toggleFav(el) { toggleFav(el.dataset.id); },
    cardFav(el) { toggleFav(el.dataset.id); },
    undoFav(el) { setFav(el.dataset.id, true); refreshFav(el.dataset.id); toast('즐겨찾기를 되돌렸어요.'); },
    copyAddr(el) { const s = getStore(el.dataset.id); if (s) copyText(s.address); },
    startCourse(el) { startCourse(el.dataset.id); },
    goMyFav() { state.tab = 'fav'; go('my'); },
    goCourseSaved() { state.ctab = 'saved'; go('course', { reset: true }); },
    courseTab(el) { state.ctab = el.dataset.tab; renderCourseHub(); },
    popSort(el) { state.psort = el.dataset.v; renderCourseHub(); },
    likeCourse(el) {
      const id = el.dataset.id, l = db.get(KEY.likes, []);
      db.set(KEY.likes, l.includes(id) ? l.filter((x) => x !== id) : l.concat(id));
      renderCourseHub();
    },
    takeCourse(el) {
      const x = state.shared.find((c) => c.id === el.dataset.id);
      if (!x) return;
      const all = db.get(KEY.courses, []);
      if (all.some((c) => c.srcId === x.id)) { toast('이미 내 코스에 담았어요.'); return; }
      all.push({
        id: 'c' + Date.now(), title: x.title, bookstoreId: x.bookstoreId, includeWalk: x.includeWalk, walkMinutes: x.walkMinutes,
        readingMinutes: x.readingMinutes, order: x.order.slice(), createdAt: todayStr(), visibility: 'private', srcId: x.id, from: x.author
      });
      db.set(KEY.courses, all);
      renderCourseHub();
      toast('내 코스에 담았어요.', { label: '저장한 코스 보기', action: 'goCourseSaved' });
    },
    toggleVis(el) {
      const all = db.get(KEY.courses, []);
      const x = all.find((c) => c.id === el.dataset.id);
      if (!x || x.srcId) return;
      x.visibility = x.visibility === 'public' ? 'private' : 'public';
      db.set(KEY.courses, all);
      renderScreen(current);
      toast(x.visibility === 'public' ? '공개 코스로 바꿨어요. 인기 코스에 표시돼요.' : '비공개로 바꿨어요.');
    },
    setVis(el) { state.course.visibility = el.dataset.v; renderScreen(current); },
    myTab(el) { state.tab = el.dataset.tab; renderMy(); },
    unfav(el) {
      const id = el.dataset.id;
      if (!id) return;
      setFav(id, false); renderMy();
      toast('즐겨찾기에서 해제했어요.', { label: '실행 취소', action: 'undoFav', id: id });
    },
    addVisit(el) { if (el.dataset.id) addVisitFor(el.dataset.id); },
    saveMemo(el) {
      const memo = el.closest('.card').querySelector('.memo').value.trim();
      const v = db.get(KEY.visits, []);
      const r = v.find((x) => x.id === el.dataset.id);
      if (r) { r.memo = memo; db.set(KEY.visits, v); toast('메모를 저장했어요.'); }
    },
    delVisit(el) {
      const id = el.dataset.id;
      confirmSheet('방문 기록 삭제', '이 방문 기록과 메모를 삭제할까요?', '삭제', () => {
        db.set(KEY.visits, db.get(KEY.visits, []).filter((x) => x.id !== id));
        renderMy(); toast('방문 기록을 삭제했어요.');
      });
    },
    openCourse(el) {
      /* 내 저장 코스 → 없으면 다른 사용자가 공유한 코스(사본으로 열림) */
      const own = db.get(KEY.courses, []).find((c) => c.id === el.dataset.id);
      const x = own || state.shared.find((c) => c.id === el.dataset.id);
      if (!x) return;
      state.course = {
        id: own ? x.id : null, storeId: x.bookstoreId, includeWalk: x.includeWalk, walkMinutes: x.walkMinutes,
        readingMinutes: x.readingMinutes, order: x.order.slice(),
        visibility: own && x.visibility === 'public' ? 'public' : 'private',
        srcId: own ? x.srcId : x.id, from: own ? x.from : x.author
      };
      go(el.dataset.mode === 'edit' ? 'edit' : 'map');
    },
    delCourse(el) {
      const id = el.dataset.id;
      confirmSheet('코스 삭제', '이 저장 코스를 삭제할까요?', '삭제', () => {
        db.set(KEY.courses, db.get(KEY.courses, []).filter((x) => x.id !== id));
        renderScreen(current); toast('코스를 삭제했어요.');
      });
    },
    pickStore: pickStoreSheet,
    chooseStore(el) { state.course = blankCourse(el.dataset.id); closeSheet(); renderSetup(); },
    setWalkOn(el) { state.course.includeWalk = el.dataset.v === 'true'; renderSetup(); },
    setWalkMin(el) { state.course.walkMinutes = Number(el.dataset.v); renderSetup(); },
    setReadMin(el) { state.course.readingMinutes = Number(el.dataset.v); renderSetup(); },
    makeCourse() { state.course.order = []; go('map'); },
    editCourse() { go('edit'); },
    moveItem(el) {
      const i = Number(el.dataset.i), d = Number(el.dataset.d), o = state.course.order;
      const j = i + d;
      if (j < 0 || j >= o.length) return;
      const t = o[i]; o[i] = o[j]; o[j] = t; renderEdit();
    },
    removeItem(el) {
      const o = state.course.order, i = Number(el.dataset.i);
      if (o[i] && o[i][0] === 'S') return;
      o.splice(i, 1); renderEdit();
    },
    addPlace: addPlaceSheet,
    chooseAddPlace(el) { state.course.order.push('P:' + el.dataset.id); closeSheet(); renderEdit(); },
    saveCourse: saveCourse,
    savePrefs: savePrefs
  };

  /* ---------- 이벤트 연결 ---------- */
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { closeSheet(); navTo(nav.dataset.nav); return; }
    const g = e.target.closest('[data-go]');
    if (g) { g.dataset.go === 'course' ? navTo('course') : (g.dataset.go === 'list' ? navTo('list') : go(g.dataset.go)); return; }
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.closest('#toast')) $('#toast').classList.remove('show');
    const fn = actions[el.dataset.action];
    if (fn) fn(el, e);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#sheetWrap').hidden) closeSheet();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.book[role="button"]')) { e.preventDefault(); e.target.click(); }
  });
  $('#homeSearch').addEventListener('submit', (e) => {
    e.preventDefault();
    state.query = $('#homeQuery').value; state.applied = []; state.visible = PAGE;
    go('list');
  });
  $('#listQuery').addEventListener('input', (e) => { state.query = e.target.value; state.visible = PAGE; renderList(); });
  $('#sortSelect').addEventListener('change', (e) => { state.sort = e.target.value; renderList(); });
  $('#importFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; importFile(f); });
  /* 방문 메모는 입력 후 바깥을 누르면 자동 저장 */
  document.addEventListener('change', (e) => {
    if (!e.target.matches('.memo')) return;
    const card = e.target.closest('.card');
    const v = db.get(KEY.visits, []);
    const r = v.find((x) => x.id === card.dataset.id);
    if (r && r.memo !== e.target.value.trim()) { r.memo = e.target.value.trim(); db.set(KEY.visits, v); toast('메모를 저장했어요.'); }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'reviewComment') $('#rcount').textContent = e.target.value.length + '/80';
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'authForm') {
      e.preventDefault();
      const form = e.target;
      const nickname = form.nickname.value.trim();
      const pin = form.pin.value;
      const mode = e.submitter && e.submitter.value === 'signup' ? 'signup' : 'login';
      if (!nickname || !/^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{5}$/.test(pin)) { toast('인증번호는 영문·숫자 혼합 5자리로 입력해 주세요.'); return; }
      const accounts = db.get('bookbangteum.demoAccounts', {});
      if (mode === 'signup') {
        if (accounts[nickname]) { toast('이미 사용 중인 닉네임이에요.'); return; }
        accounts[nickname] = pin;
        db.set('bookbangteum.demoAccounts', accounts);
      } else if (accounts[nickname] !== pin) { toast('닉네임 또는 인증번호를 확인해 주세요.'); return; }
      sessionStorage.setItem(AUTH_SESSION, nickname);
      go('my', {reset:true});
      toast(mode === 'signup' ? '회원가입했어요.' : '로그인했어요.');
      return;
    }
    if (e.target.id === 'reviewForm') { e.preventDefault(); submitReview(); }
  });

  /* ---------- 시작 ---------- */
  applySettings();
  go('home', { reset: true });
  load();
})();

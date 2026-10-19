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
    reviews: 'bookstore.userReviews'
  };
  const db = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('저장 공간을 사용할 수 없어요.'); } }
  };

  const TITLES = {
    home: '책방틈', list: '책방 탐색', detail: '책방 상세', reviews: '방문자 후기',
    my: '나의 책방', 'course-setup': '코스 만들기', map: '지도·코스 결과', edit: '코스 편집',
    taste: '나의 취향', 'done-fav': '저장 완료', 'done-course': '저장 완료'
  };
  const NAV_OF = {
    home: 'home', taste: 'home', list: 'list', detail: 'list', reviews: 'list', 'done-fav': 'list',
    'course-setup': 'course', map: 'course', edit: 'course', 'done-course': 'course', my: 'my'
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
    stores: [], places: [],
    query: '', applied: [], sort: 'name', visible: PAGE,
    currentId: null, tab: 'fav', selectedFavId: null,
    course: blankCourse(null),
    lastDoneFavId: null
  };
  let current = null;
  let hist = [];

  function blankCourse(storeId) {
    return { id: null, storeId, includeWalk: true, walkMinutes: 20, readingMinutes: 60, order: [] };
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
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
  }
  function openSheet(title, html) {
    $('#sheetTitle').textContent = title;
    $('#sheetBody').innerHTML = html;
    $('#sheetWrap').hidden = false;
  }
  function closeSheet() { $('#sheetWrap').hidden = true; }

  /* ---------- 데이터 로드 ---------- */
  function load() {
    state.status = 'loading';
    renderList();
    Promise.all([
      fetch('data/bookstores.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch('data/places.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    ]).then(([stores, places]) => {
      state.stores = stores;
      state.places = places;
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
    if (opts.reset) hist = [];
    else if (opts.push !== false && current && current !== name) hist.push(current);
    current = name;
    $$('.screen').forEach((el) => { el.hidden = el.dataset.screen !== name; });
    $('#pageTitle').textContent = TITLES[name] || '책방틈';
    $('#backBtn').classList.toggle('invisible', ['home', 'my', 'taste'].includes(name) && !hist.length);
    $$('.bottom button').forEach((b) => b.classList.toggle('on', b.dataset.nav === NAV_OF[name]));
    renderScreen(name);
    $('#screens').scrollTop = 0;
  }
  function back() {
    const prev = hist.pop() || 'home';
    go(prev, { push: false });
  }
  function renderScreen(name) {
    ({
      home: () => {}, list: renderList, detail: renderDetail, reviews: renderReviews, my: renderMy,
      'course-setup': renderSetup, map: renderMap, edit: renderEdit, taste: renderTaste,
      'done-fav': renderDoneFav, 'done-course': renderDoneCourse
    }[name] || (() => {}))();
  }
  function navTo(name) {
    if (name === 'course') {
      if (!state.course.storeId) {
        const f = favorites();
        if (f.length) state.course = blankCourse(f[0]);
      }
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
  function cardHTML(s, action, extra, cls) {
    const tags = uniq([].concat(s.categories.slice(0, 1), s.reviewTags.slice(0, 1), s.facilities.slice(0, 1)));
    const hours = s.openingHours ? '영업 ' + s.openingHours.split(' ')[0] : '영업시간 정보 확인';
    return '<div class="book ' + (cls || '') + '" role="button" tabindex="0" data-action="' + action + '" data-id="' + s.id + '">' +
      '<div class="thumb" aria-hidden="true">' + esc(s.title[0]) + '</div>' +
      '<div class="bookbody"><b>' + esc(s.title) + '</b><small>' + esc(s.district) + ' · ' + esc(hours) + '</small>' +
      '<div class="chips mini">' + tags.map((t) => '<span class="chip">' + esc(t) + '</span>').join('') + '</div>' +
      (extra || '') + '<span class="textlink">상세보기 〉</span></div></div>';
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
    if (state.query.trim()) chips.push('<span class="chip">“' + esc(state.query.trim()) + '” <button type="button" class="x" data-action="clearQuery" aria-label="검색어 지우기" style="border:0;background:none">×</button></span>');
    state.applied.forEach((a, i) => chips.push('<span class="chip">' + esc(a.value) + ' <button type="button" data-action="removeFilter" data-i="' + i + '" aria-label="' + esc(a.value) + ' 해제" style="border:0;background:none">×</button></span>'));
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
      '<button type="button" class="btn" data-action="applyFilter" data-key="' + key + '">적용</button>' +
      '<button type="button" class="btn light" data-action="clearGroup" data-key="' + key + '">이 항목 해제</button>');
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
    box.innerHTML =
      '<div class="hero">[ 책방 이미지 자리 ]</div>' +
      '<div class="title-row"><h2>' + esc(s.title) + '</h2><span class="fav-state">' + (fav ? '★ 저장됨' : '☆ 저장 전') + '</span></div>' +
      '<div class="chips mini">' + chipTags.map((t) => '<span class="chip">' + esc(t) + '</span>').join('') + '</div>' +
      '<div class="fact"><span>주소</span><span>' + esc(s.address) + '</span></div>' +
      '<div class="fact"><span>운영</span><span>' + esc(s.openingHours || '정보 확인') + '</span></div>' +
      '<div class="fact"><span>시설</span><span>좌석 ' + (s.facilities.includes('좌석') ? '있음' : '정보 확인') + ' / 음료 ' + (s.facilities.includes('음료') ? '있음' : '정보 확인') + '</span></div>' +
      '<h3 class="section">큐레이션 · 공간 소개</h3><p class="para">' + esc(s.description) + '</p>' +
      '<div class="section"><button type="button" class="linkrow" data-action="openReviews"><span>방문자 후기·키워드</span><span>〉</span></button></div>' +
      '<p class="para">후기 ' + tc.total + '건' + (topTags ? ' · ' + esc(topTags) : '') + '</p>' +
      '<div class="sticky"><button type="button" class="btn" data-action="toggleFav" data-id="' + s.id + '">' + (fav ? '★ 즐겨찾기 해제' : '☆ 즐겨찾기 저장') + '</button>' +
      '<button type="button" class="btn light" data-action="startCourse" data-id="' + s.id + '">이 책방으로 코스 만들기</button></div>';
    $('[data-screen="detail"]').classList.add('has-sticky');
  }
  function toggleFav(id) {
    let f = db.get(KEY.fav, []);
    if (f.includes(id)) {
      f = f.filter((x) => x !== id);
      db.set(KEY.fav, f);
      toast('즐겨찾기에서 해제했어요.');
      renderScreen(current);
    } else {
      f.push(id);
      db.set(KEY.fav, f);
      state.lastDoneFavId = id;
      go('done-fav');
    }
  }
  function renderDoneFav() {
    const s = getStore(state.lastDoneFavId) || {};
    $('#doneFavBody').innerHTML =
      '<div class="state"><div class="icon">✓</div><h3>즐겨찾기에 저장했어요</h3><p>' + esc(s.title || '') + '<br>나의 책방에서 다시 확인할 수 있어요.</p></div>' +
      '<button type="button" class="btn" data-action="goMyFav">나의 책방에서 확인</button>' +
      '<button type="button" class="btn light" data-action="startCourse" data-id="' + esc(s.id || '') + '">이 책방으로 코스 만들기</button>' +
      '<p class="para muted">저장 후에도 책방 상세와 검색 조건은 유지됩니다.</p>';
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
      '<textarea class="inputarea" id="reviewComment" maxlength="80" placeholder="한 줄 후기를 입력하세요 (선택)" aria-label="한 줄 후기"></textarea>' +
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
    $$('.tabs button').forEach((b) => {
      const on = b.dataset.tab === state.tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on);
    });
    const box = $('#myBody');
    if (!needReady(box)) return;
    if (state.tab === 'fav') box.innerHTML = myFavHTML();
    else if (state.tab === 'visits') box.innerHTML = myVisitsHTML();
    else box.innerHTML = myCoursesHTML();
  }
  function myFavHTML() {
    const f = favorites().map(getStore);
    if (!f.length) return '<div class="state"><div class="icon">☆</div><h3>즐겨찾기한 책방이 없어요</h3><p>마음에 드는 책방을 저장해 보세요.</p></div><button type="button" class="btn" data-nav="list">책방 탐색하기</button>';
    if (!f.some((s) => s.id === state.selectedFavId)) state.selectedFavId = null;
    const sel = getStore(state.selectedFavId);
    return '<h3 class="section first">즐겨찾기한 책방 ' + f.length + '곳</h3>' +
      f.map((s) => cardHTML(s, 'selectFav', '', s.id === state.selectedFavId ? 'sel' : '')).join('') +
      '<div class="section">선택한 책방</div>' +
      (sel ? '<p class="para"><b>' + esc(sel.title) + '</b></p>' : '<p class="para muted">목록에서 책방을 눌러 선택하세요. 카드의 “상세보기”로 상세 화면으로 이동할 수 있어요.</p>') +
      '<button type="button" class="btn" data-action="startCourse" data-id="' + esc(state.selectedFavId || '') + '"' + (sel ? '' : ' disabled') + '>이 책방으로 코스 만들기</button>' +
      '<button type="button" class="btn light" data-action="addVisit"' + (sel ? '' : ' disabled') + '>방문 기록 추가</button>' +
      '<button type="button" class="btn light" data-action="unfav"' + (sel ? '' : ' disabled') + '>즐겨찾기 해제</button>';
  }
  function myVisitsHTML() {
    const v = db.get(KEY.visits, []).filter((r) => getStore(r.bookstoreId));
    if (!v.length) return '<div class="state"><div class="icon">✎</div><h3>방문 기록이 없어요</h3><p>즐겨찾기 탭에서 책방을 선택한 뒤<br>“방문 기록 추가”를 눌러 보세요.</p></div>';
    return v.slice().reverse().map((r) => {
      const s = getStore(r.bookstoreId);
      return '<div class="card" data-id="' + r.id + '"><b>' + esc(s.title) + '</b> <small class="muted">' + esc(r.date) + ' 방문</small>' +
        '<textarea class="memo" maxlength="200" placeholder="메모를 남겨 보세요" aria-label="방문 메모">' + esc(r.memo) + '</textarea>' +
        '<div class="card-acts"><button type="button" class="btn sm" data-action="saveMemo" data-id="' + r.id + '">메모 저장</button>' +
        '<button type="button" class="btn light sm" data-action="delVisit" data-id="' + r.id + '">삭제</button></div></div>';
    }).join('');
  }
  function myCoursesHTML() {
    const c = db.get(KEY.courses, []);
    if (!c.length) return '<div class="state"><div class="icon">⌖</div><h3>저장한 코스가 없어요</h3><p>책방에서 코스를 만들어 저장해 보세요.</p></div><button type="button" class="btn" data-nav="course">코스 만들기</button>';
    return c.slice().reverse().map((x) =>
      '<div class="card"><b>' + esc(x.title) + '</b><p class="para">장소 ' + x.order.length + '곳 · 독서 ' + x.readingMinutes + '분' + (x.includeWalk ? ' · 산책 ' + x.walkMinutes + '분' : '') + '<br><span class="muted">' + esc(x.createdAt) + ' 저장</span></p>' +
      '<div class="card-acts"><button type="button" class="btn sm" data-action="openCourse" data-id="' + x.id + '" data-mode="map">확인</button>' +
      '<button type="button" class="btn light sm" data-action="openCourse" data-id="' + x.id + '" data-mode="edit">편집</button>' +
      '<button type="button" class="btn light sm" data-action="delCourse" data-id="' + x.id + '">삭제</button></div></div>').join('');
  }

  /* ---------- 코스 ---------- */
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
      '<h3 class="section">선택 조건 요약</h3>' +
      '<p class="para">' + (s ? '책방 1곳' : '책방 미선택') + (c.includeWalk ? ' · 산책 ' + c.walkMinutes + '분' : ' · 산책 없음') + ' · 독서 ' + fmtMin(c.readingMinutes) + '</p>' +
      '<div class="sticky"><button type="button" class="btn" data-action="makeCourse"' + (s ? '' : ' disabled') + '>지도에서 코스 확인하기</button></div>';
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
    const line = pts.length > 1 ? '<polyline points="' + pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ') + '" fill="none" stroke="#444" stroke-width="2.5" stroke-dasharray="6 5" stroke-linecap="round"/>' : '';
    const dots = pts.map((p, i) => '<g><circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="13" fill="' + (items[i].isStore ? '#2d2d2d' : '#fff') + '" stroke="#2d2d2d" stroke-width="2"/><text x="' + p[0].toFixed(1) + '" y="' + (p[1] + 4.5).toFixed(1) + '" text-anchor="middle" font-size="13" font-weight="700" fill="' + (items[i].isStore ? '#fff' : '#2d2d2d') + '">' + (i + 1) + '</text></g>').join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="코스 위치 약도">' + line + dots + '</svg>';
  }
  function renderMap() {
    const box = $('#mapBody');
    if (!needReady(box)) return;
    const c = state.course;
    if (!getStore(c.storeId)) { box.innerHTML = '<div class="state"><p>코스를 만들 책방을 먼저 선택해 주세요.</p><button type="button" class="btn" data-nav="course">코스 만들기</button></div>'; return; }
    if (!c.order.length) buildOrder();
    const st = courseStats();
    box.innerHTML =
      '<div class="map">' + mapSVG(st.items) + '<div class="legend">지도 API 연동 전 약도예요. 마커는 위치 관계만 보여줘요.</div></div>' +
      '<h3 class="section">코스 요약</h3>' +
      st.items.map((it, i) => '<div class="route"><span class="name">' + (i + 1) + '. ' + esc(it.name) + '</span><small>' + itemLabel(it, st) + '</small></div>').join('') +
      '<p class="para">예상 도보 시간: ' + (st.moveMin ? '약 ' + st.moveMin + '분 (직선거리 기준 추정)' : '표시할 값이 없어요') + '<br>총 소요시간: ' +
      (c.readingMinutes + st.walkTotal + (st.moveMin || 0)) + '분 (체류 ' + (c.readingMinutes + st.walkTotal) + '분' + (st.moveMin ? ' + 이동 약 ' + st.moveMin + '분' : '') + ')</p>' +
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
      readingMinutes: c.readingMinutes, order: c.order.slice(), createdAt: todayStr()
    };
    const i = all.findIndex((x) => x.id === rec.id);
    if (i >= 0) all[i] = rec; else all.push(rec);
    db.set(KEY.courses, all);
    c.id = rec.id;
    state.lastCourseTitle = rec.title;
    go('done-course');
  }
  function renderDoneCourse() {
    $('#doneCourseBody').innerHTML =
      '<div class="state"><div class="icon">✓</div><h3>나만의 코스를 저장했어요</h3><p>' + esc(state.lastCourseTitle || '') + '<br>저장한 코스에서 다시 열 수 있어요.</p></div>' +
      '<button type="button" class="btn" data-action="goMyCourses">저장 코스 확인하기</button>' +
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

  /* ---------- 액션 ---------- */
  const actions = {
    back: back,
    retry: load,
    closeSheet: closeSheet,
    openMenu() {
      openSheet('메뉴',
        '<button type="button" class="opt-btn" data-nav="home"><span>홈</span></button>' +
        '<button type="button" class="opt-btn" data-nav="taste"><span>나의 취향</span></button>' +
        '<button type="button" class="opt-btn" data-action="wipe"><span>저장 데이터 모두 지우기</span></button>');
    },
    wipe() {
      if (!confirm('즐겨찾기·방문 기록·저장 코스·후기·취향을 모두 지울까요?')) return;
      Object.values(KEY).forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
      state.selectedFavId = null; state.course = blankCourse(null);
      closeSheet(); toast('저장 데이터를 지웠어요.'); navTo('home');
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
    openDetail(el) { state.currentId = el.dataset.id; go('detail'); },
    openReviews() { go('reviews'); },
    toggleFav(el) { toggleFav(el.dataset.id); },
    startCourse(el) { startCourse(el.dataset.id); },
    goMyFav() { state.tab = 'fav'; go('my', { reset: true }); },
    goMyCourses() { state.tab = 'courses'; go('my', { reset: true }); },
    myTab(el) { state.tab = el.dataset.tab; renderMy(); },
    selectFav(el, e) {
      if (e.target.closest('.textlink')) { state.currentId = el.dataset.id; go('detail'); return; }
      state.selectedFavId = el.dataset.id === state.selectedFavId ? null : el.dataset.id;
      renderMy();
    },
    unfav() {
      const id = state.selectedFavId;
      if (!id) return;
      db.set(KEY.fav, db.get(KEY.fav, []).filter((x) => x !== id));
      state.selectedFavId = null; toast('즐겨찾기에서 해제했어요.'); renderMy();
    },
    addVisit() {
      const id = state.selectedFavId;
      if (!id) return;
      const v = db.get(KEY.visits, []);
      v.push({ id: 'v' + Date.now(), bookstoreId: id, date: todayStr(), memo: '' });
      db.set(KEY.visits, v);
      state.tab = 'visits'; toast('방문 기록을 추가했어요.'); renderMy();
    },
    saveMemo(el) {
      const memo = el.closest('.card').querySelector('.memo').value.trim();
      const v = db.get(KEY.visits, []);
      const r = v.find((x) => x.id === el.dataset.id);
      if (r) { r.memo = memo; db.set(KEY.visits, v); toast('메모를 저장했어요.'); }
    },
    delVisit(el) {
      if (!confirm('이 방문 기록을 삭제할까요?')) return;
      db.set(KEY.visits, db.get(KEY.visits, []).filter((x) => x.id !== el.dataset.id));
      renderMy();
    },
    openCourse(el) {
      const x = db.get(KEY.courses, []).find((c) => c.id === el.dataset.id);
      if (!x) return;
      state.course = { id: x.id, storeId: x.bookstoreId, includeWalk: x.includeWalk, walkMinutes: x.walkMinutes, readingMinutes: x.readingMinutes, order: x.order.slice() };
      go(el.dataset.mode === 'edit' ? 'edit' : 'map');
    },
    delCourse(el) {
      if (!confirm('이 코스를 삭제할까요?')) return;
      db.set(KEY.courses, db.get(KEY.courses, []).filter((x) => x.id !== el.dataset.id));
      renderMy();
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
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'reviewForm') { e.preventDefault(); submitReview(); }
  });

  /* ---------- 시작 ---------- */
  go('home', { reset: true });
  load();
})();

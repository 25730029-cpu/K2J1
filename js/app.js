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

  /* ---------- 계정 (데모: 이 브라우저의 localStorage에만 저장돼요) ---------- */
  const AUTH_SESSION = 'bookbangteum.demoSession';
  const ACCOUNTS_KEY = 'bookbangteum.accounts';
  const ID_RE = /^[A-Za-z0-9]{4,20}$/;                // 아이디: 영문·숫자 4~20자
  const PW_RE = /^(?=.*[A-Za-z])(?=.*[0-9]).{8,32}$/;  // 비밀번호: 영문+숫자 포함 8~32자
  const NICK_MAX = 12;
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const accounts = () => { const a = db.get(ACCOUNTS_KEY, {}); return a && typeof a === 'object' && !Array.isArray(a) ? a : {}; };
  const getAccount = (id) => { const all = accounts(); return id && has(all, id) ? all[id] : null; };
  const signedIn = () => { const id = sessionStorage.getItem(AUTH_SESSION) || ''; return getAccount(id) ? id : ''; };
  const me = () => getAccount(signedIn());
  const requireMember = () => { if (me()) return true; toast('회원 전용 기능이에요. 로그인 후 이용해 주세요.'); go('auth'); return false; };
  const nickError = (n) => (n.length < 2 || n.length > NICK_MAX ? '닉네임은 2~' + NICK_MAX + '자로 입력해 주세요.' : '');
  const normPrefs = (p) => ({
    category: Array.isArray(p && p.category) ? p.category : [],
    mood: Array.isArray(p && p.mood) ? p.mood : [],
    facility: Array.isArray(p && p.facility) ? p.facility : []
  });
  /* 취향: 로그인했으면 내 계정에, 아니면 이 기기에 저장 */
  const getPrefs = () => { const a = me(); return normPrefs(a ? a.prefs : db.get(KEY.prefs, null)); };
  function setPrefs(p) {
    const id = signedIn();
    if (id) { const all = accounts(); all[id] = Object.assign({}, all[id], { prefs: p }); db.set(ACCOUNTS_KEY, all); }
    else db.set(KEY.prefs, p);
  }

  /* 헤더의 사람 아이콘: 로그인 전엔 로그인 화면, 로그인 후엔 계정 메뉴(내 정보 설정 · 로그아웃) */
  function syncAuthUI() {
    const b = $('#headerLogin');
    if (!b) return;
    const a = me();
    b.classList.toggle('is-in', !!a);
    if (a) {
      b.setAttribute('aria-label', a.nickname + '님 계정 메뉴'); b.title = a.nickname + '님';
      b.setAttribute('aria-haspopup', 'menu');
      b.setAttribute('aria-expanded', String(!$('#accountMenu').hidden));
    } else {
      b.setAttribute('aria-label', '로그인'); b.title = '로그인';
      b.removeAttribute('aria-haspopup'); b.removeAttribute('aria-expanded');
    }
  }
  function closeAccountMenu(focusIcon) {
    const m = $('#accountMenu'), b = $('#headerLogin');
    if (!m || m.hidden) return;
    m.hidden = true;
    if (b) {
      if (b.hasAttribute('aria-expanded')) b.setAttribute('aria-expanded', 'false');
      if (focusIcon) b.focus();
    }
  }
  function toggleAccountMenu() {
    const m = $('#accountMenu'), b = $('#headerLogin'), a = me();
    if (!a) return;
    if (!m.hidden) { closeAccountMenu(); return; }
    m.innerHTML = '<div class="account-name"><b>' + esc(a.nickname) + '</b>님<small>' + esc(signedIn()) + '</small></div>' +
      '<button type="button" role="menuitem" data-action="openProfile">내 정보 설정</button>' +
      '<button type="button" role="menuitem" data-action="signOut">로그아웃</button>';
    m.hidden = false;
    b.setAttribute('aria-expanded', 'true');
    const first = m.querySelector('button');
    if (first) first.focus();
  }

  const TITLES = {
    auth: '로그인 / 회원가입', home: '책방틈', list: '책방 탐색', detail: '책방 상세', reviews: '후기 작성',
    my: '나의 책방', course: '코스', 'course-setup': '코스 만들기', map: '지도·코스 결과', edit: '코스 편집',
    taste: '나의 취향', 'done-course': '저장 완료', signup: '프로필 설정', profile: '내 정보 설정'
  };
  const NAV_OF = {
    auth: 'home', home: 'home', taste: 'home', list: 'list', detail: 'list', reviews: 'list',
    course: 'course', 'course-setup': 'course', map: 'course', edit: 'course', 'done-course': 'course', my: 'my', signup: 'home', profile: 'home'
  };
  const MOOD_FILTERS = ['조용함', '아늑함', '활기참', '감성적', '깔끔함'];
  const FACILITY_FILTERS = ['좌석', '음료', '콘센트', '오래 머물기', '혼자 가기'];
  const BASIC_FACILITY_FILTERS = ['공간대여', '주차', '카페', '화장실 구분'];
  const REVIEW_TO_FACILITY = {
    '좌석 있음': '좌석', '음료 제공': '음료', '콘센트 있음': '콘센트',
    '오래 머물기 좋음': '오래 머물기', '혼자 가기 좋음': '혼자 가기',
    '좌석': '좌석', '음료': '음료', '콘센트': '콘센트',
    '오래 머물기': '오래 머물기', '혼자 가기': '혼자 가기'
  };
  const GROUPS = [
    { key: 'region', label: '지역', get: (s) => [s.district] },
    { key: 'category', label: '취급 분야', get: (s) => s.categories },
    { key: 'theme', label: '테마', get: (s) => s.themes },
    { key: 'mood', label: '분위기', get: (s) => reviewMoodValues(s.id) },
    /* 시설은 사용자에게 하나의 필터로 보여주되, 데이터 출처에 따라 내부적으로 각각 집계합니다. */
    { key: 'facility', label: '시설', get: (s) => facilityValues(s) }
  ];
  /* 후기 체크리스트: 눌러서 고르기만 하면 되고, 항목 이름이 그대로 키워드로 저장돼요.
     세 분류 모두 REVIEW_PICK_MIN~REVIEW_PICK_MAX개씩 골라야 후기를 등록할 수 있어요 */
  const REVIEW_PICK_MIN = 1, REVIEW_PICK_MAX = 3;
  const REVIEW_GROUPS = [
    { label: '분위기', options: ['조용함', '아늑함', '활기참', '감성적', '깔끔함'] },
    { label: '공간·시설', options: ['좌석 있음', '음료 제공', '콘센트 있음', '오래 머물기 좋음', '혼자 가기 좋음'] },
    { label: '책·큐레이션', options: ['큐레이션이 좋음', '책 종류가 다양함', '독립출판물이 많음', '사장님 추천이 좋음'] }
  ];
  const PAGE = 6;

  /* ---------- 상태 ---------- */
  const state = {
    status: 'loading', // loading | ready | error
    stores: [], places: [], shared: [], loadErrors: [],
    ctab: 'all', psort: '', cf: blankCF(), reviewStoreId: null, reviewCtx: null, dtab: 'info', // dtab: 책방 상세 탭 (info | comments)
    query: '', applied: [], sort: 'name', visible: PAGE,
    preset: null, presetPending: false, cfPreset: null, cfPending: false, signup: null,
    currentId: null, tab: 'fav',
    course: blankCourse(null)
  };
  let current = null;
  let hist = [];
  const scrollMem = {};

  /* 전체 코스 필터 조건 (비어 있으면 모든 코스 표시) */
  function blankCF() {
    return { q: '', regions: [], walk: 'any', walkMins: [], readMins: [] };
  }
  const COURSE_WALK_OPTS = [10, 20, 30];
  const COURSE_READ_OPTS = [30, 60, 120];
  function blankCourse(storeId) {
    return { id: null, title: '', storeId, includeWalk: true, walkMinutes: 20, readingMinutes: 60, order: [], visibility: 'private' };
  }
  const COURSE_TITLE_MAX = 40;
  /* 코스 이름을 비워 두면 '책방 이름 중심 산책 코스'처럼 자동으로 정해요 */
  function defaultCourseTitle(c) {
    const s = getStore(c.storeId);
    return (s ? s.title : '책방 이름') + ' 중심 ' + (c.includeWalk ? '산책 ' : '') + '코스';
  }
  /* 코스 종류: 새로 만드는 코스 / 내가 만든 저장 코스 / 다른 사람의 공유 코스(담았거나 둘러보는 중) */
  const courseKind = (c) => (c.srcId ? 'shared' : c.id ? 'own' : 'new');
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
  /* 다른 책방을 열 때마다 '책방 정보' 탭에서 시작 (후기 작성 후 뒤로 오면 보던 탭 그대로) */
  function showDetail(id) { state.currentId = id; state.dtab = 'info'; pushRecent(id); go('detail'); }

  /* ---------- 데이터 로드: 두 JSON을 독립적으로 읽어 부분 실패를 허용 ---------- */
  const nonempty = (v) => v !== null && v !== undefined && !(typeof v === 'string' && !v.trim());
  const display = (v, fallback = '정보 없음') => nonempty(v) ? String(v) : fallback;
  function normalizeStore(raw, source) {
    if (!raw || typeof raw !== 'object') return null;
    const s = { ...raw };
    s.id = display(s.id, '');
    s.title = display(s.title, '이름 정보 없음');
    s.address = nonempty(s.address) ? String(s.address) : null;
    s.district = nonempty(s.district) ? String(s.district) : null;
    s.description = nonempty(s.description) ? String(s.description) : null;
    s.openingHours = nonempty(s.openingHours) ? String(s.openingHours) : null;
    s.closedDays = nonempty(s.closedDays) ? String(s.closedDays) : null;
    s.phone = nonempty(s.phone) ? String(s.phone) : null;
    ['categories','themes','reviewTags','facilities','reviews'].forEach(k => { s[k] = Array.isArray(s[k]) ? s[k] : []; });
    const c = s.coordinates;
    s.coordinates = Array.isArray(c) && c.length === 2 && c.every(v => v !== null && v !== '' && Number.isFinite(Number(v))) ? c.map(Number) : null;
    s.sourceType = source;
    s.sourceVerified = source === 'JSON' ? true : s.sourceVerified === true;
    return s.id ? s : null;
  }
  async function fetchJson(path) {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(path + ': HTTP ' + response.status);
    const value = await response.json();
    if (!Array.isArray(value)) throw new Error(path + ': 배열 형식이 아닙니다');
    return value;
  }
  async function load() {
    state.status = 'loading';
    state.loadErrors = [];
    renderList();
    const files = ['data/bookstores-local.json', 'data/bookstores-api.json'];
    const results = await Promise.allSettled([
      fetchJson(files[0]), fetchJson(files[1]), fetchJson('data/places.json'), fetchJson('data/sharedCourses.json')
    ]);
    const merged = [], keys = new Set();
    results.slice(0, 2).forEach((r, i) => {
      if (r.status !== 'fulfilled') { state.loadErrors.push(i === 0 ? 'JSON' : 'API'); return; }
      const source = i === 0 ? 'JSON' : 'API';
      r.value.forEach(raw => {
        const s = normalizeStore(raw, source);
        if (!s) return;
        const key = [s.title.trim().toLowerCase(), (s.address || '').replace(/\s/g, '').toLowerCase()].join('|');
        if (keys.has(key)) return;
        keys.add(key);
        merged.push(s);
      });
    });
    state.stores = merged;
    state.places = results[2].status === 'fulfilled' ? results[2].value : [];
    state.shared = results[3].status === 'fulfilled' ? results[3].value : [];
    state.status = state.loadErrors.length === 2 ? 'error' : 'ready';
    if (state.presetPending) {
      state.presetPending = false;
      if (state.status === 'ready' && current === 'list' && me() && !state.applied.length && !state.query.trim()) applyPreset();
    }
    if (state.cfPending) {
      state.cfPending = false;
      if (state.status === 'ready' && current === 'course' && !courseFilterCount()) applyCoursePreset();
    }
    if (current) renderScreen(current);
  }
  function needReady(box) {
    if (state.status === 'ready') return true;
    box.innerHTML = state.status === 'loading'
      ? '<div class="state"><p>책방 정보를 불러오는 중이에요…</p></div>'
      : '<div class="state"><div class="icon">!</div><h3>책방 데이터를 불러오지 못했어요</h3><p>JSON과 API 저장본을 모두 읽을 수 없어요.<br>연결 상태를 확인하고 다시 시도해 주세요.</p><button type="button" class="btn" data-action="retry">다시 시도</button></div>';
    return false;
  }
  function sourceBadge(s) {
    const isApi = s.sourceType === 'API';
    const label = isApi ? 'A' : 'J';
    const tooltip = isApi ? (s.sourceVerified ? 'API 수집 데이터' : 'API 후보 데이터 · 재수집 필요') : '기존 JSON 데이터';
    return '<span class="source-badge ' + (isApi ? 'source-badge--api' : 'source-badge--json') + '" title="' + tooltip + '" aria-label="' + tooltip + '">' + label + '</span>';
  }
  function loadWarning() {
    if (!state.loadErrors.length) return '';
    return '<div class="data-warning" role="status">' + esc(state.loadErrors.join('·')) + ' 데이터 파일을 불러오지 못했어요. 이용 가능한 책방만 표시 중이에요. <button type="button" data-action="retry">다시 시도</button></div>';
  }

  /* 탐색/코스 메인 화면에서만 스크롤 위치에 따라 TOP 버튼 표시 */
  function updateScrollTopButton() {
    const btn = $('#scrollTopButton');
    const scroller = $('#screens');
    if (!btn || !scroller) return;
    btn.hidden = !(['list', 'course'].includes(current) && scroller.scrollTop > 240);
  }
  $('#screens').addEventListener('scroll', updateScrollTopButton, { passive: true });
  $('#scrollTopButton').addEventListener('click', () => {
    $('#screens').scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });

  /* ---------- 화면 전환 ---------- */
  function go(name, opts) {
    opts = opts || {};
    if (current) scrollMem[current] = $('#screens').scrollTop;
    if (opts.reset) hist = [];
    else if (opts.push !== false && current && current !== name) hist.push(current);
    current = name;
    $$('.screen').forEach((el) => { el.hidden = el.dataset.screen !== name; });
    $('#pageTitle').textContent = '책방틈'; /* 로고 옆 제목은 화면이 바뀌어도 '책방틈'으로 고정 */
    $$('.bottom button').forEach((b) => b.classList.toggle('on', b.dataset.nav === NAV_OF[name]));
    syncAuthUI();
    closeAccountMenu();
    // 실제 이전 화면이 있을 때만 뒤로 가기 노출 (상단 주요 메뉴는 제외) — 취향 화면은 홈에서 들어오므로 뒤로 갈 수 있어요
    const backButton = $('#headerBack');
    if (backButton) backButton.hidden = !(hist.length && (name === 'list' || !['home', 'course', 'my'].includes(name)));
    renderScreen(name);
    $('#screens').scrollTop = opts.restore ? (scrollMem[name] || 0) : 0;
    updateScrollTopButton();
  }
  function back() {
    const prev = hist.pop() || 'home';
    go(prev, { push: false, restore: true });
  }
  function renderScreen(name) {
    ({
      auth: () => {}, signup: renderSignup, profile: renderProfile, home: renderHome, list: renderList, detail: renderDetail, reviews: renderReviews, my: renderMy,
      course: renderCourseHub, 'course-setup': renderSetup, map: renderMap, edit: renderEdit, taste: renderTaste,
      'done-course': renderDoneCourse
    }[name] || (() => {}))();
  }
  function navTo(name) {
    if (name === 'course-new' && !requireMember()) return;
    if (name === 'home') homePicks = []; /* 홈을 열 때마다 '오늘은 이런 책방 어때요?'를 새로 뽑아요 */
    if (name === 'course') {
      state.ctab = 'all';
      state.cf = blankCF();
      state.psort = '';
      /* 코스 탭 진입 시 — 로그인했고 위치를 설정했다면 내 위치를 지역 조건으로 미리 채움 (책방 탐색과 같은 방식) */
      state.cfPreset = null; state.cfPending = false;
      if (me() && me().region) { if (state.status === 'ready') applyCoursePreset(); else state.cfPending = true; }
      go('course', { reset: true });
    } else if (name === 'course-new') {
      /* 새 코스는 항상 빈 상태에서 시작 (즐겨찾기 첫 책방이 있으면 미리 선택) — 이전 화면으로 돌아갈 수 있게 기록은 유지 */
      const f = favorites();
      state.course = blankCourse(f.length ? f[0] : null);
      go('course-setup');
    } else {
      if (name === 'list') {
        /* 책방 탐색 진입 시 조건 초기화 — 로그인했다면 내 위치·취향으로 미리 채움 */
        state.query = ''; state.visible = PAGE; state.preset = null; state.presetPending = false;
        if (!me()) state.applied = [];
        else if (state.status === 'ready') applyPreset();
        else { state.applied = []; state.presetPending = true; }
      }
      go(name, { reset: true });
    }
  }

  /* ---------- 목록 ---------- */
  function filterOptions(key) {
    if (key === 'mood') return MOOD_FILTERS.slice();
    if (key === 'facility') return BASIC_FACILITY_FILTERS.concat(FACILITY_FILTERS);
    const g = GROUPS.find((x) => x.key === key);
    return uniq(state.stores.flatMap((s) => g.get(s))).sort((a, b) => a.localeCompare(b, 'ko'));
  }
  /* 지역 필터(책방 탐색 · 코스 공통): 시·도(서울 · 경기 · 강원 · 제주 …)와 시·군·구를 함께 골라요.
     시·도를 고르면 그 안의 모든 지역이 해당돼요 */
  const provinceOf = (d) => String(d || '').split(' ')[0];
  const regionMatch = (district, v) => !!district && (district === v || provinceOf(district) === v);
  const regionLabel = (o) => (o.indexOf(' ') < 0 ? o + ' 전체' : o);
  /* 시·도 → 그 아래 시·군·구 */
  function regionTree() {
    const m = new Map();
    filterOptions('region').forEach((d) => {
      const p = provinceOf(d);
      if (!m.has(p)) m.set(p, []);
      if (d !== p) m.get(p).push(d);
    });
    return Array.from(m.keys()).sort((a, b) => a.localeCompare(b, 'ko')).map((p) => ({ prov: p, kids: m.get(p) }));
  }
  /* 지역 선택 목록: 시·도(굵게) 아래에 시·군·구가 들여쓰기로 이어져요.
     시·도를 누르면 아래 시·군·구가 모두 선택되고, 하나라도 빼면 시·도 선택은 풀려요 */
  function regionSheetHTML(name, sel) {
    const box = (cls, role, prov, val, checked, label) => '<label class="opt ' + cls + '"><input type="checkbox" name="' + name + '"' + (role ? ' data-role="' + role + '" data-prov="' + esc(prov) + '"' : '') +
      ' value="' + esc(val) + '"' + (checked ? ' checked' : '') + '> ' + label + '</label>';
    return regionTree().map((g) => {
      if (!g.kids.length) return box('rg-head', '', '', g.prov, sel.includes(g.prov), '<b>' + esc(g.prov) + '</b>');
      const all = sel.includes(g.prov) || g.kids.every((k) => sel.includes(k));
      return box('rg-head', 'parent', g.prov, g.prov, all, '<b>' + esc(g.prov) + '</b>') +
        g.kids.map((k) => box('rg-sub', 'child', g.prov, k, all || sel.includes(k), esc(k.slice(g.prov.length).trim()))).join('');
    }).join('');
  }
  /* 체크한 지역 → 적용할 값: 시·도 아래를 모두 골랐으면 시·도 하나로, 아니면 고른 시·군·구만 */
  function pickedRegions(name) {
    const root = $('#sheetBody'), out = [];
    const all = Array.from(root.querySelectorAll('input[name="' + name + '"]'));
    all.forEach((i) => {
      if (!i.checked) return;
      if (i.dataset.role === 'child' && all.some((j) => j.dataset.role === 'parent' && j.dataset.prov === i.dataset.prov && j.checked)) return;
      out.push(i.value);
    });
    return out;
  }
  const matchApplied = (s, applied) => GROUPS.every((g) => {
    const sel = applied.filter((a) => a.key === g.key).map((a) => a.value);
    return !sel.length || sel.some((v) => g.get(s).includes(v) || (g.key === 'region' && regionMatch(s.district, v)));
  });
  const sameFilters = (a, b) => a.length === b.length && a.every((x) => b.some((y) => y.key === x.key && y.value === x.value));
  /* 내 위치·취향을 책방 탐색 조건으로 미리 채워요.
     조건을 전부 겹치면 결과가 0건이 되기 쉬워서, 결과가 남는 조건만 위치 → 분야 → 시설 → 분위기 순서로 적용하고
     쓰지 못한 조건은 목록 위 안내문으로 알려 줘요. */
  function computePreset() {
    const a = me();
    if (!a) return { filters: [], note: '' };
    const p = normPrefs(a.prefs);
    const steps = [['region', a.region ? [a.region] : [], '위치'], ['category', p.category, '책 분야'], ['facility', p.facility, '시설'], ['mood', p.mood, '분위기']];
    let filters = [];
    const skipped = [];
    steps.forEach((st) => {
      if (!st[1].length) return;
      const trial = filters.concat(st[1].map((v) => ({ key: st[0], value: v })));
      if (state.stores.some((s) => matchApplied(s, trial))) filters = trial; else skipped.push(st[2]);
    });
    return { filters: filters, note: skipped.length ? skipped.join('·') + ' 조건은 맞는 책방이 없어 제외했어요.' : '' };
  }
  function applyPreset() { state.preset = computePreset(); state.applied = state.preset.filters.slice(); }
  function filteredStores() {
    const q = state.query.trim().toLowerCase();
    const r = state.stores.filter((s) => {
      if (q && !(s.title + ' ' + s.address + ' ' + s.district).toLowerCase().includes(q)) return false;
      return matchApplied(s, state.applied);
    });
    r.sort(state.sort === 'reviews'
      ? (a, b) => reviewsOf(b.id).length - reviewsOf(a.id).length || a.title.localeCompare(b.title, 'ko')
      : (a, b) => a.title.localeCompare(b.title, 'ko'));
    return r;
  }
  function cardHTML(s, action, extra, cls, noHeart) {
    const fav = isFav(s.id);
    const tags = uniq([].concat(s.categories.slice(0, 1), reviewMoodValues(s.id).slice(0, 1), reviewFacilityValues(s.id).slice(0, 1)));
    const hours = s.openingHours ? '영업 ' + s.openingHours.split(' ')[0] : '영업시간 정보 없음';
    return '<div class="book ' + (cls || '') + '" role="button" tabindex="0" data-action="' + action + '" data-id="' + s.id + '">' +
      '<div class="thumb" aria-hidden="true">' + esc(s.title[0]) + '</div>' +
      '<div class="bookbody"><div class="book-title-with-source"><b>' + esc(s.title) + '</b>' + sourceBadge(s) + '</div><small>' + esc(display(s.district, '지역 정보 없음')) + ' · ' + esc(hours) + '</small>' +
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
    state.applied.forEach((a, i) => { const lab = a.key === 'region' ? regionLabel(a.value) : a.value; chips.push('<span class="chip">' + esc(lab) + ' <button type="button" class="x" data-action="removeFilter" data-i="' + i + '" aria-label="' + esc(lab) + ' 해제">×</button></span>'); });
    const presetOn = state.preset && (state.preset.filters.length || state.preset.note) && !state.query.trim() && sameFilters(state.applied, state.preset.filters);
    const presetNote = presetOn
      ? '<span class="muted preset-note">' + (state.preset.filters.length ? '내 위치·취향이 미리 적용돼 있어요. ' : '') + esc(state.preset.note) + '</span>'
      : '';
    sel.hidden = false;
    sel.innerHTML = (chips.length
      ? '<span>선택 조건:</span>' + chips.join('') + '<button type="button" class="reset" data-action="resetAll">초기화</button>'
      : '<span class="muted">선택된 조건이 없어요. 필터를 눌러 조건을 추가해 보세요.</span>') + presetNote;

    if (state.status !== 'ready') {
      $('#resultMeta').textContent = '검색 결과';
      needReady(body);
      return;
    }
    const list = filteredStores();
    $('#resultMeta').textContent = '검색 결과 ' + list.length + '건 (JSON ' + state.stores.filter(s => s.sourceType === 'JSON').length + ' · API ' + state.stores.filter(s => s.sourceType === 'API').length + ')';
    if (!list.length) {
      body.innerHTML = loadWarning() + '<div class="state"><div class="icon">∅</div><h3>조건에 맞는 책방이 없어요</h3><p>선택한 조건을 줄이거나<br>다른 지역에서 찾아보세요.</p></div>' +
        '<button type="button" class="btn" data-action="removeLast"' + (state.applied.length ? '' : ' disabled') + '>마지막 필터 해제</button>' +
        '<button type="button" class="btn light" data-action="resetAll">전체 조건 초기화</button>';
      return;
    }
    body.innerHTML = loadWarning() + list.slice(0, state.visible).map((s) => cardHTML(s, 'openDetail')).join('');
    more.hidden = list.length <= state.visible;
  }
  function openFilter(key) {
    const g = GROUPS.find((x) => x.key === key);
    const sel = activeValues(key);
    openSheet(g.label, (key === 'region'
      ? [regionSheetHTML('fopt', sel)]
      : filterOptions(key).map((o) =>
        '<label class="opt"><input type="checkbox" name="fopt" value="' + esc(o) + '"' + (sel.includes(o) ? ' checked' : '') + '> ' + esc(o) + '</label>')).join('') +
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
  /* 탐색 필터는 책방 기본 정보가 아니라 실제 후기 체크 항목을 기준으로 집계해요.
     후기 체크리스트의 표현을 필터에서 쓰는 짧은 시설명으로 통일합니다. */
  function reviewTagsOf(id) {
    return uniq(reviewsOf(id).flatMap((r) => Array.isArray(r.tags) ? r.tags : []));
  }
  function reviewMoodValues(id) {
    const tags = reviewTagsOf(id);
    return MOOD_FILTERS.filter((v) => tags.includes(v));
  }
  function reviewFacilityValues(id) {
    const tags = reviewTagsOf(id);
    return FACILITY_FILTERS.filter((v) => tags.some((t) => REVIEW_TO_FACILITY[t] === v));
  }
  function facilityValues(store) {
    /* 공간대여·주차·카페·화장실은 기존 JSON/API의 facilities 값을 사용하고,
       좌석·음료·콘센트·오래 머물기·혼자 가기는 실제 후기 태그에서 집계합니다. */
    return uniq((store.facilities || []).filter((v) => BASIC_FACILITY_FILTERS.includes(v))
      .concat(reviewFacilityValues(store.id)));
  }
  function tagCounts(id) {
    const rs = reviewsOf(id);
    const c = {};
    rs.forEach((r) => r.tags.forEach((t) => { c[t] = (c[t] || 0) + 1; }));
    return { total: rs.length, tags: Object.entries(c).sort((a, b) => b[1] - a[1]) };
  }
  /* 후기 체크리스트 → 책방 키워드:
     분위기 · 공간·시설 · 책·큐레이션 각 분류에서 가장 많이 선택된 항목만 표시해요.
     최다 선택 수가 같은 항목은 최대 2개까지 보여주고, 2개를 초과하면 가나다순으로 2개를 골라요. */
  function reviewKeywords(id) {
    const counts = Object.fromEntries(tagCounts(id).tags);
    return REVIEW_GROUPS.flatMap((group) => {
      const ranked = group.options
        .map((tag) => ({ tag, count: counts[tag] || 0 }))
        .filter((item) => item.count > 0);
      if (!ranked.length) return [];
      const maxCount = Math.max(...ranked.map((item) => item.count));
      return ranked
        .filter((item) => item.count === maxCount)
        .sort((a, b) => a.tag.localeCompare(b.tag, 'ko'))
        .slice(0, 2)
        .map((item) => item.tag);
    });
  }
  /* 키워드 색: 후기 체크리스트 분류(REVIEW_GROUPS 순서 — 분위기 · 공간·시설 · 책·큐레이션)마다 다른 색 */
  const KW_CLASS = ['kw-mood', 'kw-space', 'kw-book'];
  function reviewKeywordsHTML(id) {
    const k = reviewKeywords(id);
    return k.length ? '<div class="chips mini" role="group" aria-label="방문자 후기 키워드">' + k.map((t) => {
      const gi = REVIEW_GROUPS.findIndex((g) => g.options.includes(t));
      return '<span class="chip' + (KW_CLASS[gi] ? ' ' + KW_CLASS[gi] : '') + '"' + (gi >= 0 ? ' title="' + esc(REVIEW_GROUPS[gi].label) + '"' : '') + '>' + esc(t) + '</span>';
    }).join('') + '</div>' : '';
  }
  /* 줄글(한 줄) 후기만 모아요 — 최신순. 내 후기는 이 책방에 몇 번째로 남겼는지(visit)를 함께 가져요 */
  function commentsOf(id) {
    const s = getStore(id);
    const mine = db.get(KEY.reviews, []).filter((r) => r.bookstoreId === id)
      .map((r, i) => Object.assign({}, r, { visit: Number(r.visit) || i + 1 }));
    return (s ? s.reviews : []).concat(mine)
      .filter((r) => r && typeof r.comment === 'string' && r.comment.trim()).reverse();
  }
  const VISIT_ORD = ['', '', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
  const visitLabel = (n) => (n <= 10 ? VISIT_ORD[n] + ' 번째 방문' : n + '번째 방문');

  const hasReview = (storeId) => db.get(KEY.reviews, []).some((r) => r.bookstoreId === storeId);
  /* 후기 유도: 저장한 코스를 만든 지 하루 이상 지났고 그 책방 후기가 아직 없으면 '다녀오셨나요?'를 띄워요 */
  function nudgeCourse() {
    const today = todayStr();
    return db.get(KEY.courses, []).slice().reverse().find((x) => !x.nudgeOff && x.createdAt &&
      String(x.createdAt).replace(/-/g, '.') < today && getStore(x.bookstoreId) && !hasReview(x.bookstoreId)) || null;
  }
  function reviewNudgeHTML() {
    const c = nudgeCourse();
    if (!c) return '';
    return '<div class="nudge"><b>“' + esc(c.title) + '” 다녀오셨나요?</b>' +
      '<small>다녀온 책방 후기를 체크로 간단히 남겨 보세요.</small>' +
      '<div class="nudge-acts"><button type="button" class="btn sm" data-action="reviewFor" data-id="' + c.bookstoreId + '" data-course="' + c.id + '">후기 쓰기</button>' +
      '<button type="button" class="btn light sm" data-action="nudgeOff" data-id="' + c.id + '">아직이에요</button></div></div>';
  }
  /* 앱을 쓰기 전에 다녀온 곳도 후기를 남길 수 있다는 안내 (아직 후기가 하나도 없을 때만) */
  function firstReviewBannerHTML() {
    if (db.get(KEY.reviews, []).length) return '';
    return '<button type="button" class="banner soft" data-action="pickReviewStore"><span><b>다녀온 책방이 있나요?</b><small>이 앱을 쓰기 전에 다녀온 곳도 체크만으로 후기를 남길 수 있어요</small></span><span class="go" aria-hidden="true">〉</span></button>';
  }
  /* 다녀온 책방 찾기 (시트): 검색 전에는 즐겨찾기·최근 본 책방부터 */
  function reviewStoreListHTML(q) {
    q = (q || '').trim().toLowerCase();
    const list = q
      ? state.stores.filter((s) => (s.title + ' ' + (s.district || '') + ' ' + (s.address || '')).toLowerCase().includes(q)).slice(0, 30)
      : uniq(favorites().concat(recent())).map(getStore).filter(Boolean).slice(0, 12);
    if (!list.length) return '<p class="para">' + (q ? '검색 결과가 없어요.' : '책방 이름이나 지역으로 검색해 보세요.') + '</p>';
    return (q ? '' : '<p class="para">즐겨찾기·최근 본 책방이에요.</p>') + list.map((s) =>
      '<button type="button" class="opt-btn" data-action="reviewFor" data-id="' + s.id + '"><span>' + esc(s.title) + '</span><small>' + esc(s.district) + '</small></button>').join('');
  }
  function pickReviewStoreSheet() {
    openSheet('다녀온 책방 찾기',
      '<input type="search" class="fld" id="reviewSearchQ" placeholder="책방 이름이나 지역 검색" aria-label="책방 검색" autocomplete="off">' +
      '<div id="reviewSearchList">' + reviewStoreListHTML('') + '</div>');
  }

  /* ---------- 상세 ---------- */
  function renderDetail() {
    const box = $('#detailBody');
    if (!needReady(box)) return;
    const s = getStore(state.currentId);
    if (!s) { box.innerHTML = '<div class="state"><p>책방 정보를 찾을 수 없어요.</p><button type="button" class="btn" data-nav="list">책방 탐색으로</button></div>'; return; }
    const fav = isFav(s.id);
    const chipTags = uniq(s.categories.concat(s.themes.slice(0, 1), reviewMoodValues(s.id), reviewFacilityValues(s.id)));
    const cn = commentsOf(s.id).length;
    /* 코스 화면의 '전체 코스 / 저장한 코스'처럼, 이름·분류 아래에서 '책방 정보'와 '줄글 후기만' 중에 골라 봐요 */
    const dtabs = [['info', '책방 정보'], ['comments', cn ? '줄글 후기 ' + cn : '줄글 후기']];
    const onComments = state.dtab === 'comments';
    /* 위쪽 내용(.detail-main)과 하단 버튼(.sticky)을 나눠서, 탭 내용이 짧아도 버튼은 항상 화면 맨 아래(하단 메뉴 바로 위)에 놓여요 */
    box.innerHTML = '<div class="detail-main">' +
      '<div class="hero"><span class="hero-letter" aria-hidden="true">' + esc(s.title[0]) + '</span><small>' + esc(s.district) + '</small></div>' +
      '<div class="title-row"><div class="detail-title-with-source"><h2>' + esc(s.title) + '</h2>' + sourceBadge(s) + '</div>' +
      (me() ? '<button type="button" class="heart" data-action="toggleFav" data-id="' + s.id + '" aria-pressed="' + fav + '" aria-label="즐겨찾기">' + (fav ? '★' : '☆') + '</button>' : '') + '</div>' +
      '<div class="chips mini">' + chipTags.map((t) => '<span class="chip">' + esc(t) + '</span>').join('') + '</div>' +
      '<div class="tabs sm detail-tabs" role="tablist" aria-label="책방 상세 보기">' + dtabs.map((t) =>
        '<button type="button" role="tab" class="' + (state.dtab === t[0] ? 'on' : '') + '" aria-selected="' + (state.dtab === t[0]) + '" data-action="detailTab" data-tab="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' +
      '<div role="tabpanel">' + (onComments ? detailCommentsHTML(s) : detailInfoHTML(s)) + '</div></div>' +
       (me() ? '<div class="sticky"><div class="btn-row"><button type="button" class="btn" data-action="startCourse" data-id="' + s.id + '">코스 만들기</button>' +
      '<button type="button" class="btn light" data-action="openReviews">후기 작성</button></div></div>' : '');
    $('[data-screen="detail"]').classList.add('has-sticky');
  }
  /* '책방 정보' 탭: 주소·운영·휴무일 등 기본 정보 + 큐레이션 소개 + 후기에서 뽑은 키워드 */
  function detailInfoHTML(s) {
    const visits = db.get(KEY.visits, []).filter((v) => v.bookstoreId === s.id).length;
    const mapUrl = s.address ? 'https://map.naver.com/p/search/' + encodeURIComponent(s.address) : null;
    return '<div class="fact"><span>주소</span><div class="val">' + esc(display(s.address, '주소 정보 없음')) +
      (s.address ? '<div class="card-acts"><button type="button" class="mini-btn" data-action="copyAddr" data-id="' + s.id + '">주소 복사</button>' + '<a class="mini-btn" href="' + mapUrl + '" target="_blank" rel="noopener noreferrer">지도에서 보기 ↗</a></div>' : '') + '</div></div>' +
      '<div class="fact"><span>운영</span><span class="val">' + esc(display(s.openingHours, '영업시간 정보 없음')) + '</span></div>' + '<div class="fact"><span>휴무일</span><span class="val">' + esc(display(s.closedDays, '휴무일 정보 없음')) + '</span></div>' + '<div class="fact"><span>전화번호</span><span class="val">' + esc(display(s.phone, '전화번호 정보 없음')) + '</span></div>' +
      '<div class="fact"><span>시설</span><span class="val">좌석 ' + (s.facilities.includes('좌석') ? '있음' : '정보 확인') + ' / 음료 ' + (s.facilities.includes('음료') ? '있음' : '정보 확인') + '</span></div>' +
      '<h3 class="section">큐레이션 · 공간 소개</h3><p class="para">' + esc(display(s.description, '등록된 소개가 없어요')) + '</p>' +
      reviewKeywordsHTML(s.id) +
      (visits ? '<p class="para">내 방문 ' + visits + '회</p>' : '');
  }
  /* '줄글 후기' 탭: 한 줄 후기만 최신순으로 */
  function detailCommentsHTML(s) {
    const list = commentsOf(s.id);
    return list.length
      ? list.map((r) =>
        '<div class="card"><b>' + esc(r.nickname || '익명') + '</b>' +
        (r.visit >= 2 ? '<span class="badge on">' + visitLabel(r.visit) + '</span>' : '') +
        (r.date ? ' <small class="muted">' + esc(r.date) + ' 작성</small>' : '') +
        '<p class="para">“' + esc(r.comment.trim()) + '”</p></div>').join('')
      : '<div class="state"><div class="icon">✎</div><h3>아직 줄글 후기가 없어요</h3><p>후기를 쓸 때 한 줄 후기를 남기면<br>여기에 모여요.</p></div>';
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
  let homePicks = [];
  function pickHomeStores() {
    const pool = state.stores.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    homePicks = pool.slice(0, 2).map((s) => s.id);
  }
  function homePickCard(s) {
    return '<button type="button" class="home-pick-card" data-action="openDetail" data-id="' + esc(s.id) + '">' +
      '<span class="home-pick-visual" aria-hidden="true"><span>BOOK<br>STORE</span><strong>' + esc(s.title.slice(0, 1)) + '</strong></span>' +
      '<span class="home-pick-info"><span class="home-pick-name">' + esc(s.title) + '</span>' + sourceBadge(s) + '</span>' +
      '<span class="home-pick-place">' + esc(display(s.district, '지역 정보 없음')) + '</span>' +
      '<span class="home-pick-more">책방 자세히 보기 ↗</span></button>';
  }
  function renderHome() {
    const box = $('#homeExtra');
    const discovery = $('#homeDiscovery');
    if (state.status !== 'ready') {
      discovery.innerHTML = '<div class="home-block"><h3>오늘은 이런 책방 어때요?</h3><p class="para">책방 정보를 불러오는 중이에요.</p></div>';
      box.innerHTML = '';
      return;
    }
    if (!homePicks.length || homePicks.some((id) => !getStore(id))) pickHomeStores();
    const picks = homePicks.map(getStore).filter(Boolean);
    discovery.innerHTML =
      '<section class="home-block"><div class="home-heading"><div><span class="home-kicker">DISCOVER</span><h3>오늘은 이런 책방 어때요?</h3></div>' +
      '<button type="button" class="textbtn" data-action="refreshHomePicks">↻ 다시 뽑기</button></div>' +
      '<div class="home-pick-grid">' + picks.map(homePickCard).join('') + '</div></section>' +
      '<section class="home-block"><div class="home-heading"><div><span class="home-kicker">NEWS & STORIES</span><h3>새소식</h3></div></div>' +
      '<p class="home-news-intro">동네 책방과 독립출판의 새로운 이야기를 만나보세요.</p>' +
      '<a class="home-news-item" href="https://www.google.com/search?q=%EB%8F%85%EB%A6%BD%EC%84%9C%EC%A0%90+%EC%B5%9C%EC%8B%A0+%EB%89%B4%EC%8A%A4&tbm=nws" target="_blank" rel="noopener noreferrer"><span class="home-news-icon" aria-hidden="true">✦</span><span><b>독립서점 최신 뉴스</b><small>새롭게 전해지는 책방 소식 찾아보기</small></span><span aria-hidden="true">↗</span></a>' +
      '<a class="home-news-item" href="https://www.google.com/search?q=%EB%8F%85%EB%A6%BD%EC%84%9C%EC%A0%90+%EB%B6%81%ED%86%A0%ED%81%AC+%ED%96%89%EC%82%AC&tbm=nws" target="_blank" rel="noopener noreferrer"><span class="home-news-icon" aria-hidden="true">▤</span><span><b>북토크 · 책방 행사</b><small>요즘 열리는 행사와 모임 소식 찾아보기</small></span><span aria-hidden="true">↗</span></a>' +
      '<p class="home-news-note">※ 실시간 기사 목록이 아닌 뉴스 검색 연결이에요.</p></section>';
    /* 인기 코스 3개 (전체 코스 '인기순'과 같은 기준) — 로그인 여부와 상관없이 표시, 누르면 코스 정보 화면으로 */
    let h = '';
    const likedIds = db.get(KEY.likes, []);
    const likeCnt = (x) => x.likes + (likedIds.includes(x.id) ? 1 : 0);
    const topCourses = allCourseList(db.get(KEY.courses, []))
      .sort((a, b) => likeCnt(b) - likeCnt(a) || String(b.createdAt).localeCompare(String(a.createdAt)) || String(a.title).localeCompare(String(b.title), 'ko'))
      .slice(0, 3);
    if (topCourses.length) {
      h += '<section class="home-block"><div class="home-heading"><div><span class="home-kicker">POPULAR COURSES</span><h3>인기 코스</h3></div></div>' +
        topCourses.map((x) => '<div class="card home-course" data-action="openCourse" data-id="' + x.id + '" data-mode="map">' +
          '<div class="home-course-top">' + courseTitleHTML(x) + '<span class="home-course-likes" aria-label="좋아요 ' + likeCnt(x) + '개">♥ ' + likeCnt(x) + '</span></div>' +
          '<p class="para">' + esc(x.author) + '님 · ' + courseMeta(x) + '<br>' + esc(routeText(x)) + '</p></div>').join('') + '</section>';
    }
    box.innerHTML = h;
  }

  /* ---------- 후기 화면 ---------- */
  function renderReviews() {
    const box = $('#reviewBody');
    if (!needReady(box)) return;
    const s = getStore(state.reviewStoreId);
    if (!s) return;
    const ctx = state.reviewCtx;
    const pickRule = REVIEW_PICK_MIN + '~' + REVIEW_PICK_MAX + '개';
    box.innerHTML =
      '<h3>' + esc(s.title) + '</h3>' +
      '<p class="para">' + (ctx
        ? '“' + esc(ctx.title) + '” 코스는 어떠셨나요? '
        : '이 앱을 쓰기 전에 다녀온 곳도 괜찮아요. ') +
      '분위기 · 공간·시설 · 책·큐레이션에서 각각 ' + pickRule + '씩 골라 주세요. 한 줄 후기는 쓰지 않아도 괜찮아요.</p>' +
      '<form id="reviewForm" novalidate>' +
      REVIEW_GROUPS.map((g, i) =>
        '<div id="rgroup' + i + '">' +
        '<h3 class="section section-row' + (i ? '' : ' first') + '"><span>' + esc(g.label) + ' <small class="muted">(필수 · ' + pickRule + ')</small></span>' +
        '<small class="rcount" id="rcnt' + i + '" aria-live="polite">0/' + REVIEW_PICK_MAX + '</small></h3>' +
        '<div class="chips" role="group" aria-label="' + esc(g.label) + '">' +
        g.options.map((o) => '<label class="chk"><input type="checkbox" name="rtag" value="' + esc(o) + '"><span>' + esc(o) + '</span></label>').join('') +
        '</div><p class="field-err" id="rerr' + i + '" role="alert" hidden></p></div>').join('') +
      '<h3 class="section">한 줄 후기 <small class="muted">(선택)</small></h3>' +
      '<textarea class="inputarea" id="reviewComment" maxlength="80" placeholder="하고 싶은 말이 있다면 적어 주세요" aria-label="한 줄 후기 (선택)"></textarea><div class="counter" id="rcount">0/80</div>' +
      '<div class="sticky"><button type="submit" class="btn">후기 등록</button></div></form>';
    $('[data-screen="reviews"]').classList.add('has-sticky');
    syncReviewGroups();
  }
  /* 분류(분위기 · 공간·시설 · 책·큐레이션)별로 몇 개를 골랐는지 */
  function reviewGroupCounts() {
    const picked = $$('input[name="rtag"]:checked').map((i) => i.value);
    return REVIEW_GROUPS.map((g) => picked.filter((t) => g.options.includes(t)).length);
  }
  /* 선택 개수를 분류 옆에 보여주고, 최대 개수에 닿으면 그 분류의 나머지 항목은 잠가요. 1개 이상 골랐다면 안내 문구는 걷어요 */
  function syncReviewGroups() {
    const counts = reviewGroupCounts();
    REVIEW_GROUPS.forEach((g, i) => {
      const box = $('#rgroup' + i);
      if (!box) return;
      const full = counts[i] >= REVIEW_PICK_MAX;
      $$('input[name="rtag"]', box).forEach((inp) => { inp.disabled = full && !inp.checked; });
      const c = $('#rcnt' + i);
      c.textContent = counts[i] + '/' + REVIEW_PICK_MAX;
      c.classList.toggle('ok', counts[i] >= REVIEW_PICK_MIN);
      if (counts[i] >= REVIEW_PICK_MIN) { c.classList.remove('err'); $('#rerr' + i).hidden = true; }
    });
  }
  function submitReview() {
    const tags = $$('input[name="rtag"]:checked').map((i) => i.value);
    const comment = $('#reviewComment').value.trim();
    /* 세 분류 모두 1~3개를 골라야 등록할 수 있어요 — 부족한 분류를 표시하고 첫 번째 분류로 스크롤 */
    const counts = reviewGroupCounts();
    const bad = REVIEW_GROUPS.map((g, i) => i).filter((i) => counts[i] < REVIEW_PICK_MIN || counts[i] > REVIEW_PICK_MAX);
    if (bad.length) {
      bad.forEach((i) => {
        $('#rcnt' + i).classList.add('err');
        const e = $('#rerr' + i);
        e.textContent = REVIEW_GROUPS[i].label + '에서 ' + REVIEW_PICK_MIN + '~' + REVIEW_PICK_MAX + '개를 골라 주세요.';
        e.hidden = false;
      });
      toast(bad.map((i) => REVIEW_GROUPS[i].label).join(', ') + '에서 ' + REVIEW_PICK_MIN + '~' + REVIEW_PICK_MAX + '개씩 골라 주세요.');
      $('#rgroup' + bad[0]).scrollIntoView({ block: 'center' });
      return;
    }
    const all = db.get(KEY.reviews, []);
    /* 이 책방에 몇 번째로 남기는 후기인지(방문 횟수)와 작성자 닉네임을 함께 저장 */
    const prev = all.filter((r) => r.bookstoreId === state.reviewStoreId);
    const visit = Math.max(prev.length, ...prev.map((r) => Number(r.visit) || 0)) + 1;
    const rec = { reviewId: 'r' + Date.now(), bookstoreId: state.reviewStoreId, tags: tags, comment: comment, date: todayStr(), nickname: me() ? me().nickname : '', visit: visit };
    if (state.reviewCtx) rec.courseId = state.reviewCtx.courseId;
    all.push(rec);
    db.set(KEY.reviews, all);
    toast('후기를 등록했어요.');
    back();
  }

  /* ---------- 나의 책방 ---------- */
  function renderMy() {
    const myTabs = $('[data-screen="my"] .tabs');
    myTabs.hidden = !signedIn();
    if (!signedIn()) { $('#myBody').innerHTML = '<div class="state"><h3>나의 책방</h3><p>로그인하거나 회원가입해 주세요.</p><button type="button" class="btn" data-action="openAuth">로그인 / 회원가입</button></div>'; return; }
    const labels = { fav: '즐겨찾기', reviews: '내 후기', courses: '저장 코스' };
    const counts = { fav: db.get(KEY.fav, []).length, reviews: db.get(KEY.reviews, []).length, courses: db.get(KEY.courses, []).length };
    $$('[data-screen="my"] .tabs button').forEach((b) => {
      const on = b.dataset.tab === state.tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on);
      b.textContent = labels[b.dataset.tab] + ' ' + counts[b.dataset.tab];
    });
    const box = $('#myBody');
    if (!needReady(box)) return;
    if (state.tab === 'fav') box.innerHTML = myFavHTML();
    else if (state.tab === 'reviews') box.innerHTML = myReviewsHTML();
    else box.innerHTML = myCoursesHTML();
  }
  function myFavHTML() {
    const f = favorites().map(getStore);
    if (!f.length) return '<div class="state"><div class="icon">☆</div><h3>즐겨찾기한 책방이 없어요</h3><p>마음에 드는 책방의 ☆를 눌러 저장해 보세요.</p></div><button type="button" class="btn" data-nav="list">책방 탐색하기</button>';
    return '<h3 class="section first">즐겨찾기한 책방 ' + f.length + '곳</h3>' +
      f.map((s) => cardHTML(s, 'openDetail',
        '<div class="card-acts"><button type="button" class="btn sm" data-action="startCourse" data-id="' + s.id + '">코스 만들기</button>' +
        '<button type="button" class="btn light sm" data-action="reviewFor" data-id="' + s.id + '">후기 쓰기</button>' +
        '<button type="button" class="btn light sm" data-action="unfav" data-id="' + s.id + '">해제</button></div>', '', true)).join('');
  }
  function myReviewsHTML() {
    const rs = db.get(KEY.reviews, []).filter((r) => getStore(r.bookstoreId));
    const add = '<button type="button" class="btn" data-action="pickReviewStore">＋ 다녀온 책방 후기 쓰기</button>';
    const head = rs.length
      ? add + '<h3 class="section">남긴 후기 ' + rs.length + '건</h3>' + rs.slice().reverse().map((r) => {
          const s = getStore(r.bookstoreId);
          return '<div class="card"><button type="button" class="card-title" data-action="openDetail" data-id="' + s.id + '">' + esc(s.title) + ' <span aria-hidden="true">〉</span></button> <small class="muted">' + esc(r.date) + ' 작성</small>' +
            (r.tags.length ? '<div class="chips mini">' + r.tags.map((t) => '<span class="chip">' + esc(t) + '</span>').join('') + '</div>' : '') +
            (r.comment ? '<p class="para">“' + esc(r.comment) + '”</p>' : '') +
            '<div class="card-acts"><button type="button" class="btn light sm" data-action="delReview" data-id="' + esc(r.reviewId) + '">삭제</button></div></div>';
        }).join('')
      : '<div class="state"><div class="icon">✎</div><h3>아직 남긴 후기가 없어요</h3><p>이 앱을 쓰기 전에 다녀온 책방도 괜찮아요.<br>분류마다 1~3개씩 눌러 체크만으로 후기를 남길 수 있어요.</p></div>' + add;
    return head + legacyVisitsHTML();
  }
  /* 예전에 남긴 방문 기록(메모)은 지우지 않고 후기 탭 아래에 그대로 보여줘요 */
  function legacyVisitsHTML() {
    const v = db.get(KEY.visits, []).filter((r) => getStore(r.bookstoreId));
    if (!v.length) return '';
    return '<h3 class="section">예전 방문 기록 ' + v.length + '건</h3>' + v.slice().reverse().map((r) => {
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
  /* ---------- 코스 허브 (전체 코스 · 저장한 코스) ---------- */
  function routeText(x) {
    return x.order.map(itemInfo).filter(Boolean).map((it) => it.name).join(' → ');
  }
  function courseMeta(x) {
    return '장소 ' + x.order.length + '곳 · 독서 ' + fmtMin(x.readingMinutes) + (x.includeWalk ? ' · 산책 ' + x.walkMinutes + '분' : '');
  }
  /* 코스 제목: 누르면 코스 정보(지도·요약)가 열려요 */
  function courseTitleHTML(x) {
    return '<button type="button" class="card-title" data-action="openCourse" data-id="' + x.id + '" data-mode="map">' + esc(x.title) + ' <span aria-hidden="true">〉</span></button>';
  }
  /* 저장한 코스 카드 (코스 허브·나의 책방 공용) */
  function courseCardHTML(x) {
    const badge = x.from
      ? '<span class="badge">' + esc(x.from) + '님의 코스</span>'
      : '<span class="badge' + (x.visibility === 'public' ? ' on' : '') + '">' + (x.visibility === 'public' ? '공개' : '비공개') + '</span>';
    const reviewBtn = !getStore(x.bookstoreId) ? ''
      : hasReview(x.bookstoreId)
        ? '<button type="button" class="btn light sm" disabled>후기 작성 ✓</button>'
        : '<button type="button" class="btn sm" data-action="reviewFor" data-id="' + x.bookstoreId + '" data-course="' + x.id + '">후기 쓰기</button>';
    return '<div class="card">' + courseTitleHTML(x) + badge +
      '<p class="para">' + courseMeta(x) + '<br>' + esc(routeText(x)) + '<br><span class="muted">' + esc(x.createdAt) + ' 저장</span></p>' +
      '<div class="card-acts">' + reviewBtn + '<button type="button" class="btn light sm" data-action="openCourse" data-id="' + x.id + '" data-mode="edit">편집</button>' +
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
      '<p class="para">' + (v === 'public' ? '저장하면 전체 코스 목록에 올라가 다른 사용자도 볼 수 있어요.' : '나만 볼 수 있어요. 저장한 코스에서 언제든 공개로 바꿀 수 있어요.') + '</p>';
  }
  /* 전체 코스 = 다른 사용자가 공유한 코스 + 내가 공개로 저장한 코스 */
  function allCourseList(saved) {
    const mine = saved.filter((x) => x.visibility === 'public' && !x.srcId)
      .map((x) => Object.assign({}, x, { author: '나', mine: true, likes: 0 }));
    return state.shared.concat(mine).filter((x) => getStore(x.bookstoreId));
  }
  /* 전체 코스: 책방 탐색처럼 서점 검색 아래에 필터 칩(지역 · 산책 포함 · 산책 시간 · 체류 시간) */
  const CF_GROUPS = [
    { key: 'region', label: '지역' }, { key: 'walk', label: '산책 포함' },
    { key: 'walkMin', label: '산책 시간' }, { key: 'readMin', label: '체류 시간' }
  ];
  function courseFilterCount() {
    const f = state.cf;
    return (f.q.trim() ? 1 : 0) + f.regions.length + (f.walk !== 'any' ? 1 : 0) + (f.walk === 'no' ? 0 : f.walkMins.length) + f.readMins.length;
  }
  function matchCourseFilter(x, ff) {
    const f = ff || state.cf, s = getStore(x.bookstoreId), q = f.q.trim().toLowerCase();
    if (q && !(s && s.title.toLowerCase().includes(q))) return false;
    if (f.regions.length && !(s && f.regions.some((r) => regionMatch(s.district, r)))) return false;
    if (f.walk === 'yes' && !x.includeWalk) return false;
    if (f.walk === 'no' && x.includeWalk) return false;
    if (f.walk !== 'no' && f.walkMins.length && !(x.includeWalk && f.walkMins.includes(x.walkMinutes))) return false;
    if (f.readMins.length && !f.readMins.includes(x.readingMinutes)) return false;
    return true;
  }
  /* 내 위치를 코스 지역 조건으로 미리 채워요. 그 지역에 맞는 코스가 하나도 없으면 빈 목록이 되지 않게 조건은 빼고 안내만 보여줘요 */
  function applyCoursePreset() {
    const a = me();
    state.cfPreset = null;
    if (!a || !a.region) return;
    const trial = Object.assign(blankCF(), { regions: [a.region] });
    if (allCourseList(db.get(KEY.courses, [])).some((x) => matchCourseFilter(x, trial))) {
      state.cf.regions = [a.region];
      state.cfPreset = { region: a.region, note: '' };
    } else {
      state.cfPreset = { region: '', note: '내 위치(' + a.region + ')에 맞는 코스가 아직 없어 위치 조건은 빼고 보여드려요.' };
    }
  }
  /* 적용 중인 조건을 칩으로 보여 주고 하나씩 해제할 수 있게 (책방 탐색의 '선택 조건'과 같은 모양) */
  function courseFilterChips() {
    const f = state.cf, chips = [];
    const add = (k, v, label) => chips.push('<span class="chip">' + esc(label) + ' <button type="button" class="x" data-action="cfRemove" data-k="' + k + '" data-v="' + esc(v) + '" aria-label="' + esc(label) + ' 해제">×</button></span>');
    if (f.q.trim()) add('q', '', '“' + f.q.trim() + '”');
    f.regions.forEach((r) => add('region', r, regionLabel(r)));
    if (f.walk !== 'any') add('walk', '', f.walk === 'yes' ? '산책 포함' : '산책 미포함');
    if (f.walk !== 'no') f.walkMins.forEach((m) => add('walkMin', String(m), '산책 ' + m + '분'));
    f.readMins.forEach((m) => add('readMin', String(m), '독서 ' + fmtMin(m)));
    const pre = state.cfPreset;
    const onlyRegion = f.regions.length === 1 && !f.q.trim() && f.walk === 'any' && !f.walkMins.length && !f.readMins.length;
    const note = pre && (pre.region ? onlyRegion && f.regions[0] === pre.region : !courseFilterCount() && pre.note)
      ? '<span class="muted preset-note">' + (pre.region ? '내 위치가 미리 적용돼 있어요.' : esc(pre.note)) + '</span>' : '';
    return '<div class="selected">' + (chips.length
      ? '<span>선택 조건:</span>' + chips.join('') + '<button type="button" class="reset" data-action="cfReset">초기화</button>'
      : '<span class="muted">선택된 조건이 없어요. 필터를 눌러 조건을 추가해 보세요.</span>') + note + '</div>';
  }
  /* 코스 화면 맨 위: 서점 검색 + 그 아래 필터 칩 (책방 탐색과 같은 구성) */
  function courseQuickHTML() {
    const f = state.cf;
    const on = { region: f.regions.length, walk: f.walk !== 'any' ? 1 : 0, walkMin: f.walk === 'no' ? 0 : f.walkMins.length, readMin: f.readMins.length };
    return '<div class="search"><input type="search" id="courseQuery" value="' + esc(f.q) + '" placeholder="서점 이름 검색" aria-label="서점 이름 검색" autocomplete="off"></div>' +
      '<div class="chips" id="courseFilterChips">' + CF_GROUPS.map((g) =>
        '<button type="button" class="chip' + (on[g.key] ? ' on' : '') + '" data-action="openCF" data-key="' + g.key + '" aria-haspopup="dialog">' +
        g.label + (on[g.key] && g.key !== 'walk' ? ' ' + on[g.key] : '') + ' ▾</button>').join('') + '</div>';
  }
  function allCoursesHTML() {
    return courseQuickHTML() + '<div id="courseListBody">' + courseListHTML() + '</div>';
  }
  function refreshCourseList() {
    const box = $('#courseListBody');
    if (box) box.innerHTML = courseListHTML();
  }
  function courseListHTML() {
    const liked = db.get(KEY.likes, []);
    const saved = db.get(KEY.courses, []);
    const base = allCourseList(saved);
    const list = base.filter((x) => matchCourseFilter(x));
    const cnt = (x) => x.likes + (liked.includes(x.id) ? 1 : 0);
    const byTitle = (a, b) => String(a.title).localeCompare(String(b.title), 'ko');
    list.sort(state.psort === 'new'
      ? (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || cnt(b) - cnt(a) || byTitle(a, b)
      : state.psort === 'likes'
        ? (a, b) => cnt(b) - cnt(a) || String(b.createdAt).localeCompare(String(a.createdAt)) || byTitle(a, b)
        : byTitle);
    const n = courseFilterCount();
    const sortSel = '<label class="sort">정렬: <select id="courseSort" aria-label="정렬">' +
      [['name', '이름순'], ['likes', '인기순'], ['new', '최신순']].map((o) =>
        '<option value="' + o[0] + '"' + ((state.psort || 'name') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label>';
    const head = courseFilterChips() + '<div class="rowline"><b>전체 코스 ' + list.length + '개</b>' + sortSel + '</div>';
    if (!list.length) return head + (base.length && n
      ? '<div class="state"><div class="icon">∅</div><h3>조건에 맞는 코스가 없어요</h3><p>선택한 조건을 줄이거나<br>다른 지역에서 찾아보세요.</p></div>'
      : '<div class="state"><div class="icon">⌖</div><h3>아직 공개된 코스가 없어요</h3><p>코스를 만들 때 “공개”를 선택하면<br>여기에 올라가요.</p></div>');
    return head +
      list.map((x) => {
        const taken = saved.some((c) => c.srcId === x.id);
        const acts = !me() ? '' : x.mine
          ? '<button type="button" class="btn light sm" data-action="toggleVis" data-id="' + x.id + '">비공개로 전환</button>'
          : '<button type="button" class="btn light sm" data-action="takeCourse" data-id="' + x.id + '" aria-pressed="' + taken + '"' + (taken ? ' title="다시 누르면 내 코스에서 빼요"' : '') + '>' + (taken ? '담음 ✓' : '내 코스로 담기') + '</button>' +
            '<button type="button" class="btn light sm" data-action="likeCourse" data-id="' + x.id + '" aria-pressed="' + liked.includes(x.id) + '" aria-label="좋아요">' + (liked.includes(x.id) ? '♥ ' : '♡ ') + cnt(x) + '</button>';
        return '<div class="card">' + courseTitleHTML(x) + (x.mine ? '<span class="badge on">내 코스</span>' : '') +
          '<p class="para">' + esc(x.author) + '님 · ' + courseMeta(x) + '<br>' + esc(routeText(x)) +
          (x.desc ? '<br><span class="muted">' + esc(x.desc) + '</span>' : '') + '</p>' +
          '<div class="card-acts">' + acts + '</div></div>';
      }).join('');
  }
  /* 필터 시트: 책방 탐색처럼 항목(지역 · 산책 포함 · 산책 시간 · 체류 시간)마다 하나씩 */
  function openCF(key) {
    const f = state.cf;
    const opt = (type, name, val, label, checked, disabled) =>
      '<label class="opt"><input type="' + type + '" name="' + name + '" value="' + esc(val) + '"' + (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + '> ' + esc(label) + '</label>';
    let title, body;
    if (key === 'region') {
      title = '지역';
      body = regionSheetHTML('cf-region', f.regions);
    } else if (key === 'walk') {
      title = '산책 포함 여부';
      body = [['any', '전체'], ['yes', '포함'], ['no', '포함하지 않음']].map((x) => opt('radio', 'cf-walk', x[0], x[1], f.walk === x[0])).join('');
    } else if (key === 'walkMin') {
      title = '산책 시간';
      body = (f.walk === 'no' ? '<p class="para">산책을 포함하지 않는 조건이라 산책 시간은 고를 수 없어요.</p>' : '') +
        COURSE_WALK_OPTS.map((m) => opt('checkbox', 'cf-walkmin', m, m + '분', f.walkMins.includes(m), f.walk === 'no')).join('');
    } else if (key === 'readMin') {
      title = '체류 시간';
      body = COURSE_READ_OPTS.map((m) => opt('checkbox', 'cf-readmin', m, fmtMin(m), f.readMins.includes(m))).join('');
    } else return;
    openSheet(title, body + '<div class="sheet-foot"><div class="btn-row">' +
      '<button type="button" class="btn light" data-action="clearCF" data-key="' + key + '">이 항목 해제</button>' +
      '<button type="button" class="btn" data-action="applyCF" data-key="' + key + '">적용</button></div></div>');
  }
  function renderCourseHub() {
    const box = $('#courseBody');
    if (!needReady(box)) return;
    const saved = db.get(KEY.courses, []);
    const tabs = me() ? [['all', '전체 코스'], ['saved', '저장한 코스 ' + saved.length]] : [['all', '전체 코스']];
    const body = state.ctab === 'saved'
      ? (saved.length
        ? reviewNudgeHTML() + saved.slice().reverse().map(courseCardHTML).join('')
        : '<div class="state"><div class="icon">⌖</div><h3>저장한 코스가 없어요</h3><p>직접 만들거나, 전체 코스에서<br>마음에 드는 코스를 담아 보세요.</p></div>')
      : allCoursesHTML();
    box.innerHTML =
      '<div class="hub-main"><div class="tabs" role="tablist">' + tabs.map((t) =>
        '<button type="button" role="tab" class="' + (state.ctab === t[0] ? 'on' : '') + '" aria-selected="' + (state.ctab === t[0]) + '" data-action="courseTab" data-tab="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' +
      body + '</div>' +
      (me() ? '<div class="hub-fab"><button type="button" class="btn" data-nav="course-new">＋ 새 코스 만들기</button></div>' : '');
  }

  function startCourse(id) {
    if (!id) return;
    const s = getStore(id);
    if (s && !s.coordinates) { toast('좌표 정보가 없어 이 책방으로 코스를 만들 수 없어요.'); return; }
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
      '<label class="section first" for="courseTitle">코스 이름 <small class="muted">(선택)</small></label>' +
      '<input type="text" class="fld" id="courseTitle" maxlength="' + COURSE_TITLE_MAX + '" value="' + esc(c.title || '') + '" placeholder="' + esc(defaultCourseTitle(c)) + '" aria-label="코스 이름" autocomplete="off">' +
      '<p class="para">비워 두면 “' + esc(defaultCourseTitle(c)) + '”처럼 자동으로 정해져요.</p>' +
      '<h3 class="section">선택한 책방</h3>' +
      '<button type="button" class="pick" data-action="pickStore"><b>' + (s ? esc(s.title) : '책방을 선택해 주세요') + '</b><span>책방 변경 〉</span></button>' +
      '<h3 class="section">산책을 포함할까요?</h3>' +
      '<div class="choices">' + choice(c.includeWalk, true, '포함', 'setWalkOn') + choice(c.includeWalk, false, '포함하지 않음', 'setWalkOn') + '</div>' +
      (c.includeWalk ? '<h3 class="section">산책 시간</h3><div class="choices">' + [10, 20, 30].map((m) => choice(c.walkMinutes, m, m + '분', 'setWalkMin')).join('') + '</div>' : '') +
      '<h3 class="section">책방 독서 체류 시간</h3>' +
      '<div class="choices">' + [[30, '30분'], [60, '1시간'], [120, '2시간']].map((x) => choice(c.readingMinutes, x[0], x[1], 'setReadMin')).join('') + '</div>' +
      visHTML(c) +
      '<h3 class="section">선택 조건 요약</h3>' +
      '<p class="para">' + (s ? '책방 1곳' : '책방 미선택') + (c.includeWalk ? ' · 산책 ' + c.walkMinutes + '분' : ' · 산책 없음') + ' · 독서 ' + fmtMin(c.readingMinutes) + (c.srcId ? '' : ' · ' + (c.visibility === 'public' ? '공개' : '비공개')) + '</p>' +
      '<div class="sticky"><button type="button" class="btn" data-action="makeCourse"' + (s && s.coordinates ? '' : ' disabled') + '>' + (s && s.coordinates ? '지도에서 코스 확인하기' : s ? '좌표 정보가 없어 코스를 만들 수 없어요' : '책방을 먼저 선택해 주세요') + '</button></div>';
    $('[data-screen="course-setup"]').classList.add('has-sticky');
  }
  const fmtMin = (m) => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? (r ? h + '시간 ' + r + '분' : h + '시간') : r + '분'; };

  function dist(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return Infinity;
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
  /* 하단 저장 버튼: 코스 종류에 따라 달라져요 (맨 위가 주 버튼, 지도 화면에선 '코스 편집'이 저장 아래)
     - 새 코스: 현재 코스 저장
     - 내가 만든 코스: 저장하기(덮어쓰기) · 새 코스로 저장하기
     - 공유 코스: 새 코스로 저장하기만 (원본은 그대로 두고 내 코스로 새로 만들어요) */
  function saveButtonsHTML(c, withEdit) {
    const k = courseKind(c);
    const btn = (action, label, light) => '<button type="button" class="btn' + (light ? ' light' : '') + '" data-action="' + action + '">' + label + '</button>';
    let html = '';
    if (k === 'shared') html = btn('saveAsNew', '새 코스로 저장하기');
    else if (k === 'own') html = '<div class="btn-row">' + btn('saveCourse', '저장하기') + btn('saveAsNew', '새 코스로 저장하기', true) + '</div>';
    else html = btn('saveCourse', withEdit ? '현재 코스 저장' : '코스 저장하기');
    if (withEdit) html += btn('editCourse', '코스 편집', true);
    return '<div class="sticky">' + html + '</div>';
  }
  /* 전체 코스에서 다른 사람의 코스를 열어 볼 때: 코스 담기(다시 누르면 취소) · 후기 작성 */
  function sharedViewButtonsHTML(c) {
    const taken = db.get(KEY.courses, []).some((x) => x.srcId === c.srcId);
    const takeBtn = '<button type="button" class="btn" data-action="takeCourse" data-id="' + esc(c.srcId) + '" aria-pressed="' + taken + '"' +
      (taken ? ' title="다시 누르면 내 코스에서 빼요"' : '') + '>' + (taken ? '담음 ✓' : '코스 담기') + '</button>';
    const reviewBtn = !getStore(c.storeId) ? ''
      : hasReview(c.storeId)
        ? '<button type="button" class="btn light" disabled>후기 작성 ✓</button>'
        : '<button type="button" class="btn light" data-action="reviewFor" data-id="' + esc(c.storeId) + '" data-course="' + esc(c.srcId) + '">후기 작성</button>';
    return '<div class="sticky"><div class="btn-row">' + takeBtn + reviewBtn + '</div></div>';
  }
  /* 저장한 코스를 눌러 열었을 때(코스 소개): 코스 편집 · 후기 작성 — 편집·저장은 '코스 편집'을 눌러야 나와요 */
  function savedViewButtonsHTML(c) {
    const reviewBtn = !getStore(c.storeId) ? ''
      : hasReview(c.storeId)
        ? '<button type="button" class="btn light" disabled>후기 작성 ✓</button>'
        : '<button type="button" class="btn light" data-action="reviewFor" data-id="' + esc(c.storeId) + '" data-course="' + esc(c.id) + '">후기 작성</button>';
    return '<div class="sticky"><div class="btn-row"><button type="button" class="btn" data-action="editCourse">코스 편집</button>' + reviewBtn + '</div></div>';
  }
  /* 코스 제목을 눌러 열었을 때: 맨 위에 코스 제목과 만든 사람 닉네임 (새로 만드는 중인 코스에는 표시하지 않아요) */
  function courseHeadHTML(c) {
    if (!c.id && !c.srcId) return '';
    const maker = c.srcId ? c.from : (me() ? me().nickname : '나');
    return '<div class="course-head"><h2>' + esc(c.title || defaultCourseTitle(c)) + '</h2>' +
      (maker ? '<p class="para">만든 사람 · ' + esc(maker) + '</p>' : '') + '</div>';
  }
  function renderMap() {
    const box = $('#mapBody');
    if (!needReady(box)) return;
    const c = state.course;
    /* 코스 소개 화면: 다른 사람의 코스(코스 담기·후기 작성) · 내가 저장한 코스(코스 편집·후기 작성) — 하단 버튼을 하단 메뉴 바로 위에 고정 */
    const savedView = !!(c.id && c.view);
    $('[data-screen="map"]').classList.toggle('shared-view', savedView || !!(c.srcId && !c.id));
    if (!getStore(c.storeId)) { box.innerHTML = '<div class="state"><p>코스를 만들 책방을 먼저 선택해 주세요.</p><button type="button" class="btn" data-nav="course-new">코스 만들기</button></div>'; return; }
    if (!c.order.length) buildOrder();
    const st = courseStats();
    box.innerHTML =
      '<div class="map-main">' + courseHeadHTML(c) +
      '<div class="map">' + mapSVG(st.items) + '<div class="legend">지도 API 연동 전 약도예요. 마커는 위치 관계만 보여줘요.</div></div>' +
      '<h3 class="section">코스 요약</h3>' +
      st.items.map((it, i) => '<div class="route"><span class="name">' + (i + 1) + '. ' + esc(it.name) + '</span><small>' + itemLabel(it, st) + '</small></div>').join('') +
      '<p class="para">예상 도보 시간: ' + (st.moveMin ? '약 ' + fmtMin(st.moveMin) + ' (직선거리 기준 추정)' : '표시할 값이 없어요') + '<br>총 소요시간: ' +
      fmtMin(c.readingMinutes + st.walkTotal + (st.moveMin || 0)) + ' (체류 ' + fmtMin(c.readingMinutes + st.walkTotal) + (st.moveMin ? ' + 이동 약 ' + fmtMin(st.moveMin) : '') + ')</p>' +
      (savedView ? '' : visHTML(c)) + mapReviewHTML(c) + '</div>' +
      (me() ? (savedView ? savedViewButtonsHTML(c) : c.srcId && !c.id ? sharedViewButtonsHTML(c) : saveButtonsHTML(c, true)) : '');
    $('[data-screen="map"]').classList.add('has-sticky');
  }
  /* 저장했거나 따라가 보는 코스에서: 다녀왔다면 바로 후기로 */
  function mapReviewHTML(c) {
    if ((!c.id && !c.srcId) || !getStore(c.storeId) || hasReview(c.storeId)) return '';
    if (!me()) return '';
    return '<div class="nudge"><b>이 코스를 다녀오셨나요?</b><small>다녀온 책방의 후기를 체크로 간단히 남겨 주세요.</small>' +
      '<div class="nudge-acts"><button type="button" class="btn sm" data-action="reviewFor" data-id="' + c.storeId + '" data-course="' + (c.id || c.srcId) + '">후기 쓰기</button></div></div>';
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
      '<p class="para">책방 1곳 · 산책 장소 ' + st.walkCount + '곳 · 기타 ' + (n - 1 - st.walkCount) + '곳<br>독서 ' + fmtMin(c.readingMinutes) + ' · 산책 ' + fmtMin(st.walkTotal) + '<br>도보 시간: ' + (st.moveMin ? '약 ' + fmtMin(st.moveMin) + ' (추정)' : '확인 필요') + '</p>' +
      visHTML(c) +
      saveButtonsHTML(c, false);
    $('[data-screen="edit"]').classList.add('has-sticky');
  }
  /* 코스 저장
     - 기본: 새 코스는 추가하고, 내가 만든 코스는 덮어써요 (Ctrl+S)
     - opts.asNew: 항상 새 코스로 따로 저장해요 (Ctrl+Shift+S) — 이름·공개 여부는 opts로 받아요.
       새 코스에는 원본 작성자 표시(srcId·from)를 붙이지 않아서 '공개/비공개' 코스로 보여요. */
  function saveCourse(opts) {
    opts = opts || {};
    const c = state.course;
    const s = getStore(c.storeId);
    if (!s || !c.order.length) return;
    /* 공유 코스는 덮어쓰지 않고 항상 새 코스로 저장 */
    if (courseKind(c) === 'shared' && !opts.asNew) { openSaveAsSheet(); return; }
    const all = db.get(KEY.courses, []);
    let id = c.id;
    if (opts.asNew || !id) {
      id = 'c' + Date.now();
      while (all.some((x) => x.id === id)) id += 'x';
    }
    const rawTitle = opts.asNew ? opts.title : c.title;
    const vis = opts.asNew ? opts.visibility : c.visibility;
    const rec = {
      id: id,
      title: String(rawTitle || '').trim() || defaultCourseTitle(c),
      bookstoreId: s.id, includeWalk: c.includeWalk, walkMinutes: c.walkMinutes,
      readingMinutes: c.readingMinutes, order: c.order.slice(), createdAt: todayStr(),
      visibility: vis === 'public' ? 'public' : 'private'
    };
    const prevRec = all.find((x) => x.id === rec.id);
    if (prevRec && prevRec.nudgeOff) rec.nudgeOff = true;
    const i = all.findIndex((x) => x.id === rec.id);
    if (i >= 0) all[i] = rec; else all.push(rec);
    db.set(KEY.courses, all);
    /* 저장한 코스가 지금 코스가 돼요 — 저장 후 뒤로 가도 '내 코스' 버튼(저장하기·새 코스로 저장하기)이 보여요 */
    c.id = rec.id;
    c.title = rec.title;
    c.visibility = rec.visibility;
    if (opts.asNew) { delete c.srcId; delete c.from; }
    state.lastCourseTitle = rec.title;
    state.lastCourseVis = rec.visibility;
    go('done-course');
  }
  /* 저장한 코스를 고쳐서 새 코스로 저장할 때 이름을 그대로 두면 원래 코스와 헷갈리니까 '기존 코스 이름 수정'으로 */
  function copyTitle(c) {
    const base = String(c.title || '').trim() || defaultCourseTitle(c);
    return base.slice(0, COURSE_TITLE_MAX - 3) + ' 수정';
  }
  /* '새 코스로 저장하기': 코스 이름과 공개 여부를 고른 뒤 새 코스로 저장 */
  function openSaveAsSheet() {
    const c = state.course;
    if (!getStore(c.storeId) || !c.order.length) return;
    const v = c.visibility === 'public' ? 'public' : 'private';
    const renamed = c.id ? copyTitle(c) : '';
    const pill = (val, label) => '<label class="chk"><input type="radio" name="sa-vis" value="' + val + '"' + (v === val ? ' checked' : '') + '><span>' + label + '</span></label>';
    openSheet('새 코스로 저장',
      '<form id="saveAsForm">' +
      '<label class="section first" for="saveAsTitle">코스 이름 <small class="muted">(선택)</small></label>' +
      '<input type="text" class="fld" id="saveAsTitle" maxlength="' + COURSE_TITLE_MAX + '" value="' + esc(c.title || '') + '" placeholder="' + esc(renamed || defaultCourseTitle(c)) + '" autocomplete="off">' +
      (renamed
        ? '<p class="para">이름을 바꾸지 않거나 비워 두면 “' + esc(renamed) + '”(으)로 저장돼요.</p>'
        : '<p class="para">비워 두면 “' + esc(defaultCourseTitle(c)) + '”처럼 자동으로 정해져요.</p>') +
      '<h3 class="section">코스 공개 설정</h3>' +
      '<div class="chips">' + pill('private', '비공개') + pill('public', '공개') + '</div>' +
      '<p class="para">공개로 저장하면 전체 코스 목록에 올라가 다른 사용자도 볼 수 있어요. 비공개는 나만 볼 수 있어요.</p>' +
      '<div class="sheet-foot"><div class="btn-row">' +
      '<button type="button" class="btn light" data-action="closeSheet">취소</button>' +
      '<button type="submit" class="btn">저장</button></div></div>' +
      '</form>');
  }
  function renderDoneCourse() {
    $('#doneCourseBody').innerHTML =
      '<div class="state"><div class="icon">✓</div><h3>나만의 코스를 저장했어요</h3><p>' + esc(state.lastCourseTitle || '') + '<br>' + (state.lastCourseVis === 'public' ? '공개 코스로 저장했어요. 전체 코스 목록에서 볼 수 있어요.' : '저장한 코스에서 다시 열 수 있어요.') + '</p></div>' +
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
    const p = getPrefs();
    const group = (title, name, opts, sel) => '<h3 class="section">' + title + '</h3><div class="chips">' +
      opts.map((o) => '<label class="chk"><input type="checkbox" name="' + name + '" value="' + esc(o) + '"' + (sel.includes(o) ? ' checked' : '') + '><span>' + esc(o) + '</span></label>').join('') + '</div>';
    box.innerHTML =
      group('선호하는 책 분야', 'pcategory', filterOptions('category'), p.category).replace('section"', 'section first"') +
      group('원하는 공간 분위기', 'pmood', filterOptions('mood'), p.mood) +
      group('시설', 'pfacility', filterOptions('facility'), p.facility) +
      '<button type="button" class="btn" data-action="savePrefs">취향 저장 및 추천 보기</button>' +
      '<div id="tasteResult">' + tasteResultHTML(p) + '</div>';
  }
  function matchCount(s, p) {
    return s.categories.filter((x) => p.category.includes(x)).length +
      reviewMoodValues(s.id).filter((x) => p.mood.includes(x)).length +
      facilityValues(s).filter((x) => p.facility.includes(x)).length;
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
    setPrefs(p);
    /* 저장하면 홈으로 — 눌렀던 자리(내 취향 맞춤 추천)로 스크롤을 되돌려서 바뀐 추천을 바로 볼 수 있어요 */
    go('home', { reset: true, restore: true });
    toast('취향을 저장했어요.');
  }

  /* ---------- 회원가입 2단계 · 내 정보 설정 ---------- */
  function regionSelectHTML(id, sel, emptyLabel) {
    const opts = filterOptions('region');
    const groups = {};
    opts.forEach((o) => { const k = o.split(' ')[0]; (groups[k] = groups[k] || []).push(o); });
    const stray = sel && !opts.includes(sel) ? '<option value="' + esc(sel) + '" selected>' + esc(sel) + '</option>' : '';
    return '<select class="fld" id="' + id + '" name="region"><option value="">' + esc(emptyLabel || '선택 안 함') + '</option>' + stray +
      Object.keys(groups).map((k) => '<optgroup label="' + esc(k) + '">' + groups[k].map((o) =>
        '<option value="' + esc(o) + '"' + (o === sel ? ' selected' : '') + '>' + esc(o.slice(k.length).trim() || o) + '</option>').join('') + '</optgroup>').join('') + '</select>';
  }
  function tasteFieldsHTML(p) {
    const defs = [['선호하는 책 분야', 'category', 'fcat'], ['원하는 공간 분위기', 'mood', 'fmood'], ['시설', 'facility', 'ffac']];
    return defs.map((d) => {
      const opts = filterOptions(d[1]);
      if (!opts.length) return '';
      return '<h3 class="section">' + d[0] + '</h3><div class="chips">' + opts.map((o) =>
        '<label class="chk"><input type="checkbox" name="' + d[2] + '" value="' + esc(o) + '"' + (p[d[1]].includes(o) ? ' checked' : '') + '><span>' + esc(o) + '</span></label>').join('') + '</div>';
    }).join('');
  }
  /* 닉네임 · 위치 · 취향 입력칸 (회원가입 2단계와 내 정보 설정에서 같이 써요) */
  function profileFieldsHTML(pre, a) {
    a = a || { nickname: '', region: '', prefs: null };
    return '<label class="fld-label" for="' + pre + 'Nick">닉네임</label>' +
      '<input class="fld" id="' + pre + 'Nick" name="nickname" maxlength="' + NICK_MAX + '" autocomplete="nickname" required placeholder="2~' + NICK_MAX + '자" value="' + esc(a.nickname) + '">' +
      '<label class="fld-label" for="' + pre + 'Region">위치</label>' + regionSelectHTML(pre + 'Region', a.region) +
      tasteFieldsHTML(normPrefs(a.prefs)) +
      '<p class="para">위치·취향은 책방 탐색에 미리 적용돼요. 맞는 책방이 없는 조건은 자동으로 빼고 보여드려요.</p>';
  }
  function readProfileForm(form) {
    const vals = (n) => Array.from(form.querySelectorAll('input[name="' + n + '"]:checked')).map((i) => i.value);
    return { nickname: form.nickname.value.trim(), region: form.region.value, prefs: { category: vals('fcat'), mood: vals('fmood'), facility: vals('ffac') } };
  }
  function renderSignup() {
    const box = $('#signupBody');
    if (!state.signup) {
      box.innerHTML = '<div class="state"><p>가입 정보가 없어요.<br>아이디와 비밀번호부터 입력해 주세요.</p><button type="button" class="btn" data-action="openAuth">로그인 / 회원가입</button></div>';
      return;
    }
    if (state.status === 'loading') { needReady(box); return; }
    box.innerHTML = '<h2 class="form-head">프로필 설정</h2>' +
      '<p class="para">아이디 <b>' + esc(state.signup.id) + '</b>(으)로 가입해요. 아래 내용은 나중에 내 정보 설정에서 바꿀 수 있어요.</p>' +
      (state.stores.length ? '' : '<p class="para">책방 데이터를 불러오지 못해 위치·취향은 나중에 설정할 수 있어요.</p>') +
      '<form id="signupForm">' + profileFieldsHTML('su', null) + '<div class="sticky"><button type="submit" class="btn">가입 완료</button></div></form>';
    $('[data-screen="signup"]').classList.add('has-sticky');
  }
  function renderProfile() {
    const box = $('#profileBody');
    const id = signedIn(), a = me();
    if (!a) {
      box.innerHTML = '<div class="state"><h3>내 정보 설정</h3><p>로그인한 뒤 이용할 수 있어요.</p><button type="button" class="btn" data-action="openAuth">로그인 / 회원가입</button></div>';
      return;
    }
    if (state.status === 'loading') { needReady(box); return; }
    box.innerHTML = '<form id="profileForm">' +
      '<label class="fld-label" for="pfId">아이디</label><input class="fld" id="pfId" value="' + esc(id) + '" readonly aria-readonly="true">' +
      profileFieldsHTML('pf', a) +
      '<h3 class="section">계정 관리</h3>' +
      '<button type="button" class="btn light" data-action="signOut">로그아웃</button>' +
      '<button type="button" class="btn danger" data-action="deleteAccount">회원 탈퇴</button>' +
      '<div class="sticky"><button type="submit" class="btn">저장</button></div></form>';
    $('[data-screen="profile"]').classList.add('has-sticky');
  }

  /* ---------- 더보기 메뉴 ---------- */
  /* 저장된 값이 없으면(자동) 시스템 설정을 따르므로, 지금 실제로 적용 중인 모드를 돌려줘요 */
  function effectiveTheme() {
    const t = settings().theme;
    if (t === 'light' || t === 'dark') return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function menuHTML() {
    const rec = recent().slice(0, 3).map(getStore).filter(Boolean);
    const cur = effectiveTheme();
    return '<div class="menu-sec"><h4>화면 모드</h4><div class="seg" role="group" aria-label="화면 모드">' +
      [['light', '라이트 모드'], ['dark', '다크 모드']].map(([v, label]) =>
        '<button type="button" data-action="setTheme" data-v="' + v + '" aria-pressed="' + (cur === v) + '">' + label + '</button>').join('') +
      '</div></div>' +
      '<div class="menu-sec"><h4>나의 활동</h4><div class="all-menu-links">' +
      '<button type="button" data-action="menuMyTab" data-tab="fav">즐겨찾기한 책방</button>' +
      '<button type="button" data-action="menuMyTab" data-tab="courses">저장 코스</button>' +
      '<button type="button" data-action="menuMyTab" data-tab="reviews">나의 후기</button>' +
      '</div></div>' +
      (rec.length ? '<div class="menu-sec"><h4>최근 본 책방</h4>' +
      rec.map((r) => '<button type="button" class="recent-item" data-action="openDetail" data-id="' + r.id + '"><span>' + esc(r.title) + '</span><small>' + esc(r.district) + '</small></button>').join('') + '</div>' : '') +
      '<div class="menu-sec"><details class="help"><summary>이용 안내</summary><ul>' +
      '<li>책방 카드의 ☆를 누르면 즐겨찾기에 저장돼요.</li>' +
      '<li>코스를 만들고 저장하거나 방문 기록을 남길 수 있어요.</li>' +
      '</ul></details></div>' +
      (signedIn() ? '<div class="menu-sec"><button type="button" class="btn light" data-action="openProfile">내 정보 설정</button><button type="button" class="btn light" data-action="signOut">로그아웃</button></div>' : '');
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
      .map((x) => ({ reviewId: str(x.reviewId) || 'r' + Date.now(), bookstoreId: x.bookstoreId, tags: strs(x.tags), comment: str(x.comment).slice(0, 80), date: str(x.date), courseId: str(x.courseId) || undefined, nickname: str(x.nickname) || undefined, visit: Number(x.visit) >= 1 ? Math.floor(Number(x.visit)) : undefined }));
    out[KEY.courses] = arr(d[KEY.courses]).filter((x) => x && typeof x.id === 'string' && typeof x.bookstoreId === 'string' && Array.isArray(x.order))
      .map((x) => ({
        id: x.id, title: str(x.title), bookstoreId: x.bookstoreId, includeWalk: !!x.includeWalk,
        walkMinutes: Number(x.walkMinutes) || 20, readingMinutes: Number(x.readingMinutes) || 60,
        order: x.order.filter((o) => typeof o === 'string' && /^[SP]:/.test(o)), createdAt: str(x.createdAt),
        visibility: x.visibility === 'public' && !x.srcId ? 'public' : 'private',
        srcId: str(x.srcId) || undefined, from: str(x.from) || undefined, nudgeOff: x.nudgeOff ? true : undefined
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
    goHome() { homePicks = []; closeSheet(); go('home', {reset:true}); },
    openMenu() { openSheet('메뉴', menuHTML()); },
    menuMyTab(el) { state.tab = el.dataset.tab; closeSheet(); navTo('my'); },
    headerAccount() { closeSheet(); if (!signedIn()) { go('auth'); return; } toggleAccountMenu(); },
    openAuth() { closeSheet(); go('auth'); },
    openProfile() { closeAccountMenu(); closeSheet(); go('profile'); },
    signOut() {
      sessionStorage.removeItem(AUTH_SESSION);
      closeAccountMenu(); closeSheet();
      state.preset = null;
      go('home', { reset: true });
      toast('로그아웃했어요.');
    },
    deleteAccount() {
      const id = signedIn();
      if (!id) return;
      confirmSheet('회원 탈퇴',
        '아이디 <b>' + esc(id) + '</b> 계정과 닉네임·위치·취향 설정이 삭제돼요.<br><span class="muted">즐겨찾기·방문 기록·저장 코스는 이 기기에 그대로 남아 있어요. 탈퇴하면 되돌릴 수 없어요.</span>',
        '탈퇴하기', () => {
          const all = accounts();
          delete all[id];
          db.set(ACCOUNTS_KEY, all);
          sessionStorage.removeItem(AUTH_SESSION);
          state.preset = null;
          go('home', { reset: true });
          toast('탈퇴했어요. 이용해 주셔서 감사해요.');
        });
    },
    confirmOk() { const f = pendingConfirm; closeSheet(); if (f) f(); },
    setFs(el) { db.set(KEY.settings, Object.assign(settings(), { fs: el.dataset.v })); applySettings(); refreshMenu(); },
    setTheme(el) {
      const v = el.dataset.v;
      if (v !== 'light' && v !== 'dark') return;
      db.set(KEY.settings, Object.assign(settings(), { theme: v }));
      applySettings(); refreshMenu();
      /* 메뉴를 다시 그리면 포커스가 사라지므로 방금 누른 버튼으로 되돌려 둠 */
      const b = $('#sheetBody [data-action="setTheme"][data-v="' + v + '"]');
      if (b) b.focus();
    },
    heroBookstore() {
      const store = state.stores.find((s) => s.title === '모즈나');
      if (store) showDetail(store.id);
      else toast('책방 정보를 찾지 못했어요.');
    },
    refreshHomePicks() {
      if (state.status !== 'ready') return;
      pickHomeStores(); renderHome();
    },
    randomStore() {
      if (state.status !== 'ready') { toast('책방 정보를 불러오는 중이에요.'); return; }
      const seen = recent();
      let pool = state.stores.filter((s) => !seen.includes(s.id));
      if (!pool.length) pool = state.stores;
      const s = pool[Math.floor(Math.random() * pool.length)];
      closeSheet(); showDetail(s.id); toast('오늘의 책방: ' + s.title);
    },
    removeRecent(el) {
      const id = el.dataset.id;
      db.set(KEY.recent, db.get(KEY.recent, []).filter((x) => x !== id));
      renderHome();
      toast('최근 본 책방에서 삭제했어요.');
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
      const quickMap = { '혼자 가기': { key: 'facility', value: '혼자 가기' }, '좌석': { key: 'facility', value: '좌석' } };
      const filter = quickMap[el.dataset.value] || { key: el.dataset.key, value: el.dataset.value };
      state.applied = [filter];
      go('list');
    },
    openFilter(el) { openFilter(el.dataset.key); },
    applyFilter(el) {
      const key = el.dataset.key;
      const vals = key === 'region' ? pickedRegions('fopt') : $$('input[name="fopt"]:checked').map((i) => i.value);
      state.applied = state.applied.filter((a) => a.key !== key)
        .concat(vals.map((v) => ({ key: key, value: v })));
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
    openReviews() { state.reviewStoreId = state.currentId; state.reviewCtx = null; go('reviews'); },
    /* 책방 상세의 '책방 정보 / 줄글 후기' 탭 전환 — 다시 그린 뒤에도 키보드 포커스는 누른 탭에 둬요 */
    detailTab(el) {
      state.dtab = el.dataset.tab === 'comments' ? 'comments' : 'info';
      renderDetail();
      const b = $('#detailBody [role="tab"][data-tab="' + state.dtab + '"]');
      if (b) b.focus();
    },
    /* 어디서든 특정 책방(+다녀온 코스)의 후기 작성으로 */
    reviewFor(el) {
      const id = el.dataset.id;
      if (!getStore(id)) return;
      closeSheet();
      const cid = el.dataset.course;
      const cs = cid ? (db.get(KEY.courses, []).find((c) => c.id === cid) || state.shared.find((c) => c.id === cid)) : null;
      state.reviewStoreId = id;
      state.reviewCtx = cs ? { courseId: cid, title: cs.title } : null;
      go('reviews');
    },
    pickReviewStore: pickReviewStoreSheet,
    nudgeOff(el) {
      const all = db.get(KEY.courses, []);
      const c = all.find((x) => x.id === el.dataset.id);
      if (c) { c.nudgeOff = true; db.set(KEY.courses, all); }
      renderScreen(current);
    },
    delReview(el) {
      const id = el.dataset.id;
      confirmSheet('후기 삭제', '이 후기를 삭제할까요?', '삭제', () => {
        db.set(KEY.reviews, db.get(KEY.reviews, []).filter((r) => r.reviewId !== id));
        renderMy(); toast('후기를 삭제했어요.');
      });
    },
    toggleFav(el) { toggleFav(el.dataset.id); },
    cardFav(el) { toggleFav(el.dataset.id); },
    undoFav(el) { setFav(el.dataset.id, true); refreshFav(el.dataset.id); toast('즐겨찾기를 되돌렸어요.'); },
    copyAddr(el) { const s = getStore(el.dataset.id); if (s) copyText(s.address); },
    startCourse(el) { startCourse(el.dataset.id); },
    goMyFav() { state.tab = 'fav'; go('my'); },
    goCourseSaved() { state.ctab = 'saved'; go('course', { reset: true }); },
    courseTab(el) { state.ctab = el.dataset.tab; renderCourseHub(); },
    openCF(el) { openCF(el.dataset.key); },
    applyCF(el) {
      const f = state.cf, key = el.dataset.key, root = $('#sheetBody');
      const vals = (n) => Array.from(root.querySelectorAll('input[name="' + n + '"]:checked')).map((i) => i.value);
      if (key === 'region') f.regions = pickedRegions('cf-region');
      else if (key === 'walk') { f.walk = vals('cf-walk')[0] || 'any'; if (f.walk === 'no') f.walkMins = []; }
      else if (key === 'walkMin') f.walkMins = vals('cf-walkmin').map(Number);
      else if (key === 'readMin') f.readMins = vals('cf-readmin').map(Number);
      closeSheet(); renderCourseHub();
    },
    clearCF(el) {
      const f = state.cf, key = el.dataset.key;
      if (key === 'region') f.regions = [];
      else if (key === 'walk') f.walk = 'any';
      else if (key === 'walkMin') f.walkMins = [];
      else if (key === 'readMin') f.readMins = [];
      closeSheet(); renderCourseHub();
    },
    cfReset() { state.cf = blankCF(); state.cfPreset = null; closeSheet(); renderCourseHub(); },
    cfRemove(el) {
      const f = state.cf, k = el.dataset.k, v = el.dataset.v;
      if (k === 'q') f.q = '';
      else if (k === 'region') f.regions = f.regions.filter((r) => r !== v);
      else if (k === 'walk') f.walk = 'any';
      else if (k === 'walkMin') f.walkMins = f.walkMins.filter((m) => String(m) !== v);
      else if (k === 'readMin') f.readMins = f.readMins.filter((m) => String(m) !== v);
      renderCourseHub();
    },
    likeCourse(el) {
      const id = el.dataset.id, l = db.get(KEY.likes, []);
      db.set(KEY.likes, l.includes(id) ? l.filter((x) => x !== id) : l.concat(id));
      renderCourseHub();
    },
    takeCourse(el) {
      const x = state.shared.find((c) => c.id === el.dataset.id);
      if (!x) return;
      const all = db.get(KEY.courses, []);
      const had = all.findIndex((c) => c.srcId === x.id);
      if (had >= 0) {
        /* 이미 담은 코스를 다시 누르면 내 코스에서 빼요 */
        all.splice(had, 1);
        db.set(KEY.courses, all);
        current === 'map' ? renderMap() : renderCourseHub();
        toast('내 코스에서 뺐어요.');
        return;
      }
      all.push({
        id: 'c' + Date.now(), title: x.title, bookstoreId: x.bookstoreId, includeWalk: x.includeWalk, walkMinutes: x.walkMinutes,
        readingMinutes: x.readingMinutes, order: x.order.slice(), createdAt: todayStr(), visibility: 'private', srcId: x.id, from: x.author
      });
      db.set(KEY.courses, all);
      current === 'map' ? renderMap() : renderCourseHub();
      toast('내 코스에 담았어요.');
    },
    toggleVis(el) {
      const all = db.get(KEY.courses, []);
      const x = all.find((c) => c.id === el.dataset.id);
      if (!x || x.srcId) return;
      x.visibility = x.visibility === 'public' ? 'private' : 'public';
      db.set(KEY.courses, all);
      renderScreen(current);
      toast(x.visibility === 'public' ? '공개 코스로 바꿨어요. 전체 코스에 표시돼요.' : '비공개로 바꿨어요.');
    },
    setVis(el) { state.course.visibility = el.dataset.v; renderScreen(current); },
    myTab(el) { state.tab = el.dataset.tab; renderMy(); },
    unfav(el) {
      const id = el.dataset.id;
      if (!id) return;
      setFav(id, false); renderMy();
      toast('즐겨찾기에서 해제했어요.', { label: '실행 취소', action: 'undoFav', id: id });
    },
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
        id: own ? x.id : null, title: x.title || '', storeId: x.bookstoreId, includeWalk: x.includeWalk, walkMinutes: x.walkMinutes,
        readingMinutes: x.readingMinutes, order: x.order.slice(),
        visibility: own && x.visibility === 'public' ? 'public' : 'private',
        srcId: own ? x.srcId : x.id, from: own ? x.from : x.author,
        view: !!own && el.dataset.mode !== 'edit' /* 저장한 코스를 눌러 연 경우: 먼저 코스 소개 화면 */
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
    chooseStore(el) {
      /* 책방을 바꿔도 먼저 적어 둔 코스 이름은 유지 */
      const title = state.course.title;
      state.course = blankCourse(el.dataset.id);
      state.course.title = title;
      closeSheet(); renderSetup();
    },
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
    saveCourse() { saveCourse(); },
    saveAsNew: openSaveAsSheet,
    savePrefs: savePrefs
  };

  /* ---------- 이벤트 연결 ---------- */
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#accountMenu, #headerLogin')) closeAccountMenu();
    const nav = e.target.closest('[data-nav]');
    if (nav) { closeSheet(); navTo(nav.dataset.nav); return; }
    const g = e.target.closest('[data-go]');
    if (g) { g.dataset.go === 'course' ? navTo('course') : (g.dataset.go === 'list' ? navTo('list') : go(g.dataset.go)); return; }
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.closest('#toast')) $('#toast').classList.remove('show');
    const memberOnlyActions = ['toggleFav','cardFav','undoFav','startCourse','openReviews','reviewFor','pickReviewStore','delReview','likeCourse','takeCourse','saveCourse','saveAsNew','editCourse','moveItem','removeItem','addPlace','chooseAddPlace','chooseStore','setWalkOn','setWalkMin','setReadMin','makeCourse','toggleVis','nudgeOff'];
    if (memberOnlyActions.includes(el.dataset.action) && !requireMember()) return;
    const fn = actions[el.dataset.action];
    if (fn) fn(el, e);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#accountMenu').hidden) closeAccountMenu(true);
    else if (e.key === 'Escape' && !$('#sheetWrap').hidden) closeSheet();
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
    if (e.target.id === 'courseQuery') { state.cf.q = e.target.value; refreshCourseList(); return; }
    if (e.target.id === 'courseTitle') state.course.title = e.target.value;
    if (e.target.id === 'reviewComment') $('#rcount').textContent = e.target.value.length + '/80';
    if (e.target.id === 'reviewSearchQ') $('#reviewSearchList').innerHTML = reviewStoreListHTML(e.target.value);
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'authForm') {
      e.preventDefault();
      const form = e.target;
      const id = form.userId.value.trim().toLowerCase();
      const pw = form.password.value;
      const mode = e.submitter && e.submitter.value === 'signup' ? 'signup' : 'login';
      if (mode === 'signup') {
        /* 1단계: 아이디·비밀번호 확인 후 닉네임·위치·취향 설정 화면으로 */
        if (!ID_RE.test(id)) { toast('아이디는 영문·숫자 4~20자로 입력해 주세요.'); return; }
        if (!PW_RE.test(pw)) { toast('비밀번호는 영문·숫자를 포함해 8자 이상 입력해 주세요.'); return; }
        if (getAccount(id)) { toast('이미 사용 중인 아이디예요.'); return; }
        state.signup = { id: id, pw: pw };
        go('signup');
        return;
      }
      const acc = getAccount(id);
      if (!acc || acc.pw !== pw) { toast('아이디 또는 비밀번호를 확인해 주세요.'); return; }
      sessionStorage.setItem(AUTH_SESSION, id);
      form.reset();
      go('home', { reset: true });
      toast('로그인했어요.');
      return;
    }
    if (e.target.id === 'signupForm') {
      e.preventDefault();
      const s = state.signup;
      if (!s) { go('auth'); return; }
      const f = readProfileForm(e.target);
      const err = nickError(f.nickname);
      if (err) { toast(err); return; }
      if (getAccount(s.id)) { toast('이미 사용 중인 아이디예요.'); return; }
      const all = accounts();
      all[s.id] = { pw: s.pw, nickname: f.nickname, region: f.region, prefs: f.prefs, createdAt: todayStr() };
      db.set(ACCOUNTS_KEY, all);
      if (!getAccount(s.id)) return; /* 저장 실패 시 db.set 이 안내를 띄워요 */
      sessionStorage.setItem(AUTH_SESSION, s.id);
      state.signup = null;
      $('#authForm').reset();
      go('home', { reset: true });
      toast('회원가입했어요. 환영해요, ' + f.nickname + '님!');
      return;
    }
    if (e.target.id === 'profileForm') {
      e.preventDefault();
      const id = signedIn();
      if (!id) { go('auth'); return; }
      const f = readProfileForm(e.target);
      const err = nickError(f.nickname);
      if (err) { toast(err); return; }
      const all = accounts();
      all[id] = Object.assign({}, all[id], { nickname: f.nickname, region: f.region, prefs: f.prefs });
      db.set(ACCOUNTS_KEY, all);
      syncAuthUI();
      toast('내 정보를 저장했어요.');
      return;
    }
    if (e.target.id === 'saveAsForm') {
      e.preventDefault();
      const form = e.target;
      const checked = form.querySelector('input[name="sa-vis"]:checked');
      let newTitle = form.querySelector('#saveAsTitle').value.trim();
      const cur = state.course;
      if (cur.id && (!newTitle || newTitle === String(cur.title || '').trim())) newTitle = copyTitle(cur);
      const opts = { asNew: true, title: newTitle, visibility: checked && checked.value === 'public' ? 'public' : 'private' };
      closeSheet();
      saveCourse(opts);
      return;
    }
    if (e.target.id === 'reviewForm') { e.preventDefault(); submitReview(); }
  });
  /* 지역 목록: 시·도를 누르면 아래 시·군·구가 모두 선택·해제되고, 시·군·구를 바꾸면 시·도 선택도 맞춰져요 */
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.dataset || !t.dataset.role || !t.closest('#sheetBody')) return;
    const same = Array.from(t.closest('#sheetBody').querySelectorAll('input[data-prov]')).filter((i) => i.dataset.prov === t.dataset.prov);
    const kids = same.filter((i) => i.dataset.role === 'child'), par = same.find((i) => i.dataset.role === 'parent');
    if (t.dataset.role === 'parent') kids.forEach((i) => { i.checked = t.checked; });
    else if (par) par.checked = kids.every((i) => i.checked);
  });
  /* 코스 화면의 정렬(이름순·인기순·최신순): 고르면 바로 목록에 반영 */
  document.addEventListener('change', (e) => {
    if (e.target.id === 'courseSort') { state.psort = e.target.value === 'name' ? '' : e.target.value; refreshCourseList(); }
  });
  /* 코스 필터: '산책 포함하지 않음'을 고르면 산책 시간 선택은 잠가요 */
  document.addEventListener('change', (e) => {
    if (e.target.name === 'rtag') { syncReviewGroups(); return; }
    if (e.target.name === 'cf-sort' && e.target.checked) {
      $$('input[name="cf-sort"]').forEach((i) => { if (i !== e.target) i.checked = false; });
      return;
    }
    if (e.target.name !== 'cf-walk') return;
    const off = e.target.value === 'no';
    $$('input[name="cf-walkmin"]').forEach((i) => { i.disabled = off; if (off) i.checked = false; });
  });

  /* ---------- 시작 ---------- */
  applySettings();
  go('home', { reset: true });
  load();
})();

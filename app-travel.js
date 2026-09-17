// ---- storage keys ----
const LS_TRAVEL = 'coupleLog.travel.v1';
const LS_ACTIVE_TRIP = 'coupleLog.travel.activeTrip.v1';
const LS_SEEDED = 'coupleLog.travel.seeded.v1';

const DAY_MS = 86400000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MAX_IMAGE_CHARS = 480000; // data URL 문자 수 상한 (약 350KB 사진)

// ---- 일정 분류 (원래 웹의 lib/constants/itemCategory.ts 와 동일) ----
const CATEGORIES = [
  { value: 'flight', label: '비행기 이동', icon: '✈️' },
  { value: 'car', label: '차량 이동', icon: '🚗' },
  { value: 'lodging', label: '숙소', icon: '🏨' },
  { value: 'food', label: '식사', icon: '🍽️' },
  { value: 'sightseeing', label: '관광', icon: '📸' },
  { value: 'shopping', label: '쇼핑', icon: '🛍️' },
  { value: 'etc', label: '기타', icon: '📌' },
];
function categoryInfo(value) {
  return CATEGORIES.find((c) => c.value === value) || null;
}

// 원래 웹의 표에서 시간을 두 개의 select(시/분, 5분 단위)로 고릅니다.
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

// 동선 지도에서 일차마다 다른 색을 씁니다 (원래 웹과 같은 색 목록).
const DAY_COLORS = ['#0EA5E9', '#F59E0B', '#10B981', '#8B5CF6', '#EF4444', '#EC4899', '#14B8A6', '#F97316'];

// ---- state ----
// travel = { trips, items, flights, stays, checks, summaries, currency }  (모두 평평한 목록, 각 행에 tripId)
function emptyTravel() {
  return { trips: [], items: [], flights: [], stays: [], checks: [], summaries: [], currency: [] };
}

/** 환전액 한 줄(통화 이름 + 필요 자금 + 준비한 금액). */
function normalizeCurrencyItem(c) {
  return {
    id: c.id,
    tripId: c.tripId,
    name: c.name || '',
    needed: typeof c.needed === 'number' ? c.needed : Number(c.needed) || 0,
    prepared: typeof c.prepared === 'number' ? c.prepared : Number(c.prepared) || 0,
    updatedAt: c.updatedAt || Date.now(),
  };
}

/** att 는 늘 3칸(첨부 1/2/3)을 유지합니다. */
function normalizeItem(item) {
  const src = Array.isArray(item.att) ? item.att : [];
  const att = [];
  for (let i = 0; i < 3; i += 1) {
    const a = src[i] || {};
    att.push({ text: a.text || '', image: a.image || '' });
  }
  return {
    id: item.id,
    tripId: item.tripId,
    day: Number(item.day) || 1,
    date: item.date || '',
    time: item.time || '',
    category: item.category || '',
    schedule: item.schedule || '',
    location: item.location || '',
    lat: typeof item.lat === 'number' ? item.lat : null,
    lng: typeof item.lng === 'number' ? item.lng : null,
    att,
    order: typeof item.order === 'number' ? item.order : 0,
    updatedAt: item.updatedAt || Date.now(),
  };
}

function normalizeTravel(raw) {
  const t = raw && typeof raw === 'object' ? raw : {};
  return {
    trips: Array.isArray(t.trips) ? t.trips : [],
    items: (Array.isArray(t.items) ? t.items : []).map(normalizeItem),
    flights: Array.isArray(t.flights) ? t.flights : [],
    stays: Array.isArray(t.stays) ? t.stays : [],
    checks: Array.isArray(t.checks) ? t.checks : [],
    summaries: Array.isArray(t.summaries) ? t.summaries : [],
    currency: (Array.isArray(t.currency) ? t.currency : []).map(normalizeCurrencyItem),
  };
}

function loadTravel() {
  try {
    const raw = localStorage.getItem(LS_TRAVEL);
    return normalizeTravel(raw ? JSON.parse(raw) : null);
  } catch (e) {
    return emptyTravel();
  }
}
function saveTravel() {
  localStorage.setItem(LS_TRAVEL, JSON.stringify(travel));
  if (window.CampSync) window.CampSync.schedulePush();
}

let travel = loadTravel();
let activeTripId = localStorage.getItem(LS_ACTIVE_TRIP) || null;

/**
 * travel-journal 웹에서 옮겨온 첫 자료를 한 번만 넣습니다.
 * 이미 기록이 있으면(다른 기기에서 먼저 썼거나, 이미 한 번 들어왔으면) 건드리지 않습니다.
 *
 * '불러왔음' 표시(LS_SEEDED)는 실제로 데이터를 넣은 뒤에만 남깁니다.
 * 예전에는 이 표시를 맨 앞에서 먼저 남겼는데, 그 사이 travel-seed.js
 * 가 아직 안 떠서 window.TRAVEL_SEED 가 비어 있으면(서비스워커 갱신
 * 직후 새로고침 같은 때) 다시는 시도하지 않고 빈 상태로 영영 굳어
 * 버리는 문제가 있었습니다.
 */
function maybeImportSeed() {
  if (localStorage.getItem(LS_SEEDED)) return false;
  if (travel.trips.length > 0) { localStorage.setItem(LS_SEEDED, '1'); return false; }
  const seed = window.TRAVEL_SEED;
  if (!seed || !Array.isArray(seed.trips) || seed.trips.length === 0) return false;

  localStorage.setItem(LS_SEEDED, '1');
  travel = normalizeTravel(JSON.parse(JSON.stringify(seed)));
  saveTravel();
  return true;
}

// ---- helpers ----
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// 'YYYY-MM-DD' 를 표준시에 흔들리지 않게 다룹니다.
function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function toISO(utcMs) {
  return new Date(utcMs).toISOString().slice(0, 10);
}
function todayISO() {
  const now = new Date();
  return toISO(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}
function addDaysISO(iso, n) {
  return toISO(toUTC(iso) + n * DAY_MS);
}
function nightsOf(trip) {
  return Math.round((toUTC(trip.end) - toUTC(trip.start)) / DAY_MS);
}
// 원래 웹(src/lib/utils/date.ts)과 같은 표기 규칙입니다.
function formatDisplayDate(iso) {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${y}.${m}.${d}`;
}
function formatMonthDay(iso) {
  const [, m, d] = iso.split('-');
  if (!m || !d) return iso;
  return `${Number(m)}월 ${Number(d)}일`;
}
function toKoreanWeekday(iso) {
  return `${WEEKDAYS[new Date(toUTC(iso)).getUTCDay()]}요일`;
}
function tripDates(trip) {
  const out = [];
  const total = Math.max(0, nightsOf(trip));
  for (let i = 0; i <= total; i += 1) out.push(addDaysISO(trip.start, i));
  return out;
}
/** [start, end] 구간(양끝 포함)에 date 가 들어가는지. */
function isDateWithinRange(date, start, end) {
  return date >= start && date <= end;
}

function sortedTrips() {
  return [...travel.trips].sort((a, b) => a.start.localeCompare(b.start));
}
function getActiveTrip() {
  return travel.trips.find((t) => t.id === activeTripId) || null;
}
function setActiveTrip(id) {
  activeTripId = id;
  if (id) localStorage.setItem(LS_ACTIVE_TRIP, id);
  else localStorage.removeItem(LS_ACTIVE_TRIP);
}

function itemsOfTrip(tripId) {
  return travel.items.filter((i) => i.tripId === tripId);
}
function itemsOfDay(tripId, day) {
  return itemsOfTrip(tripId).filter((i) => i.day === day).sort((a, b) => a.order - b.order);
}
function flightsOfTrip(tripId) {
  return travel.flights.filter((f) => f.tripId === tripId).sort((a, b) => a.depDate.localeCompare(b.depDate));
}
function staysOfTrip(tripId) {
  return travel.stays.filter((s) => s.tripId === tripId).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
}
function checksOfTrip(tripId) {
  return travel.checks.filter((c) => c.tripId === tripId);
}
function currencyOfTrip(tripId) {
  return travel.currency.filter((c) => c.tripId === tripId);
}
function summaryOf(tripId, day) {
  return travel.summaries.find((s) => s.tripId === tripId && s.day === day) || null;
}

/** 체크인 당일은 "[체크인] 이름", 체크아웃 당일은 "[체크아웃] 이름"으로. (원래 웹과 동일) */
function accommodationLabelFor(date, acc) {
  const isIn = date === acc.checkIn;
  const isOut = date === acc.checkOut;
  if (isIn && isOut) return `[체크인·체크아웃] ${acc.name}`;
  if (isIn) return `[체크인] ${acc.name}`;
  if (isOut) return `[체크아웃] ${acc.name}`;
  return acc.name;
}

/** 구글 지도 검색 딥링크 (별도 화면 없이 위치만 열 때 씁니다). */
function itemMapUrl(item) {
  if (typeof item.lat === 'number' && typeof item.lng === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`;
  }
  if (item.location) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`;
  }
  return null;
}

function reorderDay(orderedIds) {
  const now = Date.now();
  orderedIds.forEach((id, idx) => {
    const item = travel.items.find((i) => i.id === id);
    if (item) { item.order = idx; item.updatedAt = now; }
  });
  saveTravel();
}

/* ===========================================================
   렌더링
   =========================================================== */

function renderAll() {
  renderTripTabs();
  renderPanel();
}

/* ---- 여행 탭 (이름 변경은 탭 안에서 바로, 메뉴는 ⋯) ---- */
function renderTripTabs() {
  const nav = document.getElementById('tripTabs');
  nav.innerHTML = '';

  sortedTrips().forEach((trip) => {
    nav.appendChild(buildTripTab(trip));
  });

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'add-trip-pill';
  addBtn.textContent = '+ 새 여행';
  addBtn.addEventListener('click', () => openModal(buildNewTripDialog()));
  nav.appendChild(addBtn);
}

function buildTripTab(trip) {
  const wrap = document.createElement('div');
  wrap.style.position = 'relative';

  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'trip-tab' + (trip.id === activeTripId ? ' active' : '');
  tab.style.paddingRight = '30px';

  const name = document.createElement('span');
  name.className = 'trip-tab-place';
  name.textContent = trip.name;
  const meta = document.createElement('span');
  meta.className = 'trip-tab-meta';
  meta.textContent = `${formatMonthDay(trip.start)} ~ ${formatMonthDay(trip.end)}`;
  tab.appendChild(name);
  tab.appendChild(meta);
  tab.addEventListener('click', () => { setActiveTrip(trip.id); renderAll(); });

  const menuBtn = document.createElement('button');
  menuBtn.type = 'button';
  menuBtn.setAttribute('aria-label', '여행 메뉴');
  menuBtn.textContent = '⋯';
  menuBtn.style.cssText = 'position:absolute;top:6px;right:8px;background:none;border:none;font-size:.85rem;cursor:pointer;padding:2px 4px;'
    + (trip.id === activeTripId ? 'color:#fff;' : 'color:var(--text-faint);');

  const menu = document.createElement('div');
  menu.className = 'modal-list-item';
  menu.style.cssText = 'position:absolute;top:100%;left:0;z-index:20;margin-top:4px;display:flex;flex-direction:column;gap:2px;padding:5px;width:auto;min-width:110px;';
  menu.classList.add('hidden');

  const renameBtn = document.createElement('button');
  renameBtn.type = 'button';
  renameBtn.className = 'modal-link-btn';
  renameBtn.textContent = '이름 변경';
  renameBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.add('hidden');
    startInlineRename(wrap, trip);
  });

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'modal-link-btn danger';
  delBtn.textContent = '삭제';
  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.add('hidden');
    deleteTrip(trip);
  });

  menu.appendChild(renameBtn);
  menu.appendChild(delBtn);

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.trip-tab-menu-open').forEach((m) => m.classList.add('hidden'));
    menu.classList.toggle('hidden');
  });
  menu.classList.add('trip-tab-menu-open');
  document.addEventListener('click', () => menu.classList.add('hidden'), { once: false });

  wrap.appendChild(tab);
  wrap.appendChild(menuBtn);
  wrap.appendChild(menu);
  return wrap;
}

/** 탭을 이름 입력칸으로 바꿔서 그 자리에서 이름을 고칩니다 (원래 웹과 동일). */
function startInlineRename(wrap, trip) {
  wrap.innerHTML = '';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:6px;';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = trip.name;
  input.className = 'cell-input';
  input.style.cssText = 'width:140px;padding:8px;font-size:.85rem;';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'modal-link-btn';
  saveBtn.textContent = '저장';
  saveBtn.addEventListener('click', () => {
    const name = input.value.trim();
    if (!name) { showToast('여행 이름을 입력해주세요.'); return; }
    trip.name = name;
    trip.updatedAt = Date.now();
    saveTravel();
    renderAll();
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'modal-link-btn';
  cancelBtn.textContent = '취소';
  cancelBtn.addEventListener('click', () => renderAll());

  row.appendChild(input);
  row.appendChild(saveBtn);
  row.appendChild(cancelBtn);
  wrap.appendChild(row);
  input.focus();
}

function deleteTrip(trip) {
  if (!window.confirm('이 여행을 삭제할까요? 여행계획표도 함께 삭제됩니다.')) return;
  const id = trip.id;
  travel.trips = travel.trips.filter((t) => t.id !== id);
  travel.items = travel.items.filter((i) => i.tripId !== id);
  travel.flights = travel.flights.filter((f) => f.tripId !== id);
  travel.stays = travel.stays.filter((s) => s.tripId !== id);
  travel.checks = travel.checks.filter((c) => c.tripId !== id);
  travel.summaries = travel.summaries.filter((s) => s.tripId !== id);
  travel.currency = travel.currency.filter((c) => c.tripId !== id);
  saveTravel();
  setActiveTrip(travel.trips[0] ? sortedTrips()[0].id : null);
  renderAll();
}

/* ---- 메인 패널 : 툴바 → 일차요약(읽기전용) → 일정표 ---- */
function renderPanel() {
  const panel = document.getElementById('tripPanel');
  const empty = document.getElementById('emptyState');
  panel.innerHTML = '';

  const trip = getActiveTrip();
  if (!trip) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  panel.appendChild(buildToolbar(trip));

  const summaryStrip = buildSummaryStrip(trip);
  if (summaryStrip) panel.appendChild(summaryStrip);

  panel.appendChild(buildDayJumpNav(trip));
  tripDates(trip).forEach((iso, index) => {
    panel.appendChild(buildDaySection(trip, index + 1, iso));
  });
}

function buildToolbar(trip) {
  const bar = document.createElement('div');
  bar.className = 'trip-toolbar';

  const make = (label, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toolbar-btn';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  };

  bar.appendChild(make('+ 항공편', () => openModal(buildFlightDialog(trip))));
  bar.appendChild(make('+ 숙소', () => openModal(buildAccommodationDialog(trip))));
  bar.appendChild(make('체크리스트', () => openModal(buildChecklistDialog(trip))));
  bar.appendChild(make('🌐 동선', () => openModal(buildRouteMapDialog(trip))));
  let summaryBtn;
  summaryBtn = make('🤖 요약 확인', () => runSummaryCheckFromButton(trip, summaryBtn));
  bar.appendChild(summaryBtn);
  return bar;
}

/* ---- 일차별 요약 : 읽기 전용, AI 자동 생성(runSummaryCheck)이나 아래 배치가 채웁니다 ---- */
function buildSummaryStrip(trip) {
  const byDay = new Map(
    travel.summaries.filter((s) => s.tripId === trip.id).map((s) => [s.day, s])
  );
  const dates = tripDates(trip);

  const strip = document.createElement('div');
  strip.className = 'summary-strip';

  dates.forEach((iso, index) => {
    const day = index + 1;
    const s = byDay.get(day);
    const dayItems = itemsOfDay(trip.id, day);
    if (!s && dayItems.length === 0) return; // 일정도 없고 요약도 없으면 카드 자체를 안 보여줍니다.

    const card = document.createElement('a');
    card.className = 'summary-card';
    card.href = `#day-${day}`;

    const title = document.createElement('p');
    title.className = 'summary-card-title';
    title.textContent = `${day}일차 요약`;
    card.appendChild(title);

    const rows = [
      { label: '주요 동선', text: s ? s.route : '' },
      { label: '체크포인트', text: s ? s.points : '' },
    ];
    rows.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'summary-row';
      const label = document.createElement('span');
      label.className = 'summary-label';
      label.textContent = r.label;
      const text = document.createElement('p');
      text.className = 'summary-text';
      text.textContent = r.text || (s ? '-' : '아직 요약이 없어요');
      row.appendChild(label);
      row.appendChild(text);
      card.appendChild(row);
    });

    if (s && s.cautions) {
      const row = document.createElement('div');
      row.className = 'summary-row';
      const label = document.createElement('span');
      label.className = 'summary-label caution';
      label.textContent = '주의사항';
      const text = document.createElement('p');
      text.className = 'summary-text caution';
      text.textContent = s.cautions;
      row.appendChild(label);
      row.appendChild(text);
      card.appendChild(row);
    }

    strip.appendChild(card);
  });

  return strip.children.length ? strip : null;
}

/* ===========================================================
   일차 요약 자동 생성 — Supabase Edge Function(travel-summary)이
   Claude API를 호출해 mainRoute/checkpoints/cautions 를 만들어 줍니다.
   일자별로 하나씩 누르는 대신, 일정이 바뀐 날만 골라서 한 번에
   돌립니다(수동 버튼 + 1시간마다 자동 확인).
   =========================================================== */
const SUMMARY_FN_URL = 'https://ctjinobcioovomjoryjt.supabase.co/functions/v1/travel-summary';
const SUMMARY_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1시간

/** 요약이 아예 없거나, 그 날 일정 중 요약보다 나중에 바뀐 게 있으면 "바뀐 날"로 봅니다. */
function getStaleSummaryDays(trip) {
  const dates = tripDates(trip);
  const stale = [];
  dates.forEach((iso, index) => {
    const day = index + 1;
    const dayItems = itemsOfDay(trip.id, day);
    if (dayItems.length === 0) return;
    const maxItemUpdatedAt = Math.max(...dayItems.map((i) => i.updatedAt || 0));
    const summary = travel.summaries.find((s) => s.tripId === trip.id && s.day === day);
    if (!summary || maxItemUpdatedAt > (summary.updatedAt || 0)) stale.push(day);
  });
  return stale;
}

function fetchDaySummary(trip, day) {
  const dayItems = itemsOfDay(trip.id, day);
  return fetch(SUMMARY_FN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${window.CAMP_SUPABASE.anonKey}`,
      apikey: window.CAMP_SUPABASE.anonKey,
    },
    body: JSON.stringify({
      day,
      items: dayItems.map((i) => ({
        time: i.time, category: i.category, schedule: i.schedule, location: i.location,
      })),
    }),
  })
    .then((res) => res.json().catch(() => ({})).then((body) => ({ ok: res.ok, body })))
    .then(({ ok, body }) => {
      if (!ok || !body || !body.summary) throw new Error((body && body.error) || '요약 생성에 실패했어요.');
      return body.summary;
    });
}

function applyDaySummary(trip, day, summary) {
  const existing = travel.summaries.find((s) => s.tripId === trip.id && s.day === day);
  if (existing) {
    existing.route = summary.mainRoute || '';
    existing.points = summary.checkpoints || '';
    existing.cautions = summary.cautions || '';
    existing.updatedAt = Date.now();
  } else {
    travel.summaries.push({
      id: newId(), tripId: trip.id, day,
      route: summary.mainRoute || '', points: summary.checkpoints || '', cautions: summary.cautions || '',
      updatedAt: Date.now(),
    });
  }
}

/** 바뀐 일정이 있는 날만 골라 요약을 다시 만듭니다. 수동 버튼과 1시간 자동 확인이 둘 다 이 함수를 씁니다. */
async function runSummaryCheck(trip, options) {
  options = options || {};
  if (!window.CAMP_SUPABASE || !window.CAMP_SUPABASE.anonKey) {
    if (!options.silent) showToast('함께 쓰기 설정이 안 되어 있어서 자동 요약을 쓸 수 없어요.');
    return;
  }
  const stale = getStaleSummaryDays(trip);
  if (stale.length === 0) {
    if (!options.silent) showToast('바뀐 일정이 없어요. 요약은 이미 최신이에요.');
    return;
  }

  const succeeded = [];
  const failed = [];
  for (const day of stale) {
    try {
      const summary = await fetchDaySummary(trip, day);
      applyDaySummary(trip, day, summary);
      succeeded.push(day);
    } catch (err) {
      failed.push(day);
    }
  }

  if (succeeded.length) { saveTravel(); renderPanel(); }

  if (succeeded.length && !failed.length) {
    showToast(`${succeeded.join(', ')}일차 요약을 새로 만들었어요`);
  } else if (succeeded.length && failed.length) {
    showToast(`${succeeded.join(', ')}일차는 새로 만들고, ${failed.join(', ')}일차는 실패했어요`);
  } else if (!options.silent) {
    showToast('요약 생성에 실패했어요.');
  }
}

function runSummaryCheckFromButton(trip, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '확인 중...';
  runSummaryCheck(trip, { silent: false }).finally(() => {
    btn.disabled = false;
    btn.textContent = original;
  });
}

function buildDayJumpNav(trip) {
  const dates = tripDates(trip);
  const nav = document.createElement('nav');
  nav.className = 'day-jump-nav';
  if (dates.length <= 1) nav.classList.add('hidden');
  dates.forEach((_, index) => {
    const link = document.createElement('a');
    link.className = 'day-jump-link';
    link.href = `#day-${index + 1}`;
    link.textContent = `${index + 1}일차`;
    nav.appendChild(link);
  });
  return nav;
}

/* ---- 일차 섹션 (표) ---- */
function buildDaySection(trip, day, iso, initial) {
  const section = document.createElement('section');
  section.className = 'day-section';
  section.id = `day-${day}`;

  // '수정'/'+ 일정 추가' 로 켠 상태는 표를 통째로 다시 그릴 때(rerenderSection)
  // 그대로 이어받아야 합니다. 안 그러면 다시 그릴 때마다 읽기 모드로 되돌아갑니다.
  let manageMode = (initial && initial.manageMode) || false;
  let creating = (initial && initial.creating) || false;

  function rerenderSection() {
    const fresh = buildDaySection(trip, day, iso, { manageMode, creating });
    section.replaceWith(fresh);
  }

  // ---- 머리말 ----
  const head = document.createElement('div');
  head.className = 'day-section-head';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'day-title-group';
  const badge = document.createElement('span');
  badge.className = 'day-badge';
  badge.textContent = String(day);
  const titleText = document.createElement('div');
  titleText.className = 'day-title-text';
  const title = document.createElement('p');
  title.className = 'day-title';
  title.textContent = `${day}일차`;
  const meta = document.createElement('div');
  meta.className = 'day-meta';
  const dateEl = document.createElement('span');
  dateEl.className = 'day-meta-date';
  dateEl.textContent = `${formatDisplayDate(iso)} (${toKoreanWeekday(iso)})`;
  meta.appendChild(dateEl);

  const flightLabel = flightsOfTrip(trip.id)
    .filter((f) => isDateWithinRange(iso, f.depDate, f.arrDate))
    .map((f) => `${f.airline} ${f.code}`)
    .join(', ');
  if (flightLabel) {
    const pill = document.createElement('span');
    pill.className = 'day-pill flight';
    pill.textContent = `항공편: ${flightLabel}`;
    meta.appendChild(pill);
  }
  const stayLabel = staysOfTrip(trip.id)
    .filter((s) => isDateWithinRange(iso, s.checkIn, s.checkOut))
    .map((s) => accommodationLabelFor(iso, s))
    .join(', ');
  if (stayLabel) {
    const pill = document.createElement('span');
    pill.className = 'day-pill stay';
    pill.textContent = `숙소: ${stayLabel}`;
    meta.appendChild(pill);
  }

  titleText.appendChild(title);
  titleText.appendChild(meta);
  titleGroup.appendChild(badge);
  titleGroup.appendChild(titleText);

  const actions = document.createElement('div');
  actions.className = 'day-head-actions';

  const editToggle = document.createElement('button');
  editToggle.type = 'button';
  editToggle.className = 'day-btn' + (manageMode ? ' on' : '');
  editToggle.textContent = manageMode ? '완료' : '수정';
  editToggle.addEventListener('click', () => {
    if (manageMode) {
      saveTravel();
      manageMode = false;
    } else {
      manageMode = true;
      creating = false;
    }
    rerenderSection();
  });

  const addToggle = document.createElement('button');
  addToggle.type = 'button';
  addToggle.className = 'day-btn';
  addToggle.textContent = '+ 일정 추가';
  addToggle.classList.toggle('hidden', creating);
  addToggle.addEventListener('click', () => {
    creating = true;
    rerenderSection();
  });

  actions.appendChild(editToggle);
  actions.appendChild(addToggle);
  head.appendChild(titleGroup);
  head.appendChild(actions);
  section.appendChild(head);

  // ---- 표 ----
  const scroll = document.createElement('div');
  scroll.className = 'itinerary-scroll';
  const table = document.createElement('table');
  table.className = 'itinerary-table';

  const colgroup = document.createElement('colgroup');
  [60, 150, 90, 75, 75, 70].forEach((w) => {
    const col = document.createElement('col');
    col.style.width = `${w}px`;
    colgroup.appendChild(col);
  });
  if (manageMode || creating) {
    const col = document.createElement('col');
    col.style.width = '86px';
    colgroup.appendChild(col);
  }
  table.appendChild(colgroup);

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  [['시간', ''], ['일정', ''], ['위치', ''], ['별첨1', 'att1'], ['별첨2', 'att2'], ['별첨3', 'att3']].forEach(([label, cls]) => {
    const th = document.createElement('th');
    if (cls) th.className = cls;
    th.textContent = label;
    headRow.appendChild(th);
  });
  if (manageMode || creating) {
    const th = document.createElement('th');
    th.textContent = '작업';
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const dayItems = itemsOfDay(trip.id, day);

  if (dayItems.length === 0 && !creating) {
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    const td = document.createElement('td');
    td.colSpan = manageMode ? 7 : 6;
    td.textContent = '이 날의 일정이 없습니다.';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  dayItems.forEach((item) => {
    tbody.appendChild(
      manageMode
        ? buildEditableRow(trip, day, item, rerenderSection)
        : buildReadRow(item)
    );
  });

  if (creating) {
    tbody.appendChild(buildNewItemRow(trip, day, () => { creating = false; rerenderSection(); }));
  }

  table.appendChild(tbody);
  scroll.appendChild(table);
  section.appendChild(scroll);

  return section;
}

function buildReadRow(item) {
  const tr = document.createElement('tr');

  const timeTd = document.createElement('td');
  timeTd.textContent = item.time || '-';
  tr.appendChild(timeTd);

  const schedTd = document.createElement('td');
  if (item.schedule) {
    const cat = categoryInfo(item.category);
    if (cat) {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'item-cat-icon';
      iconSpan.textContent = cat.icon;
      schedTd.appendChild(iconSpan);
    }
    schedTd.appendChild(document.createTextNode(item.schedule));
  } else {
    const span = document.createElement('span');
    span.className = 'no-schedule';
    span.textContent = '(미정)';
    schedTd.appendChild(span);
  }
  tr.appendChild(schedTd);

  const locTd = document.createElement('td');
  locTd.textContent = item.location || '-';
  tr.appendChild(locTd);

  [1, 2, 3].forEach((slot) => {
    const att = item.att[slot - 1];
    const td = document.createElement('td');
    if (att.text) {
      const badge = document.createElement('span');
      badge.className = `att-badge att${slot}`;
      badge.textContent = att.text;
      td.appendChild(badge);
    }
    if (att.image) {
      const img = document.createElement('img');
      img.className = 'att-thumb';
      img.src = att.image;
      img.alt = att.text || '첨부 사진';
      img.addEventListener('click', () => openLightbox(att.image));
      td.appendChild(img);
    }
    if (!att.text && !att.image) td.textContent = '-';
    tr.appendChild(td);
  });

  return tr;
}

function buildTimeSelectPair(value, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'time-select-pair';
  const [h, m] = value ? value.split(':') : ['', ''];

  const hourSel = document.createElement('select');
  hourSel.className = 'time-select';
  hourSel.appendChild(new Option('--', ''));
  HOURS.forEach((hh) => hourSel.appendChild(new Option(`${hh}시`, hh)));
  hourSel.value = h || '';

  const minSel = document.createElement('select');
  minSel.className = 'time-select';
  MINUTES.forEach((mm) => minSel.appendChild(new Option(`${mm}분`, mm)));
  minSel.value = m || '00';
  minSel.disabled = !hourSel.value;

  hourSel.addEventListener('change', () => {
    minSel.disabled = !hourSel.value;
    onChange(hourSel.value ? `${hourSel.value}:${minSel.value || '00'}` : '');
  });
  minSel.addEventListener('change', () => {
    if (!hourSel.value) return;
    onChange(`${hourSel.value}:${minSel.value}`);
  });

  wrap.appendChild(hourSel);
  wrap.appendChild(minSel);
  return { el: wrap, get: () => (hourSel.value ? `${hourSel.value}:${minSel.value || '00'}` : '') };
}

/** 표 안에서 시간/분류+일정/위치/별첨 3칸을 채우는 입력 셀들을 만듭니다. */
function buildFieldCells(values, options) {
  const cells = [];

  const timeTd = document.createElement('td');
  const timeCtl = buildTimeSelectPair(values.time, (v) => { values.time = v; });
  timeTd.appendChild(timeCtl.el);
  cells.push(timeTd);

  const schedTd = document.createElement('td');
  const schedWrap = document.createElement('div');
  schedWrap.className = 'cat-schedule';
  const catSel = document.createElement('select');
  catSel.className = 'cat-select';
  catSel.appendChild(new Option('-', ''));
  CATEGORIES.forEach((c) => catSel.appendChild(new Option(`${c.icon}`, c.value)));
  catSel.value = values.category || '';
  catSel.title = '분류';
  catSel.addEventListener('change', () => { values.category = catSel.value; });
  const schedInput = document.createElement('input');
  schedInput.type = 'text';
  schedInput.className = 'cell-input';
  schedInput.value = values.schedule || '';
  schedInput.addEventListener('input', () => { values.schedule = schedInput.value; });
  schedWrap.appendChild(catSel);
  schedWrap.appendChild(schedInput);
  schedTd.appendChild(schedWrap);
  cells.push(schedTd);

  const locTd = document.createElement('td');
  const locWrap = document.createElement('div');
  locWrap.className = 'loc-field';
  const locInput = document.createElement('input');
  locInput.type = 'text';
  locInput.className = 'cell-input';
  locInput.placeholder = '위치';
  locInput.value = values.location || '';
  locInput.addEventListener('input', () => {
    values.location = locInput.value;
    // 직접 타이핑하면(장소 검색으로 고른 게 아니면) 좌표는 더 이상 못 믿으므로 비웁니다.
    values.lat = null;
    values.lng = null;
  });
  const searchBtn = document.createElement('button');
  searchBtn.type = 'button';
  searchBtn.className = 'loc-search-btn';
  searchBtn.textContent = '🔍';
  searchBtn.title = '장소 검색 (고르면 좌표까지 저장돼요)';
  searchBtn.addEventListener('click', () => {
    openModal(buildPlaceSearchDialog(({ label, lat, lng }) => {
      values.location = label || values.location;
      values.lat = lat;
      values.lng = lng;
      locInput.value = values.location;
      // '완료'로 저장되도록 change 를 흘려보냅니다. (input 이벤트로 보내면
      // 위 리스너가 좌표를 다시 지워버립니다)
      locInput.dispatchEvent(new Event('change', { bubbles: true }));
    }));
  });
  locWrap.appendChild(locInput);
  locWrap.appendChild(searchBtn);
  locTd.appendChild(locWrap);
  cells.push(locTd);

  [1, 2, 3].forEach((slot) => {
    const key = `att${slot}`;
    const td = document.createElement('td');
    const wrap = document.createElement('div');
    wrap.className = 'att-edit';

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = `cell-input att${slot}`;
    textInput.placeholder = options.allowImages ? '텍스트 또는 사진' : '메모';
    textInput.value = values.att[slot - 1].text || '';
    textInput.addEventListener('input', () => { values.att[slot - 1].text = textInput.value; });
    wrap.appendChild(textInput);

    if (options.allowImages) {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.cssText = 'font-size:.62rem;';

      const attActions = document.createElement('div');
      attActions.className = 'att-edit-actions';

      const preview = document.createElement('img');
      preview.className = 'att-thumb';
      preview.classList.toggle('hidden', !values.att[slot - 1].image);
      if (values.att[slot - 1].image) preview.src = values.att[slot - 1].image;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'att-remove-btn';
      removeBtn.textContent = '제거';
      removeBtn.classList.toggle('hidden', !values.att[slot - 1].image);
      removeBtn.addEventListener('click', () => {
        values.att[slot - 1].image = '';
        preview.classList.add('hidden');
        removeBtn.classList.add('hidden');
      });

      fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        readImageCompressed(file)
          .then((dataUrl) => {
            values.att[slot - 1].image = dataUrl;
            preview.src = dataUrl;
            preview.classList.remove('hidden');
            removeBtn.classList.remove('hidden');
          })
          .catch((err) => showToast(err.message))
          .finally(() => { fileInput.value = ''; });
      });

      attActions.appendChild(preview);
      attActions.appendChild(removeBtn);
      wrap.appendChild(fileInput);
      wrap.appendChild(attActions);
    }

    td.appendChild(wrap);
    cells.push(td);
  });

  return cells;
}

function buildEditableRow(trip, day, item, onDone) {
  const tr = document.createElement('tr');
  tr.className = 'item-tr editing';
  tr.dataset.id = item.id;

  const values = {
    time: item.time, category: item.category, schedule: item.schedule, location: item.location,
    lat: item.lat, lng: item.lng,
    att: item.att.map((a) => ({ text: a.text, image: a.image })),
  };

  buildFieldCells(values, { allowImages: true }).forEach((td) => tr.appendChild(td));

  const actionTd = document.createElement('td');
  const row = document.createElement('div');
  row.className = 'row-actions';

  const handle = document.createElement('span');
  handle.className = 'row-drag';
  handle.textContent = '⠿';
  handle.title = '드래그해서 순서 변경';
  attachRowDrag(handle, item.id, trip.id, day, onDone);

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'row-del-btn';
  delBtn.textContent = '삭제';
  delBtn.addEventListener('click', () => {
    if (!window.confirm('이 일정을 삭제할까요?')) return;
    travel.items = travel.items.filter((i) => i.id !== item.id);
    saveTravel();
    onDone();
  });

  row.appendChild(handle);
  row.appendChild(delBtn);
  actionTd.appendChild(row);
  tr.appendChild(actionTd);

  // 편집 중인 값은 '완료'를 누를 때(day-section 의 editToggle) saveTravel() 로 한꺼번에 저장되도록,
  // item 객체에 실시간으로 반영해 둡니다 (원래 웹의 일괄 저장과 같은 느낌을 내되, 구조는 단순화).
  const applyLive = () => {
    item.time = values.time; item.category = values.category;
    item.schedule = values.schedule; item.location = values.location;
    item.lat = values.lat; item.lng = values.lng;
    item.att = values.att.map((a) => ({ text: a.text, image: a.image }));
    item.updatedAt = Date.now();
  };
  tr.addEventListener('input', applyLive);
  tr.addEventListener('change', applyLive);

  return tr;
}

function buildNewItemRow(trip, day, onDone) {
  const tr = document.createElement('tr');
  tr.className = 'item-tr editing';

  const values = { time: '', category: '', schedule: '', location: '', lat: null, lng: null, att: [{ text: '', image: '' }, { text: '', image: '' }, { text: '', image: '' }] };
  buildFieldCells(values, { allowImages: false }).forEach((td) => tr.appendChild(td));

  const actionTd = document.createElement('td');
  const wrap = document.createElement('div');
  wrap.className = 'new-row-actions';
  const btns = document.createElement('div');
  btns.className = 'new-row-btns';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'row-save-btn';
  saveBtn.textContent = '저장';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'row-cancel-btn';
  cancelBtn.textContent = '취소';
  cancelBtn.addEventListener('click', onDone);

  const err = document.createElement('p');
  err.className = 'row-error hidden';

  saveBtn.addEventListener('click', () => {
    const siblings = itemsOfDay(trip.id, day);
    travel.items.push({
      id: newId(), tripId: trip.id, day,
      date: addDaysISO(trip.start, day - 1),
      time: values.time, category: values.category, schedule: values.schedule, location: values.location,
      lat: values.lat, lng: values.lng,
      att: values.att.map((a) => ({ text: a.text, image: a.image })),
      order: siblings.length,
      updatedAt: Date.now(),
    });
    saveTravel();
    onDone();
  });

  btns.appendChild(saveBtn);
  btns.appendChild(cancelBtn);
  wrap.appendChild(btns);
  wrap.appendChild(err);
  actionTd.appendChild(wrap);
  tr.appendChild(actionTd);
  return tr;
}

/**
 * 손가락으로 눌러 일정 순서를 바꿉니다. (수정 모드의 표 안에서만 동작)
 * 옮기는 행은 손가락을 따라 움직이고(그림자만), 나머지 행에는 위/아래
 * 테두리로 놓일 자리를 표시합니다.
 */
function attachRowDrag(handle, itemId, tripId, day, onReordered) {
  handle.addEventListener('pointerdown', (event) => {
    if (event.button) return;
    event.preventDefault();

    const row = handle.closest('tr');
    const tbody = row.parentElement;
    let target = null; // { id, before }

    function siblingRows() {
      return Array.from(tbody.querySelectorAll('tr[data-id]')).filter((el) => el !== row);
    }

    function onMove(e) {
      row.classList.add('dragging');
      let found = null;
      const sibs = siblingRows();
      for (const sib of sibs) {
        const rect = sib.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        sib.classList.remove('drop-above', 'drop-below');
        if (!found && e.clientY < mid) found = { id: sib.dataset.id, before: true };
      }
      if (!found && sibs.length) found = { id: sibs[sibs.length - 1].dataset.id, before: false };
      if (found) {
        const el = sibs.find((s) => s.dataset.id === found.id);
        if (el) el.classList.add(found.before ? 'drop-above' : 'drop-below');
      }
      target = found;
    }

    function cleanup() {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onCancel);
      row.classList.remove('dragging');
      siblingRows().forEach((s) => s.classList.remove('drop-above', 'drop-below'));
    }

    function onUp() {
      if (target) {
        const ids = itemsOfDay(tripId, day).map((i) => i.id).filter((id) => id !== itemId);
        const targetIndex = ids.indexOf(target.id);
        const insertAt = targetIndex === -1 ? ids.length : (target.before ? targetIndex : targetIndex + 1);
        ids.splice(insertAt, 0, itemId);
        reorderDay(ids);
      }
      cleanup();
      // 이 날 표만 다시 그립니다. 전체를 다시 그리면(renderPanel) 지금 켜 둔
      // 수정 모드가 풀려 버립니다 — 원래 웹도 정렬 중엔 수정 모드가 유지됩니다.
      onReordered();
    }
    function onCancel() { cleanup(); }

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onCancel);
    if (handle.setPointerCapture) handle.setPointerCapture(event.pointerId);
  });
}

/* ===========================================================
   사진 압축 · 라이트박스
   =========================================================== */

function readImageCompressed(file) {
  return new Promise((resolve, reject) => {
    if (!file.type || file.type.indexOf('image/') !== 0) {
      reject(new Error('이미지 파일만 넣을 수 있어요'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('사진을 읽지 못했어요'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('사진을 읽지 못했어요'));
      img.onload = () => {
        const maxW = 900;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        let quality = 0.72;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > MAX_IMAGE_CHARS && quality > 0.3) {
          quality -= 0.12;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        if (dataUrl.length > MAX_IMAGE_CHARS) {
          reject(new Error('사진이 너무 커요. 더 작은 사진으로 넣어 주세요'));
          return;
        }
        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function openLightbox(src) {
  const box = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  if (!box || !img) return;
  img.src = src;
  box.classList.remove('hidden');
}
function closeLightbox() {
  const box = document.getElementById('lightbox');
  if (box) box.classList.add('hidden');
}

/* ===========================================================
   모달 대화상자 공통
   =========================================================== */

function openModal(cardEl) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'activeModal';
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  overlay.appendChild(cardEl);
  document.body.appendChild(overlay);
}
function closeModal() {
  const existing = document.getElementById('activeModal');
  if (existing) existing.remove();
}

function modalHeader(card, title, sub) {
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close-x';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', '닫기');
  closeBtn.addEventListener('click', closeModal);
  card.appendChild(closeBtn);

  const h2 = document.createElement('h2');
  h2.className = 'modal-title';
  h2.textContent = title;
  card.appendChild(h2);

  if (sub) {
    const p = document.createElement('p');
    p.className = 'modal-sub';
    p.textContent = sub;
    card.appendChild(p);
  }
}

/* ---- 새 여행 만들기 ---- */
function buildNewTripDialog() {
  const card = document.createElement('div');
  card.className = 'modal-card';
  modalHeader(card, '새 여행 만들기', '여행 기간을 정하면 날짜별로 빈 일정표가 자동으로 만들어집니다.');

  const body = document.createElement('div');
  body.className = 'modal-body';

  const nameField = labeledField('여행 이름');
  nameField.input.placeholder = '예: 오사카 2026';
  nameField.input.maxLength = 40;

  const dateRow = document.createElement('div');
  dateRow.className = 'field-row';
  const startField = labeledField('시작일', 'date');
  const endField = labeledField('종료일', 'date');
  dateRow.appendChild(startField.wrap);
  dateRow.appendChild(endField.wrap);

  const today = todayISO();
  startField.input.value = today;
  endField.input.value = today;
  startField.input.addEventListener('change', () => { endField.input.min = startField.input.value; });

  const errorEl = document.createElement('p');
  errorEl.className = 'modal-error hidden';

  body.appendChild(nameField.wrap);
  body.appendChild(dateRow);
  body.appendChild(errorEl);
  card.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-outline small';
  cancelBtn.textContent = '취소';
  cancelBtn.addEventListener('click', closeModal);
  const makeBtn = document.createElement('button');
  makeBtn.type = 'button';
  makeBtn.className = 'btn btn-primary small';
  makeBtn.textContent = '만들기';
  makeBtn.addEventListener('click', () => {
    const name = nameField.input.value.trim();
    if (!name) { errorEl.textContent = '여행 이름을 입력해주세요.'; errorEl.classList.remove('hidden'); return; }
    if (!startField.input.value || !endField.input.value) {
      errorEl.textContent = '여행 시작일과 종료일을 선택해주세요.'; errorEl.classList.remove('hidden'); return;
    }
    if (toUTC(endField.input.value) < toUTC(startField.input.value)) {
      errorEl.textContent = '종료일이 시작일보다 빠를 수 없어요.'; errorEl.classList.remove('hidden'); return;
    }
    const trip = { id: newId(), name, start: startField.input.value, end: endField.input.value, order: travel.trips.length, updatedAt: Date.now() };
    travel.trips.push(trip);
    saveTravel();
    setActiveTrip(trip.id);
    closeModal();
    renderAll();
    showToast(`${name} 여행을 추가했어요`);
  });
  actions.appendChild(cancelBtn);
  actions.appendChild(makeBtn);
  card.appendChild(actions);

  return card;
}

function labeledField(label, type) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  const span = document.createElement('span');
  span.className = 'field-label';
  span.textContent = label;
  const input = document.createElement('input');
  input.type = type || 'text';
  wrap.appendChild(span);
  wrap.appendChild(input);
  return { wrap, input };
}

/* ---- 항공편 관리 ---- */
function buildFlightDialog(trip) {
  const card = document.createElement('div');
  card.className = 'modal-card';
  modalHeader(card, '항공편 관리', '입력하면 해당 기간의 일차 옆에 항공편 정보가 표시됩니다.');

  const list = document.createElement('ul');
  list.className = 'modal-list';
  card.appendChild(list);

  const body = document.createElement('div');
  body.className = 'modal-body';
  const editingNote = document.createElement('p');
  editingNote.className = 'modal-hint hidden';
  editingNote.textContent = '항공편 정보 수정 중';

  const dateRow = document.createElement('div');
  dateRow.className = 'field-row';
  const depField = labeledField('출발일', 'date');
  const arrField = labeledField('도착일', 'date');
  dateRow.appendChild(depField.wrap);
  dateRow.appendChild(arrField.wrap);

  const airlineField = labeledField('항공사');
  airlineField.input.placeholder = '예: 대한항공';
  const codeField = labeledField('항공편 코드');
  codeField.input.placeholder = '예: KE001';

  const errorEl = document.createElement('p');
  errorEl.className = 'modal-error hidden';

  body.appendChild(editingNote);
  body.appendChild(dateRow);
  body.appendChild(airlineField.wrap);
  body.appendChild(codeField.wrap);
  body.appendChild(errorEl);
  card.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const secondaryBtn = document.createElement('button');
  secondaryBtn.type = 'button';
  secondaryBtn.className = 'btn btn-outline small';
  secondaryBtn.textContent = '닫기';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary small';
  saveBtn.textContent = '추가';
  actions.appendChild(secondaryBtn);
  actions.appendChild(saveBtn);
  card.appendChild(actions);

  let editingId = null;

  function resetForm() {
    editingId = null;
    depField.input.value = trip.start;
    arrField.input.value = trip.start;
    airlineField.input.value = '';
    codeField.input.value = '';
    editingNote.classList.add('hidden');
    secondaryBtn.textContent = '닫기';
    secondaryBtn.onclick = closeModal;
    saveBtn.textContent = '추가';
    errorEl.classList.add('hidden');
  }

  function renderList() {
    list.innerHTML = '';
    const rows = flightsOfTrip(trip.id);
    rows.forEach((flight) => {
      const li = document.createElement('li');
      li.className = 'modal-list-item' + (editingId === flight.id ? ' editing' : '');
      const info = document.createElement('div');
      const t1 = document.createElement('p');
      t1.className = 'modal-list-item-title';
      t1.textContent = `${flight.airline} ${flight.code}`;
      const t2 = document.createElement('p');
      t2.className = 'modal-list-item-sub';
      t2.textContent = `${formatDisplayDate(flight.depDate)} ~ ${formatDisplayDate(flight.arrDate)}`;
      info.appendChild(t1);
      info.appendChild(t2);

      const acts = document.createElement('div');
      acts.className = 'modal-list-actions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'modal-link-btn';
      editBtn.textContent = '수정';
      editBtn.addEventListener('click', () => {
        editingId = flight.id;
        depField.input.value = flight.depDate;
        arrField.input.value = flight.arrDate;
        airlineField.input.value = flight.airline;
        codeField.input.value = flight.code;
        editingNote.classList.remove('hidden');
        secondaryBtn.textContent = '취소';
        secondaryBtn.onclick = () => { resetForm(); renderList(); };
        saveBtn.textContent = '수정 저장';
        renderList();
      });
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'modal-link-btn danger';
      delBtn.textContent = '삭제';
      delBtn.addEventListener('click', () => {
        travel.flights = travel.flights.filter((f) => f.id !== flight.id);
        saveTravel();
        if (editingId === flight.id) resetForm();
        renderList();
        renderPanel();
      });
      acts.appendChild(editBtn);
      acts.appendChild(delBtn);
      li.appendChild(info);
      li.appendChild(acts);
      list.appendChild(li);
    });
  }

  saveBtn.addEventListener('click', () => {
    const airline = airlineField.input.value.trim();
    const code = codeField.input.value.trim();
    if (!airline || !code) { errorEl.textContent = '항공사와 항공편 코드를 입력해주세요.'; errorEl.classList.remove('hidden'); return; }
    const now = Date.now();
    if (editingId) {
      const f = travel.flights.find((x) => x.id === editingId);
      Object.assign(f, { depDate: depField.input.value, arrDate: arrField.input.value, airline, code, updatedAt: now });
    } else {
      travel.flights.push({ id: newId(), tripId: trip.id, depDate: depField.input.value, arrDate: arrField.input.value, airline, code, updatedAt: now });
    }
    saveTravel();
    resetForm();
    renderList();
    renderPanel();
  });

  resetForm();
  renderList();
  return card;
}

/* ---- 숙소 관리 ---- */
function buildAccommodationDialog(trip) {
  const card = document.createElement('div');
  card.className = 'modal-card';
  modalHeader(card, '숙소 관리', '입력하면 해당 기간의 일차 옆에 숙소명이 표시됩니다.');

  const list = document.createElement('ul');
  list.className = 'modal-list';
  card.appendChild(list);

  const body = document.createElement('div');
  body.className = 'modal-body';
  const editingNote = document.createElement('p');
  editingNote.className = 'modal-hint hidden';
  editingNote.textContent = '숙소 정보 수정 중';

  const nameField = labeledField('숙소 이름');
  nameField.input.placeholder = '예: 오사카 호텔';

  const dateRow = document.createElement('div');
  dateRow.className = 'field-row';
  const inField = labeledField('체크인', 'date');
  const outField = labeledField('체크아웃', 'date');
  dateRow.appendChild(inField.wrap);
  dateRow.appendChild(outField.wrap);

  const errorEl = document.createElement('p');
  errorEl.className = 'modal-error hidden';

  body.appendChild(editingNote);
  body.appendChild(nameField.wrap);
  body.appendChild(dateRow);
  body.appendChild(errorEl);
  card.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const secondaryBtn = document.createElement('button');
  secondaryBtn.type = 'button';
  secondaryBtn.className = 'btn btn-outline small';
  secondaryBtn.textContent = '닫기';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary small';
  saveBtn.textContent = '추가';
  actions.appendChild(secondaryBtn);
  actions.appendChild(saveBtn);
  card.appendChild(actions);

  let editingId = null;

  function resetForm() {
    editingId = null;
    nameField.input.value = '';
    inField.input.value = trip.start;
    outField.input.value = trip.start;
    editingNote.classList.add('hidden');
    secondaryBtn.textContent = '닫기';
    secondaryBtn.onclick = closeModal;
    saveBtn.textContent = '추가';
    errorEl.classList.add('hidden');
  }

  function renderList() {
    list.innerHTML = '';
    staysOfTrip(trip.id).forEach((acc) => {
      const li = document.createElement('li');
      li.className = 'modal-list-item' + (editingId === acc.id ? ' editing' : '');
      const info = document.createElement('div');
      const t1 = document.createElement('p');
      t1.className = 'modal-list-item-title';
      t1.textContent = acc.name;
      const t2 = document.createElement('p');
      t2.className = 'modal-list-item-sub';
      t2.textContent = `${formatDisplayDate(acc.checkIn)} ~ ${formatDisplayDate(acc.checkOut)}`;
      info.appendChild(t1);
      info.appendChild(t2);

      const acts = document.createElement('div');
      acts.className = 'modal-list-actions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'modal-link-btn';
      editBtn.textContent = '수정';
      editBtn.addEventListener('click', () => {
        editingId = acc.id;
        nameField.input.value = acc.name;
        inField.input.value = acc.checkIn;
        outField.input.value = acc.checkOut;
        editingNote.classList.remove('hidden');
        secondaryBtn.textContent = '취소';
        secondaryBtn.onclick = () => { resetForm(); renderList(); };
        saveBtn.textContent = '수정 저장';
        renderList();
      });
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'modal-link-btn danger';
      delBtn.textContent = '삭제';
      delBtn.addEventListener('click', () => {
        travel.stays = travel.stays.filter((s) => s.id !== acc.id);
        saveTravel();
        if (editingId === acc.id) resetForm();
        renderList();
        renderPanel();
      });
      acts.appendChild(editBtn);
      acts.appendChild(delBtn);
      li.appendChild(info);
      li.appendChild(acts);
      list.appendChild(li);
    });
  }

  saveBtn.addEventListener('click', () => {
    const name = nameField.input.value.trim();
    if (!name) { errorEl.textContent = '숙소 이름을 입력해주세요.'; errorEl.classList.remove('hidden'); return; }
    if (!inField.input.value || !outField.input.value) {
      errorEl.textContent = '체크인일과 체크아웃일을 선택해주세요.'; errorEl.classList.remove('hidden'); return;
    }
    const now = Date.now();
    if (editingId) {
      const s = travel.stays.find((x) => x.id === editingId);
      Object.assign(s, { name, checkIn: inField.input.value, checkOut: outField.input.value, updatedAt: now });
    } else {
      travel.stays.push({ id: newId(), tripId: trip.id, name, checkIn: inField.input.value, checkOut: outField.input.value, updatedAt: now });
    }
    saveTravel();
    resetForm();
    renderList();
    renderPanel();
  });

  resetForm();
  renderList();
  return card;
}

/* ---- 체크리스트 ---- */
function buildChecklistDialog(trip) {
  const card = document.createElement('div');
  card.className = 'modal-card';
  modalHeader(card, '체크리스트', '환전액과 여행 준비물을 관리하세요.');

  // ---- 환전액 (필요 자금 / 준비금) ----
  const currencyTitle = document.createElement('p');
  currencyTitle.className = 'modal-section-title';
  currencyTitle.textContent = '환전액 (필요 자금 / 준비금)';
  card.appendChild(currencyTitle);

  const currencyList = document.createElement('ul');
  currencyList.className = 'modal-list currency-list';
  card.appendChild(currencyList);

  const currencyAddRow = document.createElement('div');
  currencyAddRow.className = 'currency-add-row';
  const currencyNameInput = document.createElement('input');
  currencyNameInput.type = 'text';
  currencyNameInput.className = 'cell-input currency-name-input';
  currencyNameInput.placeholder = '통화 (예: 달러)';
  const currencyNeededInput = document.createElement('input');
  currencyNeededInput.type = 'number';
  currencyNeededInput.step = 'any';
  currencyNeededInput.className = 'cell-input currency-amount-input';
  currencyNeededInput.placeholder = '필요';
  const currencyPreparedInput = document.createElement('input');
  currencyPreparedInput.type = 'number';
  currencyPreparedInput.step = 'any';
  currencyPreparedInput.className = 'cell-input currency-amount-input';
  currencyPreparedInput.placeholder = '준비';
  const currencyAddBtn = document.createElement('button');
  currencyAddBtn.type = 'button';
  currencyAddBtn.className = 'btn btn-primary small';
  currencyAddBtn.textContent = '추가';
  currencyAddRow.appendChild(currencyNameInput);
  currencyAddRow.appendChild(currencyNeededInput);
  currencyAddRow.appendChild(currencyPreparedInput);
  currencyAddRow.appendChild(currencyAddBtn);
  card.appendChild(currencyAddRow);

  const currencyErrorEl = document.createElement('p');
  currencyErrorEl.className = 'modal-error hidden';
  card.appendChild(currencyErrorEl);

  const divider = document.createElement('hr');
  divider.className = 'modal-divider';
  card.appendChild(divider);

  // ---- 여행 준비물 ----
  const checklistTitle = document.createElement('p');
  checklistTitle.className = 'modal-section-title';
  checklistTitle.textContent = '여행 준비물';
  card.appendChild(checklistTitle);

  const list = document.createElement('ul');
  list.className = 'modal-list';
  card.appendChild(list);

  const addRow = document.createElement('div');
  addRow.className = 'checklist-add-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cell-input';
  input.style.cssText = 'flex:1;padding:9px 10px;font-size:.85rem;';
  input.placeholder = '예: 여권';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-primary small';
  addBtn.textContent = '추가';
  addRow.appendChild(input);
  addRow.appendChild(addBtn);
  card.appendChild(addRow);

  const errorEl = document.createElement('p');
  errorEl.className = 'modal-error hidden';
  card.appendChild(errorEl);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-outline small';
  closeBtn.textContent = '닫기';
  closeBtn.addEventListener('click', closeModal);
  actions.appendChild(closeBtn);
  card.appendChild(actions);

  function renderCurrencyList() {
    currencyList.innerHTML = '';
    const items = currencyOfTrip(trip.id);
    if (items.length === 0) {
      const li = document.createElement('li');
      li.className = 'list-empty';
      li.textContent = '아직 등록된 환전 계획이 없습니다.';
      currencyList.appendChild(li);
      return;
    }
    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'currency-item';

      const nameEl = document.createElement('span');
      nameEl.className = 'currency-name';
      nameEl.textContent = item.name;

      const neededField = document.createElement('label');
      neededField.className = 'currency-field';
      neededField.textContent = '필요 ';
      const neededInput = document.createElement('input');
      neededInput.type = 'number';
      neededInput.step = 'any';
      neededInput.className = 'cell-input currency-amount-input';
      neededInput.value = item.needed;
      neededInput.addEventListener('change', () => {
        item.needed = Number(neededInput.value) || 0;
        item.updatedAt = Date.now();
        saveTravel();
        renderCurrencyList();
      });
      neededField.appendChild(neededInput);

      const preparedField = document.createElement('label');
      preparedField.className = 'currency-field';
      preparedField.textContent = '준비 ';
      const preparedInput = document.createElement('input');
      preparedInput.type = 'number';
      preparedInput.step = 'any';
      preparedInput.className = 'cell-input currency-amount-input';
      preparedInput.value = item.prepared;
      preparedInput.addEventListener('change', () => {
        item.prepared = Number(preparedInput.value) || 0;
        item.updatedAt = Date.now();
        saveTravel();
        renderCurrencyList();
      });
      preparedField.appendChild(preparedInput);

      const diff = item.prepared - item.needed;
      const diffEl = document.createElement('span');
      diffEl.className = 'currency-diff' + (diff < 0 ? ' short' : '');
      diffEl.textContent = diff === 0 ? '딱 맞음' : (diff > 0 ? `여유 ${diff}` : `부족 ${Math.abs(diff)}`);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'modal-link-btn danger';
      delBtn.textContent = '삭제';
      delBtn.addEventListener('click', () => {
        travel.currency = travel.currency.filter((c) => c.id !== item.id);
        saveTravel();
        renderCurrencyList();
      });

      li.appendChild(nameEl);
      li.appendChild(neededField);
      li.appendChild(preparedField);
      li.appendChild(diffEl);
      li.appendChild(delBtn);
      currencyList.appendChild(li);
    });
  }

  function handleCurrencyAdd() {
    const name = currencyNameInput.value.trim();
    if (!name) {
      currencyErrorEl.textContent = '통화 이름을 입력해주세요.';
      currencyErrorEl.classList.remove('hidden');
      return;
    }
    currencyErrorEl.classList.add('hidden');
    travel.currency.push({
      id: newId(),
      tripId: trip.id,
      name,
      needed: Number(currencyNeededInput.value) || 0,
      prepared: Number(currencyPreparedInput.value) || 0,
      updatedAt: Date.now(),
    });
    saveTravel();
    currencyNameInput.value = '';
    currencyNeededInput.value = '';
    currencyPreparedInput.value = '';
    renderCurrencyList();
    currencyNameInput.focus();
  }
  currencyAddBtn.addEventListener('click', handleCurrencyAdd);
  [currencyNameInput, currencyNeededInput, currencyPreparedInput].forEach((el) => {
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleCurrencyAdd(); });
  });

  function renderList() {
    list.innerHTML = '';
    const items = checksOfTrip(trip.id);
    if (items.length === 0) {
      const li = document.createElement('li');
      li.className = 'list-empty';
      li.textContent = '아직 항목이 없습니다.';
      list.appendChild(li);
      return;
    }
    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'checklist-item' + (item.checked ? ' checked' : '');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = item.checked;
      check.addEventListener('change', () => {
        item.checked = check.checked;
        item.updatedAt = Date.now();
        saveTravel();
        renderList();
        renderPanel();
      });
      const text = document.createElement('span');
      text.className = 'text';
      text.textContent = item.text;
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'modal-link-btn danger';
      delBtn.textContent = '삭제';
      delBtn.addEventListener('click', () => {
        travel.checks = travel.checks.filter((c) => c.id !== item.id);
        saveTravel();
        renderList();
        renderPanel();
      });
      li.appendChild(check);
      li.appendChild(text);
      li.appendChild(delBtn);
      list.appendChild(li);
    });
  }

  function handleAdd() {
    const text = input.value.trim();
    if (!text) { errorEl.textContent = '준비물을 입력해주세요.'; errorEl.classList.remove('hidden'); return; }
    errorEl.classList.add('hidden');
    travel.checks.push({ id: newId(), tripId: trip.id, text, checked: false, updatedAt: Date.now() });
    saveTravel();
    input.value = '';
    renderList();
    renderPanel();
  }
  addBtn.addEventListener('click', handleAdd);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAdd(); });

  renderCurrencyList();
  renderList();
  return card;
}

/* ===========================================================
   동선(지도) — 실제 구글 지도 SDK 를 씁니다 (별도 API 키 필요).
   =========================================================== */

let mapsLoadPromise = null;

/**
 * 구글이 권장하는 "동적 라이브러리 불러오기" 부트스트랩 로더입니다.
 * 예전에는 <script src=".../js?...&loading=async"> 를 직접 만들고 onload 되면
 * 바로 new maps.Map() 을 썼는데, 그 시점엔 google.maps.importLibrary 자체가
 * 아직 안 채워져 있을 때가 있어서(실제 스크립트 안에서 한 단계 더 비동기로
 * 채워집니다) "google.maps.importLibrary is not a function" 으로 조용히
 * 실패했습니다 — 모듈이 이미 캐시돼 있으면 우연히 제 시간에 채워져 있어
 * 가끔은 되는 것처럼 보이기도 해서, API 키/허용 도메인 문제로 오인하기
 * 쉬운 버그였습니다.
 * 이 함수는 importLibrary 를 우리가 직접, 즉시(동기적으로) 만들어 두고
 * 실제 스크립트가 준비되면(callback) 그 실물로 이어받는 방식이라 이
 * 타이밍 문제가 없습니다. (구글 공식 부트스트랩 스니펫과 같은 방식)
 */
function ensureMapsBootstrap(apiKey) {
  const google = (window.google = window.google || {});
  const maps = (google.maps = google.maps || {});
  if (maps.importLibrary) return;

  const requested = new Set();
  let loadPromise = null;
  const load = () => loadPromise || (loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const params = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
      libraries: [...requested].join(','),
      callback: 'google.maps.__ib__',
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    maps.__ib__ = resolve;
    script.onerror = () => { loadPromise = null; reject(new Error('구글맵 스크립트를 불러오지 못했습니다.')); };
    document.head.appendChild(script);
  }));
  maps.importLibrary = (name, ...args) => {
    requested.add(name);
    return load().then(() => maps.importLibrary(name, ...args));
  };
}

function loadGoogleMapsSdk() {
  if (typeof window === 'undefined') return Promise.reject(new Error('브라우저 환경이 아닙니다.'));
  if (window.google && window.google.maps && window.google.maps.Map && window.google.maps.places) return Promise.resolve();
  if (mapsLoadPromise) return mapsLoadPromise;

  ensureMapsBootstrap(window.GOOGLE_MAPS_API_KEY);
  mapsLoadPromise = Promise.all([
    window.google.maps.importLibrary('maps'),
    window.google.maps.importLibrary('marker'),
    window.google.maps.importLibrary('places'),
  ]).catch((err) => { mapsLoadPromise = null; throw err; });
  return mapsLoadPromise;
}

/**
 * 장소 검색 대화상자. 구글이 지금 권장하는 PlaceAutocompleteElement 는
 * 기존 <input> 에 값을 미리 채워 넣는 방법이 마땅치 않은 새 위젯(자체
 * 컴포넌트)이라, 위치 칸 옆 🔍 버튼을 누르면 이 작은 대화상자를 열어
 * 검색 전용으로 쓰고, 고른 결과만 실제 위치 칸으로 돌려줍니다.
 * (레거시 google.maps.places.Autocomplete 는 2025년 3월 이후 신규
 * 프로젝트에 활성화가 막혀 있어 쓸 수 없습니다)
 */
function buildPlaceSearchDialog(onPick) {
  const card = document.createElement('div');
  card.className = 'modal-card';
  modalHeader(card, '장소 검색', '목록에서 고르면 좌표까지 함께 저장돼요.');

  const body = document.createElement('div');
  body.className = 'modal-body';
  const holder = document.createElement('div');
  holder.className = 'loc-search-holder';
  body.appendChild(holder);
  const hint = document.createElement('p');
  hint.className = 'modal-hint';
  hint.textContent = '검색창을 불러오는 중...';
  body.appendChild(hint);
  card.appendChild(body);

  loadGoogleMapsSdk()
    .then(() => {
      if (!window.google.maps.places || !window.google.maps.places.PlaceAutocompleteElement) {
        hint.textContent = '장소 검색을 쓸 수 없어요. (Places API (New) 활성화 여부를 확인해주세요)';
        return;
      }
      hint.remove();
      const el = new window.google.maps.places.PlaceAutocompleteElement();
      el.style.width = '100%';
      holder.appendChild(el);
      el.addEventListener('gmp-select', async ({ placePrediction }) => {
        const place = placePrediction.toPlace();
        await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
        onPick({
          // 옮겨온 기존 자료가 "카이로국제공항"처럼 짧은 장소 이름이라, 전체
          // 도로명 주소보다 장소 이름을 우선 씁니다.
          label: place.displayName || place.formattedAddress || '',
          lat: place.location ? place.location.lat() : null,
          lng: place.location ? place.location.lng() : null,
        });
        closeModal();
      });
    })
    .catch(() => { hint.textContent = '장소 검색을 불러오지 못했어요.'; });

  return card;
}

/** 일차 → sortOrder 순서 그대로, 좌표가 있는 항목만 골라 씁니다. */
function sortForRoute(items) {
  return items
    .filter((i) => typeof i.lat === 'number' && typeof i.lng === 'number')
    .sort((a, b) => (a.day !== b.day ? a.day - b.day : a.order - b.order));
}
function isFlightLeg(a, b) {
  return a.category === 'flight' && b.category === 'flight';
}

function buildRouteMapDialog(trip) {
  const card = document.createElement('div');
  card.className = 'modal-card wide';
  card.style.cssText = card.style.cssText + 'display:flex;flex-direction:column;';

  const top = document.createElement('div');
  top.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px;';
  const titleBox = document.createElement('div');
  const title = document.createElement('h2');
  title.className = 'modal-title';
  title.textContent = `🌐 ${trip.name} 동선`;
  const statusText = document.createElement('p');
  statusText.className = 'modal-sub';
  statusText.textContent = '지도를 불러오는 중...';
  titleBox.appendChild(title);
  titleBox.appendChild(statusText);
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-outline small';
  closeBtn.textContent = '닫기';
  closeBtn.addEventListener('click', closeModal);
  top.appendChild(titleBox);
  top.appendChild(closeBtn);
  card.appendChild(top);

  const dayPicker = document.createElement('div');
  dayPicker.className = 'route-day-picker hidden';
  card.appendChild(dayPicker);

  const mapWrap = document.createElement('div');
  mapWrap.className = 'route-map-wrap';
  const mapEl = document.createElement('div');
  mapEl.className = 'route-map';
  const statusOverlay = document.createElement('div');
  statusOverlay.className = 'route-status';
  statusOverlay.textContent = '지도를 불러오는 중...';
  mapWrap.appendChild(mapEl);
  mapWrap.appendChild(statusOverlay);
  card.appendChild(mapWrap);

  const missingBox = document.createElement('div');
  missingBox.className = 'route-missing hidden';
  card.appendChild(missingBox);

  const items = itemsOfTrip(trip.id);
  const points = sortForRoute(items);
  const withLocationCount = items.filter((i) => i.location && i.location.trim()).length;

  let selectedDay = 'all';
  let map = null;
  let markers = [];
  let polylines = [];

  function pointsForDay(day) {
    return day === 'all' ? points : points.filter((i) => i.day === day);
  }

  function renderMissing() {
    const currentPoints = pointsForDay(selectedDay);
    const plottedIds = new Set(currentPoints.map((p) => p.id));
    const scoped = selectedDay === 'all' ? items : items.filter((i) => i.day === selectedDay);
    const missing = scoped
      .filter((i) => ((i.schedule && i.schedule.trim()) || (i.location && i.location.trim())) && !plottedIds.has(i.id))
      .sort((a, b) => (a.day !== b.day ? a.day - b.day : a.order - b.order));

    missingBox.innerHTML = '';
    missingBox.classList.toggle('hidden', missing.length === 0);
    if (missing.length === 0) return;
    const p = document.createElement('p');
    p.className = 'route-missing-title';
    p.textContent = `동선에 표시되지 않은 일정 (${missing.length}개)`;
    missingBox.appendChild(p);
    missing.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'route-missing-item';
      const label = document.createElement('span');
      label.style.fontWeight = '700';
      label.textContent = `${item.day}일차${item.time ? ` ${item.time}` : ''}`;
      const text = document.createElement('span');
      text.style.cssText = 'flex:1;min-width:0;';
      text.textContent = item.schedule || item.location;
      const tag = document.createElement('span');
      tag.className = 'route-missing-tag';
      tag.textContent = item.location && item.location.trim() ? '좌표 없음' : '위치 미입력';
      row.appendChild(label);
      row.appendChild(text);
      row.appendChild(tag);
      missingBox.appendChild(row);
    });
  }

  function draw() {
    if (!map || !window.google) return;
    const maps = window.google.maps;
    markers.forEach((m) => m.setMap(null));
    polylines.forEach((p) => p.setMap(null));
    markers = []; polylines = [];

    const currentPoints = pointsForDay(selectedDay);
    if (currentPoints.length === 0) { renderMissing(); return; }

    const bounds = new maps.LatLngBounds();
    const byDay = new Map();
    const orderCounters = new Map();

    currentPoints.forEach((item) => {
      const position = { lat: item.lat, lng: item.lng };
      bounds.extend(position);
      const list = byDay.get(item.day) || [];
      list.push(item);
      byDay.set(item.day, list);
      const orderInDay = (orderCounters.get(item.day) || 0) + 1;
      orderCounters.set(item.day, orderInDay);

      const marker = new maps.Marker({
        position, map,
        label: { text: String(orderInDay), color: '#ffffff', fontWeight: 'bold', fontSize: '11px' },
      });
      markers.push(marker);
      const info = new maps.InfoWindow({
        content: `<div style="padding:6px 10px;font-size:12px;white-space:nowrap;"><b>${item.day}일차 ${orderInDay}번째${item.time ? ` · ${item.time}` : ''}</b><br/>${item.schedule || item.location}</div>`,
      });
      maps.event.addListener(marker, 'click', () => info.open({ map, anchor: marker }));
    });

    byDay.forEach((dayItems, dayNumber) => {
      if (dayItems.length < 2) return;
      const path = dayItems.map((p) => ({ lat: p.lat, lng: p.lng }));
      const polyline = new maps.Polyline({
        map, path,
        strokeColor: DAY_COLORS[(dayNumber - 1) % DAY_COLORS.length],
        strokeOpacity: 0.85, strokeWeight: 4,
      });
      polylines.push(polyline);
    });

    if (currentPoints.length === 1) {
      map.setCenter({ lat: currentPoints[0].lat, lng: currentPoints[0].lng });
      map.setZoom(13);
    } else {
      map.fitBounds(bounds);
    }
    renderMissing();
  }

  function renderDayPicker() {
    const days = [...new Set(points.map((p) => p.day))].sort((a, b) => a - b);
    if (days.length <= 1) { dayPicker.classList.add('hidden'); return; }
    dayPicker.classList.remove('hidden');
    dayPicker.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'route-day-pill' + (selectedDay === 'all' ? ' on' : '');
    if (selectedDay === 'all') allBtn.style.background = 'var(--primary)';
    allBtn.textContent = '전체';
    allBtn.addEventListener('click', () => { selectedDay = 'all'; renderDayPicker(); draw(); });
    dayPicker.appendChild(allBtn);
    days.forEach((day) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'route-day-pill' + (selectedDay === day ? ' on' : '');
      if (selectedDay === day) btn.style.background = DAY_COLORS[(day - 1) % DAY_COLORS.length];
      btn.textContent = `${day}일차`;
      btn.addEventListener('click', () => { selectedDay = day; renderDayPicker(); draw(); });
      dayPicker.appendChild(btn);
    });
  }

  if (!window.GOOGLE_MAPS_API_KEY) {
    statusOverlay.textContent = '구글맵 API 키가 설정되지 않았습니다. maps-config.js 를 확인해주세요.';
    statusText.textContent = '';
  } else if (points.length === 0) {
    statusOverlay.textContent = withLocationCount === 0
      ? '위치가 입력된 일정이 없습니다.'
      : '저장된 좌표가 없습니다. 일정 수정에서 좌표를 넣어주세요.';
    statusText.textContent = '';
  } else {
    loadGoogleMapsSdk()
      .then(() => {
        const maps = window.google.maps;
        map = new maps.Map(mapEl, { center: { lat: points[0].lat, lng: points[0].lng }, zoom: 8 });
        statusOverlay.classList.add('hidden');
        statusText.textContent = `${points.length}개 위치 표시됨`;
        renderDayPicker();
        draw();
      })
      .catch(() => {
        statusOverlay.textContent = '구글맵 스크립트를 불러오지 못했습니다. (도메인이 허용 목록에 없을 수 있어요)';
        statusText.textContent = '';
      });
  }

  return card;
}

/**
 * 배경 동기화(60초 주기)가 끝나면 서버와 합쳐진 값을 통째로 travel 에 덮어썼는데,
 * 그러면 지금 '수정' 모드로 열어 둔 행이 들고 있던 item 객체가 새 배열 안에는
 * 없는 채로 남아(참조가 끊겨) 그 뒤로 입력하는 내용이 조용히 사라졌습니다.
 * (여러 항목을 한 번에 고칠수록 편집 시간이 길어져 60초 주기와 겹칠 확률이
 * 커지므로 "여러 개를 한 번에 고치면 적용이 안 된다"로 보였던 원인입니다)
 * id 가 같은 항목은 기존 객체를 그대로 두고 값만 옮겨 담아, 화면에 열려
 * 있는 행이 계속 같은 객체를 가리키게 합니다.
 */
function reconcileArrayById(current, incoming) {
  const byId = new Map(current.map((row) => [row.id, row]));
  return incoming.map((row) => {
    const existing = byId.get(row.id);
    if (existing) {
      Object.assign(existing, row);
      return existing;
    }
    return row;
  });
}

/* ===========================================================
   함께 쓰기 다리 (sync.js 가 이 창구로 드나듭니다)
   =========================================================== */
window.CampApp = {
  getState() {
    return { travel: JSON.parse(JSON.stringify(travel)) };
  },
  applyState(state, options) {
    if (!state) return;
    const incoming = normalizeTravel(state.travel);
    travel = {
      trips: reconcileArrayById(travel.trips, incoming.trips),
      items: reconcileArrayById(travel.items, incoming.items),
      flights: reconcileArrayById(travel.flights, incoming.flights),
      stays: reconcileArrayById(travel.stays, incoming.stays),
      checks: reconcileArrayById(travel.checks, incoming.checks),
      summaries: reconcileArrayById(travel.summaries, incoming.summaries),
      currency: reconcileArrayById(travel.currency, incoming.currency),
    };
    localStorage.setItem(LS_TRAVEL, JSON.stringify(travel));

    if (travel.trips.length && !getActiveTrip()) setActiveTrip(sortedTrips()[0].id);
    if (!travel.trips.length) setActiveTrip(null);

    if (!options || options.rerender !== false) renderAll();
  },
  toast: showToast,
};

const lightboxEl = document.getElementById('lightbox');
if (lightboxEl) lightboxEl.addEventListener('click', closeLightbox);

// ---- init ----
const seeded = maybeImportSeed();

if (travel.trips.length && !getActiveTrip()) setActiveTrip(sortedTrips()[0].id);

renderAll();

if (seeded) {
  const t = sortedTrips()[0];
  if (t) showToast(`${t.name} 여행 기록을 가져왔어요`);
}

/**
 * 자동 불러오기(maybeImportSeed)가 실행되는 시점에 travel-seed.js 가
 * 아직 안 떠 있었으면(예: 서비스워커 갱신 직후 자동 새로고침과 겹친 경우)
 * '불러왔음' 표시만 남고 자료는 못 들어온 채로 굳어버릴 수 있습니다.
 * 그런 경우를 위해 여행이 하나도 없을 때만 보이는 수동 버튼을 둡니다.
 */
const reimportSeedBtn = document.getElementById('reimportSeedBtn');
if (reimportSeedBtn) {
  reimportSeedBtn.addEventListener('click', () => {
    if (travel.trips.length > 0) { showToast('이미 여행 기록이 있어서 불러오지 않았어요.'); return; }
    const seed = window.TRAVEL_SEED;
    if (!seed || !Array.isArray(seed.trips) || seed.trips.length === 0) {
      showToast('불러올 자료가 아직 없어요. 잠시 후 다시 시도해주세요.');
      return;
    }
    localStorage.setItem(LS_SEEDED, '1');
    travel = normalizeTravel(JSON.parse(JSON.stringify(seed)));
    saveTravel();
    if (travel.trips.length) setActiveTrip(sortedTrips()[0].id);
    renderAll();
    const t = sortedTrips()[0];
    if (t) showToast(`${t.name} 여행 기록을 다시 가져왔어요`);
  });
}

/**
 * 일정이 바뀐 날이 있으면 요약을 자동으로 새로 만듭니다. 1시간마다
 * 확인하고(조용히), 화면이 안 보일 때는 건너뜁니다. 페이지를 막 열었을
 * 때도 한 번 확인하되, 렌더링이 자리잡을 시간을 조금 줍니다.
 */
function autoCheckSummaries() {
  if (document.visibilityState !== 'visible') return;
  const trip = getActiveTrip();
  if (trip) runSummaryCheck(trip, { silent: true });
}
setTimeout(autoCheckSummaries, 15000);
setInterval(autoCheckSummaries, SUMMARY_CHECK_INTERVAL_MS);

if ('serviceWorker' in navigator) {
  const hadOldVersion = !!navigator.serviceWorker.controller;
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadOldVersion || reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => {});
  });
}

// ---- storage keys ----
const LS_TRAVEL = 'coupleLog.travel.v1';
const LS_ACTIVE_TRIP = 'coupleLog.travel.activeTrip.v1';
const LS_SUB_TAB = 'coupleLog.travel.subTab.v1';
const LS_SEEDED = 'coupleLog.travel.seeded.v1';

const DAY_MS = 86400000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MAX_IMAGE_CHARS = 480000; // data URL 문자 수 상한 (약 350KB 사진)

// ---- 일정 분류 ----
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

// ---- state ----
// travel = { trips, items, flights, stays, checks, summaries }  (모두 평평한 목록, 각 행에 tripId)
function emptyTravel() {
  return { trips: [], items: [], flights: [], stays: [], checks: [], summaries: [] };
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
let activeSubTab = localStorage.getItem(LS_SUB_TAB) || 'itinerary';

/**
 * travel-journal 웹에서 옮겨온 첫 자료를 한 번만 넣습니다.
 * 이미 기록이 있으면(다른 기기에서 먼저 썼거나, 이미 한 번 들어왔으면) 건드리지 않습니다.
 */
function maybeImportSeed() {
  if (localStorage.getItem(LS_SEEDED)) return false;
  localStorage.setItem(LS_SEEDED, '1');
  if (travel.trips.length > 0) return false;
  const seed = window.TRAVEL_SEED;
  if (!seed || !Array.isArray(seed.trips) || seed.trips.length === 0) return false;

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
function lengthLabel(trip) {
  const nights = nightsOf(trip);
  return nights <= 0 ? '당일치기' : `${nights}박 ${nights + 1}일`;
}
function tripDates(trip) {
  const out = [];
  const total = Math.max(0, nightsOf(trip));
  for (let i = 0; i <= total; i += 1) out.push(addDaysISO(trip.start, i));
  return out;
}
function shortDate(iso) {
  const [, m, d] = iso.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(toUTC(iso)).getUTCDay()];
  return `${m}/${d} (${weekday})`;
}
function rangeLabel(trip) {
  const [, sm, sd] = trip.start.split('-').map(Number);
  const [, em, ed] = trip.end.split('-').map(Number);
  return `${sm}/${sd} – ${em}/${ed}`;
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
function setSubTab(tab) {
  activeSubTab = tab;
  localStorage.setItem(LS_SUB_TAB, tab);
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
function summaryOf(tripId, day) {
  return travel.summaries.find((s) => s.tripId === tripId && s.day === day) || null;
}

function subTabCounts(trip) {
  const checks = checksOfTrip(trip.id);
  return {
    itinerary: itemsOfTrip(trip.id).length,
    flights: flightsOfTrip(trip.id).length,
    stays: staysOfTrip(trip.id).length,
    checklist: `${checks.filter((c) => c.checked).length}/${checks.length}`,
  };
}

/** 구글 지도 딥링크. 별도 API 키 없이 그냥 웹/앱 링크로 엽니다. */
function itemMapUrl(item) {
  if (typeof item.lat === 'number' && typeof item.lng === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`;
  }
  if (item.location) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`;
  }
  return null;
}
/** 하루치 동선을 좌표 순서대로 이어 길찾기 링크를 만듭니다. */
function dayMapUrl(items) {
  const pts = items.filter((i) => typeof i.lat === 'number' && typeof i.lng === 'number');
  if (pts.length < 2) return null;
  const coord = (p) => `${p.lat},${p.lng}`;
  const params = new URLSearchParams({ api: '1', origin: coord(pts[0]), destination: coord(pts[pts.length - 1]) });
  const mid = pts.slice(1, -1).slice(0, 8).map(coord).join('|');
  if (mid) params.set('waypoints', mid);
  return 'https://www.google.com/maps/dir/?' + params.toString();
}

let toastTimer2 = null;
function flash(el, msg) {
  el.textContent = msg;
  clearTimeout(toastTimer2);
  toastTimer2 = setTimeout(() => { el.textContent = ''; }, 2200);
}

// ---- rendering ----
function renderAll() {
  renderTripTabs();
  renderPanel();
}

function renderTripTabs() {
  const nav = document.getElementById('tripTabs');
  nav.innerHTML = '';

  sortedTrips().forEach((trip) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'trip-tab' + (trip.id === activeTripId ? ' active' : '');

    const name = document.createElement('span');
    name.className = 'trip-tab-place';
    name.textContent = trip.name;

    const meta = document.createElement('span');
    meta.className = 'trip-tab-meta';
    meta.textContent = `${rangeLabel(trip)} · ${lengthLabel(trip)}`;

    tab.appendChild(name);
    tab.appendChild(meta);
    tab.addEventListener('click', () => {
      setActiveTrip(trip.id);
      renderAll();
    });
    nav.appendChild(tab);
  });
}

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

  panel.appendChild(buildTripHead(trip));
  panel.appendChild(buildSubTabs(trip));

  const body = document.createElement('div');
  body.id = 'subTabBody';
  panel.appendChild(body);

  renderSubTabBody(trip);
}

function buildTripHead(trip) {
  const head = document.createElement('section');
  head.className = 'trip-head';

  const top = document.createElement('div');
  top.className = 'trip-head-top';

  const left = document.createElement('div');
  const name = document.createElement('h2');
  name.className = 'trip-place';
  name.textContent = trip.name;

  const dates = document.createElement('div');
  dates.className = 'trip-dates';
  dates.textContent = `${trip.start} ~ ${trip.end}`;

  left.appendChild(name);
  left.appendChild(dates);

  const actions = document.createElement('div');
  actions.className = 'trip-head-actions';

  const nameBtn = document.createElement('button');
  nameBtn.type = 'button';
  nameBtn.className = 'icon-btn';
  nameBtn.textContent = '이름';
  nameBtn.addEventListener('click', () => renameTrip(trip));

  const dateBtn = document.createElement('button');
  dateBtn.type = 'button';
  dateBtn.className = 'icon-btn';
  dateBtn.textContent = '날짜';
  dateBtn.addEventListener('click', () => editTripDates(trip));

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'icon-btn';
  delBtn.textContent = '삭제';
  delBtn.addEventListener('click', () => deleteTrip(trip));

  actions.appendChild(nameBtn);
  actions.appendChild(dateBtn);
  actions.appendChild(delBtn);

  top.appendChild(left);
  top.appendChild(actions);

  const nights = document.createElement('div');
  nights.className = 'trip-nights';
  nights.textContent = lengthLabel(trip);

  head.appendChild(top);
  head.appendChild(nights);
  return head;
}

const SUB_TABS = [
  { key: 'itinerary', label: '일정' },
  { key: 'flights', label: '항공편' },
  { key: 'stays', label: '숙소' },
  { key: 'checklist', label: '체크리스트' },
];

function buildSubTabs(trip) {
  const wrap = document.createElement('nav');
  wrap.className = 'sub-tabs travel-sub-tabs';

  const counts = subTabCounts(trip);
  SUB_TABS.forEach((info) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sub-tab' + (info.key === activeSubTab ? ' active' : '');

    const label = document.createElement('span');
    label.textContent = info.label;

    const count = document.createElement('span');
    count.className = 'sub-tab-count';
    count.textContent = String(counts[info.key]);

    btn.appendChild(label);
    btn.appendChild(count);
    btn.addEventListener('click', () => {
      setSubTab(info.key);
      renderPanel();
    });
    wrap.appendChild(btn);
  });

  return wrap;
}

function renderSubTabBody(trip) {
  const body = document.getElementById('subTabBody');
  body.innerHTML = '';
  if (activeSubTab === 'flights') buildFlights(trip, body);
  else if (activeSubTab === 'stays') buildStays(trip, body);
  else if (activeSubTab === 'checklist') buildChecklist(trip, body);
  else buildItinerary(trip, body);
}

/* ================= 일정(itinerary) ================= */

function buildItinerary(trip, body) {
  tripDates(trip).forEach((iso, index) => {
    const day = index + 1;
    body.appendChild(buildDayBlock(trip, day, iso));
  });
}

function buildDayBlock(trip, day, iso) {
  const block = document.createElement('section');
  block.className = 'day-block';

  const items = itemsOfDay(trip.id, day);

  const head = document.createElement('div');
  head.className = 'day-block-head';

  const title = document.createElement('div');
  title.className = 'day-block-title';
  const idx = document.createElement('span');
  idx.className = 'day-index';
  idx.textContent = `${day}일차`;
  const date = document.createElement('span');
  date.className = 'day-date';
  date.textContent = shortDate(iso);
  title.appendChild(idx);
  title.appendChild(date);

  const headActions = document.createElement('div');
  headActions.className = 'day-block-actions';

  const mapUrl = dayMapUrl(items);
  if (mapUrl) {
    const mapLink = document.createElement('a');
    mapLink.className = 'day-map-link';
    mapLink.href = mapUrl;
    mapLink.target = '_blank';
    mapLink.rel = 'noopener';
    mapLink.textContent = '🗺️ 동선 보기';
    headActions.appendChild(mapLink);
  }

  const summaryToggle = document.createElement('button');
  summaryToggle.type = 'button';
  summaryToggle.className = 'day-summary-toggle';
  const existingSummary = summaryOf(trip.id, day);
  const hasSummary = existingSummary && (existingSummary.route || existingSummary.points || existingSummary.cautions);
  summaryToggle.textContent = hasSummary ? '요약 ●' : '요약 +';
  headActions.appendChild(summaryToggle);

  head.appendChild(title);
  head.appendChild(headActions);
  block.appendChild(head);

  const summaryPanel = buildDaySummaryForm(trip, day);
  summaryPanel.classList.add('hidden');
  block.appendChild(summaryPanel);
  summaryToggle.addEventListener('click', () => summaryPanel.classList.toggle('hidden'));

  const list = document.createElement('div');
  list.className = 'item-list';
  items.forEach((item) => list.appendChild(buildItemRow(trip, item)));
  block.appendChild(list);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-outline small day-add-btn';
  addBtn.textContent = '+ 이 날에 일정 추가';
  const formSlot = document.createElement('div');
  addBtn.addEventListener('click', () => {
    formSlot.innerHTML = '';
    formSlot.appendChild(buildItemForm(trip, day, null, () => { formSlot.innerHTML = ''; }));
  });
  block.appendChild(addBtn);
  block.appendChild(formSlot);

  return block;
}

function buildDaySummaryForm(trip, day) {
  const wrap = document.createElement('div');
  wrap.className = 'day-summary-form';

  const existing = summaryOf(trip.id, day);
  const fields = [
    { key: 'route', label: '주요 동선', placeholder: '오늘 하루 어떻게 움직이는지' },
    { key: 'points', label: '체크포인트', placeholder: '놓치면 안 되는 시간/장소' },
    { key: 'cautions', label: '주의사항', placeholder: '조심할 것' },
  ];

  function currentSummary() {
    return summaryOf(trip.id, day);
  }

  fields.forEach((f) => {
    const label = document.createElement('label');
    label.className = 'day-summary-label';
    label.textContent = f.label;

    const textarea = document.createElement('textarea');
    textarea.className = 'day-summary-input';
    textarea.placeholder = f.placeholder;
    textarea.value = existing ? existing[f.key] || '' : '';
    textarea.rows = 2;

    let saveTimer = null;
    textarea.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        let row = currentSummary();
        if (!row) {
          row = { id: newId(), tripId: trip.id, day, route: '', points: '', cautions: '', updatedAt: Date.now() };
          travel.summaries.push(row);
        }
        row[f.key] = textarea.value;
        row.updatedAt = Date.now();
        saveTravel();
      }, 500);
    });

    wrap.appendChild(label);
    wrap.appendChild(textarea);
  });

  return wrap;
}

function buildItemRow(trip, item) {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.dataset.id = item.id;

  const handle = document.createElement('span');
  handle.className = 'item-drag';
  handle.textContent = '⠿';
  handle.setAttribute('aria-label', '눌러서 순서 바꾸기');
  attachItemDrag(handle, item.id, trip.id, item.day);

  const bodyEl = document.createElement('div');
  bodyEl.className = 'item-body';

  const topLine = document.createElement('div');
  topLine.className = 'item-top';

  if (item.time) {
    const time = document.createElement('span');
    time.className = 'item-time';
    time.textContent = item.time;
    topLine.appendChild(time);
  }

  const cat = categoryInfo(item.category);
  if (cat) {
    const catEl = document.createElement('span');
    catEl.className = 'item-cat';
    catEl.textContent = `${cat.icon} ${cat.label}`;
    topLine.appendChild(catEl);
  }
  bodyEl.appendChild(topLine);

  const schedule = document.createElement('p');
  schedule.className = 'item-schedule';
  schedule.textContent = item.schedule;
  bodyEl.appendChild(schedule);

  const mapUrl = itemMapUrl(item);
  if (item.location || mapUrl) {
    const loc = document.createElement(mapUrl ? 'a' : 'span');
    loc.className = 'item-location';
    loc.textContent = `📍 ${item.location || '지도에서 보기'}`;
    if (mapUrl) { loc.href = mapUrl; loc.target = '_blank'; loc.rel = 'noopener'; }
    bodyEl.appendChild(loc);
  }

  const atts = item.att.filter((a) => a.text || a.image);
  if (atts.length) {
    const attWrap = document.createElement('div');
    attWrap.className = 'item-atts';
    atts.forEach((a) => {
      if (a.image) {
        const thumb = document.createElement('img');
        thumb.className = 'att-thumb';
        thumb.src = a.image;
        thumb.alt = a.text || '첨부 사진';
        thumb.addEventListener('click', () => openLightbox(a.image));
        attWrap.appendChild(thumb);
      }
      if (a.text) {
        const chip = document.createElement('span');
        chip.className = 'att-chip';
        chip.textContent = a.text;
        attWrap.appendChild(chip);
      }
    });
    bodyEl.appendChild(attWrap);
  }

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const formSlot = document.createElement('div');

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'gear-act gear-edit';
  editBtn.textContent = '✎';
  editBtn.setAttribute('aria-label', '일정 수정');
  editBtn.addEventListener('click', () => {
    if (formSlot.childElementCount) { formSlot.innerHTML = ''; return; }
    formSlot.appendChild(buildItemForm(trip, item.day, item, () => { formSlot.innerHTML = ''; }));
  });

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'gear-act gear-del';
  delBtn.textContent = '✕';
  delBtn.setAttribute('aria-label', '일정 삭제');
  delBtn.addEventListener('click', () => {
    travel.items = travel.items.filter((i) => i.id !== item.id);
    saveTravel();
    renderPanel();
  });

  actions.appendChild(editBtn);
  actions.appendChild(delBtn);

  row.appendChild(handle);
  row.appendChild(bodyEl);
  row.appendChild(actions);

  const wrap = document.createElement('div');
  wrap.appendChild(row);
  wrap.appendChild(formSlot);
  return wrap;
}

/**
 * 손가락으로 눌러 일정 순서를 바꿉니다.
 * 옮기는 줄 자체는 손가락을 따라 움직이고(transform), 나머지 줄에는
 * 어디에 놓일지 테두리로 표시합니다. 손을 떼면 그 자리로 순서를 바꿉니다.
 */
function attachItemDrag(handle, itemId, tripId, day) {
  handle.addEventListener('pointerdown', (event) => {
    if (event.button) return;
    event.preventDefault();

    const row = handle.closest('.item-row');
    // 줄마다 '수정 폼 자리'와 한 덩어리로 감싸 놓아서(wrap), row 의 진짜
    // 부모는 wrap 이고 그 wrap 의 부모가 이 날의 .item-list 입니다.
    const list = row.parentElement.parentElement;
    const startY = event.clientY;
    let target = null; // { id, before }

    function siblingRows() {
      return Array.from(list.querySelectorAll('.item-row')).filter((el) => el !== row);
    }

    function onMove(e) {
      row.classList.add('dragging');
      row.style.transform = `translateY(${e.clientY - startY}px)`;

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
      row.style.transform = '';
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
      renderPanel();
    }
    function onCancel() { cleanup(); }

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onCancel);
    if (handle.setPointerCapture) handle.setPointerCapture(event.pointerId);
  });
}

function reorderDay(orderedIds) {
  const now = Date.now();
  orderedIds.forEach((id, idx) => {
    const item = travel.items.find((i) => i.id === id);
    if (item) { item.order = idx; item.updatedAt = now; }
  });
  saveTravel();
}

/** 일정 추가/수정 폼. existing 이 없으면 새로 만들고, 있으면 그 일정을 고칩니다. */
function buildItemForm(trip, day, existing, onClose) {
  const form = document.createElement('form');
  form.className = 'item-form';

  const row1 = document.createElement('div');
  row1.className = 'item-form-row';

  const timeField = document.createElement('label');
  timeField.className = 'field';
  timeField.innerHTML = '<span class="field-label">시간 (선택)</span>';
  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.value = existing ? existing.time : '';
  timeField.appendChild(timeInput);

  const catField = document.createElement('label');
  catField.className = 'field';
  catField.innerHTML = '<span class="field-label">분류 (선택)</span>';
  const catSelect = document.createElement('select');
  catSelect.className = 'item-cat-select';
  const blankOpt = document.createElement('option');
  blankOpt.value = '';
  blankOpt.textContent = '선택 안 함';
  catSelect.appendChild(blankOpt);
  CATEGORIES.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.value;
    opt.textContent = `${c.icon} ${c.label}`;
    if (existing && existing.category === c.value) opt.selected = true;
    catSelect.appendChild(opt);
  });
  catField.appendChild(catSelect);

  row1.appendChild(timeField);
  row1.appendChild(catField);
  form.appendChild(row1);

  const scheduleField = document.createElement('label');
  scheduleField.className = 'field';
  scheduleField.innerHTML = '<span class="field-label">일정 내용</span>';
  const scheduleInput = document.createElement('textarea');
  scheduleInput.className = 'item-form-textarea';
  scheduleInput.rows = 2;
  scheduleInput.required = true;
  scheduleInput.value = existing ? existing.schedule : '';
  scheduleField.appendChild(scheduleInput);
  form.appendChild(scheduleField);

  const placeField = document.createElement('label');
  placeField.className = 'field';
  placeField.innerHTML = '<span class="field-label">장소 (선택)</span>';
  const placeInput = document.createElement('input');
  placeInput.type = 'text';
  placeInput.maxLength = 80;
  placeInput.value = existing ? existing.location : '';
  placeField.appendChild(placeInput);
  form.appendChild(placeField);

  // 좌표 (선택) — 동선 보기에 쓰입니다. 접어 두고 필요할 때만 폅니다.
  const coordToggle = document.createElement('button');
  coordToggle.type = 'button';
  coordToggle.className = 'coord-toggle';
  const hasCoord = existing && typeof existing.lat === 'number';
  coordToggle.textContent = hasCoord ? '좌표 넣음 (누르면 접기/펴기)' : '좌표 직접 입력 (선택, 동선 보기용)';
  const coordRow = document.createElement('div');
  coordRow.className = 'item-form-row';
  coordRow.classList.toggle('hidden', !hasCoord);

  const latField = document.createElement('label');
  latField.className = 'field';
  latField.innerHTML = '<span class="field-label">위도</span>';
  const latInput = document.createElement('input');
  latInput.type = 'number';
  latInput.step = 'any';
  latInput.value = existing && typeof existing.lat === 'number' ? existing.lat : '';
  latField.appendChild(latInput);

  const lngField = document.createElement('label');
  lngField.className = 'field';
  lngField.innerHTML = '<span class="field-label">경도</span>';
  const lngInput = document.createElement('input');
  lngInput.type = 'number';
  lngInput.step = 'any';
  lngInput.value = existing && typeof existing.lng === 'number' ? existing.lng : '';
  lngField.appendChild(lngInput);

  coordRow.appendChild(latField);
  coordRow.appendChild(lngField);
  coordToggle.addEventListener('click', () => coordRow.classList.toggle('hidden'));
  form.appendChild(coordToggle);
  form.appendChild(coordRow);

  // 첨부 1~3
  const attInputs = [];
  for (let slot = 0; slot < 3; slot += 1) {
    const existingAtt = existing ? existing.att[slot] : { text: '', image: '' };
    attInputs.push(buildAttachmentField(slot, existingAtt, form));
  }

  const errorMsg = document.createElement('p');
  errorMsg.className = 'item-form-error hidden';
  form.appendChild(errorMsg);

  const btnRow = document.createElement('div');
  btnRow.className = 'item-form-row';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn btn-primary small';
  saveBtn.textContent = existing ? '고치기' : '추가하기';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-outline small';
  cancelBtn.textContent = '취소';
  cancelBtn.addEventListener('click', () => onClose());
  btnRow.appendChild(saveBtn);
  btnRow.appendChild(cancelBtn);
  form.appendChild(btnRow);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const schedule = scheduleInput.value.trim();
    if (!schedule) { errorMsg.textContent = '일정 내용을 적어 주세요'; errorMsg.classList.remove('hidden'); return; }

    const lat = latInput.value.trim() ? Number(latInput.value) : null;
    const lng = lngInput.value.trim() ? Number(lngInput.value) : null;

    const att = attInputs.map((a) => ({ text: a.textInput.value.trim(), image: a.currentImage }));

    const now = Date.now();
    if (existing) {
      Object.assign(existing, {
        time: timeInput.value,
        category: catSelect.value,
        schedule,
        location: placeInput.value.trim(),
        lat, lng, att,
        updatedAt: now,
      });
    } else {
      const siblings = itemsOfDay(trip.id, day);
      travel.items.push({
        id: newId(), tripId: trip.id, day,
        date: addDaysISO(trip.start, day - 1),
        time: timeInput.value,
        category: catSelect.value,
        schedule,
        location: placeInput.value.trim(),
        lat, lng, att,
        order: siblings.length,
        updatedAt: now,
      });
    }
    saveTravel();
    onClose();
    renderPanel();
  });

  return form;
}

function buildAttachmentField(slot, existingAtt, form) {
  const wrap = document.createElement('div');
  wrap.className = 'att-field';

  const label = document.createElement('span');
  label.className = 'field-label';
  label.textContent = `첨부 ${slot + 1} (선택)`;
  wrap.appendChild(label);

  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.placeholder = '메모 (예: 예약 확인서)';
  textInput.maxLength = 60;
  textInput.value = existingAtt.text || '';
  wrap.appendChild(textInput);

  const fileRow = document.createElement('div');
  fileRow.className = 'att-file-row';

  const preview = document.createElement('img');
  preview.className = 'att-thumb att-thumb-editing';
  preview.classList.toggle('hidden', !existingAtt.image);
  if (existingAtt.image) preview.src = existingAtt.image;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'gear-act gear-del';
  removeBtn.textContent = '✕';
  removeBtn.classList.toggle('hidden', !existingAtt.image);
  removeBtn.setAttribute('aria-label', `첨부 ${slot + 1} 사진 지우기`);

  const state = { currentImage: existingAtt.image || '', textInput };

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    readImageCompressed(file)
      .then((dataUrl) => {
        state.currentImage = dataUrl;
        preview.src = dataUrl;
        preview.classList.remove('hidden');
        removeBtn.classList.remove('hidden');
      })
      .catch((err) => { flashFormError(form, err.message); })
      .finally(() => { fileInput.value = ''; });
  });

  removeBtn.addEventListener('click', () => {
    state.currentImage = '';
    preview.src = '';
    preview.classList.add('hidden');
    removeBtn.classList.add('hidden');
  });

  fileRow.appendChild(preview);
  fileRow.appendChild(fileInput);
  fileRow.appendChild(removeBtn);
  wrap.appendChild(fileRow);

  form.appendChild(wrap);
  return state;
}

function flashFormError(form, message) {
  const el = form.querySelector('.item-form-error');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
}

/**
 * 사진 파일을 읽어 적당한 크기로 줄인 JPEG data URL 로 바꿉니다.
 * 업로드 서버가 없는 정적 앱이라, 기록 자체(JSON)에 사진을 함께 담아
 * 저장·동기화합니다. 그래서 너무 큰 사진은 품질을 낮춰서라도 줄입니다.
 */
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

/* ================= 항공편 ================= */

function buildFlights(trip, body) {
  const addWrap = document.createElement('div');
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-primary small';
  addBtn.textContent = '+ 항공편 추가';
  const formSlot = document.createElement('div');
  addBtn.addEventListener('click', () => {
    formSlot.innerHTML = '';
    formSlot.appendChild(buildFlightForm(trip, null, () => { formSlot.innerHTML = ''; }));
  });
  addWrap.appendChild(addBtn);
  addWrap.appendChild(formSlot);
  body.appendChild(addWrap);

  const list = flightsOfTrip(trip.id);
  if (list.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'list-empty';
    empty.textContent = '아직 등록된 항공편이 없어요.';
    body.appendChild(empty);
    return;
  }

  list.forEach((flight) => {
    const rowWrap = document.createElement('div');
    const row = document.createElement('div');
    row.className = 'flight-row';

    const info = document.createElement('div');
    info.className = 'flight-info';
    const line1 = document.createElement('div');
    line1.className = 'flight-airline';
    line1.textContent = `${flight.airline} · ${flight.code}`;
    const line2 = document.createElement('div');
    line2.className = 'flight-dates';
    line2.textContent = flight.depDate === flight.arrDate
      ? flight.depDate
      : `${flight.depDate} → ${flight.arrDate}`;
    info.appendChild(line1);
    info.appendChild(line2);

    const actions = document.createElement('div');
    actions.className = 'item-actions';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'gear-act gear-edit';
    editBtn.textContent = '✎';
    const editSlot = document.createElement('div');
    editBtn.addEventListener('click', () => {
      if (editSlot.childElementCount) { editSlot.innerHTML = ''; return; }
      editSlot.appendChild(buildFlightForm(trip, flight, () => { editSlot.innerHTML = ''; }));
    });
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'gear-act gear-del';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      travel.flights = travel.flights.filter((f) => f.id !== flight.id);
      saveTravel();
      renderPanel();
    });
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    row.appendChild(info);
    row.appendChild(actions);
    rowWrap.appendChild(row);
    rowWrap.appendChild(editSlot);
    body.appendChild(rowWrap);
  });
}

function buildFlightForm(trip, existing, onClose) {
  const form = document.createElement('form');
  form.className = 'item-form';

  const row1 = document.createElement('div');
  row1.className = 'item-form-row';
  const depField = document.createElement('label');
  depField.className = 'field';
  depField.innerHTML = '<span class="field-label">출발일</span>';
  const depInput = document.createElement('input');
  depInput.type = 'date';
  depInput.required = true;
  depInput.value = existing ? existing.depDate : trip.start;
  depField.appendChild(depInput);

  const arrField = document.createElement('label');
  arrField.className = 'field';
  arrField.innerHTML = '<span class="field-label">도착일</span>';
  const arrInput = document.createElement('input');
  arrInput.type = 'date';
  arrInput.required = true;
  arrInput.value = existing ? existing.arrDate : trip.start;
  arrField.appendChild(arrInput);
  row1.appendChild(depField);
  row1.appendChild(arrField);
  form.appendChild(row1);

  const airlineField = document.createElement('label');
  airlineField.className = 'field';
  airlineField.innerHTML = '<span class="field-label">항공사</span>';
  const airlineInput = document.createElement('input');
  airlineInput.type = 'text';
  airlineInput.required = true;
  airlineInput.maxLength = 40;
  airlineInput.value = existing ? existing.airline : '';
  airlineField.appendChild(airlineInput);
  form.appendChild(airlineField);

  const codeField = document.createElement('label');
  codeField.className = 'field';
  codeField.innerHTML = '<span class="field-label">편명 / 구간</span>';
  const codeInput = document.createElement('input');
  codeInput.type = 'text';
  codeInput.required = true;
  codeInput.maxLength = 60;
  codeInput.placeholder = '예: QR859 (인천-도하)';
  codeInput.value = existing ? existing.code : '';
  codeField.appendChild(codeInput);
  form.appendChild(codeField);

  const btnRow = document.createElement('div');
  btnRow.className = 'item-form-row';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn btn-primary small';
  saveBtn.textContent = existing ? '고치기' : '추가하기';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-outline small';
  cancelBtn.textContent = '취소';
  cancelBtn.addEventListener('click', () => onClose());
  btnRow.appendChild(saveBtn);
  btnRow.appendChild(cancelBtn);
  form.appendChild(btnRow);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const now = Date.now();
    if (existing) {
      Object.assign(existing, {
        depDate: depInput.value, arrDate: arrInput.value,
        airline: airlineInput.value.trim(), code: codeInput.value.trim(),
        updatedAt: now,
      });
    } else {
      travel.flights.push({
        id: newId(), tripId: trip.id,
        depDate: depInput.value, arrDate: arrInput.value,
        airline: airlineInput.value.trim(), code: codeInput.value.trim(),
        updatedAt: now,
      });
    }
    saveTravel();
    onClose();
    renderPanel();
  });

  return form;
}

/* ================= 숙소 ================= */

function buildStays(trip, body) {
  const addWrap = document.createElement('div');
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-primary small';
  addBtn.textContent = '+ 숙소 추가';
  const formSlot = document.createElement('div');
  addBtn.addEventListener('click', () => {
    formSlot.innerHTML = '';
    formSlot.appendChild(buildStayForm(trip, null, () => { formSlot.innerHTML = ''; }));
  });
  addWrap.appendChild(addBtn);
  addWrap.appendChild(formSlot);
  body.appendChild(addWrap);

  const list = staysOfTrip(trip.id);
  if (list.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'list-empty';
    empty.textContent = '아직 등록된 숙소가 없어요.';
    body.appendChild(empty);
    return;
  }

  list.forEach((stay) => {
    const rowWrap = document.createElement('div');
    const row = document.createElement('div');
    row.className = 'flight-row';

    const info = document.createElement('div');
    info.className = 'flight-info';
    const line1 = document.createElement('div');
    line1.className = 'flight-airline';
    line1.textContent = stay.name;
    const line2 = document.createElement('div');
    line2.className = 'flight-dates';
    line2.textContent = `${stay.checkIn} ~ ${stay.checkOut}`;
    info.appendChild(line1);
    info.appendChild(line2);

    const actions = document.createElement('div');
    actions.className = 'item-actions';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'gear-act gear-edit';
    editBtn.textContent = '✎';
    const editSlot = document.createElement('div');
    editBtn.addEventListener('click', () => {
      if (editSlot.childElementCount) { editSlot.innerHTML = ''; return; }
      editSlot.appendChild(buildStayForm(trip, stay, () => { editSlot.innerHTML = ''; }));
    });
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'gear-act gear-del';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      travel.stays = travel.stays.filter((s) => s.id !== stay.id);
      saveTravel();
      renderPanel();
    });
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    row.appendChild(info);
    row.appendChild(actions);
    rowWrap.appendChild(row);
    rowWrap.appendChild(editSlot);
    body.appendChild(rowWrap);
  });
}

function buildStayForm(trip, existing, onClose) {
  const form = document.createElement('form');
  form.className = 'item-form';

  const nameField = document.createElement('label');
  nameField.className = 'field';
  nameField.innerHTML = '<span class="field-label">숙소 이름</span>';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.required = true;
  nameInput.maxLength = 60;
  nameInput.value = existing ? existing.name : '';
  nameField.appendChild(nameInput);
  form.appendChild(nameField);

  const row1 = document.createElement('div');
  row1.className = 'item-form-row';
  const inField = document.createElement('label');
  inField.className = 'field';
  inField.innerHTML = '<span class="field-label">체크인</span>';
  const inInput = document.createElement('input');
  inInput.type = 'date';
  inInput.required = true;
  inInput.value = existing ? existing.checkIn : trip.start;
  inField.appendChild(inInput);

  const outField = document.createElement('label');
  outField.className = 'field';
  outField.innerHTML = '<span class="field-label">체크아웃</span>';
  const outInput = document.createElement('input');
  outInput.type = 'date';
  outInput.required = true;
  outInput.value = existing ? existing.checkOut : trip.end;
  outField.appendChild(outInput);
  row1.appendChild(inField);
  row1.appendChild(outField);
  form.appendChild(row1);

  const btnRow = document.createElement('div');
  btnRow.className = 'item-form-row';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn btn-primary small';
  saveBtn.textContent = existing ? '고치기' : '추가하기';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-outline small';
  cancelBtn.textContent = '취소';
  cancelBtn.addEventListener('click', () => onClose());
  btnRow.appendChild(saveBtn);
  btnRow.appendChild(cancelBtn);
  form.appendChild(btnRow);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const now = Date.now();
    if (existing) {
      Object.assign(existing, {
        name: nameInput.value.trim(), checkIn: inInput.value, checkOut: outInput.value,
        updatedAt: now,
      });
    } else {
      travel.stays.push({
        id: newId(), tripId: trip.id,
        name: nameInput.value.trim(), checkIn: inInput.value, checkOut: outInput.value,
        updatedAt: now,
      });
    }
    saveTravel();
    onClose();
    renderPanel();
  });

  return form;
}

/* ================= 체크리스트 ================= */

function buildChecklist(trip, body) {
  const form = document.createElement('form');
  form.className = 'gear-add';
  const row = document.createElement('div');
  row.className = 'gear-add-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '챙길 것을 적고 추가하세요 (예: 여권)';
  input.maxLength = 60;
  const addBtn = document.createElement('button');
  addBtn.type = 'submit';
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = '추가';
  row.appendChild(input);
  row.appendChild(addBtn);
  form.appendChild(row);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    travel.checks.push({ id: newId(), tripId: trip.id, text, checked: false, updatedAt: Date.now() });
    saveTravel();
    input.value = '';
    input.focus();
    renderPanel();
  });
  body.appendChild(form);

  const list = document.createElement('ul');
  list.className = 'gear-list';
  const items = checksOfTrip(trip.id);

  if (items.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'list-empty';
    empty.textContent = '체크리스트 항목을 추가해 보세요.';
    list.appendChild(empty);
  } else {
    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'gear-item' + (item.checked ? ' done' : '');

      const check = document.createElement('span');
      check.className = 'gear-check';
      check.textContent = '✓';

      const text = document.createElement('span');
      text.className = 'gear-text';
      text.textContent = item.text;

      const actions = document.createElement('span');
      actions.className = 'gear-actions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'gear-act gear-edit';
      editBtn.textContent = '✎';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = window.prompt('이름을 고칩니다', item.text);
        if (next === null) return;
        const t = next.trim();
        if (!t) { showToast('이름을 비워둘 수는 없어요'); return; }
        item.text = t;
        item.updatedAt = Date.now();
        saveTravel();
        renderPanel();
      });
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'gear-act gear-del';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        travel.checks = travel.checks.filter((c) => c.id !== item.id);
        saveTravel();
        renderPanel();
      });
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      li.appendChild(check);
      li.appendChild(text);
      li.appendChild(actions);
      li.addEventListener('click', () => {
        item.checked = !item.checked;
        item.updatedAt = Date.now();
        saveTravel();
        renderPanel();
      });
      list.appendChild(li);
    });
  }
  body.appendChild(list);
}

/* ================= 여행 관리 ================= */

function addTrip(name, start, end) {
  const trip = { id: newId(), name, start, end, order: travel.trips.length, updatedAt: Date.now() };
  travel.trips.push(trip);
  saveTravel();
  setActiveTrip(trip.id);
  renderAll();
  showToast(`${name} 여행을 추가했어요`);
}

function renameTrip(trip) {
  const next = window.prompt('여행 이름을 바꿉니다', trip.name);
  if (next === null) return;
  const name = next.trim();
  if (!name) { showToast('이름을 비워둘 수는 없어요'); return; }
  trip.name = name;
  trip.updatedAt = Date.now();
  saveTravel();
  renderAll();
}

function editTripDates(trip) {
  const start = window.prompt('시작일 (예: 2026-10-29)', trip.start);
  if (start === null) return;
  const end = window.prompt('종료일 (예: 2026-11-08)', trip.end);
  if (end === null) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    showToast('날짜 형식이 올바르지 않아요 (예: 2026-10-29)');
    return;
  }
  if (toUTC(end) < toUTC(start)) { showToast('종료일이 시작일보다 빠를 수 없어요'); return; }
  trip.start = start;
  trip.end = end;
  trip.updatedAt = Date.now();
  saveTravel();
  renderAll();
}

function deleteTrip(trip) {
  if (!window.confirm(`'${trip.name}' 여행 기록을 전부(일정 · 항공편 · 숙소 · 체크리스트) 삭제할까요?`)) return;
  const id = trip.id;
  travel.trips = travel.trips.filter((t) => t.id !== id);
  travel.items = travel.items.filter((i) => i.tripId !== id);
  travel.flights = travel.flights.filter((f) => f.tripId !== id);
  travel.stays = travel.stays.filter((s) => s.tripId !== id);
  travel.checks = travel.checks.filter((c) => c.tripId !== id);
  travel.summaries = travel.summaries.filter((s) => s.tripId !== id);
  saveTravel();
  setActiveTrip(travel.trips[0] ? travel.trips[0].id : null);
  renderAll();
  showToast('여행을 삭제했어요');
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
    travel = normalizeTravel(state.travel);
    localStorage.setItem(LS_TRAVEL, JSON.stringify(travel));

    if (travel.trips.length && !getActiveTrip()) setActiveTrip(sortedTrips()[0].id);
    if (!travel.trips.length) setActiveTrip(null);

    if (!options || options.rerender !== false) renderAll();
  },
  toast: showToast,
};

/* ---- 새 여행 만들기 폼 ---- */
const newTripForm = document.getElementById('newTripForm');
const newTripChevron = document.getElementById('newTripChevron');
const startInput = document.getElementById('startInput');
const endInput = document.getElementById('endInput');
const nameInput = document.getElementById('nameInput');

function toggleNewTripForm(show) {
  const willShow = show === undefined ? newTripForm.classList.contains('hidden') : show;
  newTripForm.classList.toggle('hidden', !willShow);
  newTripChevron.textContent = willShow ? '▴' : '▾';
}

document.getElementById('newTripToggle').addEventListener('click', () => toggleNewTripForm());

startInput.addEventListener('change', () => {
  if (!startInput.value) return;
  endInput.min = startInput.value;
  if (endInput.value && endInput.value < startInput.value) endInput.value = startInput.value;
});

newTripForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const start = startInput.value;
  const end = endInput.value;
  const name = nameInput.value.trim();

  if (!start || !end) { showToast('시작일과 종료일을 골라주세요'); return; }
  if (!name) { showToast('여행 이름을 적어주세요'); return; }
  if (toUTC(end) < toUTC(start)) { showToast('종료일이 시작일보다 빠를 수 없어요'); return; }

  addTrip(name, start, end);

  nameInput.value = '';
  const nextStart = addDaysISO(end, 1);
  startInput.value = nextStart;
  endInput.value = addDaysISO(nextStart, 1);
  endInput.min = nextStart;
  toggleNewTripForm(false);
});

const lightboxEl = document.getElementById('lightbox');
if (lightboxEl) lightboxEl.addEventListener('click', closeLightbox);

// ---- init ----
const seeded = maybeImportSeed();

const today = todayISO();
startInput.value = today;
endInput.value = addDaysISO(today, 1);
endInput.min = today;

if (travel.trips.length && !getActiveTrip()) setActiveTrip(sortedTrips()[0].id);
if (travel.trips.length === 0) toggleNewTripForm(true);

renderAll();

if (seeded) {
  const t = sortedTrips()[0];
  if (t) showToast(`${t.name} 여행 기록을 가져왔어요`);
}

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

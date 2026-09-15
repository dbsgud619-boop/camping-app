// ---- storage keys ----
const LS_TRIPS = 'campingApp.trips.v1';
const LS_ACTIVE_TRIP = 'campingApp.activeTrip.v1';
const LS_SUB_TAB = 'campingApp.subTab.v1';

const DAY_MS = 86400000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// ---- 하루에 기입할 수 있는 끼니 ----
const MEALS = [
  { key: 'morning', label: '아침', hint: '예: 토스트, 커피' },
  { key: 'brunch', label: '아점', hint: '예: 라면' },
  { key: 'lunch', label: '점심', hint: '예: 삼겹살' },
  { key: 'linner', label: '점저', hint: '예: 과자, 맥주' },
  { key: 'dinner', label: '저녁', hint: '예: 목살 + 쌈' },
  { key: 'night', label: '야간', hint: '예: 마시멜로' },
];

// ---- state ----
let trips = loadTrips();
let activeTripId = localStorage.getItem(LS_ACTIVE_TRIP) || (trips[0] ? trips[0].id : null);
let activeSubTab = localStorage.getItem(LS_SUB_TAB) || 'gear';

function loadTrips() {
  try {
    const raw = localStorage.getItem(LS_TRIPS);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}
function saveTrips() {
  localStorage.setItem(LS_TRIPS, JSON.stringify(trips));
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
function datesOf(trip) {
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
function getActiveTrip() {
  return trips.find((t) => t.id === activeTripId) || null;
}
function gearDoneCount(trip) {
  return trip.gear.filter((g) => g.done).length;
}
function mealFilledCount(trip, iso) {
  const day = trip.meals[iso] || {};
  return MEALS.filter((m) => (day[m.key] || '').trim()).length;
}
function mealTotalFilled(trip) {
  return datesOf(trip).reduce((sum, iso) => sum + mealFilledCount(trip, iso), 0);
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 1800);
}

// ---- rendering ----
function renderAll() {
  renderTripTabs();
  renderPanel();
}

function renderTripTabs() {
  const nav = document.getElementById('tripTabs');
  nav.innerHTML = '';

  trips.forEach((trip) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'trip-tab' + (trip.id === activeTripId ? ' active' : '');

    const place = document.createElement('span');
    place.className = 'trip-tab-place';
    place.textContent = trip.place;

    const meta = document.createElement('span');
    meta.className = 'trip-tab-meta';
    meta.textContent = `${rangeLabel(trip)} · ${lengthLabel(trip)}`;

    tab.appendChild(place);
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
  const place = document.createElement('h2');
  place.className = 'trip-place';
  place.textContent = trip.place;

  const dates = document.createElement('div');
  dates.className = 'trip-dates';
  dates.textContent = `${trip.start} ~ ${trip.end}`;

  left.appendChild(place);
  left.appendChild(dates);

  const actions = document.createElement('div');
  actions.className = 'trip-head-actions';

  const renameBtn = document.createElement('button');
  renameBtn.type = 'button';
  renameBtn.className = 'icon-btn';
  renameBtn.textContent = '수정';
  renameBtn.addEventListener('click', () => renameTrip(trip));

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'icon-btn';
  delBtn.textContent = '삭제';
  delBtn.addEventListener('click', () => deleteTrip(trip));

  actions.appendChild(renameBtn);
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

function buildSubTabs(trip) {
  const wrap = document.createElement('nav');
  wrap.className = 'sub-tabs';

  const tabs = [
    { key: 'gear', label: '준비물', count: `${gearDoneCount(trip)}/${trip.gear.length}` },
    { key: 'meals', label: '식단', count: `${mealTotalFilled(trip)}칸` },
  ];

  tabs.forEach((info) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sub-tab' + (info.key === activeSubTab ? ' active' : '');

    const label = document.createElement('span');
    label.textContent = info.label;

    const count = document.createElement('span');
    count.className = 'sub-tab-count';
    count.textContent = info.count;

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
  if (activeSubTab === 'meals') buildMeals(trip, body);
  else buildGear(trip, body);
}

// ---- 준비물 탭 ----
function buildGear(trip, body) {
  const form = document.createElement('form');
  form.className = 'gear-add';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '준비물을 적고 추가하세요 (예: 텐트)';
  input.maxLength = 60;
  input.autocomplete = 'off';

  const addBtn = document.createElement('button');
  addBtn.type = 'submit';
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = '추가';

  form.appendChild(input);
  form.appendChild(addBtn);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    trip.gear.push({ id: newId(), text, done: false });
    saveTrips();
    input.value = '';
    input.focus(); // 연달아 적을 수 있게 입력칸을 붙잡아 둡니다.
    refreshGear(trip);
  });

  const progress = document.createElement('div');
  progress.className = 'gear-progress';
  progress.id = 'gearProgress';

  const list = document.createElement('ul');
  list.className = 'gear-list';
  list.id = 'gearList';

  body.appendChild(form);
  body.appendChild(progress);
  body.appendChild(list);

  renderGearProgress(trip);
  renderGearList(trip);
}

function renderGearProgress(trip) {
  const wrap = document.getElementById('gearProgress');
  if (!wrap) return;
  wrap.innerHTML = '';

  const total = trip.gear.length;
  if (total === 0) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');

  const done = gearDoneCount(trip);
  const bar = document.createElement('div');
  bar.className = 'gear-bar';

  const fill = document.createElement('div');
  fill.className = 'gear-bar-fill';
  fill.style.width = `${Math.round((done / total) * 100)}%`;
  bar.appendChild(fill);

  const text = document.createElement('span');
  text.className = 'gear-progress-text';
  text.textContent = done === total ? '전부 챙겼어요 ✓' : `${done} / ${total} 챙김`;

  wrap.appendChild(bar);
  wrap.appendChild(text);
}

function renderGearList(trip) {
  const list = document.getElementById('gearList');
  if (!list) return;
  list.innerHTML = '';

  if (trip.gear.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'list-empty';
    empty.textContent = '준비물을 하나씩 추가해 보세요.';
    list.appendChild(empty);
    return;
  }

  trip.gear.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'gear-item' + (item.done ? ' done' : '');

    const check = document.createElement('span');
    check.className = 'gear-check';
    check.textContent = '✓';

    const text = document.createElement('span');
    text.className = 'gear-text';
    text.textContent = item.text;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'gear-del';
    del.textContent = '✕';
    del.setAttribute('aria-label', `${item.text} 삭제`);
    del.addEventListener('click', (e) => {
      e.stopPropagation(); // 삭제를 눌렀을 때 체크까지 되지 않게
      trip.gear = trip.gear.filter((g) => g.id !== item.id);
      saveTrips();
      refreshGear(trip);
    });

    li.appendChild(check);
    li.appendChild(text);
    li.appendChild(del);

    // 줄 아무 데나 눌러도 체크됩니다.
    li.addEventListener('click', () => {
      item.done = !item.done;
      saveTrips();
      refreshGear(trip);
    });

    list.appendChild(li);
  });
}

/** 준비물만 다시 그립니다. 입력칸 포커스를 잃지 않도록 패널 전체는 건드리지 않습니다. */
function refreshGear(trip) {
  renderGearList(trip);
  renderGearProgress(trip);
  refreshSubTabCounts(trip);
}

function refreshSubTabCounts(trip) {
  const counts = document.querySelectorAll('.sub-tab-count');
  if (counts.length < 2) return;
  counts[0].textContent = `${gearDoneCount(trip)}/${trip.gear.length}`;
  counts[1].textContent = `${mealTotalFilled(trip)}칸`;
}

// ---- 식단 탭 ----
function buildMeals(trip, body) {
  datesOf(trip).forEach((iso, index) => {
    if (!trip.meals[iso]) trip.meals[iso] = {};
    const day = trip.meals[iso];

    const card = document.createElement('section');
    card.className = 'day-card';

    const head = document.createElement('div');
    head.className = 'day-head';

    const dayIndex = document.createElement('span');
    dayIndex.className = 'day-index';
    dayIndex.textContent = `${index + 1}일차`;

    const dayDate = document.createElement('span');
    dayDate.className = 'day-date';
    dayDate.textContent = shortDate(iso);

    const filled = document.createElement('span');
    filled.className = 'day-filled';
    filled.textContent = `${mealFilledCount(trip, iso)}/${MEALS.length}`;

    head.appendChild(dayIndex);
    head.appendChild(dayDate);
    head.appendChild(filled);
    card.appendChild(head);

    MEALS.forEach((meal) => {
      const row = document.createElement('div');
      row.className = 'meal-row';

      const inputId = `meal-${iso}-${meal.key}`;

      const label = document.createElement('label');
      label.className = 'meal-label';
      label.textContent = meal.label;
      label.setAttribute('for', inputId);

      const input = document.createElement('input');
      input.type = 'text';
      input.id = inputId;
      input.className = 'meal-input' + ((day[meal.key] || '').trim() ? ' filled' : '');
      input.placeholder = meal.hint;
      input.value = day[meal.key] || '';
      input.maxLength = 80;
      input.autocomplete = 'off';

      input.addEventListener('input', () => {
        day[meal.key] = input.value;
        input.classList.toggle('filled', !!input.value.trim());
        filled.textContent = `${mealFilledCount(trip, iso)}/${MEALS.length}`;
        refreshSubTabCounts(trip);
        queueSave();
      });
      input.addEventListener('blur', saveNow);

      row.appendChild(label);
      row.appendChild(input);
      card.appendChild(row);
    });

    body.appendChild(card);
  });
}

// 타자 한 글자마다 저장하지 않도록 잠깐 모았다가 씁니다.
let saveTimer = null;
function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}
function saveNow() {
  clearTimeout(saveTimer);
  saveTrips();
}

// ---- actions ----
function addTrip(start, end, place) {
  const trip = {
    id: newId(),
    place,
    start,
    end,
    createdAt: Date.now(),
    gear: [],
    meals: {},
  };
  trips.push(trip);
  trips.sort((a, b) => a.start.localeCompare(b.start));
  saveTrips();
  setActiveTrip(trip.id);
  renderAll();
  showToast(`${place} 캠핑을 추가했어요`);
}

function renameTrip(trip) {
  const next = window.prompt('장소 이름을 바꿉니다', trip.place);
  if (next === null) return;
  const place = next.trim();
  if (!place) {
    showToast('장소를 비워둘 수는 없어요');
    return;
  }
  trip.place = place;
  saveTrips();
  renderAll();
}

function deleteTrip(trip) {
  if (!window.confirm(`'${trip.place}' 캠핑을 준비물·식단까지 모두 삭제할까요?`)) return;
  trips = trips.filter((t) => t.id !== trip.id);
  saveTrips();
  setActiveTrip(trips[0] ? trips[0].id : null);
  renderAll();
  showToast('캠핑을 삭제했어요');
}

// ---- event wiring ----
const newTripForm = document.getElementById('newTripForm');
const newTripChevron = document.getElementById('newTripChevron');
const startInput = document.getElementById('startInput');
const endInput = document.getElementById('endInput');
const placeInput = document.getElementById('placeInput');

function toggleNewTripForm(show) {
  const willShow = show === undefined ? newTripForm.classList.contains('hidden') : show;
  newTripForm.classList.toggle('hidden', !willShow);
  newTripChevron.textContent = willShow ? '▴' : '▾';
}

document.getElementById('newTripToggle').addEventListener('click', () => toggleNewTripForm());

// 시작일을 고르면 종료일이 그보다 앞설 수 없게 맞춰 줍니다.
startInput.addEventListener('change', () => {
  if (!startInput.value) return;
  endInput.min = startInput.value;
  if (endInput.value && endInput.value < startInput.value) {
    endInput.value = startInput.value;
  }
});

newTripForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const start = startInput.value;
  const end = endInput.value;
  const place = placeInput.value.trim();

  if (!start || !end) {
    showToast('시작일과 종료일을 골라주세요');
    return;
  }
  if (!place) {
    showToast('장소를 적어주세요');
    return;
  }
  if (toUTC(end) < toUTC(start)) {
    showToast('종료일이 시작일보다 빠를 수 없어요');
    return;
  }

  addTrip(start, end, place);

  placeInput.value = '';
  const nextStart = addDaysISO(end, 1);
  startInput.value = nextStart;
  endInput.value = addDaysISO(nextStart, 1);
  endInput.min = nextStart;
  toggleNewTripForm(false);
});

// 앱을 덮기 전에 적던 식단을 확실히 저장합니다.
window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveNow();
});

// ---- init ----
const today = todayISO();
startInput.value = today;
endInput.value = addDaysISO(today, 1);
endInput.min = today;

if (trips.length && !getActiveTrip()) setActiveTrip(trips[0].id);
if (trips.length === 0) toggleNewTripForm(true);

renderAll();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}

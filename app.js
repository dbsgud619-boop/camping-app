// ---- storage keys ----
const LS_TRIPS = 'campingApp.trips.v1';
const LS_ACTIVE_TRIP = 'campingApp.activeTrip.v1';
const LS_SUB_TAB = 'campingApp.subTab.v1';
const LS_SHARED_GEAR = 'campingApp.sharedGear.v1';
const LS_ADD_SCOPE = 'campingApp.addScope.v1';

const DAY_MS = 86400000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// ---- 하루에 기입할 수 있는 끼니 ----
// hint : 빈 칸에 흐리게 보이는 안내 문구
// main : 아침·점심·저녁은 주 끼니라 굵게, 나머지는 곁들이는 끼니라 흐리게
const MEALS = [
  { key: 'morning', label: '아침', hint: '', main: true },
  { key: 'brunch', label: '아점', hint: '추가', main: false },
  { key: 'lunch', label: '점심', hint: '', main: true },
  { key: 'linner', label: '점저', hint: '추가', main: false },
  { key: 'dinner', label: '저녁', hint: '', main: true },
  { key: 'night', label: '야간', hint: '추가', main: false },
];

// ---- state ----
// 준비물은 두 갈래입니다.
//   sharedGear  : 모든 일정에 함께 나오는 공용 목록 (텐트, 침낭 …)
//   trip.gear   : 그 일정에만 필요한 항목 (낚시대 …)
//   trip.checks : 공용 항목을 이 일정에서 챙겼는지 (체크는 일정별로 따로)
let trips = loadTrips();
let sharedGear = loadSharedGear();
let activeTripId = localStorage.getItem(LS_ACTIVE_TRIP) || (trips[0] ? trips[0].id : null);
let activeSubTab = localStorage.getItem(LS_SUB_TAB) || 'gear';
let addScope = localStorage.getItem(LS_ADD_SCOPE) === 'trip' ? 'trip' : 'shared';

/** 예전 버전에서 저장된 일정에도 빠진 칸을 채워 둡니다. */
function normalizeTrip(trip) {
  if (!Array.isArray(trip.gear)) trip.gear = [];
  if (!trip.checks || typeof trip.checks !== 'object') trip.checks = {};
  if (!trip.meals || typeof trip.meals !== 'object') trip.meals = {};
  return trip;
}

function loadTrips() {
  try {
    const raw = localStorage.getItem(LS_TRIPS);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeTrip) : [];
  } catch (e) {
    return [];
  }
}
function saveTrips() {
  localStorage.setItem(LS_TRIPS, JSON.stringify(trips));
}
function loadSharedGear() {
  try {
    const raw = localStorage.getItem(LS_SHARED_GEAR);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}
function saveSharedGear() {
  localStorage.setItem(LS_SHARED_GEAR, JSON.stringify(sharedGear));
}
function setAddScope(scope) {
  addScope = scope;
  localStorage.setItem(LS_ADD_SCOPE, scope);
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
function gearTotalCount(trip) {
  return sharedGear.length + trip.gear.length;
}
function gearDoneCount(trip) {
  const sharedDone = sharedGear.filter((g) => trip.checks[g.id]).length;
  return sharedDone + trip.gear.filter((g) => g.done).length;
}
/** 같은 이름이 공용에도 이번 일정에도 없을 때만 true */
function isNewGearText(trip, text) {
  const norm = text.replace(/\s+/g, ' ').trim();
  const clash = (g) => g.text.replace(/\s+/g, ' ').trim() === norm;
  return !sharedGear.some(clash) && !trip.gear.some(clash);
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
    { key: 'gear', label: '준비물', count: `${gearDoneCount(trip)}/${gearTotalCount(trip)}` },
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

  const row = document.createElement('div');
  row.className = 'gear-add-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '준비물을 적고 추가하세요 (예: 텐트)';
  input.maxLength = 60;
  input.autocomplete = 'off';

  const addBtn = document.createElement('button');
  addBtn.type = 'submit';
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = '추가';

  row.appendChild(input);
  row.appendChild(addBtn);

  // 어디에 넣을지 고르는 칩. 고른 값은 다음에도 기억합니다.
  const chips = document.createElement('div');
  chips.className = 'scope-chips';

  const scopes = [
    { key: 'shared', label: '공용', hint: '모든 일정에 함께' },
    { key: 'trip', label: '이번 일정만', hint: '이 일정에만' },
  ];

  scopes.forEach((scope) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'scope-chip' + (scope.key === addScope ? ' active' : '');
    chip.textContent = scope.label;
    chip.addEventListener('click', () => {
      setAddScope(scope.key);
      chips.querySelectorAll('.scope-chip').forEach((c, i) => {
        c.classList.toggle('active', scopes[i].key === addScope);
      });
      input.focus();
    });
    chips.appendChild(chip);
  });

  form.appendChild(row);
  form.appendChild(chips);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    if (!isNewGearText(trip, text)) {
      showToast(`'${text}'은(는) 이미 목록에 있어요`);
      return;
    }

    if (addScope === 'shared') {
      sharedGear.push({ id: newId(), text });
      saveSharedGear();
    } else {
      trip.gear.push({ id: newId(), text, done: false });
      saveTrips();
    }

    input.value = '';
    input.focus(); // 연달아 적을 수 있게 입력칸을 붙잡아 둡니다.
    refreshGear(trip);
  });

  const progress = document.createElement('div');
  progress.className = 'gear-progress';
  progress.id = 'gearProgress';

  const lists = document.createElement('div');
  lists.id = 'gearLists';

  body.appendChild(form);
  body.appendChild(progress);
  body.appendChild(lists);

  renderGearProgress(trip);
  renderGearLists(trip);
}

function renderGearProgress(trip) {
  const wrap = document.getElementById('gearProgress');
  if (!wrap) return;
  wrap.innerHTML = '';

  const total = gearTotalCount(trip);
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

/** 준비물 한 줄. 체크는 줄 전체, 나머지 버튼은 각자 동작합니다. */
function buildGearRow(item, options) {
  const li = document.createElement('li');
  li.className = 'gear-item' + (options.done ? ' done' : '');

  const check = document.createElement('span');
  check.className = 'gear-check';
  check.textContent = '✓';

  const text = document.createElement('span');
  text.className = 'gear-text';
  text.textContent = item.text;

  const actions = document.createElement('span');
  actions.className = 'gear-actions';

  if (options.onPromote) {
    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'gear-act gear-promote';
    up.textContent = '공용으로';
    up.setAttribute('aria-label', `${item.text}을(를) 공용 준비물로 옮기기`);
    up.addEventListener('click', (e) => {
      e.stopPropagation();
      options.onPromote();
    });
    actions.appendChild(up);
  }

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'gear-act gear-edit';
  edit.textContent = '✎';
  edit.setAttribute('aria-label', `${item.text} 이름 수정`);
  edit.addEventListener('click', (e) => {
    e.stopPropagation();
    options.onEdit();
  });

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'gear-act gear-del';
  del.textContent = '✕';
  del.setAttribute('aria-label', `${item.text} 삭제`);
  del.addEventListener('click', (e) => {
    e.stopPropagation(); // 삭제를 눌렀을 때 체크까지 되지 않게
    options.onDelete();
  });

  actions.appendChild(edit);
  actions.appendChild(del);

  li.appendChild(check);
  li.appendChild(text);
  li.appendChild(actions);

  // 줄 아무 데나 눌러도 체크됩니다.
  li.addEventListener('click', options.onToggle);
  return li;
}

function buildGearSection(title, hint, items, emptyText) {
  const section = document.createElement('section');
  section.className = 'gear-section';

  const head = document.createElement('div');
  head.className = 'gear-section-head';

  const titleEl = document.createElement('span');
  titleEl.className = 'gear-section-title';
  titleEl.textContent = title;

  const hintEl = document.createElement('span');
  hintEl.className = 'gear-section-hint';
  hintEl.textContent = hint;

  head.appendChild(titleEl);
  head.appendChild(hintEl);
  section.appendChild(head);

  const list = document.createElement('ul');
  list.className = 'gear-list';

  if (items.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'list-empty';
    empty.textContent = emptyText;
    list.appendChild(empty);
  } else {
    items.forEach((li) => list.appendChild(li));
  }

  section.appendChild(list);
  return section;
}

function renderGearLists(trip) {
  const wrap = document.getElementById('gearLists');
  if (!wrap) return;
  wrap.innerHTML = '';

  // 공용 준비물
  const sharedRows = sharedGear.map((item) =>
    buildGearRow(item, {
      done: !!trip.checks[item.id],
      onToggle: () => {
        if (trip.checks[item.id]) delete trip.checks[item.id];
        else trip.checks[item.id] = true;
        saveTrips();
        refreshGear(trip);
      },
      onEdit: () => editGearText(trip, item, 'shared'),
      onDelete: () => deleteSharedGear(trip, item),
    })
  );

  wrap.appendChild(
    buildGearSection(
      '공용 준비물',
      '모든 일정에 함께 들어가요',
      sharedRows,
      '공용으로 쓸 준비물을 추가해 보세요.'
    )
  );

  // 이번 일정에만 있는 준비물 (있을 때만 보여줍니다)
  if (trip.gear.length > 0) {
    const tripRows = trip.gear.map((item) =>
      buildGearRow(item, {
        done: item.done,
        onToggle: () => {
          item.done = !item.done;
          saveTrips();
          refreshGear(trip);
        },
        onEdit: () => editGearText(trip, item, 'trip'),
        onDelete: () => {
          trip.gear = trip.gear.filter((g) => g.id !== item.id);
          saveTrips();
          refreshGear(trip);
        },
        onPromote: () => promoteToShared(trip, item),
      })
    );

    wrap.appendChild(
      buildGearSection('이번 일정만', trip.place, tripRows, '')
    );
  }
}

/** 이름 수정. 공용 항목을 고치면 모든 일정에서 같이 바뀝니다. */
function editGearText(trip, item, scope) {
  const next = window.prompt('준비물 이름을 고칩니다', item.text);
  if (next === null) return;

  const text = next.trim();
  if (!text) {
    showToast('이름을 비워둘 수는 없어요');
    return;
  }
  if (text === item.text) return;
  if (!isNewGearText(trip, text)) {
    showToast(`'${text}'은(는) 이미 목록에 있어요`);
    return;
  }

  item.text = text;
  if (scope === 'shared') saveSharedGear();
  else saveTrips();
  refreshGear(trip);
}

/** 공용 항목 삭제는 모든 일정에 영향을 주므로 한 번 물어봅니다. */
function deleteSharedGear(trip, item) {
  const others = trips.length - 1;
  const warning = others > 0
    ? `'${item.text}'은(는) 공용 준비물이에요.\n다른 일정 ${others}개에서도 함께 사라집니다. 지울까요?`
    : `'${item.text}'을(를) 지울까요?`;
  if (!window.confirm(warning)) return;

  sharedGear = sharedGear.filter((g) => g.id !== item.id);
  saveSharedGear();

  // 남아 있는 체크 기록도 같이 정리합니다.
  trips.forEach((t) => { delete t.checks[item.id]; });
  saveTrips();

  refreshGear(trip);
}

/** 이 일정에만 있던 항목을 공용으로 옮깁니다. 체크 상태는 그대로 가져갑니다. */
function promoteToShared(trip, item) {
  trip.gear = trip.gear.filter((g) => g.id !== item.id);
  sharedGear.push({ id: item.id, text: item.text });
  if (item.done) trip.checks[item.id] = true;

  saveSharedGear();
  saveTrips();
  refreshGear(trip);
  showToast(`'${item.text}'을(를) 공용으로 옮겼어요`);
}

/** 준비물만 다시 그립니다. 입력칸 포커스를 잃지 않도록 패널 전체는 건드리지 않습니다. */
function refreshGear(trip) {
  renderGearLists(trip);
  renderGearProgress(trip);
  refreshSubTabCounts(trip);
}

function refreshSubTabCounts(trip) {
  const counts = document.querySelectorAll('.sub-tab-count');
  if (counts.length < 2) return;
  counts[0].textContent = `${gearDoneCount(trip)}/${gearTotalCount(trip)}`;
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
      label.className = 'meal-label' + (meal.main ? ' main' : '');
      label.textContent = meal.label;
      label.setAttribute('for', inputId);

      const input = document.createElement('input');
      input.type = 'text';
      input.id = inputId;
      input.className = 'meal-input'
        + (meal.main ? ' main' : '')
        + ((day[meal.key] || '').trim() ? ' filled' : '');
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
    gear: [],    // 이 일정에만 필요한 항목
    checks: {},  // 공용 항목은 새 일정에서 전부 체크 해제로 시작합니다
    meals: {},
  };
  trips.push(trip);
  trips.sort((a, b) => a.start.localeCompare(b.start));
  saveTrips();
  setActiveTrip(trip.id);
  renderAll();

  showToast(
    sharedGear.length > 0
      ? `${place} 캠핑 추가 · 공용 준비물 ${sharedGear.length}개가 들어갔어요`
      : `${place} 캠핑을 추가했어요`
  );
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

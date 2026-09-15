/* ===========================================================
   함께 쓰기 (방 코드 방식)
   -----------------------------------------------------------
   · 기록은 늘 이 폰에 먼저 저장됩니다. 인터넷이 없어도 그대로 씁니다.
   · 방에 들어가면 같은 코드를 가진 사람들과 내용을 맞춥니다.
   · 맞출 때는 '지난번에 맞춘 내용(base)' 을 기준으로 내 변경과 상대
     변경을 둘 다 살려서 합칩니다. 같은 칸을 동시에 고쳤을 때만
     나중에 고친 쪽이 남습니다.
   =========================================================== */
(function () {
  'use strict';

  var LS_ROOM = 'campingApp.room.v1';        // { code, codeHash, rev, syncedAt }
  var LS_BASE = 'campingApp.syncBase.v1';    // 마지막으로 맞춘 내용
  var LS_BACKUP = 'campingApp.backupPreSync.v1'; // 처음 연결하기 직전 백업

  var PUSH_DELAY = 1500;
  var POLL_MS = 60000;

  /* ---------- 작은 도구들 ---------- */

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }
  function same(a, b) {
    return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  }
  function readLS(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function writeLS(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  /* ---------- 3-way 병합 ----------
     base : 지난번에 맞춘 내용
     mine : 이 폰의 지금 내용
     theirs : 방에 올라와 있는 내용
     한쪽만 바뀌었으면 바뀐 쪽을 따릅니다.
     둘 다 바뀌었으면 preferMine 이 정합니다. */

  function mergeValue(base, mine, theirs, preferMine) {
    if (same(mine, theirs)) return clone(mine);
    if (same(mine, base)) return clone(theirs);   // 나는 그대로 → 상대 변경 반영
    if (same(theirs, base)) return clone(mine);   // 상대는 그대로 → 내 변경 유지
    return clone(preferMine ? mine : theirs);     // 둘 다 바뀜
  }

  /** id 를 가진 목록을 합칩니다. base 에 있다가 한쪽에서 사라지면 삭제로 봅니다. */
  function mergeList(base, mine, theirs, preferMine, mergeItem) {
    base = Array.isArray(base) ? base : [];
    mine = Array.isArray(mine) ? mine : [];
    theirs = Array.isArray(theirs) ? theirs : [];

    var byId = function (list) {
      var map = {};
      list.forEach(function (item) { if (item && item.id) map[item.id] = item; });
      return map;
    };
    var b = byId(base), m = byId(mine), t = byId(theirs);

    var order = [];
    var seen = {};
    mine.concat(theirs).forEach(function (item) {
      if (item && item.id && !seen[item.id]) { seen[item.id] = true; order.push(item.id); }
    });

    var out = [];
    order.forEach(function (id) {
      var inBase = Object.prototype.hasOwnProperty.call(b, id);
      var hasMine = Object.prototype.hasOwnProperty.call(m, id);
      var hasTheirs = Object.prototype.hasOwnProperty.call(t, id);

      if (inBase && (!hasMine || !hasTheirs)) return;          // 한쪽에서 지움 → 삭제
      if (!inBase && !hasMine && !hasTheirs) return;
      if (!hasMine && !hasTheirs) return;

      if (hasMine && hasTheirs) {
        out.push(mergeItem ? mergeItem(b[id], m[id], t[id], preferMine)
                           : mergeValue(b[id], m[id], t[id], preferMine));
      } else {
        out.push(clone(hasMine ? m[id] : t[id]));              // 한쪽에서 새로 넣음
      }
    });
    return out;
  }

  /** 열쇠-값 묶음을 합칩니다. (체크 상태, 식단 칸 등) */
  function mergeMap(base, mine, theirs, preferMine, deep) {
    base = base && typeof base === 'object' ? base : {};
    mine = mine && typeof mine === 'object' ? mine : {};
    theirs = theirs && typeof theirs === 'object' ? theirs : {};

    var keys = {};
    Object.keys(mine).forEach(function (k) { keys[k] = true; });
    Object.keys(theirs).forEach(function (k) { keys[k] = true; });

    var out = {};
    Object.keys(keys).forEach(function (key) {
      var inBase = Object.prototype.hasOwnProperty.call(base, key);
      var hasMine = Object.prototype.hasOwnProperty.call(mine, key);
      var hasTheirs = Object.prototype.hasOwnProperty.call(theirs, key);

      if (inBase && (!hasMine || !hasTheirs)) return;           // 한쪽에서 지움
      if (hasMine && hasTheirs) {
        out[key] = deep
          ? mergeMap(base[key], mine[key], theirs[key], preferMine, false)
          : mergeValue(base[key], mine[key], theirs[key], preferMine);
      } else {
        out[key] = clone(hasMine ? mine[key] : theirs[key]);
      }
    });
    return out;
  }

  function mergeTrip(base, mine, theirs, preferMine) {
    base = base || {};
    var newerIsMine = (mine.updatedAt || 0) >= (theirs.updatedAt || 0);
    var pick = preferMine === undefined ? newerIsMine : preferMine;

    return {
      id: mine.id,
      place: mergeValue(base.place, mine.place, theirs.place, pick),
      start: mergeValue(base.start, mine.start, theirs.start, pick),
      end: mergeValue(base.end, mine.end, theirs.end, pick),
      createdAt: mine.createdAt || theirs.createdAt,
      updatedAt: Math.max(mine.updatedAt || 0, theirs.updatedAt || 0),
      gear: mergeList(base.gear, mine.gear, theirs.gear, pick),
      checks: mergeMap(base.checks, mine.checks, theirs.checks, pick, false),
      meals: mergeMap(base.meals, mine.meals, theirs.meals, pick, true),
    };
  }

  /** 전체 기록 합치기 */
  function mergeState(base, mine, theirs) {
    base = base || {};
    return {
      trips: mergeList(base.trips, mine.trips, theirs.trips, undefined, mergeTrip),
      sharedGear: mergeList(base.sharedGear, mine.sharedGear, theirs.sharedGear, true),
      menuItems: mergeList(base.menuItems, mine.menuItems, theirs.menuItems, true),
    };
  }

  /* ---------- 방 코드 ---------- */

  var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 글자(I,O,0,1) 제외

  function makeRoomCode() {
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    var out = '';
    for (var i = 0; i < bytes.length; i += 1) {
      if (i > 0 && i % 4 === 0) out += '-';
      out += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return out; // 예) K7QM-3XRA-9TPF-WZ2H
  }

  function normalizeCode(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function hashCode(code) {
    var text = 'camping-app:' + normalizeCode(code);
    var bytes = new TextEncoder().encode(text);
    return crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
      return Array.prototype.map
        .call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); })
        .join('');
    });
  }

  /* ---------- 서버와 이야기하기 ---------- */

  function config() {
    return window.CAMP_SUPABASE || null;
  }
  function isConfigured() {
    var c = config();
    return !!(c && c.url && c.anonKey && c.url.indexOf('http') === 0);
  }

  function rpc(name, body) {
    var c = config();
    if (!isConfigured()) return Promise.reject(new Error('서버 설정이 아직 없습니다'));

    return fetch(c.url.replace(/\/+$/, '') + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: c.anonKey,
        Authorization: 'Bearer ' + c.anonKey,
      },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.text().then(function (text) {
        var parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch (e) { parsed = null; }
        if (!res.ok) {
          var message = (parsed && (parsed.message || parsed.hint)) || ('서버 오류 ' + res.status);
          throw new Error(message);
        }
        return parsed;
      });
    });
  }

  /* ---------- 상태 ---------- */

  var room = readLS(LS_ROOM, null);
  var pushTimer = null;
  var syncing = false;
  var pollTimer = null;
  var listeners = [];

  function status() {
    if (!isConfigured()) return { state: 'off', reason: 'config' };
    if (!room) return { state: 'off', reason: 'no-room' };
    return { state: syncing ? 'syncing' : 'on', code: room.code, syncedAt: room.syncedAt || 0 };
  }
  function notify() {
    listeners.forEach(function (fn) { try { fn(status()); } catch (e) { /* 무시 */ } });
  }

  function currentState() {
    var app = window.CampApp;
    return app ? app.getState() : { trips: [], sharedGear: [], menuItems: [] };
  }

  /* ---------- 맞추기 ---------- */

  function syncNow(options) {
    options = options || {};
    if (!isConfigured() || !room || syncing) return Promise.resolve(false);

    syncing = true;
    notify();

    var mine = currentState();
    var base = readLS(LS_BASE, null);

    return rpc('camp_pull', { p_code_hash: room.codeHash })
      .then(function (result) {
        var remote = (result && result.data) || { trips: [], sharedGear: [], menuItems: [] };
        var rev = (result && result.rev) || 0;

        var merged = mergeState(base, mine, remote);

        // 합친 결과를 화면과 이 폰에 반영
        if (window.CampApp) window.CampApp.applyState(merged, { rerender: !options.quiet });

        // 상대에게도 올려 둡니다 (달라진 게 있을 때만)
        if (same(merged, remote)) {
          room.rev = rev;
          room.syncedAt = Date.now();
          writeLS(LS_ROOM, room);
          writeLS(LS_BASE, merged);
          return true;
        }

        return rpc('camp_push', {
          p_code_hash: room.codeHash,
          p_data: merged,
          p_base_rev: rev,
        }).then(function (pushed) {
          if (pushed && pushed.ok === false) {
            // 그 사이 누가 또 고쳤습니다. 다음 차례에 다시 맞춥니다.
            writeLS(LS_BASE, base);
            return false;
          }
          room.rev = (pushed && pushed.rev) || rev + 1;
          room.syncedAt = Date.now();
          writeLS(LS_ROOM, room);
          writeLS(LS_BASE, merged);
          return true;
        });
      })
      .catch(function (err) {
        if (window.CampApp && !options.quiet) window.CampApp.toast('맞추지 못했어요: ' + err.message);
        return false;
      })
      .then(function (ok) {
        syncing = false;
        notify();
        return ok;
      });
  }

  function schedulePush() {
    if (!room || !isConfigured()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { syncNow({ quiet: true }); }, PUSH_DELAY);
  }

  function startPolling() {
    clearInterval(pollTimer);
    if (!room) return;
    pollTimer = setInterval(function () {
      if (document.visibilityState === 'visible') syncNow({ quiet: true });
    }, POLL_MS);
  }

  /* ---------- 방 만들고 들어가기 ---------- */

  function keepBackup() {
    if (!localStorage.getItem(LS_BACKUP)) {
      writeLS(LS_BACKUP, { savedAt: Date.now(), state: currentState() });
    }
  }

  function createRoom() {
    var code = makeRoomCode();
    keepBackup();

    return hashCode(code)
      .then(function (codeHash) {
        return rpc('camp_create_room', { p_code_hash: codeHash }).then(function () {
          room = { code: code, codeHash: codeHash, rev: 0, syncedAt: 0 };
          writeLS(LS_ROOM, room);
          writeLS(LS_BASE, null);      // 처음이라 공통조상 없음 → 양쪽 내용 모두 살아남습니다
          startPolling();
          return syncNow().then(function () { return code; });
        });
      });
  }

  function joinRoom(code) {
    var clean = normalizeCode(code);
    if (clean.length < 8) return Promise.reject(new Error('방 코드가 너무 짧아요'));
    keepBackup();

    return hashCode(clean).then(function (codeHash) {
      return rpc('camp_pull', { p_code_hash: codeHash }).then(function (result) {
        if (!result || result.found === false) throw new Error('그런 방이 없어요');
        room = { code: code.toUpperCase(), codeHash: codeHash, rev: result.rev || 0, syncedAt: 0 };
        writeLS(LS_ROOM, room);
        writeLS(LS_BASE, null);     // 공통조상 없음 → 내 기록과 방 기록을 모두 합칩니다
        startPolling();
        return syncNow();
      });
    });
  }

  function leaveRoom() {
    room = null;
    localStorage.removeItem(LS_ROOM);
    localStorage.removeItem(LS_BASE);
    clearInterval(pollTimer);
    clearTimeout(pushTimer);
    notify();
  }

  function restoreBackup() {
    var backup = readLS(LS_BACKUP, null);
    if (!backup || !backup.state) return false;
    if (window.CampApp) window.CampApp.applyState(backup.state, { rerender: true });
    return true;
  }

  /* ---------- 바깥에 내놓는 것들 ---------- */

  window.CampSync = {
    isConfigured: isConfigured,
    status: status,
    onChange: function (fn) { listeners.push(fn); },
    createRoom: createRoom,
    joinRoom: joinRoom,
    leaveRoom: leaveRoom,
    syncNow: syncNow,
    schedulePush: schedulePush,
    restoreBackup: restoreBackup,
    hasBackup: function () { return !!readLS(LS_BACKUP, null); },

    // 점검용
    _merge: mergeState,
    _mergeTrip: mergeTrip,
    _mergeList: mergeList,
    _mergeMap: mergeMap,
    _makeRoomCode: makeRoomCode,
    _normalizeCode: normalizeCode,
  };

  if (room && isConfigured()) {
    startPolling();
    if (document.readyState === 'complete') syncNow({ quiet: true });
    else window.addEventListener('load', function () { syncNow({ quiet: true }); });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') syncNow({ quiet: true });
    });
  }
})();

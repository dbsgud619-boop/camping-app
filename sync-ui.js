/* ===========================================================
   함께 쓰기 UI — 캠핑일지 · 여행일지 공통
   -----------------------------------------------------------
   sync.js 가 만든 window.CampSync 를 가지고 화면 위쪽 막대를 그리고,
   초대 링크를 처리하고, 토스트 알림을 띄웁니다.

   이 파일은 두 화면(캠핑일지 / 여행일지)이 똑같이 씁니다 — 방 하나에
   두 기록이 함께 들어가므로 "초대하기" 는 화면과 무관하게 늘 같은
   뜻입니다. 각 화면의 app.js / app-travel.js 는 이 파일이 만드는
   전역 showToast() 를 그대로 가져다 씁니다.

   불러오는 순서: supabase-config.js → sync.js → sync-ui.js →
   app.js(또는 app-travel.js). showToast 를 window 에 올려 두는 줄이
   각 화면 스크립트보다 먼저 실행돼야 그 안에서도 같은 함수를 씁니다.
   =========================================================== */
(function () {
  'use strict';

  var APP_NAME = '윤송부부일지';

  /* ---- 토스트 ---- */
  var toastTimer = null;
  function showToast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add('hidden'); }, 1800);
  }
  window.showToast = showToast;

  /* ---- 함께 쓰기 막대 ---- */
  function syncedAgo(ts) {
    if (!ts) return '맞추는 중';
    var sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return '방금 맞춤';
    if (sec < 3600) return Math.floor(sec / 60) + '분 전 맞춤';
    return Math.floor(sec / 3600) + '시간 전 맞춤';
  }

  function renderSyncBar(state) {
    var bar = document.getElementById('syncBar');
    if (!bar) return;

    var sync = window.CampSync;
    if (!sync || !sync.isConfigured()) {
      bar.classList.add('hidden');
      return;
    }
    bar.classList.remove('hidden');
    bar.innerHTML = '';

    var info = state || sync.status();
    var text = document.createElement('span');
    text.className = 'sync-text';

    var actions = document.createElement('div');
    actions.className = 'sync-actions';

    function makeBtn(label, onClick, cls) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sync-btn' + (cls ? ' ' + cls : '');
      b.textContent = label;
      b.addEventListener('click', onClick);
      return b;
    }

    if (info.state === 'off') {
      bar.classList.remove('on');
      text.textContent = '이 폰에만 저장 중';
      actions.appendChild(makeBtn('함께 쓰기', openRoomDialog, 'primary'));
    } else {
      bar.classList.add('on');
      text.textContent = info.state === 'syncing'
        ? '맞추는 중…'
        : '함께 쓰는 중 · ' + syncedAgo(info.syncedAt);
      actions.appendChild(makeBtn('초대하기', shareInvite, 'primary'));
      actions.appendChild(makeBtn('나가기', leaveRoomAsked));
    }

    bar.appendChild(text);
    bar.appendChild(actions);
  }

  function openRoomDialog() {
    var makeNew = window.confirm(
      '같이 쓸 방을 엽니다.\n\n'
      + '[확인] 새 방 만들기 — 지금 이 폰의 기록(여행일지 · 캠핑일지 모두)을 그대로 올립니다\n'
      + '[취소] 받은 방 코드 넣기 — 내 기록과 방 기록을 모두 합칩니다'
    );

    if (makeNew) {
      window.CampSync.createRoom()
        .then(function (code) {
          renderSyncBar();
          window.prompt('방이 열렸어요. 이 코드를 같이 갈 사람에게 보내세요.', code);
        })
        .catch(function (err) { showToast('방을 열지 못했어요: ' + err.message); });
      return;
    }

    var code = window.prompt('받은 방 코드를 넣어주세요');
    if (code === null) return;

    window.CampSync.joinRoom(code)
      .then(function () {
        renderSyncBar();
        showToast('방에 들어왔어요. 기록을 합쳤습니다');
      })
      .catch(function (err) { showToast(err.message); });
  }

  /** 방 코드는 # 뒤에 붙입니다. # 뒤는 서버로 전송되지 않아 기록에 남지 않습니다. */
  function inviteUrl(code) {
    return location.origin + location.pathname + '#room=' + encodeURIComponent(code);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('복사 실패'));
      } catch (e) {
        reject(e);
      }
      document.body.removeChild(area);
    });
  }

  function shareInvite() {
    var info = window.CampSync.status();
    if (!info.code) return;

    var url = inviteUrl(info.code);
    var text = APP_NAME + '에 초대합니다.\n링크를 열면 여행일지 · 캠핑일지 기록을 함께 볼 수 있어요.\n\n방 코드: ' + info.code;

    if (navigator.share) {
      navigator.share({ title: APP_NAME + ' · 함께 쓰기', text: text, url: url }).catch(function () {});
      return;
    }

    copyText(text + '\n' + url)
      .then(function () { showToast('초대 링크를 복사했어요'); })
      .catch(function () { window.prompt('이 링크를 보내세요', url); });
  }

  /** 초대 링크로 들어온 경우 처리합니다. */
  function handleInviteLink() {
    var match = location.hash.match(/room=([A-Za-z0-9-]+)/);
    if (!match) return;

    var code = decodeURIComponent(match[1]);
    var sync = window.CampSync;
    function clearHash() { history.replaceState(null, '', location.pathname + location.search); }

    if (!sync || !sync.isConfigured()) {
      clearHash();
      return;
    }

    var info = sync.status();
    if (info.code && sync._normalizeCode(info.code) === sync._normalizeCode(code)) {
      clearHash();
      showToast('이미 이 방에 있어요');
      return;
    }

    var ask = info.state === 'off'
      ? '초대를 받았어요.\n이 방에 들어갈까요?\n\n지금 이 폰의 기록(여행일지 · 캠핑일지 모두)과 방 기록을 모두 합칩니다.'
      : '초대를 받았어요.\n지금 방에서 나와 이 방으로 옮길까요?\n\n이 폰의 기록은 그대로 남습니다.';

    if (!window.confirm(ask)) {
      clearHash();
      return;
    }

    sync.joinRoom(code)
      .then(function () {
        clearHash();
        renderSyncBar();
        showToast('방에 들어왔어요. 기록을 합쳤습니다');
      })
      .catch(function (err) {
        clearHash();
        showToast(err.message);
      });
  }

  function leaveRoomAsked() {
    if (!window.confirm('이 폰을 방에서 빼낼까요?\n\n지금까지의 기록은 이 폰에 그대로 남습니다.')) return;
    window.CampSync.leaveRoom();
    renderSyncBar();
    showToast('방에서 나왔어요');
  }

  window.SyncUI = { renderSyncBar: renderSyncBar, handleInviteLink: handleInviteLink };

  window.addEventListener('load', function () {
    renderSyncBar();
    if (window.CampSync) window.CampSync.onChange(renderSyncBar);
    handleInviteLink();
  });
})();

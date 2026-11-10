// Sign-in gate. The map script and all data are only loaded after a successful sign-in.
// NOTE: this runs in the browser, so it keeps casual visitors out but is not real security:
// anyone who knows the data file URLs can still download them. Passwords are stored as salted SHA-256 hashes.
(function () {
  'use strict';
  var SALT = 'xeleratio-austria-plz|';
  var USERS = {
    karsten: '031b292c4e8ae3d51c8de37aeb2929ffbfd04ed7e6e6623292c2883b10569b8f',
    dimitar: '87a3086785af9d3c1569b105734c2f1fde0b8825035e808628e2411e755f85ff'
  };
  var SESSION_KEY = 'xel-austria-plz-user';
  var SCRIPTS = ['vendor/topojson-client.min.js', 'js/app.js'];

  function sha256(str) {
    var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var b = unescape(encodeURIComponent(str)), n = b.length, w = [], i, j;
    for (i = 0; i < n; i++) w[i >> 2] |= b.charCodeAt(i) << (24 - (i % 4) * 8);
    w[n >> 2] |= 0x80 << (24 - (n % 4) * 8);
    var len = (((n + 8) >> 6) + 1) * 16;
    for (i = 0; i < len; i++) if (w[i] === undefined) w[i] = 0;
    w[len - 1] = n * 8;
    var rotr = function (x, s) { return (x >>> s) | (x << (32 - s)); };
    for (i = 0; i < len; i += 16) {
      var a = H.slice(), W = [];
      for (j = 0; j < 64; j++) {
        if (j < 16) W[j] = w[i + j];
        else {
          var s0 = rotr(W[j - 15], 7) ^ rotr(W[j - 15], 18) ^ (W[j - 15] >>> 3), s1 = rotr(W[j - 2], 17) ^ rotr(W[j - 2], 19) ^ (W[j - 2] >>> 10);
          W[j] = (W[j - 16] + s0 + W[j - 7] + s1) | 0;
        }
        var S1 = rotr(a[4], 6) ^ rotr(a[4], 11) ^ rotr(a[4], 25), ch = (a[4] & a[5]) ^ (~a[4] & a[6]);
        var t1 = (a[7] + S1 + ch + K[j] + W[j]) | 0;
        var S0 = rotr(a[0], 2) ^ rotr(a[0], 13) ^ rotr(a[0], 22), mj = (a[0] & a[1]) ^ (a[0] & a[2]) ^ (a[1] & a[2]);
        var t2 = (S0 + mj) | 0;
        a = [(t1 + t2) | 0, a[0], a[1], a[2], (a[3] + t1) | 0, a[4], a[5], a[6]];
      }
      for (j = 0; j < 8; j++) H[j] = (H[j] + a[j]) | 0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }

  function valid(user, pass) {
    var u = String(user).trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(USERS, u) && USERS[u] === sha256(SALT + u + ':' + pass) ? u : null;
  }

  function loadApp() {
    return SCRIPTS.reduce(function (p, src) {
      return p.then(function () {
        return new Promise(function (ok, fail) {
          var s = document.createElement('script');
          s.src = src; s.async = false; s.onload = ok; s.onerror = function () { fail(new Error('Could not load ' + src)); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve());
  }

  function enter(user) {
    var login = document.getElementById('login');
    try { sessionStorage.setItem(SESSION_KEY, user); } catch (e) { /* private mode: just ask again next time */ }
    document.body.classList.remove('locked');
    if (login) { login.classList.add('leaving'); setTimeout(function () { login.hidden = true; }, 500); }
    loadApp().catch(function (e) { alert(e.message); });
  }

  var out = document.getElementById('signout');
  if (out) out.addEventListener('click', function () {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    location.reload();
  });

  var saved = null;
  try { saved = sessionStorage.getItem(SESSION_KEY); } catch (e) { /* ignore */ }
  if (saved && USERS[saved]) { document.getElementById('login').hidden = true; enter(saved); return; }

  var form = document.getElementById('login-form'), err = document.getElementById('login-err'), card = document.getElementById("login-form");
  var user = document.getElementById('login-user'), pass = document.getElementById('login-pass'), busy = false;
  user.focus();
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var u = valid(user.value, pass.value);
    if (u) { err.hidden = true; enter(u); return; }
    busy = true; err.hidden = false; pass.value = ''; pass.focus();
    card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
    setTimeout(function () { busy = false; }, 700);   // small delay against rapid guessing
  });
})();

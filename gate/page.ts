/**
 * The closed-beta OVERLAY. The app always loads and renders — the middleware
 * injects this frosted layer on top of the HTML for visitors without a beta
 * cookie: the live product stays visible behind it, nothing is walled off.
 * The story the visitor hears is a WAITLIST in two layers: connect, and the
 * wallet is either whitelisted (sign, you're in), already waitlisted (you're
 * in line, access soon), or invited to join the waitlist (email + signature).
 * An injected wallet (EIP-1193) is used directly; without one the overlay
 * borrows the app's WalletConnect sheet (`src/wallet/GateBridge.tsx`), and
 * only a build without WalletConnect falls back to "open in your wallet's
 * browser".
 *
 * `waitlist: true` is the same flow for a visitor already in on an access
 * code (`/?waitlist`, linked from the app's nudge): different words, a way
 * back to the app, and nothing here is blocking them.
 *
 * `hidden: true` ships it closed behind the app's landing (`src/ui/Join.tsx`
 * opens it; "Not now" closes it again) — nothing is frosted over any more.
 */

/** The messages both sides build; the middleware recovers the signer from them. */
export const message = (address: string, issued: string, email?: string) =>
  email === undefined
    ? `YieldCircle beta access\n\nAddress: ${address.toLowerCase()}\nIssued: ${issued}`
    : `YieldCircle waitlist\n\nAddress: ${address.toLowerCase()}\nEmail: ${email}\nIssued: ${issued}`

export const overlay = ({ waitlist = false, hidden = false } = {}) => `
<div id="yc-gate"${hidden ? ' style="display:none"' : ''}>
<style>
  #yc-gate { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 24px 16px;
    background: rgba(0,0,0,.55); -webkit-backdrop-filter: blur(14px) saturate(.8); backdrop-filter: blur(14px) saturate(.8);
    font: 15px/1.5 'IBM Plex Sans', system-ui, sans-serif; color: #e8e8e8; }
  #yc-gate .card { width: 100%; max-width: 400px; text-align: center; background: rgba(10,10,10,.92);
    border: 1px solid #2a2a2a; border-radius: 16px; padding: 32px 24px 24px; box-shadow: 0 24px 80px rgba(0,0,0,.6); }
  #yc-gate .tag { display: inline-block; font: 500 11px/1 'IBM Plex Mono', monospace; letter-spacing: .12em;
    text-transform: uppercase; color: #8a8a8a; border: 1px solid #2a2a2a; border-radius: 999px; padding: 6px 10px; margin-bottom: 16px; }
  #yc-gate h1 { font-size: 24px; font-weight: 600; letter-spacing: -.02em; margin: 0 0 8px; }
  #yc-gate p { color: #8a8a8a; margin: 0 0 22px; }
  #yc-gate .row { display: grid; gap: 10px; }
  #yc-gate input { width: 100%; box-sizing: border-box; font: 15px/1 'IBM Plex Sans', sans-serif; padding: 14px;
    border-radius: 12px; border: 1px solid #2a2a2a; background: #000; color: #e8e8e8; outline: none; }
  #yc-gate input:focus { border-color: #8a8a8a; }
  #yc-gate button, #yc-gate .btn { display: block; width: 100%; box-sizing: border-box; font: 600 15px/1 'IBM Plex Sans', sans-serif;
    padding: 14px; border-radius: 12px; border: 1px solid #e8e8e8; background: #e8e8e8; color: #000; cursor: pointer; text-decoration: none; }
  #yc-gate button:disabled { opacity: .5; cursor: default; }
  #yc-gate #yc-status { min-height: 1.5em; margin: 16px 0 0; font: 12px/1.5 'IBM Plex Mono', monospace; color: #8a8a8a; overflow-wrap: anywhere; }
  #yc-gate .err { color: #ff8a7a !important; }
  #yc-gate .back { display: inline-block; margin-top: 14px; font-size: 13px; color: #8a8a8a; }
</style>
<div class="card">
  <div class="tag">${waitlist ? 'Access code' : 'Closed beta'}</div>
  <h1 id="yc-title">Join the waitlist</h1>
  <p id="yc-sub">${waitlist
    ? 'You&rsquo;re in on an access code, which isn&rsquo;t yours to keep. Connect your wallet and leave an email to hold a place of your own &mdash; access opens in waves.'
    : 'Everything you see is live. Access opens in waves down the waitlist &mdash; connect your wallet to join it, or to walk in if it&rsquo;s your turn.'}</p>
  <div class="row" id="yc-row">
    <input id="yc-email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" hidden />
    <button id="yc-go">Connect wallet</button>
  </div>
  <div id="yc-status"></div>${waitlist ? `
  <a class="back" href="/">Back to the app</a>` : hidden ? `
  <a class="back" href="#" onclick="document.getElementById('yc-gate').style.display='none';return false">Not now</a>` : ''}
</div>
<script>
(() => {
  var T_VERIFY = ${JSON.stringify(message('__a__', '__i__'))};
  var T_REQUEST = ${JSON.stringify(message('__a__', '__i__', '__e__'))};
  var $ = function (id) { return document.getElementById(id); };
  var status = function (t, err) { $('yc-status').textContent = t || ''; $('yc-status').className = err ? 'err' : ''; };
  var eth = window.ethereum;
  var address = null;
  var btn = $('yc-go');
  var gate = $('yc-gate');

  var toHex = function (s) { var b = new TextEncoder().encode(s), o = '0x', i = 0; for (; i < b.length; i++) o += b[i].toString(16).padStart(2, '0'); return o; };
  /*
   * Two wallets behind one shape. An injected provider (extension, a wallet's
   * own browser) is spoken to directly. Without one, the app's connect sheet
   * does it (src/wallet/GateBridge.tsx: WalletConnect deep links on a phone, a
   * QR code on a desktop) — the overlay steps aside while that sheet is up.
   * A remote wallet signs on a TAP (\`tap\`): bringing the wallet app forward is
   * a navigation, and iOS only allows one while the gesture is live.
   */
  var injected = eth && {
    tap: false,
    connect: function () { return eth.request({ method: 'eth_requestAccounts' }).then(function (a) { return a[0]; }); },
    sign: function (msg) { return eth.request({ method: 'personal_sign', params: [toHex(msg), address] }); },
  };
  var bridged = function (yc) {
    return {
      tap: true,
      connect: function () {
        gate.style.display = 'none';
        var back = function () { gate.style.display = ''; };
        return yc.connect().then(function (a) { back(); return a; }, function (e) { back(); throw e; });
      },
      sign: function (msg) { return yc.sign(msg); },
    };
  };
  // the bundle registers \`ycGate\` once React has mounted, a beat after this script runs
  var wallet = function () {
    if (injected) return Promise.resolve(injected);
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function poll() {
        if (window.ycGate) resolve(bridged(window.ycGate));
        else if (Date.now() - t0 > 5000) resolve(null);
        else setTimeout(poll, 100);
      })();
    });
  };
  var w = null;
  var post = function (path, body) {
    return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (out) { if (!r.ok) throw new Error(out.error || 'failed'); return out; }); });
  };

  // what the next tap does; each step is called synchronously from the click, so a sign keeps the gesture
  var next = start;
  btn.onclick = function () {
    btn.disabled = true;
    var p;
    try { p = Promise.resolve(next()); } catch (e) { p = Promise.reject(e); }
    p.catch(function (e) {
      status(e && (e.shortMessage || e.message) ? (e.shortMessage || e.message) : String(e), true);
      btn.disabled = false;
    });
  };

  function start() {
    status('Waiting for the wallet\\u2026');
    return wallet().then(function (got) {
      if (!got) return none();
      w = got;
      return w.connect().then(function (a) {
        address = a;
        return fetch('/gate/check?address=' + address).then(function (r) { return r.json(); });
      }).then(function (out) { return out.listed ? (w.tap ? ready() : enter()) : out.waitlisted ? waiting() : lineup(); });
    });
  }

  /** No injected wallet and no WalletConnect on this build: the wallet's own browser is the way in. */
  function none() {
    var here = location.host + location.pathname + location.search;
    $('yc-row').innerHTML = '<a class="btn" href="https://metamask.app.link/dapp/' + here + '">Open in MetaMask</a>';
    status('No wallet in this browser. Open this page in your wallet app\\u2019s browser (MetaMask, Rabby, Coinbase Wallet\\u2026), or on a desktop with a wallet extension.');
  }

  function ready() {
    $('yc-sub').textContent = address.slice(0, 6) + '\\u2026' + address.slice(-4) + ' is on the list. One signature and you\\u2019re in.';
    btn.textContent = 'Sign to enter';
    btn.disabled = false;
    status('');
    next = enter;
  }

  function enter() {
    var issued = new Date().toISOString();
    status('Sign to enter \\u2014 free, no transaction.');
    return w.sign(T_VERIFY.replace('__a__', address.toLowerCase()).replace('__i__', issued)).then(function (signature) {
      return post('/gate/verify', { address: address, issued: issued, signature: signature });
    }).then(function () { status('You\\u2019re in.'); ${waitlist ? "location.replace('/' + location.hash)" : 'location.reload()'}; });
  }

  function lineup() {
    $('yc-sub').textContent = address.slice(0, 6) + '\\u2026' + address.slice(-4) + ' isn\\u2019t on the waitlist yet. Leave an email, sign, and you\\u2019re in line.';
    $('yc-email').hidden = false;
    btn.textContent = 'Join the waitlist';
    btn.disabled = false;
    status('');
    next = request;
  }

  function waiting(email) {
    $('yc-title').textContent = 'You\\u2019re on the waitlist';
    $('yc-sub').textContent = (email ? 'We\\u2019ll email ' + email : 'This wallet is in line. We\\u2019ll email you') + ' the moment access reaches it \\u2014 it opens in waves.';
    var text = encodeURIComponent('On the YieldCircle waitlist \\u{1F440} ' + location.origin);
    $('yc-row').innerHTML = '<a class="btn" target="_blank" rel="noopener" href="https://x.com/intent/post?text=' + text + '">Share on X</a>';
    status(address);
  }

  function request() {
    var el = $('yc-email');
    var email = el.value.trim().toLowerCase();
    if (!email || !el.checkValidity()) { status('Enter a valid email address.', true); btn.disabled = false; el.focus(); return; }
    var issued = new Date().toISOString();
    status('Sign to prove the wallet is yours \\u2014 free, no transaction.');
    return w.sign(T_REQUEST.replace('__a__', address.toLowerCase()).replace('__i__', issued).replace('__e__', email)).then(function (signature) {
      return post('/gate/request', { address: address, issued: issued, signature: signature, email: email });
    }).then(function () { waiting(email); });
  }
})();
</script>
</div>`

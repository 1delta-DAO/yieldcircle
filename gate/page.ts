/**
 * The closed-beta OVERLAY. The app always loads and renders — the middleware
 * injects this frosted layer on top of the HTML for visitors without a beta
 * cookie: the live product stays visible behind it, nothing is walled off.
 * Plain injected-wallet (EIP-1193) only: on a phone without one, the page
 * says to open the link in a wallet's browser.
 */

/** The messages both sides build; the middleware recovers the signer from them. */
export const message = (address: string, issued: string, email?: string) =>
  email === undefined
    ? `YieldCircle beta access\n\nAddress: ${address.toLowerCase()}\nIssued: ${issued}`
    : `YieldCircle beta request\n\nAddress: ${address.toLowerCase()}\nEmail: ${email}\nIssued: ${issued}`

export const overlay = () => `
<div id="yc-gate">
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
</style>
<div class="card">
  <div class="tag">Closed beta</div>
  <h1 id="yc-title">Whitelist only, for now</h1>
  <p id="yc-sub">Everything you see is live. Connect a whitelisted wallet to use it &mdash; or get in line and we&rsquo;ll email you when you&rsquo;re in.</p>
  <div class="row" id="yc-row">
    <input id="yc-email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" hidden />
    <button id="yc-go">Connect wallet</button>
  </div>
  <div id="yc-status"></div>
</div>
<script>
(() => {
  var T_VERIFY = ${JSON.stringify(message('__A__', '__I__'))};
  var T_REQUEST = ${JSON.stringify(message('__A__', '__I__', '__E__'))};
  var $ = function (id) { return document.getElementById(id); };
  var status = function (t, err) { $('yc-status').textContent = t || ''; $('yc-status').className = err ? 'err' : ''; };
  var eth = window.ethereum;
  var address = null;
  var btn = $('yc-go');

  if (!eth) {
    btn.textContent = 'Copy link';
    btn.onclick = function () { navigator.clipboard && navigator.clipboard.writeText(location.origin).then(function () { status('Link copied.'); }); };
    status('No wallet in this browser. Open this page in your wallet app\\u2019s browser (MetaMask, Rabby, Coinbase Wallet\\u2026), or on a desktop with a wallet extension.');
    return;
  }

  var toHex = function (s) { var b = new TextEncoder().encode(s), o = '0x', i = 0; for (; i < b.length; i++) o += b[i].toString(16).padStart(2, '0'); return o; };
  var sign = function (msg) { return eth.request({ method: 'personal_sign', params: [toHex(msg), address] }); };
  var post = function (path, body) {
    return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (out) { if (!r.ok) throw new Error(out.error || 'failed'); return out; }); });
  };

  btn.onclick = function () {
    btn.disabled = true;
    Promise.resolve().then(function () {
      if (address) return request();
      status('Waiting for the wallet\\u2026');
      return eth.request({ method: 'eth_requestAccounts' }).then(function (a) {
        address = a[0];
        return fetch('/gate/check?address=' + address).then(function (r) { return r.json(); });
      }).then(function (out) { return out.listed ? enter() : lineup(); });
    }).catch(function (e) {
      status(e && e.message ? e.message : String(e), true);
      btn.disabled = false;
    });
  };

  function enter() {
    var issued = new Date().toISOString();
    status('Sign to enter \\u2014 free, no transaction.');
    return sign(T_VERIFY.replace('__A__', address.toLowerCase()).replace('__I__', issued)).then(function (signature) {
      return post('/gate/verify', { address: address, issued: issued, signature: signature });
    }).then(function () { status('You\\u2019re in.'); location.reload(); });
  }

  function lineup() {
    $('yc-sub').textContent = address.slice(0, 6) + '\\u2026' + address.slice(-4) + ' isn\\u2019t whitelisted yet. Leave an email and we\\u2019ll tell you the moment it is.';
    $('yc-email').hidden = false;
    btn.textContent = 'Request access';
    btn.disabled = false;
    status('');
  }

  function request() {
    var el = $('yc-email');
    var email = el.value.trim().toLowerCase();
    if (!email || !el.checkValidity()) { status('Enter a valid email address.', true); btn.disabled = false; el.focus(); return; }
    var issued = new Date().toISOString();
    status('Sign to prove the wallet is yours \\u2014 free, no transaction.');
    return sign(T_REQUEST.replace('__A__', address.toLowerCase()).replace('__I__', issued).replace('__E__', email)).then(function (signature) {
      return post('/gate/request', { address: address, issued: issued, signature: signature, email: email });
    }).then(function () {
      $('yc-title').textContent = 'You\\u2019re in line';
      $('yc-sub').textContent = 'We\\u2019ll email ' + email + ' when this wallet is whitelisted.';
      var text = encodeURIComponent('In line for the YieldCircle closed beta \\u{1F440} ' + location.origin);
      $('yc-row').innerHTML = '<a class="btn" target="_blank" rel="noopener" href="https://x.com/intent/post?text=' + text + '">Share on X</a>';
      status(address);
    });
  }
})();
</script>
</div>`

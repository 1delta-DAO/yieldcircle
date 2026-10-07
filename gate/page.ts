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

import { MARK_D, MARK_VIEWBOX } from '../src/ui/brand.generated'

/** The key an address is stored and signed under: EVM lower-cased, a Solana pubkey as is (base58 is case-sensitive). */
export const norm = (address: string) => (address.startsWith('0x') ? address.toLowerCase() : address)

/** The messages both sides build; the middleware recovers (EVM) or verifies (Solana) the signer from them. */
export const message = (address: string, issued: string, email?: string) =>
  email === undefined
    ? `YieldCircle beta access\n\nAddress: ${norm(address)}\nIssued: ${issued}`
    : `YieldCircle waitlist\n\nAddress: ${norm(address)}\nEmail: ${email}\nIssued: ${issued}`

export const overlay = ({ waitlist = false, hidden = false } = {}) => `
<div id="yc-gate"${hidden ? ' style="display:none"' : ''}>
<style>
  #yc-gate { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 24px 16px;
    background: rgba(0,0,0,.6); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
    font: 15px/1.5 'IBM Plex Sans', system-ui, sans-serif; color: #e8e8e8; }
  #yc-gate * { box-sizing: border-box; }
  #yc-gate .yc-card { position: relative; width: 100%; max-width: 420px; text-align: center; background: #0a0a0a;
    border-radius: 22px; padding: 36px 28px 22px; box-shadow: 0 30px 100px rgba(0,0,0,.8), 0 0 80px rgba(47,211,232,.12);
    animation: yc-pop .22s ease-out; }
  /* a hairline that carries the brand gradient round the card */
  #yc-gate .yc-card::before { content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1px; pointer-events: none;
    background: linear-gradient(160deg, rgba(124,233,245,.55), rgba(11,143,181,.15) 40%, #262626 70%, #262626);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude; }
  @keyframes yc-pop { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: none; } }
  #yc-gate .yc-mark { width: 56px; height: 56px; margin: 0 auto 18px; display: block; filter: drop-shadow(0 0 18px rgba(47,211,232,.45)); }
  #yc-gate .yc-tag { display: inline-block; font: 500 10.5px/1 'IBM Plex Mono', monospace; letter-spacing: .14em;
    text-transform: uppercase; color: #2fd3e8; border: 1px solid rgba(47,211,232,.35); background: rgba(47,211,232,.08); border-radius: 999px; padding: 6px 11px; margin-bottom: 14px; }
  #yc-gate h1 { font-size: 26px; font-weight: 600; letter-spacing: -.025em; line-height: 1.15; margin: 0 0 10px; }
  #yc-gate p { color: rgba(232,232,232,.6); font-size: 14.5px; margin: 0 auto 24px; max-width: 30em; }
  #yc-gate .yc-row { display: grid; gap: 10px; }
  #yc-gate input { width: 100%; font: 15px/1 'IBM Plex Sans', sans-serif; padding: 15px 16px; border-radius: 999px;
    border: 1px solid #2a2a2a; background: #000; color: #e8e8e8; outline: none; text-align: center; transition: border-color .15s, box-shadow .15s; }
  #yc-gate input::placeholder { color: rgba(232,232,232,.35); }
  #yc-gate input:focus { border-color: #2fd3e8; box-shadow: 0 0 0 3px rgba(47,211,232,.18); }
  #yc-gate .yc-btn { display: block; width: 100%; font: 600 15.5px/1 'IBM Plex Sans', sans-serif; padding: 17px; border-radius: 999px; border: 0;
    background: linear-gradient(90deg, #0b8fb5, #7ce9f5); color: #042028; cursor: pointer; text-decoration: none;
    box-shadow: 0 0 0 1px rgba(124,233,245,.35), 0 0 32px rgba(47,211,232,.35); transition: transform .15s, box-shadow .15s; }
  #yc-gate .yc-btn:hover { transform: translateY(-1px); box-shadow: 0 0 0 1px rgba(124,233,245,.55), 0 0 48px rgba(47,211,232,.5); }
  #yc-gate .yc-btn:disabled { opacity: .55; cursor: default; transform: none; box-shadow: none; }
  #yc-gate .yc-alt { background: #000; color: #e8e8e8; box-shadow: 0 0 0 1px #2a2a2a; font-weight: 500; }
  #yc-gate .yc-alt:hover { box-shadow: 0 0 0 1px #8a8a8a; }
  #yc-gate #yc-status { min-height: 1.5em; margin: 14px 0 0; font: 12px/1.5 'IBM Plex Mono', monospace; color: rgba(232,232,232,.5); overflow-wrap: anywhere; }
  #yc-gate .yc-err { color: #ff8a7a !important; }
  #yc-gate .yc-back { display: inline-block; margin-top: 12px; font-size: 13px; color: rgba(232,232,232,.5); text-decoration: none; border-bottom: 1px solid transparent; }
  #yc-gate .yc-back:hover { color: #e8e8e8; border-color: rgba(232,232,232,.5); }
  #yc-gate .yc-foot { margin-top: 18px; padding-top: 14px; border-top: 1px solid #1c1c1c; font: 11px/1.5 'IBM Plex Mono', monospace; color: rgba(232,232,232,.35); }
</style>
<div class="yc-card">
  <svg class="yc-mark" viewBox="${MARK_VIEWBOX}" aria-hidden="true"><defs><linearGradient id="yc-g" gradientUnits="userSpaceOnUse" x1="16" y1="88" x2="86" y2="14"><stop offset="0" stop-color="#0b8fb5"/><stop offset="1" stop-color="#7ce9f5"/></linearGradient></defs><path d="${MARK_D}" fill-rule="evenodd" fill="url(#yc-g)"/></svg>
  <div class="yc-tag">${waitlist ? 'Access code' : 'Closed beta'}</div>
  <h1 id="yc-title">Join the waitlist</h1>
  <p id="yc-sub">${waitlist
    ? 'You&rsquo;re in on an access code, which isn&rsquo;t yours to keep. Connect your wallet and leave an email to hold a place of your own &mdash; access opens in waves.'
    : 'Everything you see is live. Access opens in waves down the waitlist &mdash; connect your wallet to join it, or to walk in if it&rsquo;s your turn.'}</p>
  <div class="yc-row" id="yc-row">
    <input id="yc-email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" hidden />
    <button class="yc-btn" id="yc-go">Connect wallet</button>
    <button class="yc-btn yc-alt" id="yc-sol">Solana wallet</button>
  </div>
  <div id="yc-status"></div>${waitlist ? `
  <a class="yc-back" href="/">Back to the app</a>` : hidden ? `
  <a class="yc-back" href="#" onclick="document.getElementById('yc-gate').style.display='none';return false">Not now</a>` : ''}
  <div class="yc-foot">Free to join &middot; a signature, never a transaction</div>
</div>
<script>
(() => {
  var T_VERIFY = ${JSON.stringify(message('__a__', '__i__'))};
  var T_REQUEST = ${JSON.stringify(message('__a__', '__i__', '__e__'))};
  var $ = function (id) { return document.getElementById(id); };
  var status = function (t, err) { $('yc-status').textContent = t || ''; $('yc-status').className = err ? 'yc-err' : ''; };
  var eth = window.ethereum;
  var address = null;
  var btn = $('yc-go');
  var gate = $('yc-gate');

  var toHex = function (b) { if (typeof b === 'string') b = new TextEncoder().encode(b); var o = '0x', i = 0; for (; i < b.length; i++) o += b[i].toString(16).padStart(2, '0'); return o; };
  var norm = function (a) { return a.indexOf('0x') === 0 ? a.toLowerCase() : a; };
  /*
   * Three wallets behind one shape. An injected EVM provider (extension, a
   * wallet's own browser) is spoken to directly. Without one, the app's connect
   * sheet does it (src/wallet/GateBridge.tsx: WalletConnect deep links on a
   * phone, a QR code on a desktop) — the overlay steps aside while that sheet
   * is up. A remote wallet signs on a TAP (\`tap\`): bringing the wallet app
   * forward is a navigation, and iOS only allows one while the gesture is live.
   * A Solana wallet (the second button) is found over the Wallet Standard —
   * Phantom, Solflare, Backpack… announce themselves on a window event — or,
   * failing that, \`window.solana\`; it signs the same text, raw ed25519.
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
  // Wallet Standard discovery, as src/wallet/solana.ts does it: wallets already on the page answer app-ready, later ones register
  var solStd = [];
  try {
    var api = { register: function () { for (var i = 0; i < arguments.length; i++) solStd.push(arguments[i]); return function () {}; } };
    window.addEventListener('wallet-standard:register-wallet', function (e) { if (typeof e.detail === 'function') e.detail(api); });
    window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
  } catch (e) {}
  var solWallet = function () {
    var std = null, i = 0;
    for (; i < solStd.length; i++) {
      var f = solStd[i].features || {};
      if (f['standard:connect'] && f['solana:signMessage'] && (solStd[i].chains || []).indexOf('solana:mainnet') >= 0) { std = solStd[i]; break; }
    }
    if (std) {
      var acct = null;
      return {
        tap: false,
        connect: function () {
          return std.features['standard:connect'].connect().then(function (r) {
            acct = r.accounts[0];
            if (!acct) throw new Error('no account');
            return acct.address;
          });
        },
        sign: function (msg) {
          return std.features['solana:signMessage'].signMessage({ message: new TextEncoder().encode(msg), account: acct }).then(function (r) { return toHex(r[0].signature); });
        },
      };
    }
    var sol = window.solana || (window.phantom && window.phantom.solana) || window.solflare;
    if (!sol || !sol.signMessage) return null;
    return {
      tap: false,
      connect: function () { return sol.connect().then(function (r) { return (r && r.publicKey ? r.publicKey : sol.publicKey).toString(); }); },
      sign: function (msg) { return sol.signMessage(new TextEncoder().encode(msg), 'utf8').then(function (r) { return toHex(r.signature); }); },
    };
  };
  var w = null;
  var post = function (path, body) {
    return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (out) { if (!r.ok) throw new Error(out.error || 'failed'); return out; }); });
  };

  // what the next tap does; each step is called synchronously from the click, so a sign keeps the gesture
  var next = start;
  var sol = $('yc-sol');
  var run = function (step) {
    btn.disabled = true; sol.disabled = true;
    var p;
    try { p = Promise.resolve(step()); } catch (e) { p = Promise.reject(e); }
    p.catch(function (e) {
      status(e && (e.shortMessage || e.message) ? (e.shortMessage || e.message) : String(e), true);
      btn.disabled = false; sol.disabled = false;
    });
  };
  btn.onclick = function () { run(next); };
  sol.onclick = function () { run(startSol); };

  function start() {
    status('Waiting for the wallet\\u2026');
    return wallet().then(function (got) {
      if (!got) return none();
      return connected(got);
    });
  }
  function startSol() {
    var got = solWallet();
    if (!got) return noneSol();
    status('Waiting for the wallet\\u2026');
    return connected(got);
  }
  /** One wallet chosen: from here the flow is the same, on the primary button */
  function connected(got) {
    w = got;
    sol.hidden = true;
    return w.connect().then(function (a) {
      address = a;
      return fetch('/gate/check?address=' + address).then(function (r) { return r.json(); });
    }).then(function (out) { return out.listed ? (w.tap ? ready() : enter()) : out.waitlisted ? waiting() : lineup(); });
  }
  /** No Solana wallet in this browser: Phantom's in-app browser is the way in. */
  function noneSol() {
    $('yc-row').innerHTML = '<a class="yc-btn" href="https://phantom.app/ul/browse/' + encodeURIComponent(location.href) + '?ref=' + encodeURIComponent(location.origin) + '">Open in Phantom</a>';
    status('No Solana wallet in this browser. Open this page in your wallet app\\u2019s browser (Phantom, Solflare, Backpack\\u2026), or on a desktop with a wallet extension.');
  }

  /** No injected wallet and no WalletConnect on this build: the wallet's own browser is the way in. */
  function none() {
    var here = location.host + location.pathname + location.search;
    $('yc-row').innerHTML = '<a class="yc-btn" href="https://metamask.app.link/dapp/' + here + '">Open in MetaMask</a>';
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
    return w.sign(T_VERIFY.replace('__a__', norm(address)).replace('__i__', issued)).then(function (signature) {
      return post('/gate/verify', { address: address, issued: issued, signature: signature });
    }).then(function () {
      status('You\\u2019re in.');
      // a deep link keeps its route; everyone else lands on the welcome (src/ui/Join.tsx, the in-variant)
      var h = location.hash; if (!h || h === '#/' || h === '#/start' || h === '#/join') location.hash = '#/join';
      ${waitlist ? "location.replace('/' + location.hash)" : 'location.reload()'};
    });
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
    $('yc-row').innerHTML = '<a class="yc-btn" target="_blank" rel="noopener" href="https://x.com/intent/post?text=' + text + '">Share on X</a>';
    status(address);
  }

  function request() {
    var el = $('yc-email');
    var email = el.value.trim().toLowerCase();
    if (!email || !el.checkValidity()) { status('Enter a valid email address.', true); btn.disabled = false; el.focus(); return; }
    var issued = new Date().toISOString();
    status('Sign to prove the wallet is yours \\u2014 free, no transaction.');
    return w.sign(T_REQUEST.replace('__a__', norm(address)).replace('__i__', issued).replace('__e__', email)).then(function (signature) {
      return post('/gate/request', { address: address, issued: issued, signature: signature, email: email });
    }).then(function () { waiting(email); });
  }
})();
</script>
</div>`

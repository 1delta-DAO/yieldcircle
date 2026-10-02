/**
 * The page a visitor without a beta cookie gets instead of the app. Plain HTML
 * and an injected wallet (EIP-1193) only: the app bundle — and with it
 * WalletConnect — is exactly what the gate withholds, so on a phone this page
 * is opened in a wallet's own browser.
 */

/** The one message both sides build; the middleware recovers the signer from it. */
export const message = (address: string, issued: string) =>
  `YieldCircle beta access\n\nAddress: ${address.toLowerCase()}\nIssued: ${issued}`

export const gatePage = (origin: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>YieldCircle — closed beta</title>
<meta name="description" content="YieldCircle is in closed beta. Connect a whitelisted wallet, or join the waitlist." />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="YieldCircle" />
<meta property="og:title" content="YieldCircle — closed beta" />
<meta property="og:description" content="Dollars, ether, bitcoin, earning. Whitelisted wallets only, for now." />
<meta property="og:url" content="${origin}/" />
<meta property="og:image" content="${origin}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@1deltaDAO" />
<meta name="twitter:image" content="${origin}/og.png" />
<meta name="theme-color" content="#000000" />
<meta name="color-scheme" content="dark" />
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" />
<style>
  :root { --bg: #000; --fg: #e8e8e8; --dim: #8a8a8a; --line: #222; --accent: #e8e8e8; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--fg); }
  body { font: 15px/1.5 'IBM Plex Sans', system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; padding: 24px 16px; }
  main { width: 100%; max-width: 420px; text-align: center; }
  .logo { width: 56px; height: 56px; margin-bottom: 28px; }
  .tag { display: inline-block; font: 500 11px/1 'IBM Plex Mono', monospace; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); border: 1px solid var(--line); border-radius: 999px; padding: 6px 10px; margin-bottom: 18px; }
  h1 { font-size: 28px; font-weight: 600; letter-spacing: -.02em; margin: 0 0 10px; }
  p { color: var(--dim); margin: 0 0 28px; }
  button, .btn { display: block; width: 100%; font: 600 15px/1 'IBM Plex Sans', sans-serif; padding: 15px; border-radius: 12px; border: 1px solid var(--accent); background: var(--accent); color: #000; cursor: pointer; text-decoration: none; }
  button:disabled { opacity: .5; cursor: default; }
  .ghost { background: transparent; color: var(--fg); border-color: var(--line); margin-top: 10px; }
  #status { min-height: 1.5em; margin-top: 18px; font: 13px/1.5 'IBM Plex Mono', monospace; color: var(--dim); overflow-wrap: anywhere; }
  .err { color: #ff8a7a !important; }
</style>
</head>
<body>
<main>
  <img class="logo" src="/favicon.svg" alt="" />
  <div class="tag">Closed beta</div>
  <h1 id="title">YieldCircle is invite-only</h1>
  <p id="lede">Connect a whitelisted wallet to enter. Not on the list yet? Connecting puts you on the waitlist.</p>
  <div id="actions"><button id="go">Connect wallet</button></div>
  <div id="status"></div>
</main>
<script>
(() => {
  const TEMPLATE = ${JSON.stringify(message('__ADDRESS__', '__ISSUED__'))};
  const $ = (id) => document.getElementById(id);
  const status = (text, err) => { $('status').textContent = text; $('status').className = err ? 'err' : ''; };
  const eth = window.ethereum;

  if (!eth) {
    $('actions').innerHTML = '<button id="copy">Copy link</button>';
    status('No wallet in this browser. Open this page in your wallet app\\u2019s browser (MetaMask, Rabby, Coinbase Wallet\\u2026), or on a desktop with a wallet extension.');
    $('copy').onclick = () => navigator.clipboard?.writeText(location.href).then(() => status('Link copied.'));
    return;
  }

  const toHex = (s) => '0x' + Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('');

  $('go').onclick = async () => {
    $('go').disabled = true;
    try {
      status('Waiting for the wallet\\u2026');
      const [address] = await eth.request({ method: 'eth_requestAccounts' });
      const issued = new Date().toISOString();
      const msg = TEMPLATE.replace('__ADDRESS__', address.toLowerCase()).replace('__ISSUED__', issued);
      status('Sign the message to prove it is your wallet \\u2014 free, no transaction.');
      const signature = await eth.request({ method: 'personal_sign', params: [toHex(msg), address] });
      status('Checking the list\\u2026');
      const res = await fetch('/gate/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address, issued, signature }) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'verification failed');
      if (out.listed) { status('You\\u2019re in.'); location.reload(); return; }
      $('title').textContent = 'You\\u2019re on the waitlist';
      $('lede').textContent = 'We\\u2019re letting wallets in by wave. This one is in line \\u2014 come back with it once it\\u2019s whitelisted.';
      const text = encodeURIComponent('On the waitlist for the YieldCircle closed beta \\u{1F440} ' + location.origin);
      $('actions').innerHTML = '<a class="btn" target="_blank" rel="noopener" href="https://x.com/intent/post?text=' + text + '">Share on X</a><button class="ghost" id="other">Try another wallet</button>';
      $('other').onclick = () => location.reload();
      status(address);
    } catch (e) {
      status(e && e.message ? e.message : String(e), true);
      $('go') && ($('go').disabled = false);
    }
  };
})();
</script>
</body>
</html>`

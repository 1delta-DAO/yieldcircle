/**
 * The pages a visitor without a beta cookie gets instead of the app: the gate
 * (`/`, anything) and the request form (`/lineup`). Plain HTML and an injected
 * wallet (EIP-1193) only: the app bundle — and with it WalletConnect — is
 * exactly what the gate withholds, so on a phone these are opened in a
 * wallet's own browser.
 */

/** The one message both sides build; the middleware recovers the signer from it. */
export const message = (address: string, issued: string, email?: string) =>
  email === undefined
    ? `YieldCircle beta access\n\nAddress: ${address.toLowerCase()}\nIssued: ${issued}`
    : `YieldCircle beta request\n\nAddress: ${address.toLowerCase()}\nEmail: ${email}\nIssued: ${issued}`

export const gatePage = (origin: string) =>
  layout(origin, {
    title: 'YieldCircle — closed beta',
    h1: 'YieldCircle is invite-only',
    lede: 'Connect a whitelisted wallet to enter.',
    form: `<button id="go">Connect wallet</button><a class="btn ghost" href="/lineup">Not on the list? Get in line</a>`,
    endpoint: '/gate/verify',
    template: message('__ADDRESS__', '__ISSUED__'),
  })

export const lineupPage = (origin: string) =>
  layout(origin, {
    title: 'YieldCircle — get in line',
    h1: 'Get in line for the beta',
    lede: 'We let wallets in by wave. Leave the wallet you’ll use and an email, and we’ll tell you when you’re in.',
    form: `<input id="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" required /><button id="go">Connect wallet &amp; request access</button>`,
    endpoint: '/gate/request',
    template: message('__ADDRESS__', '__ISSUED__', '__EMAIL__'),
  })

type Spec = { title: string; h1: string; lede: string; form: string; endpoint: string; template: string }

const layout = (origin: string, s: Spec) => `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>${s.title}</title>
<meta name="description" content="YieldCircle is in closed beta. Get in line with your wallet." />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="YieldCircle" />
<meta property="og:title" content="${s.title}" />
<meta property="og:description" content="Dollars, ether, bitcoin, earning. Whitelisted wallets only, for now." />
<meta property="og:url" content="${origin}/lineup" />
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
  :root { --bg: #000; --fg: #e8e8e8; --dim: #8a8a8a; --line: #2a2a2a; --accent: #e8e8e8; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--fg); }
  body { font: 15px/1.5 'IBM Plex Sans', system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; padding: 24px 16px; }
  main { width: 100%; max-width: 420px; text-align: center; }
  .logo { width: 56px; height: 56px; margin-bottom: 28px; }
  .tag { display: inline-block; font: 500 11px/1 'IBM Plex Mono', monospace; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); border: 1px solid var(--line); border-radius: 999px; padding: 6px 10px; margin-bottom: 18px; }
  h1 { font-size: 28px; font-weight: 600; letter-spacing: -.02em; margin: 0 0 10px; }
  p { color: var(--dim); margin: 0 0 28px; }
  #actions { display: grid; gap: 10px; }
  input { width: 100%; font: 15px/1 'IBM Plex Sans', sans-serif; padding: 15px; border-radius: 12px; border: 1px solid var(--line); background: #0d0d0d; color: var(--fg); outline: none; }
  input:focus { border-color: var(--dim); }
  button, .btn { display: block; width: 100%; font: 600 15px/1 'IBM Plex Sans', sans-serif; padding: 15px; border-radius: 12px; border: 1px solid var(--accent); background: var(--accent); color: #000; cursor: pointer; text-decoration: none; }
  button:disabled { opacity: .5; cursor: default; }
  .ghost { background: transparent; color: var(--fg); border-color: var(--line); }
  #status { min-height: 1.5em; margin-top: 18px; font: 13px/1.5 'IBM Plex Mono', monospace; color: var(--dim); overflow-wrap: anywhere; }
  .err { color: #ff8a7a !important; }
</style>
</head>
<body>
<main>
  <a href="/"><img class="logo" src="/favicon.svg" alt="YieldCircle" /></a>
  <div class="tag">Closed beta</div>
  <h1 id="title">${s.h1}</h1>
  <p id="lede">${s.lede}</p>
  <div id="actions">${s.form}</div>
  <div id="status"></div>
</main>
<script>
(() => {
  const TEMPLATE = ${JSON.stringify(s.template)};
  const ENDPOINT = ${JSON.stringify(s.endpoint)};
  const $ = (id) => document.getElementById(id);
  const status = (text, err) => { $('status').textContent = text; $('status').className = err ? 'err' : ''; };
  const eth = window.ethereum;
  const share = (line) => '<a class="btn" target="_blank" rel="noopener" href="https://x.com/intent/post?text=' + encodeURIComponent(line + ' ' + location.origin + '/lineup') + '">Share on X</a>';

  if (!eth) {
    $('go').textContent = 'Copy link';
    $('go').onclick = () => navigator.clipboard?.writeText(location.href).then(() => status('Link copied.'));
    status('No wallet in this browser. Open this page in your wallet app\\u2019s browser (MetaMask, Rabby, Coinbase Wallet\\u2026), or on a desktop with a wallet extension.');
    return;
  }

  const toHex = (s) => '0x' + Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('');

  $('go').onclick = async () => {
    const emailInput = $('email');
    const email = emailInput ? emailInput.value.trim().toLowerCase() : undefined;
    if (emailInput && !emailInput.checkValidity()) { status('Enter a valid email address.', true); emailInput.focus(); return; }
    $('go').disabled = true;
    try {
      status('Waiting for the wallet\\u2026');
      const [address] = await eth.request({ method: 'eth_requestAccounts' });
      const issued = new Date().toISOString();
      const msg = TEMPLATE.replace('__ADDRESS__', address.toLowerCase()).replace('__ISSUED__', issued).replace('__EMAIL__', email || '');
      status('Sign the message to prove it is your wallet \\u2014 free, no transaction.');
      const signature = await eth.request({ method: 'personal_sign', params: [toHex(msg), address] });
      status('Checking the list\\u2026');
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address, issued, signature, email }) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'verification failed');
      if (out.listed) { status('You\\u2019re in.'); location.href = '/'; return; }
      if (out.requested) {
        $('title').textContent = out.again ? 'Updated \\u2014 you\\u2019re still in line' : 'You\\u2019re in line';
        $('lede').textContent = 'We\\u2019ll email ' + email + ' when this wallet is whitelisted.';
        $('actions').innerHTML = share('In line for the YieldCircle closed beta \\u{1F440}');
        status(address);
        return;
      }
      $('title').textContent = 'Not on the list yet';
      $('lede').textContent = 'This wallet isn\\u2019t whitelisted. Get in line and we\\u2019ll email you when it is.';
      $('actions').innerHTML = '<a class="btn" href="/lineup">Get in line</a><button class="ghost" id="other">Try another wallet</button>';
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

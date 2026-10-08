# Asset research backlog

As of 2026-10-06. Moved from a Claude doc; edit here.

447 of the 548 assets in the position index have no description anywhere in the app, including 151 of the 232 assets holding $1m or more. This backlog lists them by size so research goes to the biggest gaps first.

The asset page (`src/ui/TokenPage.tsx`) opens with a description since 2026-10-08. The one source is token-lists' `asset-notes.json` (curated notes in its `scripts/notes/notes.json`, plus a derived one-liner for 6k groups); `pnpm notes` copies it into `src/data/asset-notes.json`, which the page lazy-loads. A finished row below becomes a curated note in token-lists, never a line in this repo. Plan: [asset-info-plan.md](asset-info-plan.md).

apyUSD shows the problem. Its page has numbers but never says what apyUSD is, what earns its 13.32 % own yield, or how it relates to apxUSD, the token it wraps.

## Gap types

The main research gap is the description. Missing issuer, market cap and own yield are often side effects of the same unknown token.

| Gap | How it shows on the page | Assets (all 548) | Fixed by |
| --- | --- | --- | --- |
| No description | Nothing says what the token is, what backs it or where its yield comes from | 447 | Research |
| No issuer | No desk chip in the header | 332 (many are native coins or governance tokens, which is correct) | Research, then token-lists `props.issuer` |
| No market cap | Market cap tile reads "not published for this token" | 315 | DefiLlama listing, or none exists |
| No logo | Generic token icon | 190 | token-lists |
| Yield-bearing name, no own yield | Own yield tile reads "nobody publishes a yield" (sdeUSD, xUSD, PTs) | 101 | Research the yield source, then the intrinsic-yield feed |
| Name = ticker | Title repeats the symbol (apyUSD, syrupUSDG, USD1) | 51 | token-lists name |
| No price | Price tile reads "no price in the index yet" | 43 | Price feed |

The apyUSD screenshot also shows page problems that need code, not research:

- Collateral-only assets (86, apyUSD among them) show $0 deposited, $0 borrowed and a blank utilization. Those tiles should give way to the $24m posted as collateral.
- ~~"Where it sits" opens on the protocol tab, which is empty for these assets ("Nothing read yet")~~. Fixed 2026-10-06: it opens on collateral when there are no lending deposits, and the deposit-history chart shows only under protocol / chain.
- The header reads "5 markets on 1 chain · 2 chains". The scope label ("2 chains") reads as a contradiction.
- "2 markets publish no totals" does not say which ones.

## Assets needing research

64 assets above $10m have no description; the other 383 are smaller and can wait. Rows marked "Unknown — verify" carry a size that looks too large for the token, so check the price before writing anything.

| Asset | Kind | Issuer (index) | Size ($m) | Other gaps | Status | Description |
| --- | --- | --- | --- | --- | --- | --- |
| **KBTC** · Kraken Wrapped BTC | BTC wrapper | Kraken | 546 | collateral-only | To research |  |
| **HA** · Honest Abe | Unknown — verify |  | 500 | issuer, logo, market cap | To research |  |
| **CIRBTC** · Circle Wrapped BTC | BTC wrapper |  | 412 | issuer, market cap | To research |  |
| **WLFI** · World Liberty Financial | Governance |  | 289 | issuer | To research |  |
| **PRIME** · Hastra PRIME | RWA / fund | Hastra | 264 | collateral-only | To research |  |
| **PST** · PayFi Strategy Token | RWA / credit | Huma | 188 | market cap | To research |  |
| **SYRUPUSDG** | Yield dollar | Maple | 185 | name, market cap | To research |  |
| **CBXRP** · Coinbase Wrapped XRP | Wrapped coin |  | 178 | issuer | To research |  |
| **xUSD** · Staked Stream USD | Yield dollar | Stream Finance | 159 | own yield | To research |  |
| **LINK** · ChainLink Token | Governance |  | 145 | issuer | To research |  |
| **PT-reUSD-10DEC2026** · PT reUSD (USDC) Ethereum | Pendle PT | Pendle | 133 | market cap, own yield | To research |  |
| **WLFIcx** · World Liberty Financial Custodial Asset | Governance |  | 113 | issuer, logo | To research |  |
| **MOON** · Moons | Unknown — verify |  | 111 | issuer | To research |  |
| **vUSD** · RWA Backed Lending by Valos | RWA / credit | Backed | 106 | market cap | To research |  |
| **WSRUSD** · Wrapped Savings rUSD | Yield dollar | Reservoir | 104 |  | To research |  |
| **ELIT** · ELITE | Unknown — verify |  | 102 | issuer, logo, market cap | To research |  |
| **PT-AUSD-8OCT2026** · PT AUSD (AUSD) Monad | Pendle PT | Pendle | 99 | market cap | To research |  |
| **U** · United Stables | Stablecoin | United Stables | 83 |  | To research |  |
| **MGLO** · Midas Fasanara Global Open | RWA / fund |  | 78 | issuer, collateral-only | To research |  |
| **USCC** · Superstate USCC | RWA / fund | Superstate | 60 | market cap | To research |  |
| **TETH** · Treehouse ETH | ETH LST | Treehouse | 57 |  | To research |  |
| **JAAA** · Janus Henderson Anemoy AAA CLO Fund Token | RWA / fund | Anemoy | 51 |  | To research |  |
| **aHYPER** · Hyperithm Delta Neutral Vault | Vault share |  | 50 | issuer, market cap, collateral-only | To research |  |
| **sUSDX** · Staked USDX | Yield dollar | Stables Labs | 50 | market cap | To research |  |
| **APE** · ApeCoin | Governance |  | 47 | issuer | To research |  |
| **dCOMP** | Unknown — verify |  | 42 | name, issuer, market cap, collateral-only | To research |  |
| **RPC** · Ripio Coin | Governance |  | 41 | issuer, market cap | To research |  |
| **lisUSD** · Lista USD | Stablecoin | Lista | 40 |  | To research |  |
| **OUSG** · Ondo Short-Term US Government Treasuries | RWA / fund | Ondo | 39 |  | To research |  |
| **PT-sUSDE-22OCT2026** · PT sUSDe (USDe) Plasma | Pendle PT | Pendle | 37 | market cap, own yield | To research |  |
| **PT-USDat-14JAN2027** · PT USDat (USDat) Monad | Pendle PT | Pendle | 36 | market cap, own yield | To research |  |
| **UNI** · Uniswap | Governance |  | 32 | issuer | To research |  |
| **mF-ONE** · Midas Fasanara ONE | RWA / fund |  | 31 | issuer, collateral-only | To research |  |
| **PT-USD3-17DEC2026** · PT USD3 (USDC) Ethereum | Pendle PT | Pendle | 31 | market cap, own yield, collateral-only | To research |  |
| **MGLOBAL** · Midas Fasanara Global | RWA / fund |  | 31 | issuer | To research |  |
| **CAKE** · PancakeSwap | Governance |  | 30 | issuer | To research |  |
| **asBNB** · Astherus Staked BNB | BNB LST |  | 28 | issuer | To research |  |
| **msETH** · Metronome Synth ETH | Synthetic |  | 27 | issuer | To research |  |
| **MWIN** · Midas Wellington Income Opportunities | RWA / fund |  | 25 | issuer, market cap, collateral-only | To research |  |
| **gAUSD** · K3 x Galaxy Lending | Vault share |  | 25 | issuer, market cap | To research |  |
| **apyUSD** | Yield dollar | Apyx | 24 | name, collateral-only | To research |  |
| **OETH** · Origin Ether | ETH LST | Origin | 24 | collateral-only | To research |  |
| **PT-sUSDS-26NOV2026** · PT sUSDS (USDS) Ethereum | Pendle PT | Pendle | 24 | market cap, own yield, collateral-only | To research |  |
| **sthUSD** · Staked thUSD | Yield dollar |  | 21 | issuer, market cap, collateral-only | To research |  |
| **msY** | Unknown — verify |  | 21 | name, issuer, market cap | To research |  |
| **aHyperBTC** · Hyperithm Delta Neutral cbBTC Vault | Vault share |  | 18 | issuer, market cap | To research |  |
| **mM1-USD** · Midas M1 USD Market Neutral | RWA / fund |  | 18 | issuer, collateral-only | To research |  |
| **USDX** · Stables Labs USDX | Stablecoin | Stables Labs | 18 |  | To research |  |
| **uBTC** · Unit Bitcoin | BTC wrapper |  | 18 | issuer | To research |  |
| **FXRP** | Wrapped coin |  | 17 | name, issuer, logo, collateral-only | To research |  |
| **vaSTETH** · vaSTETH Pool | Vault share |  | 17 | issuer, logo, market cap, collateral-only | To research |  |
| **STRUSD** · Tori Staked trUSD | Yield dollar | Tori | 17 | collateral-only | To research |  |
| **APXUSD** | Stablecoin | Apyx | 16 | name, market cap | To research |  |
| **SUSDAT** · Saturn sUSDat | Yield dollar | Saturn | 15 | collateral-only | To research |  |
| **PT-apyUSD-5NOV2026** · PT apyUSD (apxUSD) Ethereum | Pendle PT | Pendle | 14 | market cap, own yield, collateral-only | To research |  |
| **FBTC** · Fire Bitcoin | BTC wrapper | Function | 14 |  | To research |  |
| **spUSDG** · Spark Savings USDG | Yield dollar |  | 13 | issuer, logo, market cap, collateral-only | To research |  |
| **CBADA** · Coinbase Wrapped ADA | Wrapped coin |  | 13 | issuer, collateral-only | To research |  |
| **AA\_FalconXUSDC** · Pareto AA Tranche - FalconXUSDC | RWA / credit |  | 12 | issuer, market cap, collateral-only | To research |  |
| **USTB** · Superstate Short Duration US Government Securities Fund | RWA / fund | Superstate | 12 |  | To research |  |
| **stUSDS** · Staked USDS | Yield dollar | Sky | 12 | market cap, collateral-only | To research |  |
| **mHyperBTC** · Midas Hyperithm BTC | Vault share |  | 11 | issuer, collateral-only | To research |  |
| **msUSD** · Metronome Synth USD | Synthetic | Metronome | 11 |  | To research |  |
| **earnAUSD** | Vault share |  | 11 | name, issuer, market cap | To research |  |

## Research checklist

Each row is done when the Description cell holds one line in the style of `assets.ts` (under 90 characters, e.g. "Ethena synthetic dollar · hedged ETH/BTC basis") and the facts below are checked against the issuer's own docs.

1. **What it is**: stablecoin, staked or savings wrapper, fund share, PT, vault share, wrapped coin or governance token. For a wrapper, name the token it wraps (apyUSD wraps apxUSD).
2. **Whose credit**: the issuer or desk that holds the backing. This feeds `props.issuer` in token-lists and the desk chip.
3. **Backing**: cash and T-bills, a delta-neutral basis trade, private credit, reinsurance, or an on-chain CDP.
4. **Yield source**: where the own yield comes from, and whether a public feed exists for it. A PT's yield is its fixed rate to maturity.
5. **Redemption**: who can redeem, how fast, and any KYC or allowlist gate.
6. **Sources**: a link to the docs page and, where one exists, the audit or attestation.

Where the results go is still open:

- **Description** (proposed 2026-10-06): one generalized list in token-lists, keyed by **asset group** and valid on every chain the group lives on (e.g. a root `asset-notes.json`: `what`, `body`, `backing`, `yieldSource`, `redemption`, `links`, `updated`). A per-chain variant adds only a short tagline (e.g. "bridged from Ethereum via Wormhole"): derived from structured props where they exist (`props.oft` already covers 978 tokens on 5 lists checked), else a small `props.origin` on the chain entry, with free text only as an override. Today only `BASE` and `DESK` in `src/model/assets.ts` hold descriptions. Venue / vault prose (`margin-fetcher/src/terms/profiles.ts`) may move to token-lists as well; open question.
- **Issuer, name, logo**: token-lists, then `node scripts/desks.mjs` to rebuild `src/data/desks.json`.
- **Own yield**: the intrinsic-yield feed behind the index's `intrinsicApr`.
- **Market cap**: nothing to do here if DefiLlama does not list the token.

# Lite: say what a row does, not whose dollar it is

Built 2026-11-15. Lite and the phone name a row by what earns the money ("Basis trade via
Ethena", "Looped basis trade via Ethena", "USDC lending via Aave") instead of whose dollar it is.
On that day's live menu 148 of 176 rows (84 %) carry a mechanism word; the other 28 fall back.

## How it works

- **The word is per token.** token-lists' notes carry a `mechanism` id (`scripts/notes/notes.ts`
  there: `MECHANISMS`, a closed list the check enforces). It is hand-set on a curated note
  (`notes.json`), read off props for an LST or a tokenized fund, and a live Pendle PT takes its
  underlying's.
- **`pnpm notes`** copies the notes and writes `data/mechanisms.json` (group → id, ~11 kB): the
  notes are a lazy chunk, a list cannot load them.
- **`model/mechanism.ts`** turns an id into words, holds the one-line-of-business issuers
  (`DESK_DEFAULT`) and the vault platforms that lend (`LENDING_VAULTS`).
- **`model/lite.ts`**: `mechanismOf(s)` picks the word, `liteName` / `rowName` build the name,
  `plainName().sub` says where the row sits when the name had no room for it.

To give a token a word: add `"mechanism": "<id>"` to its note in token-lists, `npm run notes`
there, `pnpm notes` here. A new id also needs its words in `MECHANISM_WORDS` (a test fails
otherwise).

## The names

| Row | Before | Now | Sub line |
| --- | --- | --- | --- |
| sUSDe | Ethena | Basis trade via Ethena | Savings rate |
| wstETH | Lido | Staking via Lido | Staking rewards |
| PT sUSDe | Ethena via Pendle | Fixed basis trade via Ethena | Fixed rate until 26 Nov · on Pendle |
| sUSDe loop on Aave | Ethena loop via Aave | Looped basis trade via Ethena | Borrows dollars · on Aave |
| USDC on Aave | USDC via Aave | USDC lending via Aave | Lent to borrowers |
| USDC in a Morpho vault | USDC via Morpho | USDC lending via Morpho | Vault curated by Steakhouse |
| USDe on Aave | Ethena via Aave | Ethena lending via Aave | Lent to borrowers |
| wstETH on Fluid | Lido via Fluid | Lido lending via Fluid | Lent to borrowers · on top of its staking |
| spUSDT | USDT via Spark | USDT lending via Spark | Savings rate |
| sAVAX loop on Aave | AVAX loop via Aave | Looped AVAX staking via Aave | Borrows AVAX |

Two departures from the scoping below, both forced by the live menu:

- **A lent coin keeps its name in front.** "Lending via Aave" would have been the name of a
  dozen rows (USDC, USDT, RLUSD, GHO, USDe … all lend on Aave).
- **Folding is unchanged.** `liteMenu` still folds on the money title, so the menu has the same
  rows as before. A folded row can therefore stand in for one that earns differently (the best
  "USDC" row hides the other USDC rows, as it always did). Folding by mechanism as well was
  tried: it is more honest and adds about 28 rows. Not done; it is a menu decision.

## Fallback, as built

1. The held token's `mechanism` (a vault's share, a loop's collateral, a PT's underlying).
2. The issuer's one line of business (`DESK_DEFAULT`) — only for the issuer's own product or its
   PT, and for a loop only when the collateral itself yields.
3. A lending market or a vault on a lending platform is Lending; a staking row is Staking.
4. No word: "Savings via Usual", "Fixed rate via Tori", "USDC savings via JUSD Finance"; a loop,
   a managed vault and someone else's wrapper keep the old name ("Agora loop via Aave", "Tori via
   Upshift", "Lido via Fluid").

Rows on the fallback today: the Upshift vaults, Tori trUSD, Solstice eUSX, Midas mAPOLLO, Usual
USD0++, Hyperbeat hbUSDT, Noon sUSN, Concrete, JUSD, Nest FACTOR, Mezzanine msHastra, Metronome,
the Alchemix transmuters, Frankencoin savings, Sanctum INF, and the Solana loops and PTs whose
groups are chain-local (token-lists derives nothing for those).

## Fit on the phone

Measured, not seen on a device: every name and sub of the live menu in the app's Plex files
against the widths the layout leaves, at 360 / 375 / 393 / 430 dp. The first build's names were
about 60 % longer than the old ones and lost their ending on every one-line surface. What was done:

- Three words are short: `Mixed`, `Dividends`, `Hedged` (were "Mixed strategies", "Stock
  dividends", "Hedged trading"). The Earn list then cuts no name at 393 dp, 2 at 375, 19 at 360.
- The phone's board rows and position rows (board, You) take two lines for the title.
- The phone's feed line under a wallet keeps the short name (`rowShort`: "Ethena loop via Aave"):
  one 10.5 px line has no room for more. The web's feed says the full name.

Left: the sub line. With the "12+ people run this · $1.2M" tail a loop's or PT's sub now runs
past two lines more often (9 → 20 rows at 393 dp), because it also says where the row sits.

## Still open

- **The curated words are a draft.** The 52 hand-set ids were read off each note's `yieldSource`
  and are unverified against issuer docs; the "check" column in the table below lists the
  doubtful ones (Sky as lending, Maple, Cap, Unitas).
- "Basis trade" and "Hedged trading" as words for a Lite reader.
- The loss line of a loop ticket still says "if Ethena's dollar trades 7 % under $1" (built
  from `moneyWord`); that is whose coin can fall, so it was left.

---

The scoping as written before the build follows; its numbers are the pre-build menu.

## What was measured

Lite's default menu, built with the app's own code (`classifyEarn`, `classifyPair`, `liteMenu`)
over the live catalogue on 2026-11-15, then joined to token-lists `props` and `asset-notes.json`.
175 rows: 55 savings, 32 lending, 31 loops, 24 staking, 19 fixed (PTs), 14 vaults.

| Where the word comes from | Rows | How |
| --- | --- | --- |
| The row is a lending market | 32 | `source: 'lending'` → **Lending** |
| A vault on a lending protocol (Morpho, Jupiter Lend, Lista, Loopscale) | 8 | `protocolKey` → **Lending** |
| The held token is an LST / LRT | 42 | token-lists `lst.type` → **Staking** / **Restaking** |
| The held token is an issuer's product | 87 | needs a curated word (66 products, 57 issuers) |
| An Upshift vault (a manager's strategy, not lending) | 6 | no word; fallback **Vault** |

So 82 rows (47 %) are automatic, 87 (50 %) depend on a curated table, 6 fall back.

Three things the measurement showed that shape the design:

1. **The word belongs to the token, not the issuer.** Sky has sUSDS (savings rate) and stUSDS
   (lent to SKY stakers). Midas has mAPOLLO and mM1-USD. Hastra has PRIME and AUTO. Ethena has
   sUSDe (basis) and USDtb (T-bills). An issuer-only map would be wrong for these. The key must be
   the held token's asset group, with the issuer as a default.
2. **Nothing structured carries the mechanism for dollar savings tokens.** token-lists says
   `savings: { underlying }` and nothing about how the yield is made. `rwa.subType` has the right
   vocabulary (`treasury`, `private-credit`, `reinsurance`, `basis-trade`) but only 3 Lite rows
   carry an `rwa` block. The earn listing carries no tags. The only source today is the curated
   notes' free-text `yieldSource`.
3. **Many products are honest mixtures.** Maple is "institutional loans, plus basis trading".
   Frax is "carry trade, AMOs or T-bills". They need a word of their own, not a forced fit.

## The vocabulary

A closed list, so the words can be filtered on and translated later.

| Word | Meaning for a Lite reader | Examples on today's menu |
| --- | --- | --- |
| Lending | borrowers pay interest | Aave, Morpho vaults, Sky, scrvUSD, sDOLA, sBOLD, yoUSD, sUSDD |
| Staking / Restaking | network rewards | wstETH, weETH, ezETH, sAVAX, kHYPE |
| Basis trade | long spot, short perp, earns funding | sUSDe, sYUSD, asUSDF, BFBTC, LIMUSD, BTWU |
| US Treasuries | T-bills and repo | cUSDO, USD0++ (USDY, USDtb when listed) |
| Private credit | loans to companies or consumers | syrupUSDC, sUSD3, AUTO, sUSDfr, PST, nOPAL, sUSDai, sAID |
| Reinsurance | insurance premiums | reUSD, ONyc |
| Stock dividends | preferred-share dividends | apyUSD, sUSDat, srUSDat |
| Hedged trading | a manager's market-neutral book | strUSD, sUSDx, mM1-USD, savUSD, sUSDf, yUSD |
| Mixed strategies | several of the above | sfrxUSD, siUSD, wsrUSD, syzUSD, mixUSDC |
| Fixed rate | prefix for a PT | "Fixed basis trade via Ethena" |

## Draft mapping of the 66 curated products

Drafted from each token's `yieldSource` note. **Unverified: every line needs your sign-off**, the
"check" column most of all.

| Word | Products (issuer: token) | Check |
| --- | --- | --- |
| Lending | Sky: sUSDS, stUSDS · Curve: scrvUSD · Inverse: sDOLA · K3: sBOLD · Yearn: ysyBOLD · YO: yoUSD · USDD: sUSDD · Spark: spUSDT, spUSDG · Cap: stcUSD · Resupply: sreUSD · Frankencoin: ZCHF savings | sUSDS is partly T-bills; Cap is operator borrowing plus underwriting |
| Basis trade | Ethena: sUSDe · Aegis: sYUSD · Aster: asUSDF · BitFi: BFBTC · Liminal: LIMUSD · Bitway: BTWU · Unitas: sUSDu | Unitas is JLP fees plus funding |
| US Treasuries | OpenEden: cUSDO · Usual: USD0++ | USD0++ has no curated note |
| Private credit | Maple: syrupUSDC · 3Jane: USD3, sUSD3 · Hastra: AUTO, PRIME/msHastra · Forest Road: sUSDfr · Huma: PST · Nest: nOPAL · USDai: sUSDai · GAIB: sAID | Maple also runs basis trades; msHastra's note reads as a SOFR reserve rate |
| Reinsurance | Re: reUSD · OnRe: ONyc | |
| Stock dividends | Apyx: apyUSD, apxUSD · Royco: ROY-ST-apyUSD · Saturn: sUSDat, USDat · Strata: srUSDat | the word itself; "Preferred shares" is the alternative |
| Hedged trading | Tori: strUSD, trUSD · Axis: sUSDx · Midas: mM1-USD · Avant: savUSD · Falcon: sUSDf · YieldFi: yUSD | all manager-reported |
| Mixed strategies | Frax: sfrxUSD · infiniFi: siUSD · Reservoir: wsrUSD · Yuzu: syzUSD, YZPRIME, YZM · Alchemix: mixUSDC, mixWETH · f(x): fxSAVE | |
| No word yet (fallback) | Midas: mAPOLLO · Solstice: eUSX · Hyperbeat: hbUSDT · Concrete: ctDefiUSDT · JUSD · Nest: FACTOR · Metronome: vamsUSD · Alchemix: alUSD / alETH transmuter · Agora: PT AUSD | no `yieldSource` note to draft from |

## Fallback

In order, first hit wins. The last step is today's name, so no row can come out blank or worse.

1. The held token's curated word (a PT or wrapper resolves to its underlying's).
2. The issuer's default word, only where the issuer has one product line.
3. Structure: `lst.type` → Staking / Restaking; `rwa.subType` → Treasuries / Private credit /
   Reinsurance / Basis trade; `source` → Lending, Fixed rate, Savings, Vault.
4. The money word as now: "Dollars via X".

Step 3 means a new unknown savings token reads "Savings via X" and a new PT "Fixed rate via X".

## The phrases

| Row | Today | Proposed |
| --- | --- | --- |
| sUSDe | Ethena | Basis trade via Ethena |
| USDC on Aave | USDC via Aave | Lending via Aave |
| USDC in a Steakhouse Morpho vault | USDC via Morpho | Lending via Morpho (sub: curated by Steakhouse) |
| PT sUSDe | Ethena via Pendle | Fixed basis trade via Ethena |
| sUSDe / USDC loop on Aave | Ethena loop via Aave | Looped basis trade via Ethena |
| wstETH | Lido | Staking via Lido |

## Decisions that are yours

1. **Where the venue goes on a loop or PT.** "Looped basis trade via Ethena" drops Aave, and
   today's menu has that loop on both Aave and Venus: two rows would read the same. I recommend
   the venue moves to the sub line ("on Aave · borrows dollars").
2. **Lending a token that earns by itself** (5 rows: Huma, Re, USDai, weETH, wstETH on Fluid /
   Jupiter Lend). I recommend "Lending via Fluid", with the token's word in the sub.
3. **Where the table lives.** I recommend curating it in token-lists as a `mechanism` field on
   the note (one source, like the notes), and having `scripts/notes.mjs` extract a small
   `data/mechanisms.json` (a few kB). The notes file itself is a 1 MB lazy chunk and cannot be
   loaded for a list. A hand table in core is faster to ship but is a second place to maintain.
4. **Sky as "Lending"** and the other "check" lines above.
5. **Whether "Basis trade" is a Lite word.** It is accurate and short, but it is the one term in
   the list a beginner may not know.

## What it touches

- `model/lite.ts`: a new `whatOf(s)`; `liteName` / `rowName` build the phrase. Both apps render
  rows through `rowName` (`LiteBits.tsx`, `mobile/src/ui/lite.tsx`), so they change together.
- Keep `plainName().title` and `moneyWord` as they are. `liteMenu` folds rows on the title, and
  the loop ticket's loss line ("if Ethena's dollar trades 7 % under $1") is built from it.
- Search: add the word to the row's search text (`extra` in `LiteEarn.tsx` and
  `mobile/app/lite/index.tsx`), so "treasuries" finds rows.
- A test that every row of a recorded menu gets a non-empty word, and that the curated keys
  still exist in the notes.

Rough size: the model, table plumbing and tests are about a day. The curation is 66 one-word
entries, 49 drafted above, 17 needing a look at the issuer's docs.

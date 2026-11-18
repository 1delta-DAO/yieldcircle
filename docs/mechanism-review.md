# Mechanism words: review sheet

Written 2026-11-17 for Achim's review, regenerated 2026-11-18 after the corrections in section 4. Generated from `MECHANISM_WORDS` / `MECHANISM_DETAIL`
(`packages/core/src/model/mechanism.ts`) and the `mechanism` field of the notes
(`packages/core/src/data/asset-notes.json`, copied from token-lists).

Two things to check: whether each short word and its long form are right (section 1), and whether
each token sits under the right word (section 2). Where to correct what:

- A word or a sentence: edit `MECHANISM_WORDS` / `MECHANISM_DETAIL` in `mechanism.ts`.
- A token under the wrong word: change `"mechanism"` on its note in token-lists, `npm run notes`
  there, `pnpm notes` here.
- An issuer default: `DESK_DEFAULT` in `mechanism.ts` (section 3).

## 1. The words

"On a row" is what a list shows (`Market-neutral via Tori`, `Looped market-neutral via Tori`). The other three
columns are what the phone's ticket shows under "How it earns". The sentences are a draft and
describe the mechanism in general, not one issuer.

| Id | On a row | Full name | How it earns | What can go wrong |
| --- | --- | --- | --- | --- |
| `lending` | Lending | Lending | Lent out to borrowers, who pay interest on it. | The rate moves with the demand to borrow, and a loan whose collateral cannot be sold in time is a loss. |
| `staking` | Staking | Staking | Staked to help run the network, which pays rewards for it. | A validator that misbehaves is fined, and the staked token can trade under the coin it stands for. |
| `restaking` | Restaking | Restaking | Staked, then pledged again to secure other services, which pay on top of the staking rewards. | Every service it secures can fine it, on top of what staking itself risks. |
| `basis-trade` | Basis trade | Basis trade | Holds a coin and bets against it with futures in the same size, so its price cancels out. What is left is the fee futures traders pay to stay in their bets. | That fee can turn negative, and the trade leans on the exchanges that hold the futures. |
| `treasuries` | US Treasuries | US Treasuries | Holds short-term US government debt and passes its interest on. | The rate follows US interest rates, and the fund and its custodian sit off-chain. |
| `private-credit` | Private credit | Private credit | Lent off-chain to companies or consumers, who pay interest on it. | A borrower can default, and getting the money back out can take time. |
| `reinsurance` | Reinsurance | Reinsurance | Backs insurance contracts and earns the premiums insurers pay for that. | A year of large claims is a loss, and the money is tied up while a contract runs. |
| `dividends` | Dividends | Stock dividends | Holds preferred shares and passes their dividends on. | The shares can fall in price, and a dividend can be cut or skipped. |
| `hedged-trading` | Market-neutral | Market-neutral trading | A trading desk runs several trades that each pair a buy with an equal sell, such as futures against the coin, the same coin on two exchanges, or two lending rates. It keeps the gap between the two sides, so the rate does not need prices to rise. | The gaps can close or turn into losses when markets move fast, and the desk holds the money on exchanges: its results are its own to report, not readable on-chain. |
| `perp-lp` | Perp LP | Perp exchange liquidity pool | The pool is the other side of every bet on a perpetual-futures exchange (Jupiter’s JLP, Hyperliquid’s HLP). It earns the exchange’s trading fees and what traders lose. | It pays out what traders win, so a run of winning traders is a loss, and a pool that holds coins moves with their prices. |
| `mixed` | Mixed | Mixed strategies | The issuer spreads the money over several sources, such as lending, government debt and trading. | The issuer can change the mix, and each part carries its own risk. |

Two more sentences are added by row shape (`mechanismDetailOf` in `model/lite.ts`):

| Row | Sentence |
| --- | --- |
| A loop | Looped: it borrows against what it holds to hold more, so the rate counts several times over, and so does a fall. |
| A PT | Fixed: bought under what it pays out on its date, which locks the rate for whoever holds it until then. |

## 2. Which token sits under which word

Hand-set tokens first, with the note's own `yieldSource` beside the word so the two can be
compared. Tokens whose word was read off props (LSTs, tokenized funds) or taken from a PT's
underlying are listed by ticker only.

### Lending (`lending`, shown as "Lending") · 17 tokens

| Token | What the note says it is | Yield source in the note | Paid by |
| --- | --- | --- | --- |
| PT-sUSDS-26NOV2026 | Pendle principal token on sUSDS · fixed rate to 26 Nov 2026 | fixed discount to maturity |  |
| sBOLD | K3 Capital sBOLD · BOLD in Liquity V2 stability pools (WETH/wstETH/rETH) | Liquity V2 borrower interest (stability-pool share) and liquidation gains |  |
| scrvUSD | Curve savings crvUSD · DAO-set share of crvUSD mint-market borrow fees | DAO-set share of crvUSD borrowing fees |  |
| SDAI | Sky savings DAI (legacy DSR) · RWA T-bills + crypto-collateral loan fees | Sky revenue: stability fees on crypto-collateral loans and RWA/T-bill allocations |  |
| SDOLA | Inverse Finance staked DOLA · FiRM fixed-rate borrower DBR revenue | DBR revenue from FiRM fixed-rate lending, auctioned into DOLA |  |
| spUSDG | Spark Savings vault on USDG (Robinhood Chain) · Spark Liquidity Layer yield | Spark Liquidity Layer deployments (Sky/USDS savings-rate linked) |  |
| SPUSDT | Spark savings vault on USDT · SparkLend/Morpho lending, syrupUSDT, DEX LP | SparkLend and Morpho lending interest, capped syrupUSDT allocation, DEX fees, sUSDS on idle cash |  |
| sreUSD | Savings reUSD · ERC-4626 vault earning a share of Resupply protocol revenue | 15% of Resupply's weekly revenue (borrow interest, redemption fees) plus the full below-peg borrow surcharge |  |
| stcUSD | Cap staked cUSD · loans to restaker-covered market makers + Aave on idle USDC | operator borrow interest and underwriting premiums, plus Aave yield on idle reserve |  |
| stUSDS | Sky stUSDS · USDS lent to SKY stakers who borrow against SKY | SKY borrow rate, plus Sky Savings Rate on idle funds |  |
| sUSDD | USDD savings vault · Smart Allocator lends reserves on Aave, Spark, Morpho | lending interest from Smart Allocator deployments on Aave/Spark/Morpho |  |
| sUSDS | Sky savings rate on USDS · RWA T-bills + crypto-collateral loan fees | Sky revenue: stability fees on crypto-collateral loans, RWA/T-bill allocations, allocator (Spark) yield |  |
| SUSDS | Sky savings rate on USDS · RWA T-bills + crypto-collateral loan fees | Sky revenue: stability fees on crypto-collateral loans, RWA/T-bill allocations, allocator (Spark) yield |  |
| YOUSD | YO USDC vault · lends USDC on lending markets against cbBTC, WETH and wstETH | Interest paid by borrowers on the lending markets YO allocates to |  |

Derived (2): PT-sBOLD-4FEB2027, PT-sUSDD-26NOV2026

### Staking (`staking`, shown as "Staking") · 80 tokens

| Token | What the note says it is | Yield source in the note | Paid by |
| --- | --- | --- | --- |
| asBNB | Aster (ex-Astherus) BNB yield token · wraps Lista slisBNB in Binance Launchpools | BNB staking rewards plus Binance Launchpool/HODLer airdrop/Megadrop rewards |  |
| JitoSOL | Jito liquid-staked SOL · SPL stake pool with MEV rewards | SOL staking rewards plus Jito MEV tips, net of a 4 % fee |  |
| LBTC | Lombard staked bitcoin |  |  |
| LSETH | Liquid Collective LsETH · institutional liquid-staked ETH, allowlisted mint and redeem | Ethereum staking rewards, net of protocol fees |  |
| mSOL | Marinade mSOL · liquid-staked SOL on Marinade's own staking program | SOL staking rewards |  |
| OETH | Origin liquid staking ETH · rebasing, staking yield | Ethereum staking rewards |  |
| SFLR | Sceptre sFLR · liquid-staked FLR, P-chain staking rewards, 14.5-day unlock | Flare P-chain staking rewards, net of a 10 % protocol share |  |
| STHYPE | Valantis stHYPE · rebasing staked HYPE, the same ledger as wstHYPE | HYPE staking rewards |  |
| SWETH | Swell swETH · liquid-staked ETH, paused since 2026-10-23 after a rate inflation | Ethereum staking rewards |  |
| uniETH | Bedrock uniETH · liquid-staked ETH, non-rebasing rising exchange ratio | Ethereum staking rewards |  |
| WOETH | Origin wOETH · non-rebasing wrapper of OETH, Origin's ETH yield token | ETH staking yield plus AMO fees and rewards |  |
| WSUPEROETHB | Origin wrapped Super OETH (Base) · ETH yield from staking and an Aerodrome AMO | ETH staking yield plus Aerodrome AMO fees and rewards |  |

Derived (63): ANKRBNB, ANKRETH, aprMON, APXETH, beHYPE, CBETH, ETH+, ETHx, frxETH, FRXETH, frxETH(axelar), fxcbETH, gMON, HYPED, IAU_wstETH, ionSTONE, kHYPE, lstHYPE, Manta mETH, MATICX, METH, mewstETH, OSETH, PT-clisBNB-15APR2027, PT-kHYPE-25MAR2027, PT-shMON-18MAR2027, PT-stETH-30DEC2027, PT-stHYPE-28JAN2027, PUMPBTC, PXETH, RETH, rETH, SAVAX, SFRXETH, shMON, SHYPE, slisBNB, sMON, SolvBTC.AVAX, SOLVBTC.BERA, SolvBTC.DLP, SOLVBTC.ENA, SOLVBTC.JUP, SOLVBTCBNB, SOLVBTCPLUS, sowstETH, stBTC, STBTC, STETH, stETH, STONE, superOETHb, UNIBTC, uniETH, VHYPE, wBETH, wdwstETH, WSTETH, wstETHx, WSTHYPE, XSOLVBTC, YAYSTONE, z0stETH

### Restaking (`restaking`, shown as "Restaking") · 43 tokens

| Token | What the note says it is | Yield source in the note | Paid by |
| --- | --- | --- | --- |
| LIQUIDETH | ether.fi Liquid ETH · Veda vault of ETH run across lending, LRT and basis | staking, restaking and strategy returns, after a 0.5 % platform fee |  |
| RSWETH | Swell rswETH · EigenLayer-restaked ETH, paused since 2026-10-23 after a rate inflation | Ethereum staking plus EigenLayer restaking rewards |  |
| stXRP | Firelight stXRP · FXRP staked as slashable cover capital for DeFi insurance | cover premiums (plus premium-funded emissions) |  |
| TETH | Treehouse liquid-staking wrapper on wstETH · rate-arbitrage yield | ETH staking rewards plus leveraged staking-vs-borrow rate arbitrage |  |

Derived (39): BERASTONE, BRBTC, CARROT, CMETH, dPT-cmETH-13FEB2025, dsavETH, EBTC, EETH, eETH, EZBTC, EZEIGEN, EZETH, EZREZ, InankrETH, INEIGEN, INETH, INSFRAX, INSLISBNB, INTBTC, INWSTETHS, ionweETH, ionweETH.mode, meezETH, meweETH, pcat, PT-SY pufETH-26NOV2026, PUFETH, PUFFER, PZETH, RSETH, RSWETH, savETH, SWBTC, WEETH, weETHs, weETHx, YNETH, YNETHX, z0ezETH

### Basis trade (`basis-trade`, shown as "Basis trade") · 15 tokens

| Token | What the note says it is | Yield source in the note | Paid by |
| --- | --- | --- | --- |
| asUSDF | Aster staked USDF · delta-neutral spot-long/perp-short funding on Binance | perp funding fees from spot-long/perp-short hedges on Binance |  |
| BFBTC | BitFi yield-bearing BTC · Ceffu custody, delta-neutral basis trades on Binance | perp funding rates and spot–futures basis from delta-neutral trades on Binance |  |
| BTWU | Bitway Core Alpha on U · off-chain CEX market-neutral basis trades, fixed payout rate | fixed-rate payout from off-chain market-neutral basis/funding trading |  |
| LIMUSD | Liminal limUSD · allocator over delta-neutral Hyperliquid funding and lending xTokens | perp funding, staking and money-market yield of the xTokens |  |
| MBASIS | Midas tokenized certificate · delta-neutral basis trade, can rotate into mTBILL | perp funding and the spot-futures basis |  |
| StockMarketTRBasisTrade | Piku · Midas-issued Turkish stock-market basis-trade fund, run by Morini Capital | Turkish equity-market basis and pricing differences, reflected in an oracle-set share price |  |
| SUSDE | Ethena staked USDe · earns perp funding/basis + staked-ETH and reserve yield | perp funding and basis spread, staked-ETH rewards, stablecoin/RWA reserve yield |  |
| sYUSD | Aegis staked YUSD · BTC collateral hedged with short perps, earns funding | BTC perpetual funding rates |  |
| USCC | Superstate/Bitwise crypto carry fund · BTC/ETH basis trades | Futures basis, ETH staking and Treasury interest |  |

Derived (5): nBASIS, PT-limUSD-26NOV2026, PT-sUSDE-26NOV2026, PT-sUSDE-28JAN2027, PT-sUSDe-7JAN2027

### US Treasuries (`treasuries`, shown as "US Treasuries") · 28 tokens

| Token | What the note says it is | Yield source in the note | Paid by |
| --- | --- | --- | --- |
| CUSDO | OpenEden wrapped USDO · tokenized T-bill funds (TBILL, BUIDL, USYC, VBILL) | US Treasury bill and reverse repo interest |  |
| OUSG | Ondo tokenized short-term US Treasury fund | US Treasury bill interest |  |
| USTB | Tokenized short-term US Treasury fund · now managed by Invesco | interest on T-bills and agency securities |  |

Derived (21): BC3M, BCSBGC3, BENJI, BERNA, BERNX, bERNX, BIB01, BIBTA, BUIDL, BUIDL-I, BZPR1, DEJTRSY, JTRSY, MTBILL, nTBILL, rUSDY, USDY, USYC, VBILL, wbC3M, wbIB01

### Private credit (`private-credit`, shown as "Private credit") · 37 tokens

| Token | What the note says it is | Yield source in the note | Paid by |
| --- | --- | --- | --- |
| AUTO | Hastra staked wYLDS · funds near-prime US auto loans (Agora Data / Figure) | interest paid by the auto borrowers, at a utilization-based rate minus a 0.5 % Hastra fee; Hastra targets up to ~9 %, not guaranteed |  |
| deJAAA | Freely transferable DeFi wrapper of Anemoy's JAAA · AAA-rated CLO fund | Floating-rate interest on AAA CLO debt |  |
| DEJAAA | Freely transferable DeFi wrapper of Anemoy's JAAA · AAA-rated CLO fund | Floating-rate interest on AAA CLO debt |  |
| JAAA | Tokenized Janus Henderson AAA CLO fund (Centrifuge/Anemoy) | Floating-rate interest on AAA CLO debt |  |
| nOPAL | Nest vault share · BlackOpal LiquidStone II, Brazilian card receivables | the discount at which card receivables are bought, collected at face value as Visa / Mastercard payments settle; BlackOpal targets ~12 % in USD |  |
| PST | Huma Finance PayFi LP token · USDC lent to payment financing | fees/interest from PayFi payment financing |  |
| PT-USD3-17DEC2026 | Pendle principal token on 3Jane USD3 · fixed rate to 17 Dec 2026 | fixed discount to maturity |  |
| SAID | GAIB staked AID · financing for GPUs and AI infrastructure, 30-day FIFO exit | interest from GPU and AI-infrastructure financing deals, distributed monthly |  |
| sUSD3 | 3Jane junior first-loss tranche on USD3 · levered fintech and crypto credit yield | levered share of interest on fintech receivables and crypto credit lines |  |
| SUSDAI | USD.AI staked USDai · GPU-backed loans to AI data centers + T-bills on idle cash | interest on GPU-collateralized loans plus T-bill yield |  |
| SUSDFR | Forest Road staked USDfr · specialty-finance loan interest, 21-day queued exit | interest from Forest Road specialty-finance facilities, less a 10 % performance fee |  |
| SYRUPUSDC | Maple lending pool of USDC · overcollateralized loans to crypto institutions | interest on overcollateralized institutional loans, plus basis trading and DeFi LP |  |
| USD3 | 3Jane senior credit tranche on USDC · fintech receivables + crypto credit lines | interest on fintech receivables and crypto credit lines |  |

Derived (17): ACRDX, ACRED, BHIGH, HLSCOPE, nACRDX, nALPHA, nAXI, nCREDIT, nFALCON, nLCRD, nWISDOM, PT-deJAAA-26NOV2026, PT-sAID-31DEC2026, PT-sUSD3-17DEC2026, PT-sUSDai-24JUN2027, PT-sUSDai-25FEB2027, PT-sUSDfr-28JAN2027

### Reinsurance (`reinsurance`, shown as "Reinsurance") · 4 tokens

| Token | What the note says it is | Yield source in the note | Paid by |
| --- | --- | --- | --- |
| ONyc | OnRe ONyc · share of a Bermuda reinsurance fund, dollar NAV set by OnRe | reinsurance premiums plus the yield on the collateral |  |
| PT-reUSD-10DEC2026 | Pendle principal token on reUSD · fixed rate to 10 Dec 2026 | fixed discount to maturity |  |
| REUSD | Re senior reinsurance tranche · SOFR or sUSDe rate + 2.5%, price accrues | SOFR + 250 bps on reinsurance capital, 7-day sUSDe rate + 250 bps on on-chain capital |  |

Derived (1): PT-reUSD-10DEC2026

### Stock dividends (`dividends`, shown as "Dividends") · 10 tokens

| Token | What the note says it is | Yield source in the note | Paid by |
| --- | --- | --- | --- |
| APYUSD | Apyx savings token · wraps apxUSD, earns DAT preferred-share dividends | dividends from preferred shares and T-bill interest | STRC |
| ROY-ST-apyUSD | Royco senior tranche on apyUSD · protected share of yield, junior takes losses first | apyUSD dividends minus the junior's risk premium | STRC |
| SRUSDAT | Strata senior tranche of Saturn sUSDat · fixed 65% of STRC dividend, junior covers NAV | STRC preferred dividends and T-bill interest; senior fixed at 65% of STRC dividend rate | STRC |
| SUSDAT | Saturn staked USDat · yield from Strategy STRC preferred dividends | STRC dividends | STRC |

Derived (4): PT-apyUSD-11FEB2027, PT-apyUSD-24DEC2026, PT-srUSDat-14JAN2027, PT-sUSDat-14JAN2027

### Market-neutral trading (`hedged-trading`, shown as "Market-neutral") · 10 tokens

| Token | What the note says it is | Yield source in the note | Paid by |
| --- | --- | --- | --- |
| mM1-USD | Midas tokenized certificate · M1 Capital market-neutral USD strategy | arbitrage, basis trading and lending returns |  |
| STRUSD | Tori staked trUSD · ERC-4626 vault on delta-neutral synthetic dollar | returns from Tori's market-neutral strategies, net of a performance fee |  |
| sUSDf | Falcon staked USDf · funding/basis arb, cross-venue arb + altcoin staking | funding/basis arbitrage, cross-venue arbitrage, altcoin staking, LP and options |  |
| SUSDX | Axis staked USDx · trading returns paid as rewards, 7-day request exit | Axis trading returns, distributed as discretionary USDx rewards |  |
| yUSD | YieldFi yUSD (V2) · ERC-4626 on USDC, delta-neutral DeFi: LP, basis, funding, loops | LP fees, basis/funding spreads, hedged carry and leverage looping |  |

Derived (4): PT-strUSD-25FEB2027, PT-strUSD-26NOV2026, PT-sUSDf-17DEC2026, PT-sUSDx-3DEC2026

### Perp exchange liquidity pool (`perp-lp`, shown as "Perp LP") · 5 tokens

| Token | What the note says it is | Yield source in the note | Paid by |
| --- | --- | --- | --- |
| hwHLP | Hyperwave liquid HLP · Hyperliquid's market-making vault as a token | HLP market-making and liquidation profits |  |
| JLP | Jupiter perps liquidity pool · SOL, ETH, BTC and stablecoins, counterparty to traders | perp trading, borrow and swap fees, plus traders' net losses |  |
| sUSDu | Unitas staked USDu · JLP fees plus perp hedge, 7-day cooldown | JLP trading fees and perp funding |  |
| WHLP | Wrapped HLP · dollar token on HyperEVM that deposits into Hyperliquid's HLP vault | HLP market-making and liquidation profits |  |

Derived (1): PT-sUSDu-31DEC2026

### Mixed strategies (`mixed`, shown as "Mixed") · 13 tokens

| Token | What the note says it is | Yield source in the note | Paid by |
| --- | --- | --- | --- |
| fxSAVE | f(x) Protocol stability-pool vault of fxUSD/USDC · leverage fees + wstETH yield | xPOSITION trading fees, wstETH collateral yield, Aave USDC lending |  |
| mixUSDC | Alchemix V3 USDC yield token · Morpho Vault V2 over Yearn, infiniFi, Fluid, Tokemak | yield of the underlying USDC strategies, net of a 15 % performance fee |  |
| mixWETH | Alchemix V3 WETH yield token · Morpho Vault V2 over Yearn, Tokemak and ETH LSTs | staking and lending yield of the underlying ETH strategies, net of a 5 % performance fee |  |
| savUSD | Avant staked avUSD · senior tranche of delta-neutral basis, lending and LP strategies | basis trades, lending arbitrage, Pendle, Aave, DEX liquidity |  |
| sfrxUSD | Frax staked frxUSD · rotates between carry trade, DeFi AMOs and T-bills | Benchmark Yield Strategy: carry trade, DeFi AMOs or T-bills/RWA |  |
| siUSD | infiniFi staked iUSD · fractional-reserve mix of Aave/Spark lending and Pendle PTs | lending on Aave/Spark plus Pendle PT yield, boosted by locked-capital duration |  |
| syzUSD | Staked yzUSD (ERC-4626) · weekly target yield from Yuzu's leveraged stablecoin book | weekly target yield set by Yuzu from leveraged DeFi stablecoin strategies (funding-rate arbitrage, loops, lending, T-bills, CLOs) |  |
| WSRUSD | Reservoir savings rUSD · yield from T-bills, lending, funding | Reservoir reserve strategies passed to savings rate |  |
| YZM | Accountable YieldApp vault on Monad · USDC in, holds syzUSD, 3% performance fee | syzUSD yield passed through the share price, net of a 3% performance fee |  |
| YZPRIME | Yuzu Prime · levered tokenized T-bills, AAA CLOs and Maple lending, aims above SOFR | T-bill, CLO and lending yield, levered |  |

Derived (2): PT-fxSAVE-29APR2027, PT-siUSD-7JAN2027

## 3. Issuer defaults

Used only when a token has no word of its own, and only for the issuer's own product or its PT
(`DESK_DEFAULT`):

```ts
const DESK_DEFAULT: Partial<Record<GroupId, Record<string, Mechanism>>> = {
  USD: {
    ethena: 'basis-trade', resolv: 'basis-trade',
    maple: 'private-credit', '3jane': 'private-credit', usdai: 'private-credit',
    re: 'reinsurance', onre: 'reinsurance',
    sky: 'lending', curve: 'lending', inverse: 'lending', liquity: 'lending',
  },
  ETH: {
    lido: 'staking', rocketpool: 'staking', stakewise: 'staking', mantle: 'staking', stader: 'staking', coinbase: 'staking', binance: 'staking',
    etherfi: 'restaking', renzo: 'restaking', kelp: 'restaking', puffer: 'restaking',
  },
}
```

Separately, a lending market is always Lending, and so is a vault on Morpho, Euler Earn, Kamino,
Jupiter Lend, Lista, Loopscale, Fluid or Gearbox (`LENDING_VAULTS`).

## 4. Corrected on 2026-11-18

All in token-lists (`scripts/notes/notes.json`, then `npm run notes` there and `pnpm notes` here).

| Token | Was | Now | How |
| --- | --- | --- | --- |
| savUSD (Avant) | Hedged trading | Mixed strategies | its note lists basis trades, lending arbitrage, Pendle, Aave and DEX liquidity |
| sUSDu (Unitas), and its PT | Hedged trading | Perp LP | USDu's collateral sits in JLP, hedged with perp shorts |
| MBASIS (Midas) | US Treasuries | Basis trade | new curated note; the `rwa` label had filed it with mTBILL |
| JAAA on Monad, Avalanche, BNB, Base | US Treasuries | Private credit | added to the curated JAAA note's `alsoGroups` |
| deJAAA, DEJAAA, and PT deJAAA | US Treasuries | Private credit | new curated note |
| DESPXA (S&P 500 fund) | US Treasuries | no word | new curated note with `"mechanism": null` |
| RUSD (Reservoir) | Reinsurance | no word | new curated note with `"mechanism": null`; rUSD pays its holder nothing |
| JLP (Jupiter, Solana) | none | Perp LP | new curated note |
| hwHLP (Hyperwave), WHLP (Wrapped HLP) | none | Perp LP | hwHLP's note gained the id; WHLP has a new note, confidence low (issuer unconfirmed) |

Three things changed besides the notes:

- A new id, `perp-lp`, in token-lists' `MECHANISMS` and in `MECHANISM_IDS` here.
- `"mechanism": null` on a curated note now drops a word the props would derive. Before, a note
  could only replace one.
- `hedged-trading` keeps its id and reads `Market-neutral` on a row (was `Hedged`).

Not done:

- The `rwa` labels that caused the wrong derivations (`midas-tbill` matching mBASIS,
  `anemoy-treasury` matching every Janus Henderson Anemoy fund, `reservoir-rusd`) are unchanged
  in `scripts/labels/rwaLstRules.ts`: changing them means regenerating every list.
- Other HLP tokens have no word yet: HLP0, bbHLP (Blueberry), yHLP (YieldFi), and HLPe, which
  only exists as Pendle wrappers. JLP's Exponent wrapper wJLP has none either.
- sUSDu's Solana group (`Staked USDu::sUSDu::solana`) is not covered by the note.
- The new notes are confidence medium (WHLP low): written from secondary sources, not issuer docs.

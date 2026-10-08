# Opening the waitlist — playbook and drafts

**Status:** draft, 2026-10-08. Replace `<link>` with the site URL before posting.

## The strategy in one line

YieldCircle's pitch is *follow the proof, not the promotion*. So the launch
should run on proof too: each post shows a real wallet's real number and a
reason to be early. It should not be a stream of hype and "RT to win" posts.

## 1. Rewards and the token: what to say

Promise **early rewards**. Do not promise **a token** in writing.

- "Token launch planned" in a public post is the sentence regulators and
  lawyers quote back. It is also the hardest promise to walk back if plans
  change.
- It attracts airdrop farmers who sign up with 50 wallets. On a product whose
  core is a leaderboard of *real* wallets, sybils pollute the thing you are
  selling.
- Everyone already reads "early rewards" / "points" as "there may be a token".
  You get most of the pull without the liability.

Say this: **"Early members earn rewards. What counts is what you actually do
on YieldCircle, not how many wallets you sign up."**

Tie rewards to signals the index already proves: positions held, days held,
an X account linked, comments and follows. That kills sybils for free, and it
gives people a reason to *use* the app once they're in, not just join the
list.

## 2. Mechanics that make reposts worth doing

Reposting the same post gives less each time. Each repost needs a **new
reason** to post:

| Mechanic | How | Why it repeats |
|---|---|---|
| **Batches** | Move waitlisted wallets to the whitelist in batches (`wait:` → `wl:` in the KV) and announce each one: "Batch 2 is in. 140 wallets." | A new post every few days, and FOMO for whoever is still waiting |
| **Skip the line** | "Reply with your wallet + what you farm → we pull the best replies into the next batch" | Replies push the reach up; you pick real users by hand |
| **Proof drops** | One showcase wallet per post: the clip of its PnL counting up (`src/data/showcase.json`, e.g. Kamino AUTO/PYUSD +$6.3k, 10.6%, 70 days) | It is the product's own argument, and you never run out of them |
| **Protocol spotlights** | One integrated protocol per post, tagged (section 3) | Their audience, their retweet |
| **Weekly board** | "Top 5 proven APRs this week" from the leaderboard | Content the product makes for you, every week |

Cadence for the first two weeks: the anchor post on day 0 (pinned), then
**one proof drop or spotlight a day**, plus a batch post every 3–4 days. Quote
the anchor post each time instead of plain reposts, so the link travels with
something new.

## 3. Engaging the integrated protocols

Every protocol you integrated is a distribution channel. They want posts that
show their markets being used.

- **Show, don't ask.** Post a screenshot of their markets in YieldCircle, with
  a real wallet earning on them, and tag them. Then DM their BD or community
  lead with the link: "we put your markets in front of yield users — happy to
  co-post." A repost costs them nothing and makes them look good.
- **Order:** start with the ones with active, retweet-happy accounts and a
  Superteam link: Kamino, Jupiter Lend, Exponent, Loopscale, Huma, Jito. Then
  the EVM majors: Morpho, Euler, Fluid, Pendle, Ethena, Maple, Aave.
- **Superteam:** post in the Superteam channels as a builder update, not an ad.
  Ask the local lead for a retweet, and offer whitelist spots to their members
  (a batch just for them is an easy yes).
- Comment on *their* posts with something useful ("we see N wallets looping
  your X/Y market at Z%"). That is the "engaging with all sorts of projects"
  part, and it brings people to your profile without you asking.

## 4. Drafts

### Anchor post (pin this)

> YieldCircle's waitlist is open.
>
> A yield app where the feed is real wallets, not paid promoters. Every post is
> an on-chain position. The leaderboard ranks on APR the chain can prove.
>
> Deposit or loop on Kamino, Morpho, Euler, Pendle, Jupiter Lend and more, in
> a few taps.
>
> Early members earn rewards. 👇
> `<link>`

Attach: the hero clip or `docs/producthunt/01-hero.png`.

### Thread under it

> 1/ Yield discovery runs on sponsorship. KOLs get paid by the protocols they
> shill. You hear what was paid for, not what works.
>
> 2/ YieldCircle flips it. You see what wallets actually hold, how long they
> held it, and what they really earned.
>
> 3/ Example: this wallet has looped AUTO/PYUSD on Kamino for 70 days. +$6,295,
> 10.6% APR. Not a projection. [clip]
>
> 4/ Find one you like and copy it: deposits and loops across a dozen chains,
> EVM and Solana, in one flow.
>
> 5/ We let people in in batches. Early members earn rewards, based on what
> you actually do in the app. Join: `<link>`

### Protocol spotlight (template)

> Looping on @<protocol>? Here's who's doing it best.
>
> <N> wallets on YieldCircle hold <market>. The top one is at <APR>% over <D>
> days, proven on-chain. [screenshot]
>
> Browse every <protocol> market, or copy a position: `<link>`

### Batch announcement

> Batch <n> of the YieldCircle beta is in. <count> wallets got access today.
>
> Still waiting? Reply with your wallet and the strategy you run. We pick the
> next batch from the replies. `<link>`

### Telegram / Discord (Superteam, partner communities)

> Hey all, we've opened the waitlist for YieldCircle: a yield app with a social
> feed built from real on-chain positions (Kamino, Jupiter Lend, Exponent,
> Loopscale and EVM lenders). You can browse what wallets actually earn and copy
> a deposit or loop in a few taps. Early members earn rewards. Happy to let this
> community in as its own batch. Drop your wallet here or sign up at `<link>`.

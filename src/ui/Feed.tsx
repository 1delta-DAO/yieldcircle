/**
 * The feed. One card per TRANSACTION, never per ledger row: a loop arrives as
 * a deposit and a borrow in the same tx and reads as "opened a loop", which is
 * the difference between a feed and a log. The index folds the legs
 * (`?group=tx`), so the card is one request.
 *
 * Three scopes:
 *   following  the follow graph, resolved in SQL by the index. A wallet that
 *              follows nobody gets an EMPTY feed — never the global one.
 *   menu       everyone, but only in markets this app can open in one tap.
 *              The default: a move you cannot act on is a log line.
 *   everyone   the whole tape.
 *   talk       what people SAID about strategies and markets, newest first
 *              (tickets/0005) — the comments that used to surface only
 *              under a transaction.
 *
 * It is the home page's main column, under the pulse and beside Hot — the
 * social side is what this app is for, so what people are doing is the first
 * thing it shows rather than a tab beside it.
 */
import React from "react";
import { useApp } from "../state/AppState";
import { go, marketHref, parseRoute } from "../state/AppState";
import { feedHash, readFeedLink, sameFilters, type FeedFilters } from "../state/feedLink";
import { useCuratorsByAccount, useFeedPage } from "../index/queries";
import type { TxBundle, TxLeg, TxSubject } from "../index/types";
import {
  useCounts,
  useLatest,
  useMyFollows,
  useProfiles,
  useRatingCounts,
  useThreadOf,
} from "../social/queries";
import type { Message } from "../social/types";
import { positionKey } from "../social/api";
import { useSocialWrite } from "../social/sign";
import { useMenu } from "./useMenu";
import { ProtocolChips, protocolName, useProtocolFilter } from "./ProtocolFilter";
import { DeskMark, IssuerChips, useIssuerFilter } from "./IssuerFilter";
import { CuratorChips, CuratorMark, useCuratorFilter } from "./CuratorFilter";
import { RateMark } from "./Rate";
import { parseUid, protocolKeyOf, uidOf } from "../model/uid";
import { HIDES, isSoft, relaxFor, type HideCode } from "../model/visibility";
import { useSettings } from "../state/Settings";
import { Ago, Comments, Money, Who, describeBundle } from "./social-bits";
import { ChainCorner } from "./ChainMark";
import { indexChainLabel, subjectOf } from "../index/types";
import { Sk, Tip, Tok, TxLink, pct } from "./bits";
import { Thread } from "./Thread";
import { Talk } from "./Talk";
import { ChainChip } from "./ChainPicker";
import { chainLabel } from "../sdk/queries";
import type { Strategy } from "../model/strategies";

type Tab = "following" | "menu" | "everyone" | "talk";

/**
 * Rows that only ever accumulate, keyed by transaction.
 *
 * A list whose length is decided by a client-side filter over a moving window
 * does not settle: every poll drops the rows that fell out of the window and
 * adds whatever arrived, so the column flickers between many rows and few
 * while it is being read. Holding what matched makes the count monotonic
 * within a scope, and changing the scope clears it.
 */
function useStableRows(rows: TxBundle[], scope: string, on: boolean, cap = 240) {
  const idOf = (t: TxBundle) => `${t.chainId}:${t.txHash}`;
  const [kept, setKept] = React.useState<{ scope: string; list: TxBundle[] }>({ scope, list: [] });
  React.useEffect(() => {
    if (!on) return;
    setKept((prev) => {
      const fresh = prev.scope !== scope;
      const m = new Map((fresh ? [] : prev.list).map((t) => [idOf(t), t]));
      let changed = fresh;
      for (const t of rows) {
        const id = idOf(t);
        if (!m.has(id)) changed = true;
        m.set(id, t);
      }
      if (!changed) return prev;
      const list = [...m.values()]
        .sort((a, b) => Date.parse(b.blockTs) - Date.parse(a.blockTs))
        .slice(0, cap);
      return { scope, list };
    });
  }, [rows, scope, on, cap]);
  // a scope change empties the column on the spot rather than one render later
  return kept.scope === scope ? kept.list : [];
}


/**
 * Under this, a move is dust: a $0 rebalance, a few cents accrued, a vault
 * nudging a rounding error between two markets. They are real and they are
 * most of the tape on a quiet chain, and to someone reading what people are
 * doing they are noise — so they are hidden unless asked for.
 */
const DUST_USD = 10
/** the size a card headlines; a bundle with an unpriced leg is never called small — it may not be */
export function isDust(t: TxBundle): boolean {
  if (t.unpriced > 0) return false
  const sizes = [t.volumeUsd, ...t.legs.map((l) => l.amountUsd)].filter(
    (v): v is number => v != null,
  );
  return sizes.length > 0 && Math.max(...sizes.map(Math.abs)) < DUST_USD
}
const DUST_KEY = "yieldcircle.feed.dust";
/** a reader's preference, so it outlives the tab — unlike the filters, which ride in the link */
function useShowDust(): [boolean, (v: boolean) => void] {
  const [v, setV] = React.useState(() => {
    try {
      return localStorage.getItem(DUST_KEY) === "1";
    } catch {
      return false;
    }
  });
  const set = (on: boolean) => {
    setV(on);
    try {
      localStorage.setItem(DUST_KEY, on ? "1" : "0");
    } catch { /* private mode */ }
  };
  return [v, set];
}

const tabOf = (t: string | undefined): Tab =>
  t === "following" || t === "everyone" || t === "talk" ? t : "menu";

export function Feed({ tab: tabIn }: { tab?: string }) {
  const { chains, chainIds, allChains } = useApp();
  const { account } = useSocialWrite();
  const follows = useMyFollows(account);
  const menu = useMenu();
  const tab = tabOf(tabIn);
  const chainsParam = allChains ? undefined : chainIds.join(",");
  /**
   * A link's filters are read BEFORE the first render and seed the chips, so
   * the first request is already the filtered one — never the whole tape
   * fetched and thrown away a render later. (Its chains were taken the same
   * way, in `AppProvider`.)
   */
  const [seed] = React.useState(readFeedLink);
  const pf = useProtocolFilter("7d", "feed", seed?.protocols);
  const inf = useIssuerFilter("7d", "feed", seed ?? undefined);
  const cf = useCuratorFilter("feed", seed ? { value: seed.curator } : undefined);
  const filters: FeedFilters = {
    chains,
    protocols: pf.picked,
    issuers: inf.picked,
    match: inf.match,
    curator: cf.picked,
  };
  const hashFor = (t: Tab) => feedHash(t, filters);
  const here = hashFor(tab);
  /**
   * The address bar IS the view. Replaced, never pushed: a chip click is not a
   * page, so it adds no Back entry and fires no `hashchange` (which would
   * re-render the app from the route down). `history.state` is passed through
   * because it carries the depth stamp `useBack` reads.
   */
  React.useEffect(() => {
    if (location.hash !== here)
      history.replaceState(history.state, "", location.pathname + location.search + here);
  }, [here]);
  /**
   * A link followed while already here (pasted, or Back onto another view)
   * takes over; a bare `#/` (the Home tab) keeps this view and gets its filters
   * written back into the address.
   */
  const live = React.useRef({ filters, pf, inf, cf });
  React.useEffect(() => {
    live.current = { filters, pf, inf, cf };
  });
  React.useEffect(() => {
    const h = () => {
      const { filters: cur, pf, inf, cf } = live.current;
      const link = readFeedLink();
      if (!link) {
        if (parseRoute().view !== "home") return;
        const want = feedHash(tabOf(parseRoute().t), cur);
        if (location.hash !== want)
          history.replaceState(history.state, "", location.pathname + location.search + want);
        return;
      }
      // the chains are taken by `useRoute`, which hears every link
      if (sameFilters({ ...link, chains: [] }, { ...cur, chains: [] })) return;
      pf.setPicked(link.protocols);
      inf.setPicked(link.issuers);
      inf.setMatch(link.match);
      cf.setPicked(link.curator);
    };
    addEventListener("hashchange", h);
    return () => removeEventListener("hashchange", h);
  }, []);
  const [limit, setLimit] = React.useState(40);
  React.useEffect(
    () => setLimit(40),
    [tab, chainsParam, pf.param, inf.param, inf.matchParam, cf.param],
  );

  const desks = { issuers: inf.param, issuerMatch: inf.matchParam };
  /**
   * "In the menu" is the index's own filter now (`inMarkets`, the catalogue's
   * uids in a POST body): the newest forty moves in markets this app can open,
   * in one request. It used to read the unfiltered tape and keep what the
   * catalogue matched — 2 of the newest 40, 10 of 120 — so the tab waited for
   * the whole catalogue and then dug 40 → 120 → 200 before it had a page,
   * 5–14 s after it opened (measured 2026-09-29). Until the catalogue settles
   * the set is the last visit's, or the seed shipped with the build
   * (`useMenu`), so the tab asks at once.
   */
  const set = tab === "menu" ? menu.feedSet : null;
  // a desk resolves server-side to its vaults' addresses, so "what has
  // Steakhouse been doing" is this feed with one extra parameter
  const q =
    tab === "following"
      ? {
          follower: account,
          follow: "all" as const,
          chainIds: chainsParam,
          protocols: pf.param,
          curator: cf.param,
          ...desks,
        }
      : {
          chainIds: chainsParam,
          protocols: pf.param,
          curator: cf.param,
          ...desks,
        };
  /** the follow feed is nobody's feed until a wallet says who "you" are, and the menu's until there is a menu */
  const asked =
    tab === "talk" ? false : tab === "following" ? !!account : tab !== "menu" || !!set;
  const feed = useFeedPage(q, limit, asked, set ?? undefined);

  /**
   * A disabled query still hands back the previous key's placeholder, so
   * Following was rendering the rows Everyone had just fetched — the one thing
   * this feed promises never to do.
   */
  const all = asked ? (feed.data?.txs ?? []) : [];
  /**
   * A poll can only ADD to the menu column. The kept set is replaced by the
   * live one when the catalogue settles, and a market that fell out of the
   * menu in between would otherwise pull its row from under the cursor.
   */
  const scope = [tab, chainsParam, pf.param, inf.param, inf.matchParam, cf.param].join("|");
  const kept = useStableRows(all, scope, tab === "menu" && !feed.isPlaceholderData);
  const got = tab === "menu" ? kept : all;
  const [showDust, setShowDust] = useShowDust();
  const txs = showDust ? got : got.filter((t) => !isDust(t));
  const dust = got.length - txs.length;
  /**
   * A page of dust is an empty page. When hiding it leaves the column short
   * and the index had more to give, ask for the next page on its own rather
   * than leaving "Load more" as the only way to find a real move.
   */
  React.useEffect(() => {
    if (showDust || txs.length >= 15 || feed.isFetching) return;
    if (all.length < limit || limit >= 280) return;
    setLimit((n) => n + 60);
  }, [showDust, txs.length, all.length, limit, feed.isFetching]);
  /** what a client-side filter dropped — only an index without `inMarkets` makes one */
  const hidden = tab === "menu" ? (feed.data?.outside ?? 0) : 0;
  /**
   * A picked protocol with NO row on the menu: the tab is empty because the
   * menu's own floors hold that protocol back, not because nobody moved —
   * Project 0's 54 Solana markets, all risk 5 or under the size floor
   * (2026-10-08), read as "no move" over a chip counting 22k. Counted off the
   * catalogue's held-back rows so the empty state can name the floor.
   */
  const heldBack = React.useMemo(() => {
    if (tab !== "menu" || !pf.keys.length || !menu.settled) return null;
    const ofPicked = (s: Strategy) => {
      const lender = parseUid(uidOf(s) ?? "")?.lender;
      return !!lender && pf.keys.includes(protocolKeyOf(lender));
    };
    if (menu.all.some(ofPicked)) return null;
    const by = new Map<HideCode, number>();
    for (const r of menu.hidden) if (ofPicked(r)) by.set(r.hide, (by.get(r.hide) ?? 0) + 1);
    return [...by].filter(([c]) => isSoft(c)).sort((a, b) => b[1] - a[1]);
  }, [tab, pf.keys, menu.settled, menu.all, menu.hidden]);
  const { set: setMenu } = useSettings();
  const pickedFacet = pf.protocols.find((p) => p.protocol === pf.picked[0]);
  const pickedName = pickedFacet ? protocolName(pickedFacet) : pf.picked[0];

  const subjects = txs
    .map((t) => ({ kind: "position" as const, key: cardKey(t, pf.keys) }))
    .filter((s) => !!s.key);
  const counts = useCounts(subjects);
  const { profile } = useProfiles(
    txs.map((t) => subjectOf(t).account).filter(Boolean),
  );
  /** an actor that is really a desk is named as one, not as a whale */
  const who = useCuratorsByAccount(
    txs.map((t) => subjectOf(t).account).filter(Boolean),
  );
  /** 🚀 / 💀 counts for the markets on screen — one request for the page */
  const rated = useRatingCounts(
    [
      ...new Set(
        txs
          .map((t) => primaryLeg(t, pf.keys)?.marketUid)
          .filter((u): u is string => !!u),
      ),
    ].map((key) => ({ kind: "market" as const, key })),
  );
  const [open, setOpen] = React.useState<string | null>(null);

  /**
   * The catalogue row a card is about. A move with a borrow leg is matched as
   * the LOOP it is — collateral and debt — so the Copy button and the quoted
   * reason belong to that loop and not to whichever loop first claimed the
   * collateral market.
   */
  const threadFor = useThreadOf();
  const stratOf = (t: TxBundle): Strategy | null => {
    const leg = primaryLeg(t, pf.keys);
    const debt = t.legs.find((l) => l.side === "borrow")?.marketUid?.toLowerCase();
    if (leg?.marketUid && debt) {
      const hit = menu.all.find(
        (s) => s.kind === "loop" && s.marketLongUid === leg.marketUid && s.marketShortUid.toLowerCase() === debt,
      );
      if (hit) return hit;
    }
    return menu.forUid(leg?.marketUid);
  };
  /** the mover's own reason, said on the strategy they moved in (Say why) — never a stranger's comment */
  const sayOf = (t: TxBundle) => {
    const st = stratOf(t);
    const th = st ? threadFor(st) : null;
    const who = subjectOf(t).account;
    return th && who ? { ...th, author: who } : null;
  };
  const said = useLatest(txs.map(sayOf).filter((x): x is NonNullable<ReturnType<typeof sayOf>> => !!x));
  const saidOn = (t: TxBundle): Message | null => {
    const x = sayOf(t);
    return x ? said(x.kind, x.key, x.author) : null;
  };

  /**
   * Still looking. On a first visit the menu tab waits for the catalogue the
   * index knows nothing about, and reporting "nothing in the menu" before it
   * has landed is a verdict delivered before the evidence is in.
   */
  const digging = tab === "menu" && (!set || (feed.isFetching && !txs.length));
  const busy = feed.isLoading || digging;
  /** a followed loop counts once, though the feed expands it to its two markets */
  const nFollowed =
    follows.wallets.length + follows.markets.length + follows.strategies.length;

  return (
    /* the feed is a reading column, not a page: 1060px is where the row's five
       columns fill the width instead of leaving a gap in the middle of each card */
    <div className="feedwrap">
      {/* the tabs and the filters: pinned above the column on a desk, where the
          column is the thing that scrolls */}
      <div className="feed-top">
      <div className="feed-h">
        <div className="seg">
          <button
            aria-pressed={tab === "following"}
            onClick={() => { location.hash = hashFor("following"); }}
          >
            Following
            {nFollowed > 0 && <span className="c">{nFollowed}</span>}
          </button>
          <button
            aria-pressed={tab === "menu"}
            onClick={() => { location.hash = hashFor("menu"); }}
          >
            In the menu
          </button>
          <button
            aria-pressed={tab === "everyone"}
            onClick={() => { location.hash = hashFor("everyone"); }}
          >
            Everyone
          </button>
          <button
            aria-pressed={tab === "talk"}
            onClick={() => { location.hash = hashFor("talk"); }}
            title="What people said about strategies and markets, newest first"
          >
            Talk
          </button>
        </div>
        <span className="sp" />
        {tab !== "talk" && <label
          className="dustchk"
          title={`Moves under $${DUST_USD} — $0 rebalances, accruals, rounding. Hidden by default.`}
        >
          <input
            type="checkbox"
            checked={showDust}
            onChange={(e) => setShowDust(e.target.checked)}
          />
          Small moves
        </label>}
        <ChainChip />
        <ShareView hash={here} />
      </div>
      <LinkChainsToast />

      <ProtocolChips f={pf} />
      {/* whose credit and which desk are facts about a ledger row; a comment has neither */}
      {tab !== "talk" && <IssuerChips f={inf} />}
      {tab !== "talk" && <CuratorChips f={cf} />}
      {tab !== "talk" && cf.param && (
        <div className="note sm">
          Only what{" "}
          <b>
            {cf.curators.find((c) => c.curatorId === cf.param)?.name ??
              "this desk"}
          </b>{" "}
          did with its vaults' money. A desk with no vault in scope answers an
          empty feed, never the unfiltered one —{" "}
          <a className="pri" href={`#/c/${encodeURIComponent(cf.param)}`}>
            open the desk ›
          </a>
        </div>
      )}
      </div>

      {tab === "following" && !account && (
        <div className="note">
          Connect a wallet to see what the people and markets you follow are
          doing. Reading anyone is possible because the chain is public; the
          feed is just the part you chose.
        </div>
      )}
      {tab === "following" &&
        account &&
        !follows.isLoading &&
        !nFollowed && (
          <div className="note">
            <b>You follow nobody yet.</b> This feed stays empty until you do —
            it is never quietly replaced by the global one. Open a wallet or a
            market and press Follow, or start from{" "}
            <a className="pri" href="#/board">
              the board
            </a>
            .
          </div>
        )}
      {tab === "following" && account && follows.pendingCount > 0 && (
        <div className="note sm">
          {follows.pendingCount} follow change{follows.pendingCount === 1 ? " is" : "s are"}{" "}
          not signed yet, so this feed does not reflect{" "}
          {follows.pendingCount === 1 ? "it" : "them"} — sign from your face,
          top left.
        </div>
      )}
      {feed.error && (
        <div className="err">
          The index could not be read: {(feed.error as Error).message}
        </div>
      )}

      {tab === "talk" ? (
        <Talk chainIds={chainsParam} protocols={pf.param} menu={menu.all} />
      ) : (
      <>
      <div className="feed">
        {busy &&
          !txs.length &&
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="fcard">
              <Sk w="60%" />
              <Sk w="40%" />
            </div>
          ))}
        {!busy && !txs.length && dust > 0 && !feed.error && (
          <div className="empty">
            Only small moves (under ${DUST_USD}) in the last {got.length}.{" "}
            <button className="lnk" onClick={() => setShowDust(true)}>
              Show them ›
            </button>
          </div>
        )}
        {!busy && !txs.length && !dust && !feed.error && asked && (
          /* Two empties that look identical and are not: the index has
             nothing for the filter, or it has moves and none of them are in
             a market this app can open. Blaming the menu for the first one is
             how a filter that returns rows reads as a filter that is broken —
             a chip saying "Morpho 108k" over "nothing in the markets this app
             can open" (2026-09-23). The index filters the menu itself now, so
             an empty menu page says so and offers the whole tape to check. */
          <div className="empty">
            {tab !== "menu" ? (
              <>
                Nothing in the index for this filter
                {pf.picked.length ? " and protocol" : ""} yet.
              </>
            ) : (
              <>
                {heldBack
                  ? `None of ${pf.picked.length === 1 ? `${pickedName}'s` : "these protocols'"} markets are on your menu at its current floors${heldBack.length ? " —" : "."}`
                  : hidden > 0
                  ? `None of the last ${hidden} moves the index has are in a market this app can open.`
                  : `No move in a market this app can open${pf.picked.length || inf.param || cf.param ? " for this filter" : ""} in the index's last 30 days.`}{" "}
                {heldBack?.map(([code, n]) => (
                  <React.Fragment key={code}>
                    <button
                      className="lnk"
                      title={HIDES[code].why}
                      onClick={() => setMenu(relaxFor(code))}
                    >
                      +{n} {HIDES[code].word}
                    </button>{" "}
                  </React.Fragment>
                ))}
                <button
                  className="lnk"
                  onClick={() => { location.hash = hashFor("everyone"); }}
                >
                  Show everyone ›
                </button>
              </>
            )}
          </div>
        )}
        {txs.map((t) => (
          <Card
            key={`${t.chainId}:${t.txHash}`}
            tx={t}
            profile={profile(subjectOf(t).account)}
            strategy={stratOf(t)}
            said={saidOn(t)}
            only={pf.keys}
            curator={who.curatorOf(subjectOf(t).account)}
            rating={rated.ratingOf(
              "market",
              primaryLeg(t, pf.keys)?.marketUid ?? "",
            )}
            comments={counts.count("position", cardKey(t, pf.keys))}
            open={open === t.txHash}
            onToggle={() => setOpen(open === t.txHash ? null : t.txHash)}
          />
        ))}
      </div>

      {got.length > 0 && (
        <div className="feed-more">
          <button
            className="btn"
            onClick={() => setLimit((n) => n + 60)}
            disabled={feed.isFetching}
          >
            {feed.isFetching ? "Loading…" : "Load more"}
          </button>
          {dust > 0 && (
            <span className="foot">
              {dust} small move{dust > 1 ? "s" : ""} under ${DUST_USD} hidden —{" "}
              <button className="lnk" onClick={() => setShowDust(true)}>
                show them
              </button>
            </span>
          )}
          {hidden > 0 && (
            <span className="foot">
              {hidden} more move{hidden > 1 ? "s" : ""} in markets this app has
              no row for —{" "}
              <button
                className="lnk"
                onClick={() => { location.hash = hashFor("everyone"); }}
              >
                show everyone
              </button>
            </span>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}

/**
 * Copy this view as a link. Built on the click, from the hash the address bar
 * already holds, so it costs nothing to render. `?as=` (view-as) is left out:
 * the sender's lens is not the reader's.
 */
function ShareView({ hash }: { hash: string }) {
  const [done, setDone] = React.useState(false);
  React.useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1400);
    return () => clearTimeout(t);
  }, [done]);
  const copy = () => {
    const url = location.origin + location.pathname + hash;
    // no clipboard outside a secure context: hand the link over to copy by hand
    const byHand = () => void window.prompt("Copy this link", url);
    if (!navigator.clipboard) return byHand();
    navigator.clipboard.writeText(url).then(() => setDone(true), byHand);
  };
  return (
    <button
      type="button"
      className={"btn sm share" + (done ? " ok" : "")}
      onClick={copy}
      title="Copy a link to this feed — the tab, chains and every filter picked"
    >
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {done ? (
          <path d="M5 12.5 10 17.5 19 7" />
        ) : (
          <>
            <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
            <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
          </>
        )}
      </svg>
      {done ? "Link copied" : "Share view"}
    </button>
  );
}

/**
 * A link just changed the chains — which are global, so this is said out loud
 * with a way back, rather than done silently to the reader's own selection.
 */
function LinkChainsToast() {
  const { chainsFromLink, chains, dismissLinkChains } = useApp();
  React.useEffect(() => {
    if (!chainsFromLink) return;
    const t = setTimeout(() => dismissLinkChains(), 10000);
    return () => clearTimeout(t);
  }, [chainsFromLink, chains]);
  if (!chainsFromLink) return null;
  const names = chains.length ? chains.map(chainLabel).join(", ") : "every chain";
  return (
    <div className="toast on act" role="status">
      Showing <b>{names}</b> from this link.{" "}
      <button className="lnk" onClick={() => dismissLinkChains(true)}>
        Undo
      </button>
      <button className="lnk t50" aria-label="Dismiss" onClick={() => dismissLinkChains()}>
        ✕
      </button>
    </div>
  );
}

/**
 * The two things a card must say when a transaction is not one wallet doing
 * one thing: where a vault put the money (the pass-through leg, which is the
 * same dollars one layer down and is deliberately NOT in the total), and that
 * a solver batched several wallets into one transaction.
 */
function Nested({ into, subject }: { into?: TxLeg; subject: TxSubject }) {
  if (into)
    return (
      <Tip
        className="xglyph"
        tip={
          <>
            The vault put this deposit to work in the same transaction, in{" "}
            <b>{into.marketName ?? into.lenderName ?? "a market"}</b> — the same money, counted once.
          </>
        }
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="put to work in another market">
          <path d="M15 10l5 5-5 5M4 4v7a4 4 0 0 0 4 4h12" />
        </svg>
      </Tip>
    );
  if (subject.reason === "multi")
    return (
      <Tip
        className="xglyph"
        tip={
          <>
            One transaction, <b>{subject.accounts} unrelated wallets</b> — this card headlines the largest.
          </>
        }
      >
        <span className="xcount">+{subject.accounts - 1}</span>
      </Tip>
    );
  return null;
}

/**
 * The leg a card is ABOUT: the biggest supply-side leg, else the biggest leg.
 *
 * `only` is the active protocol filter. A bundle is a whole TRANSACTION, and
 * the index keeps every leg of one that matched — so a six-leg transaction
 * that touched Morpho and Spark is returned in full when Morpho is picked.
 * Without this the card could headline the Spark leg and read as though the
 * filter had leaked. Preferring a leg the filter chose makes the card explain
 * why it is there, while the other legs stay in the bundle where they belong.
 */
export function primaryLeg(t: TxBundle, only?: string[]): TxLeg | undefined {
  const size = (l: TxLeg) => Math.abs(l.amountUsd ?? 0);
  const wanted = only?.length
    ? t.legs.filter((l) => only.includes(protocolKeyOf(l.lenderKey)))
    : [];
  const pool = wanted.length ? wanted : t.legs;
  const supply = pool.filter((l) => l.side !== "borrow");
  const pick = (supply.length ? supply : pool)
    .slice()
    .sort((a, b) => size(b) - size(a))[0];
  return pick ?? t.legs[0];
}
/** The card's thread: the POSITION, which is stable and is what a comment written at execution time is posted against. */
export function cardKey(t: TxBundle, only?: string[]): string {
  const l = primaryLeg(t, only);
  if (!l?.marketUid) return "";
  return positionKey({
    chainId: t.chainId,
    account: l.account,
    marketUid: l.marketUid,
    side: l.side,
    posId: l.posId,
  });
}

/**
 * One leg's own word. `plainVerb` reads the whole bundle and answers what the
 * transaction was FOR ("opened a loop"); this reads a single row and answers
 * what that row did, which is the thing a summary of the flows has to say.
 */
const LEG_VERB: [RegExp, string, string][] = [
  [/liquidat/i, "liquidated", "k-liq"],
  [/borrow/i, "borrowed", "k-borrow"],
  [/repay/i, "repaid", "k-repay"],
  [/deposit|supply|mint/i, "put in", "k-in"],
  [/withdraw|redeem|burn/i, "took out", "k-out"],
  [/transfer_in/i, "received", "k-in"],
  [/transfer_out/i, "sent", "k-out"],
  [/transfer/i, "moved", "k-move"],
  [/accrual/i, "accrued", "k-move"],
];
function legVerb(l: TxLeg): { verb: string; cls: string } {
  const k = l.kind.includes("/") ? l.kind.slice(l.kind.indexOf("/") + 1) : l.kind;
  for (const [re, verb, cls] of LEG_VERB) if (re.test(k)) return { verb, cls };
  return { verb: k.replace(/_/g, " "), cls: "k-move" };
}

/**
 * What actually moved, leg by leg.
 *
 * The card headlines ONE leg, because a transaction is about one thing and a
 * feed that headlines four is a log. But a loop is a deposit AND a borrow, a
 * rebalance is a withdrawal here and a deposit there, and until now the rest
 * of the bundle was a bare count — "2 legs" — with no way to open it. The
 * reader could see that something else happened and not what.
 *
 * The totals are stated because they do not follow from the rows: `volumeUsd`
 * is what changed hands and `netUsd` is what it came to, and on a rebalance
 * those are a large number and roughly zero. A passthrough leg is the same
 * money one layer down, so it is shown and marked, never added.
 */
/**
 * A leg's rate as what it earns (or, on a borrow, costs): the pool's rate
 * PLUS what the token accrues by itself (pos-indexer tickets/0017). An RWA or
 * savings token posted where nobody borrows it reads 0.00 % from the pool —
 * Nest's nOPAL on Plume earns 10.28 % inside its own price — so the pool rate
 * alone said those deposits earned nothing. The split is in the hover, and a
 * dotted underline marks a figure that includes the token's own part.
 */
function LegRate({ l, className }: { l: TxLeg; className: string }) {
  const v = l.aprEffective ?? l.apr;
  if (v == null) return <span className={className} />;
  const own = l.intrinsicApr;
  const title =
    own == null
      ? "the pool's rate; nobody publishes a yield for this token"
      : `${pct(own)} the token itself${l.intrinsicSource === "asset" ? " (from the asset, not this market)" : ""} + ${pct(l.apr ?? 0)} the pool`;
  return (
    <span
      className={className}
      title={title}
      style={own != null ? { textDecoration: "underline dotted", textUnderlineOffset: 3 } : undefined}
    >
      {pct(v)}
    </span>
  );
}

/** a debt: the receipt a borrow leaves behind */
const OweGlyph = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="owes">
    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </svg>
);

export function Flows({ tx }: { tx: TxBundle }) {
  const via = tx.legs.filter((l) => l.passthrough).length;
  return (
    <div className="flows">
      <div className="flcap">
        <span>flows</span>
        <span className="sp" />
        <span>
          {tx.volumeUsd != null && <>moved <Money usd={tx.volumeUsd} short /></>}
          {tx.volumeUsd != null && tx.netUsd != null && " · "}
          {tx.netUsd != null && <>net <Money usd={tx.netUsd} short /></>}
        </span>
      </div>
      {tx.legs.map((l, i) => {
        const v = legVerb(l);
        return (
          <div
            key={`${l.logIndex}:${l.account}:${i}`}
            className={`flrow${l.passthrough ? " via" : ""}`}
            title={l.passthrough ? "the vault put this to work in the same transaction — the same money, counted once" : undefined}
          >
            <span className={`flv verb ${v.cls}`}>{v.verb}</span>
            <Tok sym={l.symbol ?? "?"} logo={l.assetLogo ?? undefined} size={16} />
            <span className="fln">
              {l.marketName ?? l.symbol ?? "a market"}
              <span className="t50"> · {l.lenderName ?? l.lenderKey}</span>
            </span>
            <span className="sp" />
            <LegRate l={l} className="flr ok" />
            <span className="flu">
              <Money usd={l.amountUsd} status={l.usdStatus} amount={l.amount} symbol={l.symbol} short />
            </span>
          </div>
        );
      })}
      {(via > 0 || tx.unpriced > 0) && (
        <div className="flnote">
          {via > 0 && <>{via === 1 ? "One leg is" : `${via} legs are`} the same money one layer down — shown, not counted. </>}
          {tx.unpriced > 0 && <>{tx.unpriced} of these had no price at the block, so the total is short by whatever they were worth.</>}
        </div>
      )}
    </div>
  );
}

function Card({
  tx,
  profile,
  strategy,
  said,
  comments,
  open,
  onToggle,
  only,
  curator,
  rating,
}: {
  tx: TxBundle;
  profile: ReturnType<ReturnType<typeof useProfiles>["profile"]>;
  strategy: Strategy | null;
  /** what the mover said about this strategy (tickets/0005) — the card's one-line reason */
  said?: Message | null;
  comments: number;
  open: boolean;
  onToggle: () => void;
  /** the active protocol filter, so the card headlines the leg that matched */
  only?: string[];
  /** the desk this actor belongs to, when it is one */
  curator?: ReturnType<ReturnType<typeof useCuratorsByAccount>["curatorOf"]>;
  /** what wallets have said about the market this card is about */
  rating?: ReturnType<ReturnType<typeof useRatingCounts>["ratingOf"]>;
}) {
  const leg = primaryLeg(tx, only);
  /**
   * The identity travels as ONE object (`subject`). It used to be assembled
   * from two: the address came from `accounts[0]` and the name and the VAULT
   * pill from the headline leg — so a deposit into a curated vault showed the
   * depositor's identicon under the vault's name and linked to the depositor,
   * while the money was counted on both layers and read as double.
   */
  const s = subjectOf(tx);
  const who = s.account || leg?.account || "";
  const { verb, cls } = describeBundle(tx);
  /** where a vault put the money in the same transaction */
  const into = tx.legs.find((l) => l.passthrough);
  const borrow = tx.legs.find((l) => l.side === "borrow");
  const key = cardKey(tx, only);
  /** independent of the thread: you can read the legs and the comments at once */
  const [flows, setFlows] = React.useState(false);
  return (
    <article className="fcard">
      {/* one line, five columns: who · what · how much · when · what you can do. The money,
          the chain and the buttons hold the same width on every card, so the feed reads down
          the column instead of leaving a hole in the middle of each card. */}
      <div className="fc-g">
        <div className="fc-who">
          <Who account={who} profile={profile} size={30} idx={s} />
          <CuratorMark c={curator} />
        </div>
        <div className="fc-b">
          <span className={`verb ${cls}`}>{verb}</span>
          {leg && (
            <a
              className="fc-m"
              href={leg.marketUid ? marketHref(leg.marketUid) : undefined}
            >
              <Tok
                sym={leg.symbol ?? "?"}
                logo={leg.assetLogo ?? undefined}
                size={20}
              />
              <b>{leg.marketName ?? leg.symbol ?? "a market"}</b>
              <span className="t50">{leg.lenderName ?? leg.lenderKey}</span>
            </a>
          )}
          {/* the issuer, the vault's next hop and the extra wallets are glyphs with the
              details on hover: spelled out, they squeezed the market's name down to "A…" */}
          <span className="fc-xs">
            {leg && <DeskMark x={leg} />}
            <Nested into={into} subject={s} />
            <RateMark c={rating} />
          </span>
        </div>
        <div className="fc-n">
          <span className="big">
            <Money
              usd={tx.volumeUsd ?? leg?.amountUsd}
              status={leg?.usdStatus}
              fromIndex={leg?.amountFromIndex}
              amount={leg?.amount}
              symbol={leg?.symbol}
            />
          </span>
          {/* the extras sit behind a fixed-width glyph slot: spelling them out ("owes $3k")
              widened this card's money column alone and shoved its chain and buttons out of
              line with every other card */}
          <span className="fc-x">
            {borrow && borrow !== leg && (
              <Tip
                className="fc-owe"
                tip={
                  <>
                    <b>Owes <Money usd={borrow.amountUsd} status={borrow.usdStatus} amount={borrow.amount} symbol={borrow.symbol} /></b>{" "}
                    {borrow.symbol ?? ""} borrowed in the same transaction
                    {borrow.lenderName || borrow.lenderKey ? <> on {borrow.lenderName ?? borrow.lenderKey}</> : null}
                    {(borrow.aprEffective ?? borrow.apr) != null && <>, at {pct((borrow.aprEffective ?? borrow.apr)!)}</>}.
                  </>
                }
              >
                <OweGlyph />
              </Tip>
            )}
          </span>
          {leg ? (
            <LegRate l={leg} className="fc-apr ok" />
          ) : (
            <span className="fc-apr ok" />
          )}
          {/* the count was the only trace of the rest of the bundle and there was
              no way to open it — it is the handle now */}
          {tx.legs.length > 1 ? (
            <button
              className="fc-legs lnk"
              aria-expanded={flows}
              onClick={() => setFlows((f) => !f)}
              title="what moved, leg by leg"
            >
              {tx.legs.length} legs
            </button>
          ) : (
            <span className="fc-legs t40" />
          )}
        </div>
        <div className="fc-when">
          <ChainCorner chainId={tx.chainId} />
          <Ago ts={tx.blockTs} />
          <TxLink chainId={tx.chainId} hash={tx.txHash} />
        </div>
        <div className="fc-a">
          <Comments n={comments} onClick={onToggle} active={open} />
          {strategy ? (
            <button
              className="btn sm pri"
              onClick={() =>
                go(strategy.group, {
                  u: strategy.asset,
                  s: strategy.id,
                  k: strategy.kind,
                  copy: who,
                })
              }
            >
              Copy this ›
            </button>
          ) : leg?.marketUid ? (
            <a className="btn sm" href={marketHref(leg.marketUid)}>
              Open market
            </a>
          ) : null}
        </div>
      </div>
      {said?.body && (
        <p className="fc-said" title={`said on this ${strategy?.kind === "loop" ? "loop" : "strategy"}, ${new Date(said.signedAt).toLocaleDateString()}`}>
          “{said.body}”
        </p>
      )}
      {flows && (
        <div className="fc-t">
          <Flows tx={tx} />
        </div>
      )}
      {open && key && (
        <div className="fc-t">
          <Thread
            kind="position"
            subjectKey={key}
            compact
            placeholder="What do you make of this?"
          />
        </div>
      )}
    </article>
  );
}

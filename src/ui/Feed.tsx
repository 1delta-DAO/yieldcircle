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
 */
import React from "react";
import { useApp } from "../state/AppState";
import { go, marketHref } from "../state/AppState";
import { useCuratorsByAccount, useFeedPage } from "../index/queries";
import type { TxBundle, TxLeg, TxSubject } from "../index/types";
import {
  useCounts,
  useMyFollows,
  useProfiles,
  useRatingCounts,
} from "../social/queries";
import { positionKey } from "../social/api";
import { useSocialWrite } from "../social/sign";
import { useMenu } from "./useMenu";
import { ProtocolChips, useProtocolFilter } from "./ProtocolFilter";
import { DeskChips, IssuerChips, useIssuerFilter } from "./IssuerFilter";
import { CuratorChips, CuratorMark, useCuratorFilter } from "./CuratorFilter";
import { RateMark } from "./Rate";
import { protocolKeyOf } from "../model/uid";
import { Ago, Comments, Money, Who, describeTx } from "./social-bits";
import { ChainCorner } from "./ChainMark";
import { indexChainLabel, subjectOf } from "../index/types";
import { Sk, Tok, TxLink, pct } from "./bits";
import { Thread } from "./Thread";
import { chainLabel } from "../sdk/queries";
import type { Strategy } from "../model/strategies";

type Tab = "following" | "menu" | "everyone";

/** enough rows for the tab to be worth opening, and the deepest we will dig for them */
const MENU_WANT = 12;
const MENU_MAX = 200;

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


export function Feed({ tab: tabIn }: { tab?: string }) {
  const { chainIds, allChains, chainLabelFor } = useApp();
  const { account } = useSocialWrite();
  const follows = useMyFollows(account);
  const menu = useMenu();
  const tab: Tab =
    tabIn === "following" || tabIn === "everyone" ? tabIn : "menu";
  const chainsParam = allChains ? undefined : chainIds.join(",");
  const pf = useProtocolFilter("7d");
  const inf = useIssuerFilter("7d");
  const cf = useCuratorFilter();
  const [limit, setLimit] = React.useState(40);
  React.useEffect(
    () => setLimit(40),
    [tab, chainsParam, pf.param, inf.param, inf.matchParam, cf.param],
  );

  const desks = { issuers: inf.param, issuerMatch: inf.matchParam };
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
  /** the follow feed is nobody's feed until a wallet says who "you" are */
  const asked = tab !== "following" || !!account;
  const feed = useFeedPage(q, limit, asked);

  /**
   * A disabled query still hands back the previous key's placeholder, so
   * Following was rendering the rows Everyone had just fetched — the one thing
   * this feed promises never to do.
   */
  const all = asked ? (feed.data?.txs ?? []) : [];
  // "menu" is a client-side narrowing: the index has no uid-set filter, and the
  // menu is at most a few hundred uids, so this costs nothing and stays honest
  // about what it dropped.
  const inMenu = (t: TxBundle) =>
    t.legs.some((l) => l.marketUid && menu.byUid.has(l.marketUid));
  /** the catalogue is a separate request; until it lands NOTHING is in the menu */
  const menuReady = menu.byUid.size > 0 || (!menu.isLoading && menu.anyData);
  const page = React.useMemo(
    () => (tab === "menu" ? (menuReady ? all.filter(inMenu) : []) : all),
    [tab, all, menuReady, menu.byUid],
  );
  /**
   * The menu tab filters client side, so each poll returns a different slice of
   * the tape and therefore a different number of rows — the list was jumping
   * between two and ten every twenty seconds while you read it. The rows that
   * matched are kept and a poll can only ADD to them, so the column grows
   * downwards instead of reshuffling under the cursor.
   */
  const scope = [tab, chainsParam, pf.param, inf.param, inf.matchParam, cf.param].join("|");
  const kept = useStableRows(page, scope, tab === "menu" && !feed.isPlaceholderData);
  const txs = tab === "menu" ? kept : page;
  // counted on the page in hand, never against the accumulated column
  const hidden = tab === "menu" && menuReady ? all.length - page.length : 0;

  /**
   * The index answers the most recent N transactions and this tab then keeps the
   * ones it can open. Forty recent moves across every chain routinely contain
   * none of them, which is why the page opened empty: not because nothing is
   * happening, but because the window was too short to hold anything
   * actionable. So it widens the window until it has something to show.
   */
  React.useEffect(() => {
    // the catalogue must be SETTLED, not merely started: widening against a
    // half-loaded menu digs for rows that were about to match anyway
    if (tab !== "menu" || menu.isLoading || !menuReady) return;
    if (feed.isFetching || !feed.data) return;
    // measured on the page in hand — the accumulator commits a render later,
    // and reading it here asks for another 200 rows before the first have shown
    if (page.length >= MENU_WANT || limit >= MENU_MAX) return;
    if (all.length < limit) return; // the index has nothing further back to give
    setLimit((n) => Math.min(MENU_MAX, n * 3));
  }, [tab, menu.isLoading, menuReady, feed.isFetching, feed.data, page.length, all.length, limit]);

  const subjects = txs
    .map((t) => ({ kind: "position" as const, key: cardKey(t, pf.picked) }))
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
          .map((t) => primaryLeg(t, pf.picked)?.marketUid)
          .filter((u): u is string => !!u),
      ),
    ].map((key) => ({ kind: "market" as const, key })),
  );
  const [open, setOpen] = React.useState<string | null>(null);

  /**
   * Still looking. The menu tab has two waits the index knows nothing about —
   * the catalogue request, and the widening above — and reporting "none of
   * these are in the menu" during either is a verdict delivered before the
   * evidence is in.
   */
  const digging =
    tab === "menu" &&
    (!menuReady ||
      menu.isLoading ||
      (feed.isFetching && !txs.length) ||
      (page.length < MENU_WANT && limit < MENU_MAX && all.length >= limit));
  const busy = feed.isLoading || digging;

  return (
    /* the feed is a reading column, not a page: 1060px is where the row's five
       columns fill the width instead of leaving a gap in the middle of each card */
    <div className="feedwrap">
      <div className="feed-h">
        <div className="seg">
          <button
            aria-pressed={tab === "following"}
            onClick={() => go("feed", { t: "following" })}
          >
            Following
            {follows.wallets.length + follows.markets.length > 0 && (
              <span className="c">
                {follows.wallets.length + follows.markets.length}
              </span>
            )}
          </button>
          <button
            aria-pressed={tab === "menu"}
            onClick={() => go("feed", { t: "menu" })}
          >
            In the menu
          </button>
          <button
            aria-pressed={tab === "everyone"}
            onClick={() => go("feed", { t: "everyone" })}
          >
            Everyone
          </button>
        </div>
        <span className="sp" />
        <span className="sub t50">{chainLabelFor()} · live</span>
      </div>

      <ProtocolChips f={pf} />
      <IssuerChips f={inf} />
      <CuratorChips f={cf} />
      {cf.param && (
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
        !follows.wallets.length &&
        !follows.markets.length && (
          <div className="note">
            <b>You follow nobody yet.</b> This feed stays empty until you do —
            it is never quietly replaced by the global one. Open a wallet or a
            market and press Follow, or start from{" "}
            <a className="pri" href="#/board">
              the leaderboard
            </a>
            .
          </div>
        )}
      {feed.error && (
        <div className="err">
          The index could not be read: {(feed.error as Error).message}
        </div>
      )}

      <div className="feed">
        {busy &&
          !txs.length &&
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="fcard">
              <Sk w="60%" />
              <Sk w="40%" />
            </div>
          ))}
        {!busy && !txs.length && !feed.error && asked && (
          /* Two empties that look identical and are not: the index answered
             nothing, or it answered and the menu dropped all of it. Blaming
             the menu for the first one is how a filter that returns rows
             reads as a filter that is broken — a chip saying "Morpho 108k"
             over "nothing in the markets this app can open" (2026-09-23). */
          <div className="empty">
            {all.length === 0 ? (
              <>
                Nothing in the index for this filter
                {pf.picked.length ? " and protocol" : ""} yet.
              </>
            ) : (
              <>
                None of the last {all.length} moves the index has are in a
                market this app can open.{" "}
                <button
                  className="lnk"
                  onClick={() => go("feed", { t: "everyone" })}
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
            strategy={menu.forUid(primaryLeg(t, pf.picked)?.marketUid)}
            only={pf.picked}
            curator={who.curatorOf(subjectOf(t).account)}
            rating={rated.ratingOf(
              "market",
              primaryLeg(t, pf.picked)?.marketUid ?? "",
            )}
            comments={counts.count("position", cardKey(t, pf.picked))}
            open={open === t.txHash}
            onToggle={() => setOpen(open === t.txHash ? null : t.txHash)}
          />
        ))}
      </div>

      {txs.length > 0 && (
        <div className="feed-more">
          <button
            className="btn"
            onClick={() => setLimit((n) => n + 60)}
            disabled={feed.isFetching}
          >
            {feed.isFetching ? "Loading…" : "Load more"}
          </button>
          {hidden > 0 && (
            <span className="foot">
              {hidden} more move{hidden > 1 ? "s" : ""} in markets this app has
              no row for —{" "}
              <button
                className="lnk"
                onClick={() => go("feed", { t: "everyone" })}
              >
                show everyone
              </button>
            </span>
          )}
        </div>
      )}
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
      <span
        className="t40 nested"
        title="the vault put this deposit to work in the same transaction — the same money, counted once"
      >
        → {into.marketName ?? into.lenderName ?? "a market"}
      </span>
    );
  if (subject.reason === "multi")
    return (
      <span
        className="t40 nested"
        title="one transaction, several unrelated wallets — this card headlines the largest"
      >
        +{subject.accounts - 1} more{" "}
        {subject.accounts === 2 ? "wallet" : "wallets"}
      </span>
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
            {l.apr != null && <span className="flr ok">{pct(l.apr)}</span>}
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
  const { verb, cls } = describeTx(tx.kinds, s.reason === "desk");
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
          {leg && <DeskChips x={leg} />}
          <RateMark c={rating} />
          <Nested into={into} subject={s} />
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
          {borrow && borrow !== leg && (
            <span className="t50">
              owes{" "}
              <Money
                usd={borrow.amountUsd}
                status={borrow.usdStatus}
                amount={borrow.amount}
                symbol={borrow.symbol}
                short
              />
            </span>
          )}
          <span className="fc-apr ok">
            {leg?.apr != null ? pct(leg.apr) : ""}
          </span>
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

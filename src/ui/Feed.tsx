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
import type { TxBundle, TxLeg } from "../index/types";
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
import { indexChainLabel } from "../index/types";
import { Sk, Tok, TxLink, pct } from "./bits";
import { Thread } from "./Thread";
import { chainLabel } from "../sdk/queries";
import type { Strategy } from "../model/strategies";

type Tab = "following" | "menu" | "everyone";

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
  const feed = useFeedPage(q, limit, tab !== "following" || !!account);

  const all = feed.data?.txs ?? [];
  // "menu" is a client-side narrowing: the index has no uid-set filter, and the
  // menu is at most a few hundred uids, so this costs nothing and stays honest
  // about what it dropped.
  const inMenu = (t: TxBundle) =>
    t.legs.some((l) => l.marketUid && menu.byUid.has(l.marketUid));
  const txs = tab === "menu" ? all.filter(inMenu) : all;
  const hidden = tab === "menu" ? all.length - txs.length : 0;

  const subjects = txs
    .map((t) => ({ kind: "position" as const, key: cardKey(t, pf.picked) }))
    .filter((s) => !!s.key);
  const counts = useCounts(subjects);
  const { profile } = useProfiles(
    txs.map((t) => t.accounts[0]).filter(Boolean),
  );
  /** an actor that is really a desk is named as one, not as a whale */
  const who = useCuratorsByAccount(
    txs.map((t) => t.accounts[0]).filter(Boolean),
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
        {feed.isLoading &&
          !txs.length &&
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="fcard">
              <Sk w="60%" />
              <Sk w="40%" />
            </div>
          ))}
        {!feed.isLoading && !txs.length && !feed.error && (
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
                {all.length} recent move{all.length === 1 ? "" : "s"}, none of
                them in a market this app can open.{" "}
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
            profile={profile(t.accounts[0] ?? "")}
            strategy={menu.forUid(primaryLeg(t, pf.picked)?.marketUid)}
            only={pf.picked}
            curator={who.curatorOf(t.accounts[0])}
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
  const who = tx.accounts[0] ?? leg?.account ?? "";
  const { verb, cls } = describeTx(tx.kinds);
  const borrow = tx.legs.find((l) => l.side === "borrow");
  const key = cardKey(tx, only);
  return (
    <article className="fcard">
      {/* one line, five columns: who · what · how much · when · what you can do. The money,
          the chain and the buttons hold the same width on every card, so the feed reads down
          the column instead of leaving a hole in the middle of each card. */}
      <div className="fc-g">
        <div className="fc-who">
          <Who account={who} profile={profile} size={30} idx={leg} />
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
          <span className="fc-legs t40">
            {tx.nRows > 1 ? `${tx.nRows} legs` : ""}
          </span>
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

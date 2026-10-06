/**
 * The home: **what are people doing?**
 *
 * It used to be the catalogue — every asset, sorted by the biggest number it
 * could earn — which answers "what pays most" once and then never again. The
 * social side is what this app is for, so the home is where people are:
 *
 *   the pulse   one live line that changes
 *   the feed    every move, one card per transaction, scoped to who you follow,
 *               what the menu can open, or everyone (see `Feed`)
 *   hot         the markets that are actually busy, ranked on how often AND
 *               how much — beside the feed on a desk, above it on a phone
 *
 * The feed was a tab of its own beside this page, and the page carried a
 * condensed copy of it (the stream). Two pages answering one question is a
 * nav that has to hold both, so they are one page now.
 *
 * Your own money is not here: it is the balance chip in the header, on every
 * page. The catalogue is the Earn tab.
 */
import React from 'react'
import { Hot } from './Hot'
import { Pulse } from './Pulse'
import { Feed } from './Feed'
import { useViewport } from './useViewport'

export function Home({ tab }: { tab?: string }) {
  const vp = useViewport()
  // below a desk Hot sits above the feed as one sideways row, so the feed
  // still starts on the first screen
  //
  // On a desk the PAGE does not scroll: the pulse stays put and the feed and
  // the rail are two panes that each scroll on their own, with their own
  // headers pinned. Before, the whole page scrolled until the rail reached
  // its sticky offset and only then did the feed scroll alone — the first
  // turn of the wheel moved everything, the next moved one column, and the
  // rail's last cards were only reachable once the feed had been read to the
  // end (2026-09-29).
  return (
    <div className="home-fit">
      <Pulse />
      <div className="home">
        <div className="home-main">
          {vp !== 'desk' && <Hot limit={8} strip />}
          <Feed tab={tab} />
        </div>
        {vp === 'desk' && <div className="home-side"><Hot limit={6} rail /></div>}
      </div>
    </div>
  )
}

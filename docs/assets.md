# Asset pages and issuer details

An asset page answers two questions: **what is this token**, and **who stands behind it**.
Pro has always had one (`#/t/<group>`, `packages/web/src/ui/TokenPage.tsx`), with every market,
holder and day. Since 2026-11-25, Lite on the web (`#/lite/t/<group>`) and the phone
(`/t/<group>`) have one too, kept short: what it is, the issuer, where Lite can put it to work,
and similar assets. A strategy's ticket also has a folded **What it is** section, composed from
the same parts.

## Where each fact comes from

| What | Source | Written in |
| --- | --- | --- |
| What it is, backing, yield source, way out, links | the asset note (`model/assetNotes.ts`) | token-lists `scripts/notes/notes.json`, copied by `node scripts/notes.mjs` |
| How it earns (private credit, basis trade, …) | the note's `mechanism`, else `data/mechanisms.json` | token-lists |
| The issuer's company details | `packages/core/src/data/issuers.json` | **here** |
| Price, own yield | the position index (`useAsset`) | — |
| Similar assets | the catalogue the app already holds (`useBook().all`) | — |

## Writing an issuer profile

`packages/core/src/data/issuers.json` is keyed by token-lists' issuer id, the `props.issuer.id`
on a token (`hastra`, `circle`, `ethena`; see token-lists `scripts/issuer/issuer.json`). Fill in
only what a source states, and name that source:

```jsonc
"hastra": {
  "name": "Hastra",
  "aliases": [],                 // other spellings a note's free-text `issuer` uses
  "entity": "Signum Ltd.",
  "structure": "Cayman Islands company limited by shares",
  "country": "Cayman Islands",
  "platform": "Hastra",
  // "regulator": "…",           // optional: who licenses or supervises it; leave out what is unknown
  "about": "One or two sentences: who they are and how the money moves.",
  "links": [{ "label": "Transparency and proof of reserves", "url": "https://…" }],
  "checked": "2026-11-25",
  "source": "where the legal facts were read"
}
```

A profile is matched by id first (the index's `issuer` for an asset, a strategy's `desk`), then
by name or alias against the note's free-text `issuer` (`Hastra / Figure (YLDS)` is read as
`Hastra`). An issuer with no profile still gets a card with its name and the note's words, saying
that no company details are written yet. Only Hastra has a profile so far, taken from the AUTO
page on Kamino.

## The code

- `packages/core/src/model/assetAbout.ts`: pure functions. `issuerCard`, `assetFacts` (one asset),
  `strategyAbout` (a strategy's parts: what it holds, what it puts in, what it borrows and what
  that costs, how it earns), `similarAssets` (same mechanism, same money first, then by largest
  market) and `linkLabel`. Tested in `assetAbout.test.ts`.
- `packages/app/src/about.ts`: `useAssetNotes` (the lazy notes chunk), `useStrategyAbout`,
  `useAssetPage`.
- Web: `packages/web/src/ui/lite/LiteAsset.tsx` (the page, `IssuerCardView`, `LiteAbout` on the
  Lite ticket). Pro's `TokenPage` shows the issuer card under the note when a profile exists.
- Phone: `mobile/app/t/[group].tsx` and `mobile/src/ui/about.tsx` (`StrategyAbout` on the
  strategy sheet).
- Links: core's `LiteDest` has `{ to: 'asset', group }` (`#/lite/t/<group>`), so `useNav().go`
  opens it on both apps, and a shared `#/t/…` link opens the phone's page.

## Gaps

- "Similar assets" ranks by the largest market the catalogue lists, not by supply: an asset with
  no mechanism in token-lists (PRIME today) has no similar list.
- Lite's search does not list assets. You reach an asset page from a ticket's **What it is**
  section ("About X ›") or from a similar asset.
- The phone's page has not been run on a device.

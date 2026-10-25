/**
 * The wallet character on the web: the drawing is shared (`@yieldcircle/app/identity/character`,
 * which explains the layers and the spec); this is its DOM root, and the profile picture that
 * replaces it when a profile points at one.
 */
import React from 'react'
import { CharacterArt, pictureUrl, specFor, type Prims, type Spec } from '@yieldcircle/app/identity/character'

export * from '@yieldcircle/app/identity/character'

const DOM: Prims = { Circle: 'circle', Path: 'path', G: 'g', Rect: 'rect', Line: 'line', Ellipse: 'ellipse', Defs: 'defs', ClipPath: 'clipPath' }

export function Character({ addr, avatarUrl, size = 32, spec, title, className = '' }: {
  addr: string
  avatarUrl?: string | null
  size?: number
  /** overrides both — the profile editor previews with this; a picture URL is ignored when set */
  spec?: Spec
  title?: string
  className?: string
}) {
  const pic = spec ? null : pictureUrl(avatarUrl)
  const [broken, setBroken] = React.useState<string | null>(null)
  if (pic && broken !== pic) {
    return (
      <img className={`chr pic ${className}`} src={pic} width={size} height={size} style={{ width: size, height: size }}
        alt={title ?? 'avatar'} title={title ?? 'avatar'} loading="lazy" decoding="async" referrerPolicy="no-referrer"
        onError={() => setBroken(pic)} />
    )
  }
  return (
    <svg className={`chr ${className}`} viewBox="0 0 64 64" width={size} height={size} style={{ width: size, height: size }} role="img" aria-label={title ?? 'avatar'}>
      <title>{title ?? 'avatar'}</title>
      <CharacterArt s={spec ?? specFor(addr, avatarUrl)} P={DOM} />
    </svg>
  )
}

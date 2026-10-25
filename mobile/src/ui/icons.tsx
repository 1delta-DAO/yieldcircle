import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg'

/**
 * The web's icons, path for path (packages/web/src/ui/Shell.tsx `TABS`, the profile button): the
 * same 20-unit grid and strokes, drawn by react-native-svg.
 */
type P = { color: string; size?: number }
const base = (size = 20, color: string, w = 1.6) => ({ width: size, height: size, viewBox: '0 0 20 20', fill: 'none', stroke: color, strokeWidth: w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const })

export const IconHome = ({ color, size }: P) => <Svg {...base(size, color)}><Path d="M3.5 9 10 3.8 16.5 9v7a1 1 0 0 1-1 1h-3.3v-4.6H7.8V17H4.5a1 1 0 0 1-1-1z" /></Svg>
export const IconFeed = ({ color, size }: P) => <Svg {...base(size, color)}><Path d="M2.5 10h3.2l2-5 3.4 10 2.1-5h4.3" /></Svg>
export const IconEarn = ({ color, size }: P) => <Svg {...base(size, color)}><Ellipse cx="10" cy="5.8" rx="5.8" ry="2.4" /><Path d="M4.2 5.8v4.1c0 1.3 2.6 2.4 5.8 2.4s5.8-1.1 5.8-2.4V5.8M4.2 9.9V14c0 1.3 2.6 2.4 5.8 2.4s5.8-1.1 5.8-2.4V9.9" /></Svg>
export const IconBorrow = ({ color, size }: P) => <Svg {...base(size, color)}><Rect x="2.8" y="4.5" width="10.4" height="11" rx="2" /><Circle cx="8" cy="10" r="2" /><Path d="M10.6 10h7M15 7.4l2.6 2.6-2.6 2.6" /></Svg>
export const IconBoard = ({ color, size }: P) => <Svg {...base(size, color)}><Path d="M6.5 3.5h7v4.2a3.5 3.5 0 0 1-7 0zM6.5 5H3.8v.9a2.8 2.8 0 0 0 2.9 2.8M13.5 5h2.7v.9a2.8 2.8 0 0 1-2.9 2.8M10 11.2v2.6M7 16.5h6M8.2 13.8h3.6" /></Svg>
export const IconMe = ({ color, size }: P) => <Svg {...base(size, color, 1.5)}><Circle cx="10" cy="7" r="3.2" /><Path d="M3.8 17c.9-3.2 3.3-4.8 6.2-4.8s5.3 1.6 6.2 4.8" /></Svg>
export const IconSearch = ({ color, size = 15 }: P) => <Svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round"><Circle cx="7" cy="7" r="4.6" /><Path d="m10.4 10.4 3.4 3.4" /></Svg>
export const IconBack = ({ color, size = 16 }: P) => <Svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><Path d="M10 3 5 8l5 5" /></Svg>
export const IconChev = ({ color, size = 10 }: P) => <Svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><Path d="M4.5 2.5 8 6l-3.5 3.5" /></Svg>

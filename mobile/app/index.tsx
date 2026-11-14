import { Redirect } from 'expo-router'
import { useMode } from '../src/mode'

/** `/` is the saved mode's first page, its Earn — Lite unless the reader chose Pro (the web's `#/`). */
export default function Index() {
  return <Redirect href={useMode() === 'pro' ? '/pro' : '/lite'} />
}

import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular'
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium'
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold'
import { IBMPlexSans_700Bold } from '@expo-google-fonts/ibm-plex-sans/700Bold'
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono/400Regular'
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium'

/** The web's type (index.html: IBM Plex Sans 400–700, Plex Mono 400–500), one file per weight. */
export const FONTS = { IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold, IBMPlexSans_700Bold, IBMPlexMono_400Regular, IBMPlexMono_500Medium }

export type Weight = 400 | 500 | 600 | 700
/** A custom font's weights are separate families on Android: the weight picks the file. */
export const family = (w: Weight = 400, mono = false) =>
  mono ? (w >= 500 ? 'IBMPlexMono_500Medium' : 'IBMPlexMono_400Regular')
    : w >= 700 ? 'IBMPlexSans_700Bold' : w >= 600 ? 'IBMPlexSans_600SemiBold' : w >= 500 ? 'IBMPlexSans_500Medium' : 'IBMPlexSans_400Regular'

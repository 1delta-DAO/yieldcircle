/** Where the app itself is deployed: every "Sign in" and every link into the product goes there. */
export const APP_URL = ((import.meta.env.VITE_APP_URL as string | undefined)?.trim() || 'https://app.yieldcircle.io').replace(/\/$/, '')

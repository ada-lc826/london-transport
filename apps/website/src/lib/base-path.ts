// The app is served from the site root on a real wall and in development, but from a
// sub-path on GitHub Pages (`/london-transport/`). Every absolute URL the app builds itself
// (data assets, iframes) goes through here so it works in both.
export function withBase(path: string): string {
    return `${import.meta.env.BASE_URL.replace(/\/$/, '')}${path}`;
}

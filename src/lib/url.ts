/** Prefix an internal path with the configured `base` (needed for GitHub Pages project repos). */
export function withBase(path: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}

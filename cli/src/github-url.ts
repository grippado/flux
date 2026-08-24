const PR_URL_PATTERN = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;

export function repoSlugFromTarget(target: string | null): string | null {
  if (!target) return null;
  const match = target.match(PR_URL_PATTERN);
  return match ? match[2] : null;
}

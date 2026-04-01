type InlineViewCacheParser<T> = (value: unknown) => T | null;

export const isUnknownRecord = (
  value: unknown
): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const getInlineViewCacheKey = (namespace: string) =>
  `alchemy:inline-view:${namespace}:${window.location.pathname}${window.location.search}`;

export const readInlineViewCache = <T>(
  key: string,
  parser: InlineViewCacheParser<T>
) => {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) {
      return null;
    }

    return parser(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const writeInlineViewCache = (key: string, value: unknown) => {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore session storage failures in constrained clients.
  }
};

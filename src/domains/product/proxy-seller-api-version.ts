export type ProxySellerApiVersion = 'v1' | 'v2';

const RESIDENT_API_PREFIXES = ['/resident/', '/residentsubuser/'] as const;

export const proxySellerApiVersionForPath = (
  path: string,
): ProxySellerApiVersion => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (
    normalizedPath === '/reference/list/resident' ||
    RESIDENT_API_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))
  ) {
    return 'v1';
  }

  return 'v2';
};

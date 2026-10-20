import { proxySellerApiVersionForPath } from './proxy-seller-api-version';

describe('proxySellerApiVersionForPath', () => {
  it.each([
    '/resident/package',
    '/reference/list/resident',
    '/residentsubuser/packages',
    '/residentsubuser/lists?package_key=package',
    'residentsubuser/list/add',
  ])('routes the resident endpoint %s through API v1', (path) => {
    expect(proxySellerApiVersionForPath(path)).toBe('v1');
  });

  it.each([
    '/proxy/list/isp',
    '/proxy/list/ipv6',
    '/order/make',
    '/prolong/make/isp',
    '/auth/list',
  ])('keeps the nonresident endpoint %s on API v2', (path) => {
    expect(proxySellerApiVersionForPath(path)).toBe('v2');
  });
});

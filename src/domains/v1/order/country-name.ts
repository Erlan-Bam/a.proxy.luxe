export const matchesOrderCountry = (
  providerName: string,
  orderName: string,
) => {
  const legacyName = orderName.replace(/^Proxy of /i, '').trim();
  const aliases: Record<string, string> = {
    US: 'USA',
    Czech: 'Czechia',
    'South Korea': 'Korea',
  };
  return (
    providerName.toLowerCase() ===
    (aliases[legacyName] ?? legacyName).toLowerCase()
  );
};

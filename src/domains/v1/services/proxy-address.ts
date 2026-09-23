type ProxyProtocol = 'http' | 'socks4' | 'socks5' | 'socks5h';

const formatProxyHost = (host: string): string => {
  if (host.startsWith('[') && host.endsWith(']')) return host;
  return host.includes(':') ? `[${host}]` : host;
};

export const formatProxyUrl = (
  protocol: ProxyProtocol,
  host: string,
  port: string,
  login?: string,
  password?: string,
): string => {
  const auth =
    login && password
      ? `${encodeURIComponent(login)}:${encodeURIComponent(password)}@`
      : '';

  return `${protocol}://${auth}${formatProxyHost(host)}:${port}`;
};

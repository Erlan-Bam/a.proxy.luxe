import { Injectable } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import * as tunnel from 'tunnel';
import * as net from 'net';

@Injectable()
export class ProxyCheckerService {
  // Fallback URLs. These endpoints return only the IP as a string.
  private fallbackUrls = [
    'http://api64.ipify.org',
    'http://icanhazip.com',
    'http://ifconfig.me/ip',
  ];

  /**
   * Extract IP and port from a string that may contain IPv4 or bracketed IPv6.
   */
  private extractIpPort(str: string): { ip: string; port: string } | null {
    const ipv6Match = str.match(/\[([0-9a-fA-F:]+)\]:(\d+)/);
    if (ipv6Match) {
      return { ip: ipv6Match[1], port: ipv6Match[2] };
    }
    const ipv4Match = str.match(/(\d+\.\d+\.\d+\.\d+):(\d+)/);
    if (ipv4Match) {
      return { ip: ipv4Match[1], port: ipv4Match[2] };
    }
    return null;
  }

  /**
   * Detect proxy protocol by sending a SOCKS5 handshake probe.
   * Returns 'SOCKS5' | 'SOCKS4' | 'HTTP'.
   */
  private async detectProtocol(
    host: string,
    port: number,
  ): Promise<'SOCKS5' | 'HTTP'> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);

      socket.on('connect', () => {
        // Send SOCKS5 hello: version 5, 1 auth method (no auth)
        socket.write(Buffer.from([0x05, 0x01, 0x00]));
      });

      socket.on('data', (data) => {
        socket.destroy();
        // SOCKS5 server responds with 0x05 as first byte
        if (data.length >= 2 && data[0] === 0x05) {
          resolve('SOCKS5');
        } else {
          resolve('HTTP');
        }
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve('HTTP');
      });

      socket.on('error', () => {
        socket.destroy();
        resolve('HTTP');
      });

      socket.connect(port, host);
    });
  }

  async checkProxies(proxies: string[], addCountry: boolean): Promise<any[]> {
    const myIp = (await this.getMyIpAddressDirect()).trim();

    return Promise.all(
      proxies.map(async (raw) => {
        let ip = '';
        let port = '';
        let login = '';
        let password = '';
        let proxyType = 'HTTP(s)';

        try {
          // For explicit SOCKS proxies:
          if (raw.startsWith('socks5://') || raw.startsWith('socks4://')) {
            proxyType = raw.startsWith('socks5://') ? 'SOCKS5' : 'SOCKS4';
            const extracted = this.extractIpPort(raw);
            if (extracted) {
              ip = extracted.ip;
              port = extracted.port;
            }

            const agent = new SocksProxyAgent(raw);
            return await this.tryProxyWithAgent(
              agent,
              { ip, port, login, password, proxyType, raw },
              myIp,
              addCountry,
            );
          }

          // IPv6 format with brackets
          if (raw.includes('[')) {
            const bracketMatch = raw.match(
              /^\[([0-9a-fA-F:]+)\]:(\d+)(?::([^:@\s]+):([^:@\s]+))?$/,
            );
            if (!bracketMatch) {
              throw new Error('Invalid IPv6 proxy format');
            }
            ip = bracketMatch[1];
            port = bracketMatch[2];
            login = bracketMatch[3] || '';
            password = bracketMatch[4] || '';
          } else {
            const parts = raw.split(':');
            if (parts.length === 4) {
              [ip, port, login, password] = parts;
            } else if (parts.length === 2) {
              [ip, port] = parts;
            } else {
              throw new Error('Invalid proxy format');
            }
          }

          // Auto-detect protocol
          const detected = await this.detectProtocol(ip, parseInt(port, 10));
          proxyType = detected === 'SOCKS5' ? 'SOCKS5' : 'HTTP(s)';

          // Build agents based on detected protocol
          const agentCandidates: any[] = [];

          if (detected === 'SOCKS5') {
            // SOCKS5 proxy
            if (login && password) {
              agentCandidates.push(
                new SocksProxyAgent(
                  `socks5://${login}:${password}@${ip}:${port}`,
                ),
              );
            }
            // Also try without auth (some SOCKS5 use IP whitelist)
            agentCandidates.push(
              new SocksProxyAgent(`socks5://${ip}:${port}`),
            );
          } else {
            // HTTP(s) proxy
            const isIpv6 = raw.includes('[');
            const host = isIpv6 ? `[${ip}]` : ip;

            if (login && password) {
              const proxyUrl = `http://${login}:${password}@${host}:${port}`;
              agentCandidates.push(new HttpsProxyAgent(proxyUrl));
              if (!isIpv6) {
                agentCandidates.push(
                  tunnel.httpsOverHttp({
                    proxy: {
                      host: ip,
                      port: parseInt(port, 10),
                      proxyAuth: `${login}:${password}`,
                    },
                  }),
                );
              }
            } else {
              const proxyUrl = `http://${host}:${port}`;
              agentCandidates.push(new HttpsProxyAgent(proxyUrl));
              if (!isIpv6) {
                agentCandidates.push(
                  tunnel.httpsOverHttp({
                    proxy: {
                      host: ip,
                      port: parseInt(port, 10),
                    },
                  }),
                );
              }
            }
          }

          const headers = { 'User-Agent': 'Mozilla/5.0' };
          const start = Date.now();

          const ipResponse = await Promise.any(
            agentCandidates.map((agent) =>
              this.tryFallbackRequest(agent, headers),
            ),
          );

          if (!ipResponse) {
            throw new Error('All fallback test URLs failed');
          }

          if (login && password && ipResponse.trim() === myIp) {
            throw new Error('Proxy Authentication Failed (407)');
          }

          const end = Date.now();
          return {
            status: 'valid',
            ip,
            port,
            login: login || null,
            password: password || null,
            proxyIP: ipResponse.trim(),
            type: proxyType,
            responseTime: ((end - start) / 1000).toFixed(3),
            country: addCountry ? await this.getCountry(ip) : undefined,
          };
        } catch (error: any) {
          return {
            status: 'invalid',
            raw,
            ip: ip || null,
            port: port || null,
            login: login || null,
            password: password || null,
            type: proxyType,
            error:
              error.response?.status === 407
                ? 'Proxy Authentication Failed (407)'
                : error.code || error.message || error.toString(),
          };
        }
      }),
    );
  }

  private async tryProxyWithAgent(
    agent: any,
    info: {
      ip: string;
      port: string;
      login: string;
      password: string;
      proxyType: string;
      raw: string;
    },
    myIp: string,
    addCountry: boolean,
  ) {
    const headers = { 'User-Agent': 'Mozilla/5.0' };
    const start = Date.now();

    const ipResponse = await this.tryFallbackRequest(agent, headers);

    if (!ipResponse) {
      throw new Error('All fallback test URLs failed');
    }

    if (
      info.login &&
      info.password &&
      ipResponse.trim() === myIp
    ) {
      throw new Error('Proxy Authentication Failed (407)');
    }

    const end = Date.now();
    return {
      status: 'valid',
      ip: info.ip,
      port: info.port,
      login: info.login || null,
      password: info.password || null,
      proxyIP: ipResponse.trim(),
      type: info.proxyType,
      responseTime: ((end - start) / 1000).toFixed(3),
      country: addCountry ? await this.getCountry(info.ip) : undefined,
    };
  }

  private async tryFallbackRequest(agent: any, headers: any): Promise<string> {
    const timeoutMs = 10000;
    const fallbackPromises = this.fallbackUrls.map((url) => {
      const config: AxiosRequestConfig = {
        url,
        method: 'GET',
        timeout: timeoutMs,
        headers,
        httpsAgent: agent,
        httpAgent: agent,
        transformResponse: (data) => data,
      };
      return axios(config).then((response) => response.data);
    });

    try {
      return await Promise.any(fallbackPromises);
    } catch (error) {
      throw new Error('All fallback test URLs failed');
    }
  }

  private async getMyIpAddressDirect(): Promise<string> {
    try {
      const response = await axios.get('http://api64.ipify.org', {
        timeout: 10000,
        transformResponse: (data) => data,
      });
      return response.data;
    } catch (error) {
      throw new Error('Failed to retrieve own IP address');
    }
  }

  private async getCountry(ip: string): Promise<string | null> {
    try {
      const res = await axios.get(`http://ip-api.com/json/${ip}`, {
        timeout: 3000,
      });
      return res.data.countryCode || null;
    } catch {
      return null;
    }
  }
}

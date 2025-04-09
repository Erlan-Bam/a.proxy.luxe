import { Injectable } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import * as tunnel from 'tunnel';

@Injectable()
export class ProxyCheckerService {
  // Fallback URLs. These endpoints return only the IP as a string.
  private fallbackUrls = [
    'http://api.ipify.org',
    'http://icanhazip.com',
    'http://ifconfig.me/ip',
  ];

  async checkProxies(proxies: string[], addCountry: boolean): Promise<any[]> {
    // Retrieve our own public IP (without using a proxy)
    const myIp = (await this.getMyIpAddressDirect()).trim();

    return Promise.all(
      proxies.map(async (raw) => {
        let [ip, port, login, password] = ['', '', '', ''];
        let proxyType = 'HTTP(s)';

        try {
          const agentCandidates: any[] = [];

          // For SOCKS proxies:
          if (raw.startsWith('socks5://') || raw.startsWith('socks4://')) {
            const agent = new SocksProxyAgent(raw);
            proxyType = raw.startsWith('socks5://') ? 'SOCKS5' : 'SOCKS4';
            const ipMatch = raw.match(/(\d+\.\d+\.\d+\.\d+)/);
            if (ipMatch) ip = ipMatch[1];
            port = raw.match(/:(\d+)/)?.[1] || '';
            agentCandidates.push(agent);
          } else {
            // For HTTP/HTTPS proxies (colon-separated formats).
            const parts = raw.split(':');
            if (parts.length === 4) {
              // Format: ip:port:login:password
              [ip, port, login, password] = parts;
              // Option 1: HttpsProxyAgent with credentials embedded in URL.
              const proxyUrl = `http://${login}:${password}@${ip}:${port}`;
              agentCandidates.push(new HttpsProxyAgent(proxyUrl));
              // Option 2: tunnel.httpsOverHttp with credentials provided via proxyAuth.
              agentCandidates.push(
                tunnel.httpsOverHttp({
                  proxy: {
                    host: ip,
                    port: parseInt(port, 10),
                    proxyAuth: `${login}:${password}`,
                  },
                }),
              );
            } else if (parts.length === 2) {
              // Format: ip:port
              [ip, port] = parts;
              const proxyUrl = `http://${ip}:${port}`;
              agentCandidates.push(new HttpsProxyAgent(proxyUrl));
              agentCandidates.push(
                tunnel.httpsOverHttp({
                  proxy: {
                    host: ip,
                    port: parseInt(port, 10),
                  },
                }),
              );
            } else {
              throw new Error('Invalid proxy format');
            }
          }

          const headers = {
            'User-Agent': 'Mozilla/5.0',
          };

          const start = Date.now();
          // Attempt all candidate agents concurrently.
          const ipResponse = await Promise.any(
            agentCandidates.map((agent) =>
              this.tryFallbackRequest(agent, headers),
            ),
          );

          if (!ipResponse) {
            throw new Error('All fallback test URLs failed');
          }

          // Compare the returned IP with our own IP.
          // If credentials were provided and the ipResponse equals our direct IP,
          // then the proxy did not authenticate properly.
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
            error:
              error.response?.status === 407
                ? 'Proxy Authentication Failed (407)'
                : error.code || error.message || error.toString(),
          };
        }
      }),
    );
  }

  /**
   * Try the fallback request using the given agent.
   * All fallback URLs are requested concurrently.
   */
  private async tryFallbackRequest(agent: any, headers: any): Promise<string> {
    const timeoutMs = 1000;
    // Create an array of promises for the fallback URLs.
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

    // Promise.any resolves as soon as one promise succeeds.
    try {
      return await Promise.any(fallbackPromises);
    } catch (error) {
      throw new Error('All fallback test URLs failed');
    }
  }

  /**
   * Retrieve our own public IP (without using any proxy).
   */
  private async getMyIpAddressDirect(): Promise<string> {
    try {
      const response = await axios.get('http://api.ipify.org', {
        timeout: 1000,
        transformResponse: (data) => data,
      });
      return response.data;
    } catch (error) {
      throw new Error('Failed to retrieve own IP address');
    }
  }

  /**
   * Optionally, get the country code for a given IP.
   */
  private async getCountry(ip: string): Promise<string | null> {
    try {
      const res = await axios.get(`http://ip-api.com/json/${ip}`, {
        timeout: 1000,
      });
      return res.data.countryCode || null;
    } catch {
      return null;
    }
  }
}

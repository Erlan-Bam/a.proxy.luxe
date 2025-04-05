import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import * as tunnel from 'tunnel';
import * as base64 from 'base-64';

@Injectable()
export class ProxyCheckerService {
  // Добавляем и https, и http fallback URL'ы
  private fallbackUrls = [
    // 'https://api.ipify.org',
    'http://api.ipify.org',
    // 'https://icanhazip.com',
    'http://icanhazip.com',
    // 'https://ifconfig.me/ip',
    'http://ifconfig.me/ip',
  ];

  async checkProxies(proxies: string[], addCountry: boolean): Promise<any[]> {
    return Promise.all(
      proxies.map(async (raw) => {
        let [ip, port, login, password] = ['', '', '', ''];
        let proxyType = 'HTTP(s)';

        try {
          // Если прокси начинается с socks, используем SocksProxyAgent
          if (raw.startsWith('socks5://') || raw.startsWith('socks4://')) {
            const agent = new SocksProxyAgent(raw);
            proxyType = raw.startsWith('socks5://') ? 'SOCKS5' : 'SOCKS4';
            const ipMatch = raw.match(/(\d+\.\d+\.\d+\.\d+)/);
            if (ipMatch) ip = ipMatch[1];
            port = raw.match(/:(\d+)/)?.[1] || '';
            const start = Date.now();
            const ipResponse = await this.tryFallbackRequest(agent, {
              'User-Agent': 'Mozilla/5.0',
            });
            const end = Date.now();
            return {
              status: 'valid',
              ip,
              port,
              login: null,
              password: null,
              proxyIP: ipResponse?.trim(),
              type: proxyType,
              responseTime: ((end - start) / 1000).toFixed(3),
              country: addCountry ? await this.getCountry(ip) : undefined,
            };
          }

          // HTTP/HTTPS прокси
          const parts = raw.split(':');
          let agents: any[] = [];
          if (parts.length === 4) {
            [ip, port, login, password] = parts;
            // Первый вариант — HttpsProxyAgent с URL, где в строке уже содержатся креды
            const proxyUrl = `http://${login}:${password}@${ip}:${port}`;
            agents.push(new HttpsProxyAgent(proxyUrl));
            // Второй вариант — tunnel.httpsOverHttp (без передачи заголовка вручную)
            agents.push(
              tunnel.httpsOverHttp({
                proxy: {
                  host: ip,
                  port: parseInt(port),
                  proxyAuth: `${login}:${password}`,
                },
              }),
            );
          } else if (parts.length === 2) {
            [ip, port] = parts;
            const proxyUrl = `http://${ip}:${port}`;
            agents.push(new HttpsProxyAgent(proxyUrl));
            agents.push(
              tunnel.httpsOverHttp({
                proxy: {
                  host: ip,
                  port: parseInt(port),
                },
              }),
            );
          } else {
            throw new Error('Invalid proxy format');
          }

          const headers = {
            'User-Agent': 'Mozilla/5.0',
          };

          const start = Date.now();
          let ipResponse: string | null = null;
          for (const agent of agents) {
            try {
              ipResponse = await this.tryFallbackRequest(agent, headers);
              if (ipResponse) break;
            } catch (err) {
              continue;
            }
          }
          if (!ipResponse) {
            throw new Error('All fallback test URLs failed');
          }
          const end = Date.now();
          return {
            status: 'valid',
            ip,
            port,
            login: login || null,
            password: password || null,
            proxyIP: ipResponse?.trim(),
            type: proxyType,
            responseTime: ((end - start) / 1000).toFixed(3),
            country: addCountry ? await this.getCountry(ip) : undefined,
          };
        } catch (error) {
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

  private async tryFallbackRequest(
    agent: any,
    headers: any,
  ): Promise<string | null> {
    for (const url of this.fallbackUrls) {
      try {
        const response = await axios.get(url, {
          timeout: 5000,
          httpsAgent: agent,
          headers,
        });
        return response.data;
      } catch (err) {
        continue;
      }
    }
    throw new Error('All fallback test URLs failed');
  }

  private async getCountry(ip: string): Promise<string | null> {
    try {
      const res = await axios.get(`http://ip-api.com/json/${ip}`);
      return res.data.countryCode || null;
    } catch {
      return null;
    }
  }
}

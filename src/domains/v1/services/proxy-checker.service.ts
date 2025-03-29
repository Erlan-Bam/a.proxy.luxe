import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

@Injectable()
export class ProxyCheckerService {
  async checkProxies(proxies: string[], addCountry: boolean): Promise<any[]> {
    return await Promise.all(
      proxies.map(async (raw) => {
        let [ip, port, login, password] = ['', '', '', ''];
        let proxyUrl = '';
        let agent: any;
        let proxyType = 'HTTP(s)';

        try {
          if (raw.startsWith('socks5://') || raw.startsWith('socks4://')) {
            proxyUrl = raw;
            agent = new SocksProxyAgent(proxyUrl);
            proxyType = raw.startsWith('socks5://') ? 'SOCKS5' : 'SOCKS4';

            const match = raw.match(/(\d+\.\d+\.\d+\.\d+):(\d+)/);
            if (match) {
              ip = match[1];
              port = match[2];
            }
          } else {
            const parts = raw.split(':');
            if (parts.length === 4) {
              [ip, port, login, password] = parts;
              proxyUrl = `http://${login}:${password}@${ip}:${port}`;
            } else if (parts.length === 2) {
              [ip, port] = parts;
              proxyUrl = `http://${ip}:${port}`;
            } else {
              throw new Error('Invalid proxy format');
            }
            agent = new HttpsProxyAgent(proxyUrl);
          }

          const start = Date.now();
          const response = await axios.get('https://api.ipify.org', {
            httpsAgent: agent,
            timeout: 5000,
          });
          const end = Date.now();

          return {
            status: 'valid',
            ip,
            port,
            login,
            password,
            type: proxyType,
            responseTime: ((end - start) / 1000).toFixed(3),
            country: addCountry ? await this.getCountry(ip) : undefined,
          };
        } catch (error) {
          return {
            status: 'invalid',
            raw,
            error: error.code || error.message,
          };
        }
      }),
    );
  }

  private async getCountry(ip: string): Promise<string | null> {
    try {
      const res = await axios.get(`http://ip-api.com/json/${ip}`);
      return res.data.countryCode || null;
    } catch (error) {
      return null;
    }
  }
}

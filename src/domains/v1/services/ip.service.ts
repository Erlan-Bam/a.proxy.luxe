import { Injectable, Req } from '@nestjs/common';
import { Request } from 'express';
import axios from 'axios';
import { IpInfoDto } from './dto/ip-info.dto';
import { IncomingHttpHeaders } from 'http';

@Injectable()
export class IpService {
  async getIpInfo(@Req() req): Promise<IpInfoDto> {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    try {
      // Запрос к API для получения информации о IP
      const response = await axios.get(`http://ip-api.com/json/${ip}`);
      const data = response.data;
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: data.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      interface FormattedDate {
        day: string;
        month: string;
        year: string;
        hour: string;
        minute: string;
      }

      const formatted = formatter
        .formatToParts(new Date())
        .reduce((acc: FormattedDate, part) => {
          acc[part.type as keyof FormattedDate] = part.value;
          return acc;
        }, {} as FormattedDate);

      const time = `${formatted.day}-${formatted.month}-${formatted.year}, ${formatted.hour}:${formatted.minute} (${data.timezone ?? 'Unknown'})`;

      return {
        ip,
        host: req.hostname,
        country: data.country,
        city: data.city,
        zipcode: data.zip,
        latitude: data.lat,
        longitude: data.lon,
        time: time,
        database: 'MaxMind | IP2Location',
        headers: {
          xForwardedFor: req.headers['x-forwarded-for'],
          connection: req.headers['connection'],
          xForwardedProto: req.headers['x-forwarded-proto'],
          referer: req.headers['referer'],
          userAgent: req.headers['user-agent'],
          accept: req.headers['accept'],
          acceptEncoding: req.headers['accept-encoding'],
          acceptLanguage: req.headers['accept-language'],
          acceptCharset: req.headers['accept-charset'],
          cookie: req.headers['cookie'],
        },
      };
    } catch (error) {
      throw new Error('Ошибка при получении данных об IP');
    }
  }

  private getClientIp(req: Request): string {
    return (req.headers['x-forwarded-for']?.toString() || req.ip) ?? 'unknown';
  }

  private async getGeoData(ip: string): Promise<any> {
    const response = await axios.get(`https://ipapi.co/${ip}/json/`);
    return response.data;
  }

  private formatTime(timezone: string): string {
    const date = new Date();
    return (
      new Intl.DateTimeFormat('ru-RU', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: timezone,
      }).format(date) + ` (${timezone})`
    );
  }

  private parseHeaders(headers: IncomingHttpHeaders): Record<string, string> {
    const allowedHeaders = [
      'x-forwarded-for',
      'user-agent',
      'accept',
      'accept-encoding',
      'accept-language',
      'cookie',
      'referer',
    ];

    return Object.fromEntries(
      Object.entries(headers)
        .filter(([key]) => allowedHeaders.includes(key.toLowerCase()))
        .map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join(', ') : (value ?? ''),
        ]),
    ) as Record<string, string>;
  }
}

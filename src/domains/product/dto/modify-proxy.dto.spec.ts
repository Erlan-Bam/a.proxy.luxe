import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { ModifyProxyResidentDto } from './modify-proxy.dto';

describe('ModifyProxyResidentDto', () => {
  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: ModifyProxyResidentDto,
  };

  const pipe = new ValidationPipe();

  const validPayload = {
    title: 'avitoria',
    ports: 1,
    whitelist: '',
    package_key: 'f39a0c1d4fafa09c189a',
    geo: {
      country: 'RU',
    },
  };

  it.each([
    ['null rotation from JSON NaN', null],
    ['each_request rotation alias', 'each_request'],
    ['per-request numeric rotation', 0],
    ['sticky rotation', -1],
    ['time-based rotation', 300],
  ])('accepts %s', async (_name, rotation) => {
    await expect(
      pipe.transform({ ...validPayload, rotation }, metadata),
    ).resolves.toBeDefined();
  });

  it.each(['not-a-rotation', -2, 3601])(
    'rejects invalid rotation %p',
    async (rotation) => {
      await expect(
        pipe.transform({ ...validPayload, rotation }, metadata),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});

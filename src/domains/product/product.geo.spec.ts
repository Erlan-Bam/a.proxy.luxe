import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { ProductService } from './product.service';

describe('ProductService.getGeoReference', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('serves the bundled reference without a runtime uploads directory', async () => {
    const service = new ProductService(
      {
        get: jest.fn().mockReturnValue('test-key'),
      } as unknown as ConfigService,
      {} as any,
    );
    const readFile = fs.readFileSync.bind(fs);
    jest.spyOn(fs, 'readFileSync').mockImplementation((file, options) => {
      if (String(file).includes('/uploads/')) {
        throw Object.assign(new Error('uploads is absent from this release'), {
          code: 'ENOENT',
        });
      }
      return readFile(file, options);
    });
    jest.spyOn(process, 'cwd').mockReturnValue('/unrelated-runtime-directory');

    const countries = await service.getGeoReference();
    expect(countries.length).toBeGreaterThan(200);
    expect(countries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'US', name: 'United States' }),
        expect.objectContaining({ code: 'UZ', name: 'Uzbekistan' }),
      ]),
    );
    expect(
      countries.find((country) => country.code === 'UZ')?.regions.length,
    ).toBeGreaterThan(0);
  });
});

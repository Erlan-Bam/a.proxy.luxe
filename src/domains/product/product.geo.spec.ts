import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { ProductService } from './product.service';

describe('ProductService.getGeoReference', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads the bundled geo reference independently of the working directory', async () => {
    const service = new ProductService(
      { get: jest.fn().mockReturnValue('test-key') } as unknown as ConfigService,
      {} as any,
    );
    const expectedPath = path.resolve(__dirname, '../../uploads/geo.json');
    const readFile = jest
      .spyOn(fs, 'readFileSync')
      .mockReturnValue('[{"code":"US","name":"United States"}]');
    jest.spyOn(process, 'cwd').mockReturnValue('/unrelated-runtime-directory');

    await expect(service.getGeoReference()).resolves.toEqual([
      { code: 'US', name: 'United States' },
    ]);
    expect(readFile).toHaveBeenCalledWith(expectedPath, 'utf-8');
  });
});

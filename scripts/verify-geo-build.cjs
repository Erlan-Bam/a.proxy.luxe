const assert = require('node:assert/strict');
const { mkdtempSync, rmdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const {
  ProductService,
} = require('../dist/src/domains/product/product.service');
const source = require('../src/data/geo.json');

async function verify() {
  const previousDirectory = process.cwd();
  const emptyDirectory = mkdtempSync(join(tmpdir(), 'proxy-geo-build-'));
  try {
    process.chdir(emptyDirectory);
    const service = new ProductService({ get: () => undefined }, {});
    const countries = await service.getGeoReference();
    assert.deepEqual(
      countries,
      source,
      'Built geo reference differs from source',
    );
    assert.ok(countries.length > 200, 'Geo reference is incomplete');
    for (const code of ['US', 'UZ']) {
      const country = countries.find((entry) => entry.code === code);
      assert.ok(country?.regions.length, `Missing regions for ${code}`);
      assert.ok(
        country.regions.some((region) => region.cities.length),
        `Missing cities for ${code}`,
      );
    }
    console.log(`Built geo reference verified: ${countries.length} countries`);
  } finally {
    process.chdir(previousDirectory);
    rmdirSync(emptyDirectory);
  }
}

verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

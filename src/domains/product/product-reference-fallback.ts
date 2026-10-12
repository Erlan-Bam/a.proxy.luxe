import { ResponseReferenceDTO } from './rdo/response.dto';
import geoReference = require('../../data/geo.json');

const alpha2ByAlpha3: Record<string, string> = {
  USA: 'US',
  POL: 'PL',
  NLD: 'NL',
  BRA: 'BR',
  LVA: 'LV',
  FRA: 'FR',
  ROU: 'RO',
  CAN: 'CA',
  NOR: 'NO',
  AUT: 'AT',
  GBR: 'GB',
  UKR: 'UA',
  TUR: 'TR',
  JPN: 'JP',
  ISR: 'IL',
  TWN: 'TW',
  KOR: 'KR',
  DEU: 'DE',
  SGP: 'SG',
  HKG: 'HK',
  THA: 'TH',
  ITA: 'IT',
  AUS: 'AU',
  ESP: 'ES',
  CZE: 'CZ',
  BGR: 'BG',
  PRT: 'PT',
  IND: 'IN',
};
const countries = (codes: string) =>
  codes.split(' ').map((id) => ({
    id,
    alpha3: id,
    name:
      geoReference.find((country) => country.code === alpha2ByAlpha3[id])
        ?.name ?? id,
  }));
const periods = ['1w', '2w', '1m', '2m', '3m', '6m', '9m', '12m'].map((id) => ({
  id,
  name: id,
}));

// The available product codes are fixed; display names come from the bundled geo reference.
export const productReferenceFallback: ResponseReferenceDTO = {
  status: 'success',
  isp: {
    country: countries(
      'USA POL NLD BRA LVA FRA ROU CAN NOR AUT GBR UKR TUR JPN ISR TWN KOR DEU SGP HKG THA ITA',
    ),
    period: periods,
    targets: [{ sectionId: 8, name: 'Other purposes' }],
  },
  ipv6: {
    country: countries(
      'DEU FRA NLD CAN USA GBR AUS ESP CZE TUR ROU SGP JPN BGR PRT BRA IND',
    ),
    period: periods,
    targets: [{ sectionId: 8, name: 'Other purposes' }],
  },
  resident: {
    tariffs: [
      { id: 25208, name: '1 Gb', personal: true },
      { id: 25209, name: '3 Gb', personal: true },
      { id: 25210, name: '10 Gb', personal: true },
      { id: 25211, name: '25 Gb', personal: true },
      { id: 25212, name: '50 Gb', personal: true },
      { id: 17721, name: '100 Gb', personal: true },
    ],
    targets: [],
  },
  amounts: [1, 10, 20, 30, 50, 100].map((amount) => ({
    id: String(amount),
    text: `${amount} шт`,
  })),
};

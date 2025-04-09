export interface Country {
  id: number;
  name: string;
  alpha3: string;
}

export interface Period {
  id: string;
  name: string;
}

export interface Quantity {
  id: string;
  name: string;
  quantities: number[];
}

export interface TargetItem {
  sectionId: string;
  name: string;
  targets: string;
}

export interface Target {
  sectionId: string;
  name: string;
}

export interface Tariff {
  id: number;
  name: string;
  personal: boolean;
}

export interface ReferenceData {
  ipv4: {
    country: Country[];
    period: Period[];
    target: Target[];
  };
  ipv6: {
    country: Country[];
    period: Period[];
    target: Target[];
  };
  isp: {
    country: Country[];
    period: Period[];
    target: Target[];
  };
  mobile: {
    country: Country[];
    period: Period[];
  };
  mix: {
    country: Country[];
    period: Period[];
    target: Target[];
    quantities: Quantity[];
  };
  mix_isp: {
    country: Country[];
    period: Period[];
    target: Target[];
    quantities: Quantity[];
  };
  resident: {
    tarifs: Tariff[];
    target: Target[];
  };
  scraper: {
    tarifs: Tariff[];
    target: Target[];
  };
}

export interface ReferenceError {
  message: string;
  code: number;
  customData: null;
}

export interface ReferenceResponse {
  status: 'success' | 'error';
  data: ReferenceData | null;
  errors: ReferenceError[];
}
export interface ReferenceSingleResponse {
  status: 'success' | 'error';
  data: {
    items: {
      country: Country[];
      period: Period[];
      target: Target[];
      tarifs: Tariff[];
    };
  };
  errors: ReferenceError[];
}

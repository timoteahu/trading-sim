export const CONTRACTS = ['MAY', 'JUN', 'JUL'] as const;
export type Contract = (typeof CONTRACTS)[number];
export const LOT_BBL = 1000;

export interface ProductDef {
  key: string;            // 'BRENT'
  name: string;           // display
  column: 0 | 1 | 2;      // US, Europe, spreads
  base: Record<Contract, number>;
  halfSpread: number;
  // drivers: pct of Brent pct-move to follow
  beta: number;
  noise: number;          // own OU noise sigma per tick (in price units ~ pct)
  legs?: [string, string]; // spread products: legA - legB
  povLimitLots?: number;  // e.g. JUN Brent
}

export const PRODUCTS: ProductDef[] = [
  { key: 'WTI',       name: 'WTI',              column: 0, halfSpread: 0.02, beta: 1.0,  noise: 0.00025,
    base: { MAY: 80.10, JUN: 79.80, JUL: 79.50 } },
  { key: 'GASOLINE',  name: 'GASOLINE',         column: 0, halfSpread: 0.05, beta: 1.0,  noise: 0.0006,
    base: { MAY: 161.00, JUN: 160.20, JUL: 159.50 } },
  { key: 'HO',        name: 'HEATING OIL',      column: 0, halfSpread: 0.05, beta: 1.0,  noise: 0.0006,
    base: { MAY: 156.00, JUN: 155.40, JUL: 154.80 } },
  { key: 'FO6',       name: 'FUEL OIL No.6',    column: 0, halfSpread: 0.02, beta: 0.6,  noise: 0.0004,
    base: { MAY: 42.00, JUN: 41.80, JUL: 41.60 } },
  { key: 'BRENT',     name: 'BRENT',            column: 1, halfSpread: 0.02, beta: 1.0,  noise: 0.0002,
    base: { MAY: 85.00, JUN: 84.60, JUL: 84.25 }, povLimitLots: 100 },
  { key: 'MOGAS',     name: 'MOGAS',            column: 1, halfSpread: 0.50, beta: 1.0,  noise: 0.0008,
    base: { MAY: 465.0, JUN: 462.0, JUL: 459.0 } },
  { key: 'GASOIL',    name: 'GASOIL',           column: 1, halfSpread: 0.50, beta: 0.9,  noise: 0.0008,
    base: { MAY: 447.0, JUN: 445.0, JUL: 443.0 } },
  { key: 'FO',        name: 'FUEL OIL',         column: 1, halfSpread: 0.40, beta: 0.5,  noise: 0.0006,
    base: { MAY: 304.0, JUN: 302.0, JUL: 300.0 } },
];

export const SPREADS: ProductDef[] = [
  { key: 'WTI/BRENT',   name: 'WTI/BRENT',              column: 2, halfSpread: 0.03, beta: 0, noise: 0.0003,
    legs: ['WTI', 'BRENT'],       base: { MAY: 0, JUN: 0, JUL: 0 } },
  { key: 'GAS/MOG',     name: 'GASOLINE/MOGAS',         column: 2, halfSpread: 0.10, beta: 0, noise: 0.0008,
    legs: ['GASOLINE', 'MOGAS'],  base: { MAY: 0, JUN: 0, JUL: 0 } },
  { key: 'HO/GASOIL',   name: 'HEATING OIL/GASOIL',     column: 2, halfSpread: 0.10, beta: 0, noise: 0.0008,
    legs: ['HO', 'GASOIL'],       base: { MAY: 0, JUN: 0, JUL: 0 } },
  { key: 'FO6/FO',      name: 'FUEL OIL No.6/FUEL OIL', column: 2, halfSpread: 0.10, beta: 0, noise: 0.0008,
    legs: ['FO6', 'FO'],          base: { MAY: 0, JUN: 0, JUL: 0 } },
];

export const ALL_PRODUCTS = [...PRODUCTS, ...SPREADS];

export function productByKey(key: string): ProductDef {
  const p = ALL_PRODUCTS.find((p) => p.key === key);
  if (!p) throw new Error(`unknown product ${key}`);
  return p;
}

export function instrumentId(product: string, contract: string) {
  return `${product}:${contract}`;
}

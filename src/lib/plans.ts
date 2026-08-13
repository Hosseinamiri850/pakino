export type PlanId = 'free' | 'mvp' | 'proPlus';

export interface Plan {
  id: PlanId;
  credits: number;
  priceLabel: string;
  priceToman?: number;
  priorityQueue: boolean;
  maxVideoDurationSec: number;
}

// Prices and credits configurable server-side; these are display defaults.
export const PLANS: Plan[] = [
  {
    id: 'free',
    credits: 50,
    priceLabel: '۰',
    priceToman: 0,
    priorityQueue: false,
    maxVideoDurationSec: 30,
  },
  {
    id: 'mvp',
    credits: 1000,
    priceLabel: '۹۹ هزار',
    priceToman: 99000,
    priorityQueue: true,
    maxVideoDurationSec: 120,
  },
  {
    id: 'proPlus',
    credits: 5000,
    priceLabel: '۳۹۰ هزار',
    priceToman: 390000,
    priorityQueue: true,
    maxVideoDurationSec: 300,
  },
];

export function getPlan(id: PlanId): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0]!;
}

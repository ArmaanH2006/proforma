import { CORRELATION_OUTCOMES, type FundParams } from '../engine';

export interface FundPreset {
  id: string;
  label: string;
  description: string;
  params: Omit<FundParams, 'outcomes' | 'simulations' | 'seed'>;
}

export const FUND_PRESETS: FundPreset[] = [
  {
    id: 'student',
    label: 'Student fund',
    description: '$1M, $25K first checks, no fees or carry',
    params: {
      fundSize: 1_000_000,
      managementFee: 0,
      feeYears: 10,
      carry: 0,
      initialCheck: 25_000,
      reserveRatio: 0.25,
      followOnStepUp: 2.5,
      followOnRate: { winners: 0.9, losers: 0.4 },
      deploymentYears: 4,
    },
  },
  {
    id: 'micro',
    label: 'Micro VC',
    description: '$25M, 2% fee, 20% carry, $500K checks',
    params: {
      fundSize: 25_000_000,
      managementFee: 0.02,
      feeYears: 10,
      carry: 0.2,
      initialCheck: 500_000,
      reserveRatio: 0.4,
      followOnStepUp: 2.5,
      followOnRate: { winners: 0.9, losers: 0.4 },
      deploymentYears: 3,
    },
  },
  {
    id: 'seed',
    label: 'Seed fund',
    description: '$100M, 2% fee, 20% carry, $2M checks',
    params: {
      fundSize: 100_000_000,
      managementFee: 0.02,
      feeYears: 10,
      carry: 0.2,
      initialCheck: 2_000_000,
      reserveRatio: 0.5,
      followOnStepUp: 2.5,
      followOnRate: { winners: 0.9, losers: 0.4 },
      deploymentYears: 3,
    },
  },
];

export function presetFund(id: string): FundParams & { preset: string } {
  const preset = FUND_PRESETS.find((p) => p.id === id) ?? FUND_PRESETS[0]!;
  return {
    ...preset.params,
    followOnRate: { ...preset.params.followOnRate },
    outcomes: CORRELATION_OUTCOMES.map((o) => ({ ...o })),
    simulations: 5_000,
    seed: 2026,
    preset: preset.id,
  };
}

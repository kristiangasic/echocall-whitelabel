/**
 * Number categories the marketplace sells, in the order they are offered.
 * Each value has a label under `user.numbers.types.<value>`.
 */
export const NUMBER_TYPE_OPTIONS = [
  'local',
  'national',
  'mobile',
  'tollfree',
  'shared_cost',
  'uifn',
] as const;

export type NumberTypeOption = (typeof NUMBER_TYPE_OPTIONS)[number];

import z from 'zod';

export const configSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test', 'provision'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string('DATABASE_URL is required '),
  BLOOM_FILTER_FALSE_POSITIVE_RATE: z.coerce
    .number()
    .gt(
      0,
      'BLOOM_FILTER_FALSE_POSITIVE_RATE must be a number between 0 and 1 (exclusive).',
    )
    .lt(
      1,
      'BLOOM_FILTER_FALSE_POSITIVE_RATE must be a number between 0 and 1 (exclusive).',
    ),
  BLOOM_FILTER_CAPACITY_MARGIN: z.coerce
    .number()
    .gte(
      1,
      'BLOOM_FILTER_CAPACITY_MARGIN must be a number greater than or equal to 1.',
    ),
});

export type Config = z.infer<typeof configSchema>;

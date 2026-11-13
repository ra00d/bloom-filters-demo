import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { BloomFilter } from 'bloom-filters';
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite';
import { users } from '../db/schema.js';
import { ConfigService } from '@nestjs/config';
import { Config } from '../config.schema.js';

export interface BloomFilterStats {
  ready: boolean;
  items: number;
  capacity: number;
  sizeBits: number;
  hashFunctions: number;
  memoryBytes: number;
  targetFalsePositiveRate: number;
  estimatedFalsePositiveRate: number;
  builtAt: string | null;
  lastRebuildMs: number | null;
}

interface BloomFilterInternals {
  _size: number;
  _nbHashes: number;
  _filter: { array: { byteLength: number } };
}

const MIN_CAPACITY = 1024;

@Injectable()
export class BloomFilterService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BloomFilterService.name);
  private filter: BloomFilter | null = null;
  private capacity = 0;
  private itemCount = 0;
  private builtAt: Date | null = null;
  private lastRebuildMs: number | null = null;
  private isRebuilding = false;
  private rebuildPromise: Promise<void> | null = null;
  private readonly pendingAdds = new Set<string>();

  constructor(
    @InjectDrizzle() private readonly db: NodeSQLiteDatabase,
    private readonly config: ConfigService<Config>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.rebuild();
    } catch (error) {
      this.logger.error(
        'Failed to build the Bloom filter. Make sure the users table exists and DATABASE_URL is correct.',
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  isReady(): boolean {
    return this.filter !== null;
  }

  mightContain(id: string): boolean {
    // Without a ready filter, fall back to the database instead of risking
    // a false negative.
    return this.filter ? this.filter.has(id) : true;
  }

  add(id: string): void {
    if (this.isRebuilding) {
      this.pendingAdds.add(id);
    }

    if (this.filter) {
      this.filter.add(id);
      this.itemCount += 1;
    }
  }

  rebuild(): Promise<void> {
    if (this.rebuildPromise) {
      return this.rebuildPromise;
    }

    this.isRebuilding = true;
    this.pendingAdds.clear();

    const rebuildPromise = this.doRebuild().finally(() => {
      this.isRebuilding = false;
      this.pendingAdds.clear();
      this.rebuildPromise = null;
    });

    this.rebuildPromise = rebuildPromise;
    return rebuildPromise;
  }

  getStats(): BloomFilterStats {
    const internals = this.filter as unknown as BloomFilterInternals | null;

    return {
      ready: this.filter !== null,
      items: this.itemCount,
      capacity: this.capacity,
      sizeBits: internals?._size ?? 0,
      hashFunctions: internals?._nbHashes ?? 0,
      memoryBytes: internals?._filter.array.byteLength ?? 0,
      targetFalsePositiveRate: this.config.getOrThrow(
        'BLOOM_FILTER_FALSE_POSITIVE_RATE',
      ),
      estimatedFalsePositiveRate: this.filter?.rate() ?? 0,
      builtAt: this.builtAt?.toISOString() ?? null,
      lastRebuildMs: this.lastRebuildMs,
    };
  }

  private async doRebuild(): Promise<void> {
    const startedAt = performance.now();
    const rows = await this.db.select({ id: users.id }).from(users);

    // Read the pending set only after the database snapshot has been loaded.
    // No await happens after this point, so writes cannot slip between the
    // pending snapshot, applying it to the new filter, and swapping it in.
    const pending = [...this.pendingAdds];
    const capacity = Math.max(
      Math.ceil(
        (rows.length + pending.length) *
          this.config.getOrThrow('BLOOM_FILTER_CAPACITY_MARGIN'),
      ),
      MIN_CAPACITY,
    );
    const nextFilter = BloomFilter.create(
      capacity,
      this.config.getOrThrow('BLOOM_FILTER_FALSE_POSITIVE_RATE'),
    );

    for (const row of rows) {
      nextFilter.add(row.id);
    }

    for (const id of pending) {
      nextFilter.add(id);
    }

    this.filter = nextFilter;
    this.capacity = capacity;
    this.itemCount = rows.length + pending.length;
    this.builtAt = new Date();
    this.lastRebuildMs = Math.round(performance.now() - startedAt);

    this.logger.log(
      `Bloom filter ready: ${this.itemCount} items, ${capacity} capacity, ${
        this.config.getOrThrow('BLOOM_FILTER_FALSE_POSITIVE_RATE') * 100
      }% target false-positive rate`,
    );
  }
}

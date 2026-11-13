import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq, sql } from 'drizzle-orm';
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite';
import { randomUUID } from 'node:crypto';
import { BloomFilterService } from '../bloom/bloom-filter.service.js';
import { elapsedMicros } from '../common/timing.js';
import { users, userRoles, type User, type UserRole } from '../db/schema.js';

export interface CreateUserInput {
  email?: unknown;
  name?: unknown;
  role?: unknown;
}

export interface UserLookupMetadata {
  strategy: 'database' | 'bloom';
  bloomChecked: boolean;
  maybePresent?: boolean;
  dbQueried: boolean;
  falsePositive?: boolean;
  durationUs: number;
}

export interface UserLookupResult {
  found: boolean;
  user: User | null;
  lookup: UserLookupMetadata;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectDrizzle() private readonly db: NodeSQLiteDatabase,
    private readonly bloomFilterService: BloomFilterService,
  ) {}

  async findAll() {
    const data = await this.db.select().from(users).limit(30);
    return data;
  }

  async findByIdDirect(id: string): Promise<UserLookupResult> {
    const startedAt = process.hrtime.bigint();
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return {
      found: user !== undefined,
      user: user ?? null,
      lookup: {
        strategy: 'database',
        bloomChecked: false,
        dbQueried: true,
        durationUs: elapsedMicros(startedAt),
      },
    };
  }

  async findByIdWithBloom(id: string): Promise<UserLookupResult> {
    const startedAt = process.hrtime.bigint();
    const bloomChecked = this.bloomFilterService.isReady();

    if (bloomChecked && !this.bloomFilterService.mightContain(id)) {
      return {
        found: false,
        user: null,
        lookup: {
          strategy: 'bloom',
          bloomChecked: true,
          maybePresent: false,
          dbQueried: false,
          durationUs: elapsedMicros(startedAt),
        },
      };
    }

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return {
      found: user !== undefined,
      user: user ?? null,
      lookup: {
        strategy: 'bloom',
        bloomChecked,
        maybePresent: bloomChecked ? true : undefined,
        dbQueried: true,
        falsePositive: bloomChecked && user === undefined,
        durationUs: elapsedMicros(startedAt),
      },
    };
  }

  async create(input: CreateUserInput): Promise<User> {
    const email = requireNonEmptyString(input.email, 'email');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('email must be a valid email address');
    }

    const name = requireNonEmptyString(input.name, 'name');
    const role =
      input.role === undefined ? 'user' : requireUserRole(input.role);
    const id = randomUUID();

    // Add the ID before inserting. If the insert fails, the filter contains a
    // false positive (safe). This ordering avoids a window where a committed
    // user could be rejected by the filter.
    this.bloomFilterService.add(id);

    const [createdUser] = await this.db
      .insert(users)
      .values({ id, email, name, role })
      .returning();

    if (!createdUser) {
      throw new InternalServerErrorException('Failed to create user');
    }

    return createdUser;
  }

  async count(): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(users);
    return Number(row?.count ?? 0);
  }

  async sampleIds(limit: number): Promise<string[]> {
    const totalUsers = await this.count();

    if (totalUsers === 0) {
      return [];
    }

    const take = Math.min(limit, totalUsers);
    const offset = Math.floor(Math.random() * (totalUsers - take + 1));
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .limit(take)
      .offset(offset);

    return rows.map((row) => row.id);
  }
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${field} is required`);
  }

  return value.trim();
}

function requireUserRole(value: unknown): UserRole {
  if (typeof value !== 'string' || !userRoles.includes(value as UserRole)) {
    throw new BadRequestException(
      `role must be one of: ${userRoles.join(', ')}`,
    );
  }

  return value as UserRole;
}

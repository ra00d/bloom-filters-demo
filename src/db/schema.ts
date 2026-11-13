import { randomUUID } from 'crypto';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const userRoles = ['admin', 'user'] as const;

export type UserRole = (typeof userRoles)[number];

export const users = sqliteTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: userRoles }).notNull().default('user'),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

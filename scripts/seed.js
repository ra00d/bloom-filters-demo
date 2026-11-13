import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { seed } from 'drizzle-seed';
import { users } from '../dist/db/schema.js';

async function main() {
  const db = drizzle(process.env.DATABASE_URL);

  await seed(db, { users }).refine((f) => ({
    users: {
      columns: {
        name: f.fullName(),
        email: f.email(),
      },
      count: 1000,
    },
  }));
}
await main();

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { BloomModule } from './bloom/bloom.module.js';
import { configSchema } from './config.schema.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema: configSchema,
      isGlobal: true,
    }),
    DrizzleModule.forRootAsync({
      useFactory: () => ({
        drizzle,
        connection: process.env.DATABASE_URL ?? 'bloom_filters.db',
      }),
    }),
    BloomModule,
    UsersModule,
  ],
})
export class AppModule {}

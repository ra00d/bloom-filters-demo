import { Module } from '@nestjs/common';
import { BloomFilterService } from './bloom-filter.service.js';

@Module({
  providers: [BloomFilterService],
  exports: [BloomFilterService],
})
export class BloomModule {}

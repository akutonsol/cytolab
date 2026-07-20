import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ConnectionManager } from './connection-manager';

@Global()
@Module({
  providers: [PrismaService, ConnectionManager],
  exports: [PrismaService, ConnectionManager],
})
export class PrismaModule {}

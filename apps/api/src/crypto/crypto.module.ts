import { Global, Module } from '@nestjs/common';
import { CredentialsEncryptionService } from './credentials-encryption.service';
import { PostgresPoolManager } from '../postgres/postgres-pool.manager';

@Global()
@Module({
  providers: [CredentialsEncryptionService, PostgresPoolManager],
  exports: [CredentialsEncryptionService, PostgresPoolManager],
})
export class CryptoModule {}

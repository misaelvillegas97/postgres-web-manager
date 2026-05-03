import { Injectable } from '@nestjs/common';
import { DbExtension, DbFunction, DbSchema, DbTable, TableDetail } from '@postgres-web-manager/contracts';

@Injectable()
export class MetadataService {
  async getSchemas(_connectionId: string): Promise<DbSchema[]> {
    throw new Error('Not implemented');
  }

  async getTables(_connectionId: string, _schema: string): Promise<DbTable[]> {
    throw new Error('Not implemented');
  }

  async getTableDetail(_connectionId: string, _schema: string, _table: string): Promise<TableDetail> {
    throw new Error('Not implemented');
  }

  async getFunctions(_connectionId: string, _schema: string): Promise<DbFunction[]> {
    throw new Error('Not implemented');
  }

  async getExtensions(_connectionId: string): Promise<DbExtension[]> {
    throw new Error('Not implemented');
  }
}

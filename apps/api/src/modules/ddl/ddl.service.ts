import { Injectable } from '@nestjs/common';
import {
  AlterTableRequest,
  CreateTableRequest,
  DdlExecuteResponse,
  DdlPreviewResponse,
} from '@postgres-web-manager/contracts';

@Injectable()
export class DdlService {
  async previewCreateTable(_dto: CreateTableRequest): Promise<DdlPreviewResponse> {
    throw new Error('Not implemented');
  }

  async executeCreateTable(_dto: CreateTableRequest): Promise<DdlExecuteResponse> {
    throw new Error('Not implemented');
  }

  async previewAlterTable(_dto: AlterTableRequest): Promise<DdlPreviewResponse> {
    throw new Error('Not implemented');
  }

  async executeAlterTable(_dto: AlterTableRequest): Promise<DdlExecuteResponse> {
    throw new Error('Not implemented');
  }
}

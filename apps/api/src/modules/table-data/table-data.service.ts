import { Injectable } from '@nestjs/common';
import {
  ApplyTableChangesRequest,
  ApplyTableChangesResponse,
  PreviewChangesRequest,
  PreviewChangesResponse,
  ReadTableDataRequest,
  ReadTableDataResponse,
} from '@postgres-web-manager/contracts';

@Injectable()
export class TableDataService {
  async read(_dto: ReadTableDataRequest): Promise<ReadTableDataResponse> {
    throw new Error('Not implemented');
  }

  async previewChanges(_dto: PreviewChangesRequest): Promise<PreviewChangesResponse> {
    throw new Error('Not implemented');
  }

  async applyChanges(_dto: ApplyTableChangesRequest): Promise<ApplyTableChangesResponse> {
    throw new Error('Not implemented');
  }
}

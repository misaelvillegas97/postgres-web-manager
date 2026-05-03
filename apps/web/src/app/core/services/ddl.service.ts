import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  CreateTableRequest,
  AlterTableRequest,
  DdlPreviewResponse,
  DdlExecuteResponse,
} from '@postgres-web-manager/contracts';

@Injectable({ providedIn: 'root' })
export class DdlService {
  private http = inject(HttpClient);

  previewCreateTable(dto: CreateTableRequest) {
    return this.http.post<DdlPreviewResponse>('/api/ddl/create-table/preview', dto);
  }

  executeCreateTable(dto: CreateTableRequest) {
    return this.http.post<DdlExecuteResponse>('/api/ddl/create-table/execute', dto);
  }

  previewAlterTable(dto: AlterTableRequest) {
    return this.http.post<DdlPreviewResponse>('/api/ddl/alter-table/preview', dto);
  }

  executeAlterTable(dto: AlterTableRequest) {
    return this.http.post<DdlExecuteResponse>('/api/ddl/alter-table/execute', dto);
  }
}

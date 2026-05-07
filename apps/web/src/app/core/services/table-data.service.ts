import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  ApplyTableChangesRequest,
  ApplyTableChangesResponse,
  ExportTableDataRequest,
  ExportTableDataResponse,
  ImportTableDataRequest,
  ImportTableDataResponse,
  PreviewChangesRequest,
  PreviewChangesResponse,
  ReadTableDataRequest,
  ReadTableDataResponse,
  TableChange,
  TableDataFormat,
} from '@postgres-web-manager/contracts';

export type { TableChange, TableDataFormat };

@Injectable({ providedIn: 'root' })
export class TableDataService {
  private http = inject(HttpClient);

  read(dto: ReadTableDataRequest) {
    return this.http.post<ReadTableDataResponse>('/api/table-data/read', dto);
  }

  exportData(dto: ExportTableDataRequest) {
    return this.http.post<ExportTableDataResponse>(
      '/api/table-data/export',
      dto,
    );
  }

  importData(dto: ImportTableDataRequest) {
    return this.http.post<ImportTableDataResponse>(
      '/api/table-data/import',
      dto,
    );
  }

  previewChanges(dto: PreviewChangesRequest) {
    return this.http.post<PreviewChangesResponse>(
      '/api/table-data/preview-changes',
      dto,
    );
  }

  applyChanges(dto: ApplyTableChangesRequest) {
    return this.http.post<ApplyTableChangesResponse>(
      '/api/table-data/apply-changes',
      dto,
    );
  }
}

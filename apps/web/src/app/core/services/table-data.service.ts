import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  ReadTableDataRequest,
  ReadTableDataResponse,
  PreviewChangesRequest,
  PreviewChangesResponse,
  ApplyTableChangesRequest,
  ApplyTableChangesResponse,
  TableChange,
} from '@postgres-web-manager/contracts';

export type { TableChange };

@Injectable({ providedIn: 'root' })
export class TableDataService {
  private http = inject(HttpClient);

  read(dto: ReadTableDataRequest) {
    return this.http.post<ReadTableDataResponse>('/api/table-data/read', dto);
  }

  previewChanges(dto: PreviewChangesRequest) {
    return this.http.post<PreviewChangesResponse>('/api/table-data/preview-changes', dto);
  }

  applyChanges(dto: ApplyTableChangesRequest) {
    return this.http.post<ApplyTableChangesResponse>('/api/table-data/apply-changes', dto);
  }
}

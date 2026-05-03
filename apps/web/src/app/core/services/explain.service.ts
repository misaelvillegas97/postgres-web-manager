import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ExplainRequest, ExplainResponse } from '@postgres-web-manager/contracts';

@Injectable({ providedIn: 'root' })
export class ExplainService {
  private http = inject(HttpClient);

  explain(dto: ExplainRequest) {
    return this.http.post<ExplainResponse>('/api/queries/explain', dto);
  }
}

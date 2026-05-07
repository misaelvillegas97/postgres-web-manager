import { mergeQueryRowsResult } from './workspace.component';

describe('mergeQueryRowsResult', () => {
  it('keeps streamed columns when the query result was initialized before rows arrive', () => {
    const result = mergeQueryRowsResult(
      {
        columns: [],
        rows: [],
        rowCount: 0,
        durationMs: 0,
      },
      {
        queryId: 'query-1',
        columns: [
          { name: 'id', dataTypeId: 23 },
          { name: 'name', dataTypeId: 25 },
        ],
        rows: [
          [1, 'alpha'],
          [2, 'beta'],
        ],
        offset: 0,
      },
    );

    expect(result.columns).toEqual([
      { name: 'id', dataTypeId: 23 },
      { name: 'name', dataTypeId: 25 },
    ]);
    expect(result.rows).toEqual([
      [1, 'alpha'],
      [2, 'beta'],
    ]);
  });

  it('appends later row batches without dropping existing columns', () => {
    const result = mergeQueryRowsResult(
      {
        columns: [{ name: 'id', dataTypeId: 23 }],
        rows: [[1]],
        rowCount: 1,
        durationMs: 4,
      },
      {
        queryId: 'query-1',
        rows: [[2]],
        offset: 1,
      },
    );

    expect(result.columns).toEqual([{ name: 'id', dataTypeId: 23 }]);
    expect(result.rows).toEqual([[1], [2]]);
  });
});

import {
  Component,
  ElementRef,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  ViewChild,
  AfterViewInit,
  NgZone,
} from '@angular/core';

// Monaco loader — we load it from the /assets/vs path configured in project.json
declare const require: {
  config(cfg: { paths: Record<string, string> }): void;
  (modules: string[], cb: (...args: unknown[]) => void): void;
};

// Monaco global
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const monaco: any;

let monacoLoaded = false;
let monacoLoading = false;
const monacoCallbacks: Array<() => void> = [];

function loadMonaco(cb: () => void) {
  if (monacoLoaded) { cb(); return; }
  monacoCallbacks.push(cb);
  if (monacoLoading) return;
  monacoLoading = true;

  const script = document.createElement('script');
  script.src = 'assets/vs/loader.js';
  script.onload = () => {
    require.config({ paths: { vs: 'assets/vs' } });
    require(['vs/editor/editor.main'], () => {
      monacoLoaded = true;
      monacoLoading = false;
      monacoCallbacks.splice(0).forEach((fn) => fn());
    });
  };
  document.head.appendChild(script);
}

@Component({
  selector: 'app-sql-editor',
  standalone: true,
  template: `
    <div class="sql-editor-wrap">
      <div #editorContainer class="sql-editor__container"></div>
    </div>
  `,
  styles: [`
    .sql-editor-wrap {
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .sql-editor__container {
      flex: 1;
      min-height: 0;
    }
  `],
})
export class SqlEditorComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('editorContainer', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  @Input() value = '';
  @Input() language = 'sql';
  @Input() readOnly = false;
  @Input() completionSchema: CompletionSchema | null = null;

  @Output() valueChange = new EventEmitter<string>();
  @Output() runQuery = new EventEmitter<string>();
  @Output() formatRequest = new EventEmitter<void>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private editor: any = null;
  private completionDisposable: unknown = null;
  private valueChangeDisposable: unknown = null;

  constructor(private zone: NgZone) {}

  ngOnInit() {}

  ngAfterViewInit() {
    loadMonaco(() => {
      this.zone.runOutsideAngular(() => this.initEditor());
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['value'] && this.editor) {
      const newVal: string = changes['value'].currentValue;
      if (this.editor.getValue() !== newVal) {
        this.editor.setValue(newVal ?? '');
      }
    }
    if (changes['completionSchema'] && monacoLoaded) {
      this.registerCompletions();
    }
    if (changes['readOnly'] && this.editor) {
      this.editor.updateOptions({ readOnly: this.readOnly });
    }
  }

  ngOnDestroy() {
    (this.completionDisposable as { dispose?: () => void })?.dispose?.();
    (this.valueChangeDisposable as { dispose?: () => void })?.dispose?.();
    this.editor?.dispose();
  }

  /** Programmatically set the value without triggering valueChange */
  setValue(sql: string) {
    if (this.editor && this.editor.getValue() !== sql) {
      this.editor.setValue(sql);
    }
  }

  /** Get selected text, or full text if nothing selected */
  getActiveSelection(): string {
    if (!this.editor) return this.value;
    const selection = this.editor.getSelection();
    const model = this.editor.getModel();
    if (!selection || selection.isEmpty()) return model.getValue();
    return model.getValueInRange(selection);
  }

  focus() {
    this.editor?.focus();
  }

  private initEditor() {
    if (!this.containerRef?.nativeElement) return;

    this.editor = monaco.editor.create(this.containerRef.nativeElement, {
      value: this.value ?? '',
      language: this.language,
      theme: 'pg-dark',
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      fontLigatures: true,
      lineHeight: 20,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      automaticLayout: true,
      readOnly: this.readOnly,
      suggestOnTriggerCharacters: true,
      quickSuggestions: { other: true, comments: false, strings: false },
      tabSize: 2,
      renderLineHighlight: 'gutter',
      scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
      padding: { top: 8, bottom: 8 },
    });

    this.defineTheme();

    // Ctrl+Enter / Cmd+Enter → run
    this.editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => {
        this.zone.run(() => this.runQuery.emit(this.getActiveSelection()));
      },
    );

    // Ctrl+Shift+F → format
    this.editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF,
      () => {
        this.zone.run(() => this.formatRequest.emit());
      },
    );

    // Value change
    this.valueChangeDisposable = this.editor.onDidChangeModelContent(() => {
      const val: string = this.editor.getValue();
      this.zone.run(() => this.valueChange.emit(val));
    });

    // Register completions if schema already available
    if (this.completionSchema) {
      this.registerCompletions();
    }
  }

  private defineTheme() {
    monaco.editor.defineTheme('pg-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword.sql',   foreground: '5b6af5', fontStyle: 'bold' },
        { token: 'string.sql',    foreground: '4caf7d' },
        { token: 'comment.sql',   foreground: '555d80', fontStyle: 'italic' },
        { token: 'number.sql',    foreground: 'f5a623' },
        { token: 'operator.sql',  foreground: '5bc8f5' },
      ],
      colors: {
        'editor.background':           '#0f1117',
        'editor.foreground':           '#e8eaf6',
        'editorLineNumber.foreground': '#555d80',
        'editorCursor.foreground':     '#5b6af5',
        'editor.selectionBackground':  '#313654',
        'editor.lineHighlightBackground': '#1a1d27',
        'editorSuggestWidget.background': '#1a1d27',
        'editorSuggestWidget.border':   '#2e3347',
        'editorSuggestWidget.selectedBackground': '#313654',
      },
    });
    monaco.editor.setTheme('pg-dark');
  }

  private registerCompletions() {
    (this.completionDisposable as { dispose?: () => void })?.dispose?.();
    if (!this.completionSchema || !monacoLoaded) return;

    const schema = this.completionSchema;

    this.completionDisposable = monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: ['.', ' ', '\n'],
      provideCompletionItems: (model: unknown, position: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pos = position as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = model as any;
        const textUntilPos: string = m.getValueInRange({
          startLineNumber: pos.lineNumber,
          startColumn: 1,
          endLineNumber: pos.lineNumber,
          endColumn: pos.column,
        });

        const word = m.getWordUntilPosition(pos);
        const range = {
          startLineNumber: pos.lineNumber,
          endLineNumber: pos.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions: unknown[] = [];
        const KW = monaco.languages.CompletionItemKind.Keyword;
        const TBL = monaco.languages.CompletionItemKind.Class;
        const COL = monaco.languages.CompletionItemKind.Field;
        const FN  = monaco.languages.CompletionItemKind.Function;

        // Detect if user typed `schema.` → show table completions
        const dotMatch = textUntilPos.match(/(\w+)\.\s*$/);
        if (dotMatch) {
          const schemaName = dotMatch[1];
          const schemaTables = schema.tables.filter((t) => t.schema === schemaName);
          for (const t of schemaTables) {
            suggestions.push({ label: t.name, kind: TBL, insertText: t.name, range, detail: t.type });
          }
          const tableName = schemaTables.length === 1 ? schemaTables[0]?.name : null;
          if (tableName) {
            const cols = schema.columns.filter((c) => c.table === tableName && c.schema === schemaName);
            for (const c of cols) {
              suggestions.push({ label: c.name, kind: COL, insertText: c.name, range, detail: c.dataType });
            }
          }
        } else {
          // Keywords
          for (const kw of SQL_KEYWORDS) {
            suggestions.push({ label: kw, kind: KW, insertText: kw, range });
          }
          // Schema names
          for (const s of schema.schemas) {
            suggestions.push({ label: s, kind: TBL, insertText: s, range, detail: 'schema' });
          }
          // Table names (with schema prefix snippet)
          for (const t of schema.tables) {
            suggestions.push({
              label: t.name,
              kind: TBL,
              insertText: t.schema !== 'public' ? `${t.schema}.${t.name}` : t.name,
              range,
              detail: `${t.schema} · ${t.type}`,
            });
          }
          // Functions
          for (const f of schema.functions) {
            suggestions.push({ label: f.name, kind: FN, insertText: `${f.name}($0)`, insertTextRules: 4, range, detail: f.returnType });
          }
        }

        return { suggestions };
      },
    });
  }
}

export interface CompletionSchema {
  schemas: string[];
  tables: { schema: string; name: string; type: string }[];
  columns: { schema: string; table: string; name: string; dataType: string }[];
  functions: { schema: string; name: string; returnType: string }[];
}

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN',
  'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'ILIKE', 'IS NULL', 'IS NOT NULL',
  'INSERT INTO', 'UPDATE', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE',
  'CREATE INDEX', 'EXPLAIN', 'EXPLAIN ANALYZE',
  'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT', 'AS',
  'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT',
  'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
  'WITH', 'RETURNING', 'COALESCE', 'NULLIF', 'CAST', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN',
  'NOW()', 'CURRENT_TIMESTAMP', 'CURRENT_DATE', 'TRUE', 'FALSE', 'NULL',
];

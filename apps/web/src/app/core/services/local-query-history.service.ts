import { Injectable } from '@angular/core';

export interface LocalQueryHistoryEntry {
  id: string;
  connectionId: string;
  sql: string;
  status: 'success' | 'error' | 'cancelled';
  rowCount?: number;
  durationMs?: number;
  error?: string;
  startedAt: string;
}

export interface SaveLocalQueryHistoryEntry {
  connectionId: string;
  sql: string;
  status: 'success' | 'error' | 'cancelled';
  rowCount?: number;
  durationMs?: number;
  error?: string;
  startedAt?: string;
}

interface StoredHistoryEntry {
  id: string;
  connectionScope: string;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
  status: 'success' | 'error' | 'cancelled';
  rowCount?: number;
  durationMs?: number;
  startedAt: string;
}

interface EncryptedHistoryPayload {
  connectionId: string;
  sql: string;
  error?: string;
}

interface MetaRecord {
  key: string;
  value: unknown;
}

const DB_NAME = 'pgstudio-local-history';
const DB_VERSION = 1;
const HISTORY_STORE = 'history';
const META_STORE = 'meta';
const KEY_ID = 'query-history-aes-key-v1';
const MAX_ENTRIES_PER_CONNECTION = 100;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class LocalQueryHistoryService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private keyPromise: Promise<CryptoKey> | null = null;
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  async save(entry: SaveLocalQueryHistoryEntry): Promise<void> {
    if (!this.isSupported() || !entry.sql.trim()) return;

    const db = await this.openDb();
    const key = await this.getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const payload: EncryptedHistoryPayload = {
      connectionId: entry.connectionId,
      sql: entry.sql,
      error: entry.error,
    };
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      this.encoder.encode(JSON.stringify(payload)),
    );
    const startedAt = entry.startedAt ?? new Date().toISOString();
    const stored: StoredHistoryEntry = {
      id: this.createId(),
      connectionScope: await this.connectionScope(entry.connectionId),
      iv: iv.buffer,
      ciphertext,
      status: entry.status,
      rowCount: entry.rowCount,
      durationMs: entry.durationMs,
      startedAt,
    };

    await this.put(db, HISTORY_STORE, stored);
    await this.prune(entry.connectionId);
  }

  async getHistory(connectionId: string): Promise<LocalQueryHistoryEntry[]> {
    if (!this.isSupported()) return [];

    const db = await this.openDb();
    const key = await this.getKey();
    const scope = await this.connectionScope(connectionId);
    const stored = await this.getByIndex<StoredHistoryEntry>(
      db,
      HISTORY_STORE,
      'connectionScope',
      scope,
    );
    const recent = stored
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
      .slice(0, MAX_ENTRIES_PER_CONNECTION);
    const decrypted = await Promise.all(
      recent.map((entry) => this.decryptEntry(entry, key)),
    );
    return decrypted.filter(
      (entry): entry is LocalQueryHistoryEntry => entry !== null,
    );
  }

  async clear(connectionId?: string): Promise<void> {
    if (!this.isSupported()) return;

    const db = await this.openDb();
    if (!connectionId) {
      await this.clearStore(db, HISTORY_STORE);
      return;
    }

    const scope = await this.connectionScope(connectionId);
    const entries = await this.getByIndex<StoredHistoryEntry>(
      db,
      HISTORY_STORE,
      'connectionScope',
      scope,
    );
    await Promise.all(
      entries.map((entry) => this.delete(db, HISTORY_STORE, entry.id)),
    );
  }

  private isSupported(): boolean {
    return (
      typeof indexedDB !== 'undefined' && typeof crypto?.subtle !== 'undefined'
    );
  }

  private openDb(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(HISTORY_STORE)) {
          const history = db.createObjectStore(HISTORY_STORE, {
            keyPath: 'id',
          });
          history.createIndex('connectionScope', 'connectionScope');
          history.createIndex('startedAt', 'startedAt');
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  private async getKey(): Promise<CryptoKey> {
    this.keyPromise ??= this.loadOrCreateKey();
    return this.keyPromise;
  }

  private async loadOrCreateKey(): Promise<CryptoKey> {
    const db = await this.openDb();
    const record = await this.get<MetaRecord>(db, META_STORE, KEY_ID);
    if (record?.value) {
      return record.value as CryptoKey;
    }

    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    await this.put(db, META_STORE, { key: KEY_ID, value: key });
    return key;
  }

  private async connectionScope(connectionId: string): Promise<string> {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      this.encoder.encode(connectionId),
    );
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
  }

  private async decryptEntry(
    entry: StoredHistoryEntry,
    key: CryptoKey,
  ): Promise<LocalQueryHistoryEntry | null> {
    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(entry.iv) },
        key,
        entry.ciphertext,
      );
      const payload = JSON.parse(
        this.decoder.decode(plaintext),
      ) as EncryptedHistoryPayload;
      return {
        id: entry.id,
        connectionId: payload.connectionId,
        sql: payload.sql,
        status: entry.status,
        rowCount: entry.rowCount,
        durationMs: entry.durationMs,
        error: payload.error,
        startedAt: entry.startedAt,
      };
    } catch {
      return null;
    }
  }

  private async prune(connectionId: string): Promise<void> {
    const db = await this.openDb();
    const scope = await this.connectionScope(connectionId);
    const cutoff = Date.now() - RETENTION_MS;
    const entries = await this.getByIndex<StoredHistoryEntry>(
      db,
      HISTORY_STORE,
      'connectionScope',
      scope,
    );
    const sorted = entries.sort(
      (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
    );
    const toDelete = sorted.filter(
      (entry, index) =>
        index >= MAX_ENTRIES_PER_CONNECTION ||
        Date.parse(entry.startedAt) < cutoff,
    );
    await Promise.all(
      toDelete.map((entry) => this.delete(db, HISTORY_STORE, entry.id)),
    );
  }

  private createId(): string {
    return typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private get<T>(
    db: IDBDatabase,
    storeName: string,
    key: IDBValidKey,
  ): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const request = db
        .transaction(storeName, 'readonly')
        .objectStore(storeName)
        .get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  }

  private getByIndex<T>(
    db: IDBDatabase,
    storeName: string,
    indexName: string,
    key: IDBValidKey,
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const request = db
        .transaction(storeName, 'readonly')
        .objectStore(storeName)
        .index(indexName)
        .getAll(key);
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  }

  private put(
    db: IDBDatabase,
    storeName: string,
    value: unknown,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = db
        .transaction(storeName, 'readwrite')
        .objectStore(storeName)
        .put(value);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private delete(
    db: IDBDatabase,
    storeName: string,
    key: IDBValidKey,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = db
        .transaction(storeName, 'readwrite')
        .objectStore(storeName)
        .delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private clearStore(db: IDBDatabase, storeName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = db
        .transaction(storeName, 'readwrite')
        .objectStore(storeName)
        .clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

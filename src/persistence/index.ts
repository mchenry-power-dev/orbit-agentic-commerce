import type { AppState } from "../domain";
import { clone } from "../domain";
export interface Persistence {
  load(): Promise<AppState | undefined>;
  save(state: AppState): Promise<void>;
  clear(): Promise<void>;
}
export class MemoryPersistence implements Persistence {
  private value?: AppState;
  async load(): Promise<AppState | undefined> {
    return this.value ? clone(this.value) : undefined;
  }
  async save(state: AppState): Promise<void> {
    this.value = clone(state);
  }
  async clear(): Promise<void> {
    this.value = undefined;
  }
}
/** Browser-local whole-state adapter. The application holds a Web Lock for its editing session. */
export class IndexedDbPersistence implements Persistence {
  private database?: Promise<IDBDatabase>;
  constructor(private readonly name = "orbit-studio-public-v1") {}
  private open(): Promise<IDBDatabase> {
    if (!this.database)
      this.database = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.name, 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("state");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(request.error ?? new Error("Unable to open browser storage."));
      });
    return this.database;
  }
  async load(): Promise<AppState | undefined> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("state", "readonly");
      const request = transaction.objectStore("state").get("app");
      request.onsuccess = () => resolve(request.result as AppState | undefined);
      request.onerror = () => reject(request.error);
    });
  }
  async save(state: AppState): Promise<void> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("state", "readwrite");
      transaction.objectStore("state").put(clone(state), "app");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(
          transaction.error ?? new Error("Browser storage write interrupted."),
        );
    });
  }
  async clear(): Promise<void> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("state", "readwrite");
      transaction.objectStore("state").clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

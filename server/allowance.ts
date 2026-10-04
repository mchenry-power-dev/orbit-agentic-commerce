import { createHash } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { ServiceError } from "./errors";
export interface Allowance {
  readonly remainingCents: number;
  reserve(key: string, payloadHash: string, cents: number): Promise<void>;
}
interface Ledger {
  version: 1;
  approvalId: string;
  ceilingCents: number;
  reservedCents: number;
  operations: Record<string, { hash: string; cents: number }>;
}
export const payloadHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export class MemoryAllowance implements Allowance {
  protected ledger: Ledger;
  private queue: Promise<void> = Promise.resolve();
  constructor(ceilingCents: number, approvalId = "mock-only") {
    if (!Number.isSafeInteger(ceilingCents) || ceilingCents < 0)
      throw new ServiceError(
        "allowance-config",
        "A nonnegative integer cost allowance is required.",
        503,
      );
    this.ledger = {
      version: 1,
      approvalId,
      ceilingCents,
      reservedCents: 0,
      operations: {},
    };
  }
  get remainingCents(): number {
    return Math.max(0, this.ledger.ceilingCents - this.ledger.reservedCents);
  }
  protected persist(_ledger: Ledger): Promise<void> {
    return Promise.resolve();
  }
  reserve(key: string, hash: string, cents: number): Promise<void> {
    const reservation = this.queue.then(async () => {
      const id = payloadHash(key);
      if (this.ledger.operations[id])
        throw new ServiceError(
          this.ledger.operations[id].hash === hash
            ? "already-reserved"
            : "idempotency-conflict",
          "This operation is already reserved. A failed or unknown paid call is not automatically repeated.",
          409,
        );
      if (Object.keys(this.ledger.operations).length >= 1024)
        throw new ServiceError(
          "allowance-operation-limit",
          "This approval has reached its bounded operation ledger. Inspect costs before authorizing another runtime allowance.",
          402,
        );
      if (
        !Number.isSafeInteger(cents) ||
        cents < 1 ||
        cents > this.remainingCents
      )
        throw new ServiceError(
          "allowance-exhausted",
          "The approved server cost allowance cannot cover this operation.",
          402,
        );
      const next = structuredClone(this.ledger);
      next.reservedCents += cents;
      next.operations[id] = { hash, cents };
      await this.persist(next);
      this.ledger = next;
    });
    this.queue = reservation.catch(() => {});
    return reservation;
  }
}
/** Fail closed on an existing lock or changed approval. Reservations survive restarts and failures. */
export class FileAllowance extends MemoryAllowance {
  private constructor(
    ceiling: number,
    approvalId: string,
    private directory: string,
    private lock: FileHandle,
  ) {
    super(ceiling, approvalId);
  }
  static async open(
    directory: string,
    ceilingCents: number,
    approvalId: string,
  ): Promise<FileAllowance> {
    if (
      !Number.isSafeInteger(ceilingCents) ||
      ceilingCents < 1 ||
      ceilingCents > 100_000
    )
      throw new ServiceError(
        "allowance-config",
        "Local allowance must be an explicitly approved positive integer no greater than 100,000 cents.",
        503,
      );
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(approvalId))
      throw new ServiceError(
        "allowance-config",
        "An operator approval identifier is required.",
        503,
      );
    await mkdir(directory, { recursive: true, mode: 0o700 });
    let lock: FileHandle;
    try {
      lock = await open(join(directory, "allowance.lock"), "wx", 0o600);
    } catch {
      throw new ServiceError(
        "allowance-locked",
        "Another service or interrupted allowance lock exists. Inspect it before restarting.",
        503,
      );
    }
    const allowance = new FileAllowance(
      ceilingCents,
      approvalId,
      directory,
      lock,
    );
    try {
      const saved = JSON.parse(
        await readFile(join(directory, "allowance.json"), "utf8"),
      ) as Ledger;
      if (
        saved.version !== 1 ||
        saved.approvalId !== approvalId ||
        saved.ceilingCents !== ceilingCents ||
        !Number.isSafeInteger(saved.reservedCents) ||
        saved.reservedCents < 0 ||
        saved.reservedCents > ceilingCents ||
        !saved.operations ||
        typeof saved.operations !== "object" ||
        Object.keys(saved.operations).length > 1024 ||
        Object.values(saved.operations).some(
          (operation) =>
            !Number.isSafeInteger(operation.cents) ||
            operation.cents < 1 ||
            !/^[a-f0-9]{64}$/.test(operation.hash),
        ) ||
        Object.values(saved.operations).reduce(
          (sum, item) => sum + item.cents,
          0,
        ) !== saved.reservedCents
      )
        throw new ServiceError(
          "allowance-invalid",
          "The allowance ledger is inconsistent or does not match approval. No paid operation is permitted.",
          503,
        );
      allowance.ledger = saved;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        await allowance.persist(allowance.ledger);
      else {
        await allowance.close();
        throw error;
      }
    }
    return allowance;
  }
  protected override async persist(ledger: Ledger): Promise<void> {
    const temporary = join(this.directory, "allowance.pending");
    await writeFile(temporary, JSON.stringify(ledger), {
      mode: 0o600,
      flush: true,
    });
    await rename(temporary, join(this.directory, "allowance.json"));
  }
  async close(): Promise<void> {
    await this.lock.close();
    await unlink(join(this.directory, "allowance.lock"));
  }
}

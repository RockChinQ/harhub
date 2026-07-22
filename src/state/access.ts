import { withDatabaseStateAccessLock } from "./database.js";

let stateAccessTail: Promise<void> = Promise.resolve();

/** Serializes state read-modify-write sequences across this process and Postgres-backed replicas. */
export function serializeStateAccess<T>(action: () => Promise<T>): Promise<T> {
  const run = () => withDatabaseStateAccessLock(action);
  const result = stateAccessTail.then(run, run);
  stateAccessTail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

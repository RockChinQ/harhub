let stateAccessTail: Promise<void> = Promise.resolve();

/** Serializes state read-modify-write sequences that span related state domains. */
export function serializeStateAccess<T>(action: () => Promise<T>): Promise<T> {
  const result = stateAccessTail.then(action, action);
  stateAccessTail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

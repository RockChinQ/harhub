import { EnvHttpProxyAgent, type Dispatcher } from "undici";

type FetchInitWithDispatcher = RequestInit & {
  dispatcher?: Dispatcher;
};

let defaultProxyDispatcher: EnvHttpProxyAgent | null | undefined;

export class HarhubNetworkError extends Error {
  readonly code?: string;

  constructor(url: string | URL, error: unknown) {
    const cause = networkErrorCause(error);
    const code = networkErrorCode(cause);
    const detail = cause instanceof Error ? cause.message : String(cause);
    const origin = new URL(url).origin;
    super(
      `Network request to ${origin} failed${code ? ` (${code})` : ""}: ${detail}`,
      { cause: error }
    );
    this.name = "HarhubNetworkError";
    this.code = code;
  }
}

export async function fetchHarhub(
  url: string | URL,
  init?: RequestInit
): Promise<Response> {
  const dispatcher = getDefaultProxyDispatcher();
  const requestInit: FetchInitWithDispatcher | undefined = dispatcher
    ? { ...init, dispatcher }
    : init;

  try {
    return await fetch(url, requestInit);
  } catch (error) {
    throw new HarhubNetworkError(url, error);
  }
}

export function createEnvProxyDispatcher(
  environment: NodeJS.ProcessEnv = process.env
): EnvHttpProxyAgent | undefined {
  const httpProxy = environment.http_proxy ?? environment.HTTP_PROXY;
  const httpsProxy = environment.https_proxy ?? environment.HTTPS_PROXY;
  if (!httpProxy && !httpsProxy) return undefined;

  return new EnvHttpProxyAgent({
    httpProxy,
    httpsProxy,
    noProxy: environment.no_proxy ?? environment.NO_PROXY ?? ""
  });
}

export async function closeHarhubHttp(): Promise<void> {
  const dispatcher = defaultProxyDispatcher;
  defaultProxyDispatcher = undefined;
  if (dispatcher) await dispatcher.close();
}

function getDefaultProxyDispatcher(): EnvHttpProxyAgent | undefined {
  if (defaultProxyDispatcher === undefined) {
    defaultProxyDispatcher = createEnvProxyDispatcher() ?? null;
  }
  return defaultProxyDispatcher ?? undefined;
}

function networkErrorCause(error: unknown): unknown {
  if (error instanceof Error && error.cause !== undefined) return error.cause;
  return error;
}

function networkErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

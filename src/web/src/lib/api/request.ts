export const JSON_HEADERS = {
  "Content-Type": "application/json"
};

export class ApiRequestError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.data = data;
  }
}

export async function request<T>(
  url: string,
  init: RequestInit & { token?: string } = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.token) {
    headers.set("Authorization", `Bearer ${init.token}`);
  }

  const response = await fetch(url, {
    ...init,
    headers
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message =
      typeof data?.error === "string"
        ? data.error
        : `Request failed with ${response.status}`;
    throw new ApiRequestError(message, response.status, data);
  }

  return data as T;
}

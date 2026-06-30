import { JSON_HEADERS, request } from "./request";
import type { AuthResponse, SessionResponse } from "./types";

export async function getSession(token: string): Promise<SessionResponse> {
  return request<SessionResponse>("/api/session", { token });
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

export async function signUp(input: {
  email: string;
  name: string;
  password: string;
  workspaceName: string;
}): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/signup", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

export async function logout(token: string): Promise<void> {
  await request<void>("/api/auth/logout", {
    token,
    method: "POST"
  });
}

export async function updateAccount(
  token: string,
  input: { name?: string; email?: string }
): Promise<SessionResponse> {
  return request<SessionResponse>("/api/account", {
    token,
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

export async function changePassword(
  token: string,
  input: { currentPassword: string; newPassword: string }
): Promise<void> {
  await request<void>("/api/account/password", {
    token,
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

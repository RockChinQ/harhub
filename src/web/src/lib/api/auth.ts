import { JSON_HEADERS, request } from "./request";
import type { WorkspaceRecord } from "../../../../shared/types";
import type { AuthConfigResponse, AuthResponse, SessionResponse } from "./types";

export async function getAuthConfig(): Promise<AuthConfigResponse> {
  return request<AuthConfigResponse>("/api/auth/config");
}

export async function getSession(token: string): Promise<SessionResponse> {
  return request<SessionResponse>("/api/session", { token });
}

export async function login(input: {
  email: string;
  password: string;
  inviteToken?: string;
}): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

export async function developmentLogin(input: {
  email: string;
  inviteToken?: string;
}): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/dev-login", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

export async function requestEmailCode(input: {
  email: string;
  inviteToken?: string;
  oauthEmailVerificationToken?: string;
}): Promise<{ sent: boolean; expiresAt: string }> {
  return request<{ sent: boolean; expiresAt: string }>("/api/auth/email-code/request", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

export async function verifyEmailCode(input: {
  email: string;
  code: string;
  inviteToken?: string;
  oauthEmailVerificationToken?: string;
}): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/email-code/verify", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

export async function acceptInvitation(
  token: string,
  invitationToken: string
): Promise<SessionResponse & { workspace: WorkspaceRecord }> {
  return request<SessionResponse & { workspace: WorkspaceRecord }>("/api/invitations/accept", {
    token,
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ token: invitationToken })
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

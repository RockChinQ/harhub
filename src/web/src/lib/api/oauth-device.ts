import type { OAuthDeviceAuthorizationSummary } from "../../../../shared/oauth";
import { JSON_HEADERS, request } from "./request";

export async function getOAuthDeviceAuthorization(
  token: string,
  userCode: string
): Promise<OAuthDeviceAuthorizationSummary> {
  return request<OAuthDeviceAuthorizationSummary>(
    `/api/oauth/device/authorization?user_code=${encodeURIComponent(userCode)}`,
    { token }
  );
}

export async function decideOAuthDeviceAuthorization(
  token: string,
  input: { userCode: string; action: "approve" | "deny" }
): Promise<OAuthDeviceAuthorizationSummary> {
  return request<OAuthDeviceAuthorizationSummary>("/api/oauth/device/authorization", {
    token,
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

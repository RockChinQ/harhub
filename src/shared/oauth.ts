export const HARHUB_CLI_CLIENT_ID = "harhub-cli";
export const HARHUB_CLI_SCOPE = "harhub:cli";
export const OAUTH_DEVICE_GRANT_TYPE =
  "urn:ietf:params:oauth:grant-type:device_code";

export interface OAuthDeviceAuthorizationResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export interface OAuthDeviceTokenResponse {
  access_token: string;
  token_type: "Bearer";
  scope: string;
}

export type OAuthDeviceTokenErrorCode =
  | "authorization_pending"
  | "slow_down"
  | "access_denied"
  | "expired_token"
  | "invalid_client"
  | "invalid_grant"
  | "invalid_request"
  | "invalid_scope"
  | "unsupported_grant_type";

export interface OAuthDeviceTokenError {
  error: OAuthDeviceTokenErrorCode;
  error_description?: string;
}

export interface OAuthDeviceAuthorizationSummary {
  clientId: string;
  scope: string;
  userCode: string;
  status: "pending" | "approved" | "denied";
  expiresAt: string;
}

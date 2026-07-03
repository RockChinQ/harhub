import { EMAIL_FROM, RESEND_API_KEY } from "../config.js";

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(RESEND_API_KEY && EMAIL_FROM);
}

export async function sendLoginCodeEmail(input: {
  email: string;
  code: string;
}): Promise<void> {
  await sendEmail({
    to: input.email,
    subject: "Your Harhub sign-in code",
    text: `Your Harhub sign-in code is ${input.code}. It expires in 10 minutes.`,
    html: `<p>Your Harhub sign-in code is <strong>${input.code}</strong>.</p><p>It expires in 10 minutes.</p>`
  });
}

export async function sendWorkspaceInvitationEmail(input: {
  email: string;
  workspaceName: string;
  inviterName: string;
  acceptUrl: string;
}): Promise<void> {
  await sendEmail({
    to: input.email,
    subject: `Join ${input.workspaceName} on Harhub`,
    text:
      `${input.inviterName} invited you to ${input.workspaceName} on Harhub.\n\n` +
      `Accept the invitation: ${input.acceptUrl}\n\n` +
      "This invitation expires in 7 days.",
    html:
      `<p>${escapeHtml(input.inviterName)} invited you to <strong>${escapeHtml(input.workspaceName)}</strong> on Harhub.</p>` +
      `<p><a href="${escapeAttribute(input.acceptUrl)}">Accept the invitation</a></p>` +
      "<p>This invitation expires in 7 days.</p>"
  });
}

async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  if (!RESEND_API_KEY) {
    throw new Error("Email delivery is not configured. Set RESEND_API_KEY.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => undefined);
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : `Resend email failed with ${response.status}`
    );
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

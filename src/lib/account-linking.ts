/** Client-side helpers for connecting sign-in methods in Settings. */
export const PENDING_LINK_KEY = "admin.pendingIdentityLink";

export interface PendingLink {
  provider: string;
  userId: string;
  email: string;
}

export type LinkFailure = "load" | "provider" | "different_account" | "not_linked" | "unlink";

/** Plain-language message for a failed connect/disconnect. Never returns raw codes alone. */
export function linkErrorMessage(kind: LinkFailure, detail: string, provider = "That method", expectedEmail = ""): string {
  const raw = detail.toLowerCase();
  if (raw.includes("manual_linking_disabled") || raw.includes("manual linking is disabled")) {
    return kind === "unlink"
      ? "Disconnecting sign-in methods isn't turned on for this portal yet, so nothing was removed."
      : `${provider} couldn't be connected directly. Use an account with the same email${expectedEmail ? ` (${expectedEmail})` : ""}.`;
  }
  switch (kind) {
    case "load":
      return `Couldn't load your sign-in methods: ${detail}`;
    case "different_account":
      return `${provider} signed in as ${detail || "a different email"}, not ${expectedEmail || "this account"}, so it wasn't connected. Sign in again with your admin account, then connect a ${provider} account that uses the same email.`;
    case "not_linked":
      return `${provider} wasn't connected. Make sure that ${provider} account uses ${expectedEmail || "the same email"} and try again.`;
    case "unlink":
      return `Couldn't disconnect: ${detail}`;
    default:
      if (raw.includes("popup") || raw.includes("cancel") || raw.includes("closed")) return `${provider} sign-in was cancelled. Nothing changed.`;
      return `Couldn't connect ${provider}: ${detail || "unknown error"}. Nothing changed.`;
  }
}

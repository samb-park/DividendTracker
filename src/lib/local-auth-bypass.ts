const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLocalAuthBypassEnabled() {
  return process.env.DIVIDENDTRACKER_LOCAL_AUTH_BYPASS === "true";
}

export function normalizeHostHeader(host: string | null | undefined) {
  if (!host) return "";
  const firstHost = host.split(",")[0]?.trim().toLowerCase() ?? "";

  if (firstHost.startsWith("[")) {
    const end = firstHost.indexOf("]");
    return end >= 0 ? firstHost.slice(0, end + 1) : firstHost;
  }

  return firstHost.split(":")[0] ?? "";
}

export function isLocalhostHost(host: string | null | undefined) {
  return LOOPBACK_HOSTS.has(normalizeHostHeader(host));
}

export function shouldUseLocalAuthBypass(host: string | null | undefined) {
  return isLocalAuthBypassEnabled() && isLocalhostHost(host);
}

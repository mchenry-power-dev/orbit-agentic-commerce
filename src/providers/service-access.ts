/** The published static application never connects to a service, even if a
 * service URL was accidentally supplied at build time. The optional service
 * remains available only from the documented local development workflow. */
export function localDevelopmentServiceUrl(
  configuredUrl: string | undefined,
  development: boolean,
  hostname: string,
): string | undefined {
  if (!development || !["localhost", "127.0.0.1"].includes(hostname))
    return undefined;
  return configuredUrl?.trim() || undefined;
}

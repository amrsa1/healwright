/**
 * Provider SDKs are optional peer dependencies: a project installs the one it
 * uses. Each is imported on its provider's first call, so the rest never load,
 * and a missing one fails with the command that fixes it.
 */
export async function loadSdk<T>(pkg: string, provider: string, importer: () => Promise<T>): Promise<T> {
  try {
    return await importer();
  } catch (err: any) {
    const code = err?.code;
    const missing = (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND")
      && String(err?.message ?? "").includes(`'${pkg}'`);
    if (missing) {
      throw new Error(
        `healwright: the ${provider} provider needs the "${pkg}" package. Install it with: npm install ${pkg}`,
        { cause: err },
      );
    }
    throw err;
  }
}

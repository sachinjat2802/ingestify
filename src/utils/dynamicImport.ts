/**
 * Dynamically import a module by name.
 * Uses Function constructor to prevent TypeScript from statically analyzing
 * the import and requiring type declarations at DTS build time.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dynamicImport(moduleName: string): Promise<any> {
  try {
    return await new Function('m', 'return import(m)')(moduleName);
  } catch {
    return null;
  }
}

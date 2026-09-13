/** Replaced by Vite at build time; the installed app needs no network lookup. */
declare const __VERSO_BUILD_METADATA__: unknown;

export interface BuildMetadata {
  version: string;
  revision: string;
  sourceDate: string;
  modified: boolean;
}

export function validateBuildMetadata(value: unknown): BuildMetadata {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    version:
      typeof raw.version === 'string' && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(raw.version)
        ? raw.version
        : '0.1.0',
    revision:
      typeof raw.revision === 'string' && /^[a-f0-9]{7,40}$/.test(raw.revision)
        ? raw.revision
        : 'unversioned',
    sourceDate:
      typeof raw.sourceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.sourceDate)
        ? raw.sourceDate
        : '',
    modified: raw.modified === true,
  };
}

export const BUILD_METADATA = validateBuildMetadata(
  typeof __VERSO_BUILD_METADATA__ === 'undefined' ? undefined : __VERSO_BUILD_METADATA__,
);

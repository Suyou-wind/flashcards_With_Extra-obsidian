export interface SyncScopeSettings {
  includedFolders: string[];
  excludedFolders: string[];
  excludedNotes: string[];
}

export type ScopeExclusion =
  | { kind: "note"; path: string }
  | { kind: "folder"; path: string }
  | { kind: "outside-includes" };

export function mergeSyncScope(value: unknown): SyncScopeSettings {
  const candidate = (
    value && typeof value === "object" ? value : {}
  ) as Partial<SyncScopeSettings>;
  const paths = (items: unknown): string[] => {
    if (!Array.isArray(items)) return [];
    return [
      ...new Set(
        items
          .filter((item): item is string => typeof item === "string")
          .map((path) => path.replace(/\/+$/, ""))
          .filter(
            (path) =>
              path.length > 0 &&
              !path.startsWith("/") &&
              !path
                .split("/")
                .some((part) => part === "" || part === "." || part === ".."),
          ),
      ),
    ];
  };
  return {
    includedFolders: paths(candidate.includedFolders),
    excludedFolders: paths(candidate.excludedFolders),
    excludedNotes: paths(candidate.excludedNotes),
  };
}

export function scopeExclusion(
  path: string,
  scope?: SyncScopeSettings,
): ScopeExclusion | undefined {
  if (!scope) return undefined;
  if (scope.excludedNotes.includes(path)) return { kind: "note", path };
  let folder: string | undefined;
  for (const parent of scope.excludedFolders) {
    if (
      path.startsWith(`${parent}/`) &&
      parent.length > (folder?.length ?? -1)
    ) {
      folder = parent;
    }
  }
  if (folder !== undefined) return { kind: "folder", path: folder };
  if (
    scope.includedFolders.length &&
    !scope.includedFolders.some((parent) => path.startsWith(`${parent}/`))
  ) {
    return { kind: "outside-includes" };
  }
  return undefined;
}

/** Rewrite explicit rules; inherited exclusions remain attached to their folder. */
export function renameSyncScope(
  scope: SyncScopeSettings,
  oldPath: string,
  newPath: string,
): SyncScopeSettings {
  const rewrite = (paths: string[]): string[] => [
    ...new Set(
      paths.map((path) =>
        path === oldPath
          ? newPath
          : path.startsWith(`${oldPath}/`)
            ? newPath + path.slice(oldPath.length)
            : path,
      ),
    ),
  ];
  return {
    includedFolders: rewrite(scope.includedFolders),
    excludedFolders: rewrite(scope.excludedFolders),
    excludedNotes: rewrite(scope.excludedNotes),
  };
}

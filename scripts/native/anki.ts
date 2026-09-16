export type AnkiCall = <T>(
  action: string,
  params?: Record<string, unknown>,
) => Promise<T>;

export function createAnkiCall(endpoint: string, key?: string): AnkiCall {
  return async <T>(
    action: string,
    params: Record<string, unknown> = {},
  ): Promise<T> => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        version: 6,
        params,
        ...(key ? { key } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`AnkiConnect HTTP ${response.status}`);
    const envelope = (await response.json()) as { result?: T; error?: unknown };
    if (envelope.error !== null || !("result" in envelope)) {
      throw new Error(
        `AnkiConnect ${action}: ${String(envelope.error ?? "invalid response")}`,
      );
    }
    return envelope.result as T;
  };
}

export async function requireProfile(
  call: AnkiCall,
  expected: string,
): Promise<void> {
  if (!expected.trim())
    throw new Error("An explicit Anki test profile is required.");
  const active = await call<string>("getActiveProfile");
  if (active !== expected)
    throw new Error(
      `Anki profile mismatch: expected ${JSON.stringify(expected)}, active ${JSON.stringify(active)}. No test mutation allowed.`,
    );
}

interface OwnedNote {
  noteId: number;
  tags: string[];
}

/** Delete only IDs created by this run and still carrying its unique tag. */
export async function removeOwnedNotes(
  call: AnkiCall,
  profile: string,
  tag: string,
  ids: number[],
): Promise<void> {
  await requireProfile(call, profile);
  if (!/^native_scope_[a-f0-9]{32}$/.test(tag))
    throw new Error("Invalid native-test ownership tag.");
  if (!ids.every((id) => Number.isSafeInteger(id) && id > 0))
    throw new Error("Invalid test note IDs.");
  if (!ids.length) return;
  const notes = await call<OwnedNote[]>("notesInfo", { notes: ids });
  if (
    notes.length !== ids.length ||
    notes.some(
      (note) => !ids.includes(note.noteId) || !note.tags?.includes(tag),
    )
  ) {
    throw new Error(
      "Cleanup refused: test-note ownership could not be verified.",
    );
  }
  await requireProfile(call, profile);
  await call("deleteNotes", { notes: ids });
}

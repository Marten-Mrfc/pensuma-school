/**
 * Deleting a question in the builder without losing edits:
 * 1. save the question's pending draft (so no autosave of a deleted
 *    question can run after the delete, and nothing is lost when the
 *    delete is refused);
 * 2. delete it on the server;
 * 3. only then forget the local draft.
 * When the server refuses (e.g. a retention hold), the error propagates
 * (ConfirmDialog shows it) and the draft is kept.
 */
export async function deleteQuestionKeepingEdits(steps: {
  saveDraft: () => Promise<unknown>;
  deleteOnServer: () => Promise<unknown>;
  discardDraft: () => void;
}): Promise<void> {
  await steps.saveDraft();
  await steps.deleteOnServer();
  steps.discardDraft();
}

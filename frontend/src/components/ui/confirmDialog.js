/**
 * Tiny wrapper around native confirm — keeps the call site honest and testable.
 * Returns true if the user confirmed, false otherwise.
 */
export function confirmAction(message) {
  return window.confirm(message);
}

/**
 * Two-step destructive action: shows a confirm, then calls the mutation.
 * Usage:
 *   onClick={() => withConfirm("Delete this note? It cannot be undone.", () => deleteNote.mutate(id))}
 */
export function withConfirm(message, onConfirm) {
  return () => {
    if (confirmAction(message)) onConfirm();
  };
}
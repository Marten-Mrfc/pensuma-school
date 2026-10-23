import { claimLocalData } from "@/lib/local-data";

/**
 * After a successful sign-in: make this browser's Pensuma data belong to the
 * new user, then do a full navigation to `target`. On a shared school
 * computer this clears what the previous user left (practice code, answer
 * backups) before the next page can read it, also when that user closed the
 * browser instead of signing out.
 */
export function completeSignIn(
  userId: string,
  target: string,
  navigate: (url: string) => void = (url) => window.location.assign(url),
): void {
  claimLocalData(userId);
  navigate(target);
}

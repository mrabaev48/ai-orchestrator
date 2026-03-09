export interface ReviewResult {
  approved: boolean;
  blockingIssues: string[];
  nonBlockingSuggestions: string[];
  missingTests: string[];
  notes: string[];
}

export function isApproved(result: ReviewResult): boolean {
  return result.approved && result.blockingIssues.length === 0;
}

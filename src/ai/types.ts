/**
 * AI provider types and interfaces
 */

export interface AdCopyResult {
  headline: string;
  primaryText: string;
}

export interface GenerateAdCopyOptions {
  prompt: string;
  additionalContext?: string;
}

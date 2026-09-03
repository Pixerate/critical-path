export interface MentionSegment {
  type: 'text' | 'mention';
  value: string;
  handle?: string;
}

/**
 * Regex matching mentions:
 * - Quoted mentions: @"Jane Doe"
 * - Standard mentions: @jane_doe, @planner, @user-1, @john.smith
 * Note: Does not match emails like foo@bar.com (requires word boundary or start of string before @).
 */
export const MENTION_REGEX = /(?:^|\s)@(?:"([^"]+)"|([a-zA-Z0-9_.-]+))/g;

/**
 * Extracts unique mention handles from a text string.
 * Strips quotes and the leading '@' symbol.
 * Preserves the order of their first appearance.
 */
export function extractMentions(content: string): string[] {
  if (!content || typeof content !== 'string') return [];

  const mentions: string[] = [];
  const seen = new Set<string>();

  // Reset regex lastIndex
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const handle = match[1] ?? match[2];
    if (handle && !seen.has(handle)) {
      seen.add(handle);
      mentions.push(handle);
    }
  }

  return mentions;
}

/**
 * Segments a text string into plain text parts and mention tokens.
 * Useful for rendering highlighted mention badges or links in UI components.
 */
export function parseMentionSegments(content: string): MentionSegment[] {
  if (!content) return [];

  const segments: MentionSegment[] = [];
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const fullMatch = match[0];
    const leadingWhitespace = fullMatch.startsWith(' ') || fullMatch.startsWith('\t') || fullMatch.startsWith('\n')
      ? fullMatch[0]
      : '';
    const mentionToken = fullMatch.slice(leadingWhitespace.length);
    const handle = match[1] ?? match[2];
    const matchStart = match.index + leadingWhitespace.length;

    // Push text before this mention if any
    if (matchStart > lastIndex) {
      segments.push({
        type: 'text',
        value: content.slice(lastIndex, matchStart)
      });
    }

    // Push the mention token
    segments.push({
      type: 'mention',
      value: mentionToken,
      handle
    });

    lastIndex = match.index + fullMatch.length;
  }

  // Push any remaining text after the last match
  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      value: content.slice(lastIndex)
    });
  }

  return segments;
}

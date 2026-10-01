export interface MentionSegment {
  type: 'text' | 'mention';
  value: string;
  handle?: string;
}

/**
 * Regex matching mentions:
 * - Quoted mentions: @"Jane Doe", &quot;Jane Doe&quot;
 * - Standard handles: @planner, @user-1, @john.smith
 * Unquoted handles exclude trailing punctuation (e.g. @turquoise. matches handle "turquoise" without the dot).
 */
export const MENTION_REGEX =
  /(?:^|[\s>(*_"';\\/[\]{}~`:]|&quot;|&gt;|&lt;|&amp;)@(?:"([^"]+)"|&quot;([^&]+)&quot;|([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*))/g;

/**
 * Strips code blocks and inline code from markdown or HTML content:
 * - Fenced code blocks: ```...``` and ~~~...~~~
 * - Inline backtick code: `...`
 * - HTML code/pre tags: <pre>...</pre>, <code>...</code>
 * Used to avoid false-positive mention parsing within code snippets, terminal logs, or stack traces.
 */
export function stripMarkdownCode(content: string): string {
  if (!content || typeof content !== 'string') return '';
  return content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
    .replace(/<pre[\s\S]*?<\/pre>/gi, '')
    .replace(/<code[\s\S]*?<\/code>/gi, '')
    .replace(/`[^`\n]*`/g, '');
}

/**
 * Extracts unique mention handles from a text string, ignoring trailing punctuation,
 * code blocks or inline code snippets, URLs, markdown link destinations, and pre-existing HTML mention nodes.
 * Preserves the order of their first appearance.
 */
export function extractMentions(content: string): string[] {
  if (!content || typeof content !== 'string') return [];

  // Normalize rich text mention nodes (e.g. from TipTap or custom mention spans)
  const normalizedMentionNodes = content.replace(
    /<span\b[^>]*\b(?:data-type=["']mention["']|class=["'][^"']*pixerate-mention-node[^"']*["'])[^>]*>([\s\S]*?)<\/span>/gi,
    (match, inner) => {
      const labelMatch = match.match(/\bdata-label=["']([^"']+)["']/i);
      if (labelMatch) {
        const val = labelMatch[1].trim();
        return val.includes(' ') ? ` @"${val}" ` : ` @${val} `;
      }
      const idMatch = match.match(/\bdata-id=["']([^"']+)["']/i);
      if (idMatch) {
        const val = idMatch[1].trim();
        return val.includes(' ') ? ` @"${val}" ` : ` @${val} `;
      }
      return ` ${inner} `;
    }
  );

  const cleanContent = stripMarkdownCode(normalizedMentionNodes);
  // Strip URLs and markdown link destinations so @package or @handles in URLs are not extracted as mentions
  const withoutUrls = cleanContent
    .replace(/(?:https?|ftp|file):\/\/[^\s<>()]+/gi, '')
    .replace(/\]\([^)]*\)/g, ']');
  // Strip remaining HTML tags
  const textOnly = withoutUrls.replace(/<[^>]+>/g, ' ');

  const mentions: string[] = [];
  const seen = new Set<string>();

  const regex = new RegExp(MENTION_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(textOnly)) !== null) {
    const handle = (match[1] ?? match[2] ?? match[3] ?? '').trim();
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
    const atIndex = fullMatch.indexOf('@');
    const prefix = atIndex > 0 ? fullMatch.slice(0, atIndex) : '';
    const mentionToken = fullMatch.slice(atIndex);
    const handle = match[1] ?? match[2] ?? match[3];
    const matchStart = match.index + prefix.length;

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

    lastIndex = matchStart + mentionToken.length;
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

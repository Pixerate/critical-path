import { describe, it, expect } from 'vitest';
import { extractMentions, parseMentionSegments, stripMarkdownCode } from './mentions.js';

describe('mentions utility', () => {
  describe('extractMentions', () => {
    it('returns empty array for empty or non-string input', () => {
      expect(extractMentions('')).toEqual([]);
      expect(extractMentions(null as any)).toEqual([]);
      expect(extractMentions(undefined as any)).toEqual([]);
    });

    it('extracts single mention', () => {
      expect(extractMentions('Hello @planner, please review.')).toEqual(['planner']);
    });

    it('extracts multiple mentions and deduplicates them', () => {
      const text = 'Hey @jane and @planner, can @jane check with @coordinator?';
      expect(extractMentions(text)).toEqual(['jane', 'planner', 'coordinator']);
    });

    it('supports quoted handles with spaces', () => {
      const text = 'Assigning to @"Agent Planner" and @"Jane Doe"';
      expect(extractMentions(text)).toEqual(['Agent Planner', 'Jane Doe']);
    });

    it('ignores email addresses without leading space or boundary', () => {
      const text = 'Send mail to user@example.com or ping @alex';
      expect(extractMentions(text)).toEqual(['alex']);
    });

    it('handles mentions with dashes, underscores, and periods', () => {
      const text = 'Call @agent-1, @super_user, and @john.doe';
      expect(extractMentions(text)).toEqual(['agent-1', 'super_user', 'john.doe']);
    });

    it('correctly ignores trailing punctuation such as periods, commas, and exclamation marks', () => {
      const text = 'Check with @turquoise. Then ping @john.doe! Also ask @coordinator, and @"Jane Doe".';
      expect(extractMentions(text)).toEqual(['turquoise', 'john.doe', 'coordinator', 'Jane Doe']);
    });

    it('suppresses mentions inside fenced code blocks and inline backticks (UCH-128, UCH-138)', () => {
      const markdown = `
Hey @alice, please review this test output:
\`\`\`ts
import { describe } from '@vitest/runner';
// mention in code comment: @bob
const handler = () => '@charlie';
\`\`\`
Also do not match \`@david\` in inline backticks or ~~~@eva~~~ in tilde fences.
Only real mentions like @frank should match.
      `;
      expect(extractMentions(markdown)).toEqual(['alice', 'frank']);
    });

    it('suppresses mentions inside HTML <pre> and <code> blocks', () => {
      const html = 'Hello @alice! Check <pre>npm i @types/node</pre> and <code>@bob</code>. Thanks @charlie!';
      expect(extractMentions(html)).toEqual(['alice', 'charlie']);
    });

    it('suppresses handles inside URLs and markdown link destinations', () => {
      const text = 'Visit https://github.com/@org/repo and [profile](https://example.com/@jack) then ping @jack';
      expect(extractMentions(text)).toEqual(['jack']);
    });

    it('preserves rich text HTML mention nodes while ignoring attributes', () => {
      const html = '<p>Assigned to <span data-type="mention" data-label="Jane Doe" data-mention-suggestion-char="@">@Jane Doe</span> and ping @coordinator</p>';
      expect(extractMentions(html)).toEqual(['Jane Doe', 'coordinator']);
    });
  });

  describe('stripMarkdownCode', () => {
    it('strips code blocks, tilde blocks, inline backticks, pre and code tags', () => {
      const raw = 'Before ```code @foo``` and `inline @bar` and <pre>pre @baz</pre> and <code>c @qux</code> after @real';
      expect(stripMarkdownCode(raw)).toBe('Before  and  and  and  after @real');
    });
  });

  describe('parseMentionSegments', () => {
    it('returns empty array for empty string', () => {
      expect(parseMentionSegments('')).toEqual([]);
    });

    it('returns single text segment if no mentions', () => {
      expect(parseMentionSegments('Just a normal comment without tags.')).toEqual([
        { type: 'text', value: 'Just a normal comment without tags.' }
      ]);
    });

    it('correctly segments text with single mention in the middle', () => {
      const result = parseMentionSegments('Hello @planner, please check.');
      expect(result).toEqual([
        { type: 'text', value: 'Hello ' },
        { type: 'mention', value: '@planner', handle: 'planner' },
        { type: 'text', value: ', please check.' }
      ]);
    });

    it('correctly segments mention with trailing period', () => {
      const result = parseMentionSegments('Hello @turquoise.');
      expect(result).toEqual([
        { type: 'text', value: 'Hello ' },
        { type: 'mention', value: '@turquoise', handle: 'turquoise' },
        { type: 'text', value: '.' }
      ]);
    });

    it('correctly segments text starting with a mention', () => {
      const result = parseMentionSegments('@planner can you take a look?');
      expect(result).toEqual([
        { type: 'mention', value: '@planner', handle: 'planner' },
        { type: 'text', value: ' can you take a look?' }
      ]);
    });

    it('correctly segments text ending with a mention', () => {
      const result = parseMentionSegments('Assigned to @coordinator');
      expect(result).toEqual([
        { type: 'text', value: 'Assigned to ' },
        { type: 'mention', value: '@coordinator', handle: 'coordinator' }
      ]);
    });

    it('correctly segments quoted mentions', () => {
      const result = parseMentionSegments('Ping @"Agent Supervisor" ASAP');
      expect(result).toEqual([
        { type: 'text', value: 'Ping ' },
        { type: 'mention', value: '@"Agent Supervisor"', handle: 'Agent Supervisor' },
        { type: 'text', value: ' ASAP' }
      ]);
    });
  });
});

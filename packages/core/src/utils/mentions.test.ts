import { describe, it, expect } from 'vitest';
import { extractMentions, parseMentionSegments } from './mentions.js';

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

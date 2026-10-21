#!/usr/bin/env node
// Tool-selection eval: does a model pick the right Critical Path tool for each request, given only
// the tool descriptions and the server instructions? Run after changing tool names, descriptions
// or skills, and compare the score with the previous run.
//
//   pnpm --filter @critical-path/mcp build && pnpm --filter @critical-path/mcp eval:tools
//
// Needs Anthropic credentials (ANTHROPIC_API_KEY or an `ant auth login` profile) and calls the
// API once per case. EVAL_MODEL overrides the model.
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { ALL_TOOLS, buildAgentInstructions } from '../dist/index.js';

const model = process.env.EVAL_MODEL ?? 'claude-opus-5-5';
const cases = JSON.parse(readFileSync(new URL('./tool-selection.cases.json', import.meta.url), 'utf8'));
const client = new Anthropic();

const tools = ALL_TOOLS.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema }));
const system = `${buildAgentInstructions(ALL_TOOLS)}\n\nYou are a project management assistant. Answer each request by calling a tool; ids mentioned by the user are real.`;

async function pick(prompt) {
  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    output_config: { effort: 'low' },
    system,
    tools,
    tool_choice: { type: 'auto', disable_parallel_tool_use: true },
    messages: [{ role: 'user', content: prompt }]
  });
  if (response.stop_reason === 'refusal') return '(refusal)';
  const call = response.content.find((block) => block.type === 'tool_use');
  return call ? call.name : '(no tool)';
}

let passed = 0;
for (const testCase of cases) {
  let chosen;
  try {
    chosen = await pick(testCase.prompt);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error('No valid Anthropic credentials. Set ANTHROPIC_API_KEY or run `ant auth login`.');
      process.exit(1);
    }
    chosen = `(error: ${err.message})`;
  }
  const ok = testCase.expect.includes(chosen);
  if (ok) passed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${chosen.padEnd(36)} ${testCase.prompt}${ok ? '' : `  (expected ${testCase.expect.join(' | ')})`}`);
}
console.log(`\n${passed}/${cases.length} correct with ${model}`);
process.exit(passed === cases.length ? 0 : 1);

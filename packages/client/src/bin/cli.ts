#!/usr/bin/env node
import { CriticalPathClient } from '../index.js';

interface CliContext {
  apiUrl?: string;
  apiKey?: string;
  taskId?: string;
  projectId?: string;
}

function parseCliArgs(args: string[]) {
  const flags: Record<string, string | boolean | string[]> = {};
  const positionals: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (key === 'help' || key === 'disengaged') {
        flags[key] = true;
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        const val = args[++i];
        if (key === 'question') {
          if (!Array.isArray(flags.question)) flags.question = [];
          (flags.question as string[]).push(val);
        } else {
          flags[key] = val;
        }
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      if (key === 'h') {
        flags.help = true;
      } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[key] = args[++i];
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(arg);
    }
  }

  return { flags, positionals };
}

function getContext(flags: Record<string, any>): {
  client: CriticalPathClient;
  taskId?: string;
  projectId?: string;
  authorId: string;
} {
  const apiUrl = (flags.api as string) || process.env.CRITICAL_PATH_API;
  const apiKey = (flags.key as string) || process.env.CRITICAL_PATH_KEY;
  const taskId = (flags.task as string) || process.env.CRITICAL_PATH_TASK_ID;
  const projectId = (flags.project as string) || process.env.CRITICAL_PATH_PROJECT_ID;
  const authorId = (flags.author as string) || process.env.CRITICAL_PATH_AUTHOR_ID || 'agent';

  if (!apiUrl) {
    console.error('[critical-path] Error: Base API URL is required. Provide --api or set CRITICAL_PATH_API.');
    process.exit(1);
  }

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const client = new CriticalPathClient({ baseUrl: apiUrl, headers });
  return { client, taskId, projectId, authorId };
}

function printHelp() {
  console.log(`
Critical Path Agent CLI

Usage:
  critical-path <command> [options]

Commands:
  status <message>                       Update live execution activity / status
  block --reason <reason> [--pr <url>]   Mark current task as blocked with explanation
  clarify --reason <reason> [--question <q>...] Post clarification request on task
  propose --title <title> [--description <desc>] Stage follow-up draft task on board
  deliverable --title <title> --url <url> Record output artifact or PR link
  comment <content>                      Post progress comment to task

Options:
  --task <id>       Target task ID (defaults to CRITICAL_PATH_TASK_ID)
  --project <id>    Target project ID (defaults to CRITICAL_PATH_PROJECT_ID)
  --api <url>       Critical Path API base URL (defaults to CRITICAL_PATH_API)
  --key <key>       API Bearer token (defaults to CRITICAL_PATH_KEY)
  --help, -h        Display this help message
`);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { flags, positionals } = parseCliArgs(argv);
  const command = positionals[0];

  if (!command || flags.help || command === 'help') {
    printHelp();
    return;
  }

  switch (command) {
    case 'status': {
      const statusMessage = positionals[1] || (flags.message as string);
      if (!statusMessage) {
        console.error('[critical-path] Error: Status message is required. Example: critical-path status "Running unit tests"');
        process.exit(1);
      }
      const { client, taskId, projectId } = getContext(flags);
      const isEngaged = !flags.disengaged;
      const details = flags.details as string | undefined;

      await client.updateStatus(statusMessage, {
        taskId,
        projectId,
        details,
        isEngaged
      });
      console.log(`[critical-path] Status updated: "${statusMessage}"`);
      break;
    }

    case 'block': {
      const reason = (flags.reason as string) || positionals[1];
      if (!reason) {
        console.error('[critical-path] Error: --reason is required when marking task blocked.');
        process.exit(1);
      }
      const { client, taskId } = getContext(flags);
      if (!taskId) {
        console.error('[critical-path] Error: Task ID is required (--task or CRITICAL_PATH_TASK_ID).');
        process.exit(1);
      }
      const prUrl = flags.pr as string | undefined;

      let commentContent = `Task marked as blocked: ${reason}`;
      if (prUrl) {
        commentContent += `\n\nPull Request: ${prUrl}`;
      }

      await client.addComment({
        taskId,
        authorId: getContext(flags).authorId,
        content: commentContent,
        authorType: 'agent'
      });

      await client.updateTask(taskId, {
        isBlocked: true,
        customFields: {
          blockerReason: reason,
          ...(prUrl ? { prUrl } : {})
        }
      });

      await client.updateStatus(`Blocked: ${reason}`, {
        taskId,
        isEngaged: false
      });

      console.log(`[critical-path] Task ${taskId} marked as blocked: "${reason}"`);
      break;
    }

    case 'clarify': {
      const reason = (flags.reason as string) || positionals[1];
      if (!reason) {
        console.error('[critical-path] Error: --reason is required when requesting clarification.');
        process.exit(1);
      }
      const { client, taskId, authorId } = getContext(flags);
      if (!taskId) {
        console.error('[critical-path] Error: Task ID is required (--task or CRITICAL_PATH_TASK_ID).');
        process.exit(1);
      }

      const questions = Array.isArray(flags.question)
        ? (flags.question as string[])
        : flags.question
          ? [flags.question as string]
          : [];

      let content = `### Clarification Needed\n\n**Reason:** ${reason}`;
      if (questions.length > 0) {
        content += `\n\n**Questions:**\n` + questions.map((q) => `- ${q}`).join('\n');
      }

      await client.addComment({
        taskId,
        authorId,
        content,
        authorType: 'agent'
      });

      await client.updateTask(taskId, {
        isBlocked: true,
        customFields: {
          needsClarification: true,
          clarificationReason: reason
        }
      });

      await client.updateStatus('Awaiting clarification', {
        taskId,
        isEngaged: false
      });

      console.log(`[critical-path] Clarification request posted on task ${taskId}.`);
      break;
    }

    case 'propose': {
      const title = (flags.title as string) || positionals[1];
      if (!title) {
        console.error('[critical-path] Error: --title is required when proposing follow-up task.');
        process.exit(1);
      }
      const description = (flags.description as string) || '';
      const { client, taskId, projectId } = getContext(flags);

      if (!projectId) {
        console.error('[critical-path] Error: Project ID is required (--project or CRITICAL_PATH_PROJECT_ID).');
        process.exit(1);
      }

      const created = await client.createTask({
        projectId,
        title,
        description,
        status: 'draft' as any,
        priority: (flags.priority as any) || 'medium',
        parentId: (flags.parent as string) || taskId,
        customFields: {
          proposedByAgent: true
        }
      });

      console.log(`[critical-path] Created draft proposal "${title}" (ID: ${created.id})`);
      break;
    }

    case 'deliverable': {
      const title = (flags.title as string) || positionals[1];
      const url = (flags.url as string) || (flags.pr as string);
      if (!title || !url) {
        console.error('[critical-path] Error: Both --title and --url are required for deliverable.');
        process.exit(1);
      }
      const { client, taskId, projectId, authorId } = getContext(flags);

      if (projectId) {
        try {
          await client.createDeliverable({
            projectId,
            title,
            status: 'delivered',
            outputUrls: [url]
          });
        } catch {
          // If deliverables entity is not supported by backend store, fallback to task metadata
        }
      }

      if (taskId) {
        await client.addComment({
          taskId,
          authorId,
          content: `Deliverable recorded: [${title}](${url})`,
          authorType: 'agent'
        });
        await client.updateTask(taskId, {
          customFields: {
            deliverableUrl: url,
            deliverableTitle: title
          }
        });
      }

      console.log(`[critical-path] Recorded deliverable "${title}" (${url})`);
      break;
    }

    case 'comment': {
      const content = positionals.slice(1).join(' ') || (flags.content as string) || (flags.message as string);
      if (!content) {
        console.error('[critical-path] Error: Comment content is required.');
        process.exit(1);
      }
      const { client, taskId, authorId } = getContext(flags);
      if (!taskId) {
        console.error('[critical-path] Error: Task ID is required (--task or CRITICAL_PATH_TASK_ID).');
        process.exit(1);
      }

      await client.addComment({
        taskId,
        authorId,
        content,
        authorType: 'agent'
      });
      console.log(`[critical-path] Added comment to task ${taskId}.`);
      break;
    }

    default:
      console.error(`[critical-path] Unknown command: "${command}". Run "critical-path --help" for usage.`);
      process.exit(1);
  }
}

// Only invoke main when executed directly as CLI script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[critical-path] Execution error:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

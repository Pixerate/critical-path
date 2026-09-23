#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { CriticalPathClient, type TaskTodoItem } from '../index.js';

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
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        if (flags[key]) {
          if (Array.isArray(flags[key])) {
            (flags[key] as string[]).push(nextArg);
          } else {
            flags[key] = [flags[key] as string, nextArg];
          }
        } else {
          flags[key] = nextArg;
        }
        i++;
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      flags[key] = true;
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
  subtask <title> [--description <desc>] Create active child subtask under task
  subtask list                           List subtasks under current or specified task
  checklist add <title>                  Add a checklist item to current task
  checklist check <item>                 Mark a checklist item completed by title or ID
  checklist uncheck <item>               Mark a checklist item incomplete
  checklist list                         List all checklist items on current task
  checklist set <item1> <item2>...       Replace/initialize full checklist for task
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

    case 'subtask': {
      const subAction = positionals[1];
      const { client, taskId, projectId } = getContext(flags);
      const targetParentId = (flags.parent as string) || taskId;

      if (subAction === 'list') {
        const targetProj = (flags.project as string) || projectId;
        if (!targetParentId) {
          console.error('[critical-path] Error: Parent task ID is required (--task, --parent, or CRITICAL_PATH_TASK_ID).');
          process.exit(1);
        }
        const tasks = await client.getTasks(targetProj);
        const subtasks = tasks.filter((t) => t.parentId === targetParentId);
        if (subtasks.length === 0) {
          console.log(`[critical-path] No subtasks found for parent task ${targetParentId}.`);
        } else {
          console.log(`[critical-path] Subtasks for parent task ${targetParentId} (${subtasks.length}):`);
          for (const st of subtasks) {
            console.log(`  - [${st.id}] (${st.status}): ${st.title}`);
          }
        }
        break;
      }

      const title =
        subAction === 'create'
          ? positionals.slice(2).join(' ') || (flags.title as string)
          : positionals.slice(1).join(' ') || (flags.title as string);

      if (!title) {
        console.error('[critical-path] Error: Subtask title is required. Example: critical-path subtask "Implement unit tests"');
        process.exit(1);
      }

      if (!targetParentId) {
        console.error('[critical-path] Error: Parent task ID is required (--task, --parent, or CRITICAL_PATH_TASK_ID).');
        process.exit(1);
      }

      let targetProj = (flags.project as string) || projectId;
      if (!targetProj) {
        const parentTask = await client.getTask(targetParentId);
        targetProj = parentTask.projectId;
      }

      const created = await client.createTask({
        projectId: targetProj,
        title,
        description: (flags.description as string) || '',
        parentId: targetParentId,
        status: (flags.status as any) || 'todo',
        priority: (flags.priority as any) || 'medium',
        assigneeId: (flags.assignee as string) || undefined,
        customFields: {
          createdByAgent: true
        }
      });

      console.log(`[critical-path] Created subtask "${created.title}" (ID: ${created.id}) under parent task ${targetParentId}.`);
      break;
    }

    case 'checklist':
    case 'todo': {
      const subAction = positionals[1];
      const { client, taskId } = getContext(flags);
      if (!taskId) {
        console.error('[critical-path] Error: Task ID is required (--task or CRITICAL_PATH_TASK_ID).');
        process.exit(1);
      }

      if (!subAction || subAction === 'list') {
        const task = await client.getTask(taskId);
        if (!task.todos || task.todos.length === 0) {
          console.log(`[critical-path] Task ${taskId} has no checklist items.`);
        } else {
          console.log(`[critical-path] Checklist for task ${taskId} (${task.todos.length}):`);
          for (const item of task.todos) {
            console.log(`  ${item.completed ? '[x]' : '[ ]'} ${item.title} (${item.id})`);
          }
        }
        break;
      }

      if (subAction === 'check' || subAction === 'done' || subAction === 'complete') {
        const query = positionals.slice(2).join(' ') || (flags.item as string) || (flags.title as string) || (flags.id as string);
        if (!query) {
          console.error('[critical-path] Error: Checklist item ID or title is required. Example: critical-path checklist check "Write unit tests"');
          process.exit(1);
        }
        const updated = await client.toggleTodo(taskId, query, true);
        const item = updated.todos?.find(
          (t) => t.id === query || t.title.toLowerCase().includes(query.toLowerCase())
        );
        console.log(`[critical-path] Marked checklist item "${item?.title || query}" as completed on task ${taskId}.`);
        break;
      }

      if (subAction === 'uncheck') {
        const query = positionals.slice(2).join(' ') || (flags.item as string) || (flags.title as string) || (flags.id as string);
        if (!query) {
          console.error('[critical-path] Error: Checklist item ID or title is required.');
          process.exit(1);
        }
        const updated = await client.toggleTodo(taskId, query, false);
        const item = updated.todos?.find(
          (t) => t.id === query || t.title.toLowerCase().includes(query.toLowerCase())
        );
        console.log(`[critical-path] Marked checklist item "${item?.title || query}" as incomplete on task ${taskId}.`);
        break;
      }

      if (subAction === 'set') {
        const rawItems = positionals.slice(2);
        const items = rawItems.length > 0 ? rawItems : (flags.items as string[]) || [];
        if (items.length === 0) {
          console.error('[critical-path] Error: Items are required when using checklist set.');
          process.exit(1);
        }
        const newTodos: TaskTodoItem[] = items.map((title, i) => ({
          id: `todo_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          title,
          completed: false,
          createdAt: new Date().toISOString()
        }));
        await client.updateTask(taskId, { todos: newTodos });
        console.log(`[critical-path] Set ${newTodos.length} checklist item(s) on task ${taskId}.`);
        break;
      }

      // Default or 'add'
      const title =
        subAction === 'add'
          ? positionals.slice(2).join(' ') || (flags.title as string) || (flags.item as string)
          : positionals.slice(1).join(' ') || (flags.title as string) || (flags.item as string);

      if (!title) {
        console.error('[critical-path] Error: Item title is required. Example: critical-path checklist add "Write unit tests"');
        process.exit(1);
      }

      const item = await client.addTodo(taskId, title);
      console.log(`[critical-path] Added checklist item "${item.title}" (${item.id}) to task ${taskId}.`);
      break;
    }

    default:
      console.error(`[critical-path] Unknown command: "${command}". Run "critical-path --help" for usage.`);
      process.exit(1);
  }
}

// Only invoke main when executed directly as CLI script
export function isDirectExecution(
  scriptUrl: string = import.meta.url,
  argv1: string | undefined = process.argv[1]
): boolean {
  if (!argv1) return false;
  try {
    const scriptPath = fileURLToPath(scriptUrl);
    return fs.realpathSync(scriptPath) === fs.realpathSync(argv1);
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  main().catch((err) => {
    console.error('[critical-path] Execution error:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

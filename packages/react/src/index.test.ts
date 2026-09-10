import { describe, it, expect } from 'vitest';
import {
  CriticalPathProvider,
  useCriticalPathClient,
  useProjects,
  useTasks,
  useKanban,
  useWorkflows,
  useTaskTransitions,
  useComments,
  useAttachments,
  useTaskActivity,
  useDeliverables,
  useDeliverableSummary,
  useWebMCP
} from './index.js';

describe('@critical-path/react Exports Test', () => {
  it('exports Provider and Hooks', () => {
    expect(CriticalPathProvider).toBeDefined();
    expect(useCriticalPathClient).toBeDefined();
    expect(useProjects).toBeDefined();
    expect(useTasks).toBeDefined();
    expect(useKanban).toBeDefined();
    expect(useWorkflows).toBeDefined();
    expect(useTaskTransitions).toBeDefined();
    expect(useComments).toBeDefined();
    expect(useAttachments).toBeDefined();
    expect(useTaskActivity).toBeDefined();
    expect(useDeliverables).toBeDefined();
    expect(useDeliverableSummary).toBeDefined();
    expect(useWebMCP).toBeDefined();
  });
});


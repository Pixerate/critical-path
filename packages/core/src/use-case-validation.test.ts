import { describe, it, expect } from 'vitest';
import { CriticalPathEngine, DEFAULT_SOFTWARE_WORKFLOW, DEFAULT_VFX_WORKFLOW } from './index.js';

describe('Critical Path Use Case Validation Suite', () => {
  describe('Use Case 1: Software Development (Product Planning & Issue Tracking)', () => {
    it('supports full software development lifecycle with epics, sprints, dependencies, custom fields, and workflow transitions', async () => {
      const engine = new CriticalPathEngine();

      // 1. Create Workflow & Project
      const softwareProject = await engine.createProject({
        key: 'DEV',
        name: 'Mobile App Project',
        description: 'Software development project for mobile client',
        workflow: DEFAULT_SOFTWARE_WORKFLOW,
        customFieldDefinitions: [
          { id: 'cf_story_points', key: 'storyPoints', label: 'Story Points', type: 'number' },
          { id: 'cf_severity', key: 'severity', label: 'Severity', type: 'single_select', options: ['low', 'medium', 'high', 'critical'] }
        ]
      });

      expect(softwareProject.id).toBeDefined();

      // 2. Setup Team and Sprint Iteration
      const devTeam = await engine.createTeam({
        name: 'Frontend Core Team',
        memberIds: ['dev_alice', 'dev_bob', 'lead_charlie']
      });

      const sprint = await engine.createIteration({
        projectId: softwareProject.id,
        name: 'Sprint 24',
        type: 'sprint',
        startDate: '2026-09-01T00:00:00.000Z',
        endDate: '2026-09-14T00:00:00.000Z',
        status: 'active'
      });

      // 3. Epics / Task Containers
      const authEpic = await engine.createContainer({
        projectId: softwareProject.id,
        name: 'OAuth2 & Biometric Auth Epic',
        type: 'epic'
      });

      // 4. Tasks & Subtasks
      // Feature task under Auth Epic
      const featureTask = await engine.createTask({
        projectId: softwareProject.id,
        title: 'Implement FaceID & TouchID Login',
        description: 'Add biometric authentication flow to iOS and Android builds',
        status: 'backlog',
        priority: 'high',
        taskType: 'feature',
        reporterId: 'lead_charlie',
        reviewerId: 'lead_charlie',
        teamId: devTeam.id,
        containerId: authEpic.id,
        iterationId: sprint.id,
        estimatedHours: 16,
        customFields: {
          storyPoints: 5,
          severity: 'high'
        }
      });

      // Bug task blocking the feature release
      const bugTask = await engine.createTask({
        projectId: softwareProject.id,
        title: 'Fix OAuth Token Expiry Edge Case',
        description: 'Token refresh fails when app is backgrounded over 24 hours',
        status: 'todo',
        priority: 'urgent',
        taskType: 'bug',
        assigneeId: 'dev_alice',
        reporterId: 'dev_bob',
        reviewerId: 'lead_charlie',
        iterationId: sprint.id,
        estimatedHours: 4,
        customFields: {
          storyPoints: 2,
          severity: 'critical'
        }
      });

      // Subtask under Feature Task
      const subTask = await engine.createTask({
        projectId: softwareProject.id,
        title: 'iOS LocalAuthentication Bridge',
        status: 'todo',
        priority: 'high',
        taskType: 'subtask',
        assigneeId: 'dev_bob',
        parentId: featureTask.id,
        estimatedHours: 8
      });

      expect(subTask.parentId).toBe(featureTask.id);

      // 5. Blocker Dependency: FeatureTask depends on BugTask being resolved first
      await engine.store.addDependency({
        taskId: featureTask.id,
        dependsOnTaskId: bugTask.id,
        type: 'blocking'
      });

      const bugGraph = await engine.getTaskDependencyGraph(bugTask.id);
      expect(bugGraph.downstreamTasks.map((t) => t.id)).toContain(featureTask.id);

      // 6. Execution & Workflow Transitions
      // Move Feature from Backlog -> Todo -> In Progress
      await engine.updateTask(featureTask.id, { status: 'todo' });
      await engine.updateTask(featureTask.id, {
        status: 'in_progress',
        assigneeId: 'dev_alice',
        actualStartDate: '2026-09-02T09:00:00.000Z'
      });

      // Log progress and hours
      const updatedFeature = await engine.updateTask(featureTask.id, {
        loggedHours: 10,
        progress: 60
      });
      expect(updatedFeature?.loggedHours).toBe(10);
      expect(updatedFeature?.progress).toBe(60);

      // Transition In Progress -> In Review
      const reviewTask = await engine.updateTask(featureTask.id, { status: 'in_review' });
      expect(reviewTask?.status).toBe('in_review');

      // Invalid Transition Check: Try to transition back from Done to Backlog directly (not allowed by workflow)
      const doneTask = await engine.updateTask(featureTask.id, { status: 'done', actualEndDate: '2026-09-05T17:00:00.000Z' });
      expect(doneTask?.status).toBe('done');

      await expect(
        engine.updateTask(featureTask.id, { status: 'backlog' })
      ).rejects.toThrow();

      // Check Lifecycle State
      const lifecycle = await engine.getTaskLifecycleState(featureTask.id);
      expect(lifecycle?.isDone).toBe(true);
      expect(lifecycle?.completionState).toBe('done');
    });
  });

  describe('Use Case 2: Visual Effects (VFX) Production', () => {
    it('supports VFX shot deliverable hierarchies, drafting/bidding, artist/vendor assignment, and multi-stage review workflows', async () => {
      const engine = new CriticalPathEngine();

      // 1. Setup VFX Project with DEFAULT_VFX_WORKFLOW
      const vfxProject = await engine.createProject({
        key: 'FX_MOP',
        name: 'Feature Film - Movie Project',
        description: 'VFX shot production for sequence SEQ_101',
        workflow: DEFAULT_VFX_WORKFLOW,
        customFieldDefinitions: [
          { id: 'cf_bid_days', key: 'bidDays', label: 'Bid Days', type: 'number' },
          { id: 'cf_bid_amount', key: 'bidAmountUSD', label: 'Bid Amount ($)', type: 'number' },
          { id: 'cf_frame_count', key: 'frameCount', label: 'Frame Count', type: 'number' },
          { id: 'cf_resolution', key: 'resolution', label: 'Resolution', type: 'single_select', options: ['2K', '4K', '8K'] },
          { id: 'cf_vfx_version', key: 'vfxVersion', label: 'VFX Version', type: 'text' },
          { id: 'cf_review_url', key: 'reviewMediaUrl', label: 'Review Media URL', type: 'text' }
        ]
      });

      // 2. Outsource Vendor & Internal Department Teams
      const vendorTeam = await engine.createTeam({
        name: 'Outsource Vendor Studio X',
        description: '3D Simulation & FX Vendor Studio',
        memberIds: ['vendor_lead_mark', 'vendor_artist_joe']
      });

      const internalLeadTeam = await engine.createTeam({
        name: 'Internal VFX Supervisors',
        memberIds: ['vfx_sup_sarah', 'comp_lead_dave']
      });

      expect(vendorTeam.id).toBeDefined();
      expect(internalLeadTeam.id).toBeDefined();

      // 3. Hierarchy Deliverables: Sequence Container -> Shot Container
      const sequenceContainer = await engine.createContainer({
        projectId: vfxProject.id,
        name: 'SEQ_101 - Desert Canyon Chase',
        type: 'sequence'
      });

      const shotContainer = await engine.createContainer({
        projectId: vfxProject.id,
        name: 'SHOT_101_010 - Hero Vehicle Explosion',
        type: 'shot',
        parentId: sequenceContainer.id
      });

      expect(shotContainer.parentId).toBe(sequenceContainer.id);

      // 4. Draft & Bidding Phase
      // Create VFX Task for FX Simulation department under SHOT_101_010
      const fxBiddingTask = await engine.createTask({
        projectId: vfxProject.id,
        title: 'FX Simulation - Fire & Vehicle Debris',
        description: 'Heavy pyro explosion and fracturing geometry',
        status: 'bidding', // Starts in Draft & Bidding
        priority: 'high',
        taskType: 'vfx_task',
        reporterId: 'vfx_sup_sarah',
        containerId: shotContainer.id,
        teamId: vendorTeam.id,
        customFields: {
          bidDays: 12.5,
          bidAmountUSD: 15000,
          frameCount: 180,
          resolution: '4K',
          vfxVersion: 'v000'
        }
      });

      expect(fxBiddingTask.status).toBe('bidding');
      expect(fxBiddingTask.customFields?.bidAmountUSD).toBe(15000);

      // Element Subtask
      const dustElementTask = await engine.createTask({
        projectId: vfxProject.id,
        title: 'Secondary Dust Cloud Elements',
        status: 'bidding',
        priority: 'medium',
        taskType: 'subtask',
        parentId: fxBiddingTask.id,
        customFields: { bidDays: 3 }
      });

      expect(dustElementTask.parentId).toBe(fxBiddingTask.id);

      // 5. Award Bids & Transition to In Production
      const awardedTask = await engine.updateTask(fxBiddingTask.id, {
        status: 'awarded'
      });
      expect(awardedTask?.status).toBe('awarded');

      // Assign to Vendor Artist and start production
      const productionTask = await engine.updateTask(fxBiddingTask.id, {
        status: 'in_production',
        assigneeId: 'vendor_artist_joe',
        reviewerId: 'comp_lead_dave',
        customFields: {
          ...fxBiddingTask.customFields,
          vfxVersion: 'v001'
        }
      });
      expect(productionTask?.status).toBe('in_production');
      expect(productionTask?.assigneeId).toBe('vendor_artist_joe');

      // 6. Review & Approval Process
      // Artist finishes v001 and submits to Internal Review
      const internalReviewTask = await engine.updateTask(fxBiddingTask.id, {
        status: 'internal_review',
        customFields: {
          ...productionTask?.customFields,
          vfxVersion: 'v001',
          reviewMediaUrl: 'https://vfx-pipeline.studio.com/reviews/SHOT_101_010_FX_v001.mov'
        }
      });
      expect(internalReviewTask?.status).toBe('internal_review');

      // Internal Lead rejects v001 and requests revisions with notes
      await engine.store.addComment({
        taskId: fxBiddingTask.id,
        authorId: 'comp_lead_dave',
        content: 'Fire velocity looks great, but debris needs 20% more scale and air resistance.'
      });

      const revisionTask = await engine.updateTask(fxBiddingTask.id, {
        status: 'revision_requested'
      });
      expect(revisionTask?.status).toBe('revision_requested');

      // Artist addresses revisions -> In Production -> Resubmits v002 to Internal Review
      await engine.updateTask(fxBiddingTask.id, {
        status: 'in_production',
        customFields: {
          ...revisionTask?.customFields,
          vfxVersion: 'v002'
        }
      });

      const internalReviewPass = await engine.updateTask(fxBiddingTask.id, {
        status: 'internal_review',
        customFields: {
          ...revisionTask?.customFields,
          vfxVersion: 'v002',
          reviewMediaUrl: 'https://vfx-pipeline.studio.com/reviews/SHOT_101_010_FX_v002.mov'
        }
      });
      expect(internalReviewPass?.status).toBe('internal_review');

      // Internal Lead approves and passes shot to Client Review
      const clientReviewTask = await engine.updateTask(fxBiddingTask.id, {
        status: 'client_review'
      });
      expect(clientReviewTask?.status).toBe('client_review');

      // Director / Client Supervisor approves final shot
      await engine.store.addComment({
        taskId: fxBiddingTask.id,
        authorId: 'vfx_sup_sarah',
        content: 'Client Supervisor approved v002 for final comp assembly.'
      });

      const finalApprovedTask = await engine.updateTask(fxBiddingTask.id, {
        status: 'approved',
        progress: 100
      });
      expect(finalApprovedTask?.status).toBe('approved');
      expect(finalApprovedTask?.progress).toBe(100);

      // Verify task lifecycle status shows completed
      const lifecycle = await engine.getTaskLifecycleState(fxBiddingTask.id);
      expect(lifecycle?.isDone).toBe(true);

      // Verify audit log history recorded all approval steps
      const activities = await engine.store.getActivities({ taskId: fxBiddingTask.id });
      expect(activities.length).toBeGreaterThanOrEqual(6);
    });
  });
});

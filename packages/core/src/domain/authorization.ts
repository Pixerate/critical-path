import type {
  Actor,
  AuthorizationAction,
  AuthorizationPolicy,
  AuthorizationRequest,
  ProjectRole
} from '../types/index.js';

const VIEWER: AuthorizationAction[] = ['project.read'];
const CONTRIBUTOR: AuthorizationAction[] = [
  ...VIEWER,
  'task.create',
  'task.update',
  'comment.create',
  'attachment.create',
  'time.log'
];
const PROJECT_MANAGER: AuthorizationAction[] = [
  ...CONTRIBUTOR,
  'task.delete',
  'plan.manage',
  'project.update',
  'project.manage_members',
  'comment.moderate',
  'attachment.delete'
];
const PROJECT_ADMIN: AuthorizationAction[] = [...PROJECT_MANAGER, 'project.delete', 'project.manage_admins'];

/** Actions each project role grants by default. */
export const DEFAULT_ROLE_PERMISSIONS: Record<ProjectRole, readonly AuthorizationAction[]> = {
  viewer: VIEWER,
  contributor: CONTRIBUTOR,
  project_manager: PROJECT_MANAGER,
  admin: PROJECT_ADMIN
};

export interface RolePolicyOptions {
  /** Override or extend the actions granted to each project role. */
  rolePermissions?: Partial<Record<ProjectRole, readonly AuthorizationAction[]>>;
  /** Workspace roles (from `actor.roles`) that may do anything within their tenant. Default `['admin']`. */
  superuserRoles?: string[];
  /**
   * Who may create projects (they become the project's `admin`). Default: any actor except the
   * anonymous one (`userId === 'anonymous'`).
   */
  canCreateProjects?: (actor: Actor) => boolean;
  /** Who may manage workflows, teams and webhooks. Default: superusers only. */
  canManageWorkspace?: (actor: Actor) => boolean;
}

/**
 * Role-based policy driven by `project.members`. Members get their role's actions on that project;
 * authors may edit and delete their own comments and attachments; workspace superusers may do
 * everything. Everyone else is denied.
 */
export function createRolePolicy(options: RolePolicyOptions = {}): AuthorizationPolicy {
  const permissions = { ...DEFAULT_ROLE_PERMISSIONS, ...options.rolePermissions };
  const superuserRoles = options.superuserRoles ?? ['admin'];
  const isSuperuser = (actor: Actor) => (actor.roles ?? []).some((r) => superuserRoles.includes(r));
  const canCreateProjects = options.canCreateProjects ?? ((actor: Actor) => actor.userId !== 'anonymous');
  const canManageWorkspace = options.canManageWorkspace ?? isSuperuser;

  return ({ actor, action, project, resource, teamIds }: AuthorizationRequest): boolean => {
    if (isSuperuser(actor)) return true;
    if (action === 'project.create') return canCreateProjects(actor);
    if (action === 'workspace.manage') return canManageWorkspace(actor);
    if (!project) return false;

    // Roles granted directly and through any of the actor's teams
    const roles = (project.members ?? [])
      .filter((m) => (m.userId !== undefined ? m.userId === actor.userId : teamIds.includes(m.teamId)))
      .map((m) => m.role);
    if (roles.length === 0) return false;

    const granted = new Set(roles.flatMap((role) => permissions[role] ?? []));
    if (granted.has(action)) return true;

    // Authors manage their own comments and attachments without moderator rights.
    const ownsResource = resource?.ownerId !== undefined && resource.ownerId === actor.userId;
    if (action === 'comment.moderate' && ownsResource && granted.has('comment.create')) return true;
    if (action === 'attachment.delete' && ownsResource && granted.has('attachment.create')) return true;

    return false;
  };
}

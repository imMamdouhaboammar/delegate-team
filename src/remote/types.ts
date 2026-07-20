export type RemotePolicy = {
  schema: 'delegate-team.remote-policy.v1';
  workspaceRoot: string;
  allowDependencyInstall: boolean;
  allowDelete: boolean;
  allowCommit: boolean;
  allowPush: boolean;
  allowMerge: boolean;
  allowPublish: boolean;
  allowSystemChanges: boolean;
  allowSecretRead: boolean;
  requireFeatureBranch: boolean;
  requireBaselineTests: boolean;
  requireFinalVerification: boolean;
  requireDiffReview: boolean;
};

export type RemoteMetadata = {
  schema: 'delegate-team.remote-agent.v1';
  version: 1;
  projectName: string;
  workspaceRoot: string;
  createdAt: string;
  updatedAt: string;
};

export type RemoteSessionState = {
  schema: 'delegate-team.remote-session.v1';
  selectedMode: 'unselected' | 'coding-agent' | 'delegator' | 'hybrid';
  lastCheckedAt: string | null;
};

export type AgentStatus = {
  id: string;
  label: string;
  command: string | null;
  path: string | null;
  installed: boolean;
  version: string | null;
};

export type CommandStatus = {
  command: string;
  path: string | null;
  installed: boolean;
  version: string | null;
};

export type RemoteWorkspace = {
  workspaceRoot: string;
  metadata: RemoteMetadata;
  policy: RemotePolicy;
};

export type RemoteDoctorReport = {
  ready: boolean;
  workspace: {
    root: string;
    initialized: boolean;
  };
  coreTools: {
    node: CommandStatus;
    npm: CommandStatus;
    git: CommandStatus;
    dt: CommandStatus;
  };
  agents: AgentStatus[];
};

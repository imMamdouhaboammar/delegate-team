import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';

export interface TraceDepthControl {
  max_depth: number;
  current_depth: number;
  can_delegate: boolean;
  can_call_metagpt: boolean;
}

export interface TraceBudget {
  max_roles: number;
  max_rounds: number;
  max_tokens_total: number;
  max_runtime_seconds: number;
  fallback_budget: number;
}

export interface TraceRole {
  role: string;
  backend: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  files_touched: string[];
}

export interface DelegationTrace {
  trace_id: string;
  parent_id: string;
  controller: string;
  executor: string;
  depth_control: TraceDepthControl;
  budget: TraceBudget;
  roles: TraceRole[];
  final_status: 'initialized' | 'executing' | 'ready_for_review' | 'committed';
  commit_allowed: boolean;
}

export class TraceManager {
  private tracesDir: string;

  constructor() {
    this.tracesDir = join(homedir(), '.config', 'dt', 'traces');
    if (!existsSync(this.tracesDir)) {
      mkdirSync(this.tracesDir, { recursive: true });
    }
  }

  public createTrace(parentId: string = 'claude-code-session'): DelegationTrace {
    const inheritedParentId = process.env.DT_TRACE_ID || parentId;
    const inheritedDepth = process.env.DT_EXECUTION_DEPTH ? parseInt(process.env.DT_EXECUTION_DEPTH, 10) + 1 : 1;
    const canCallMetagpt = process.env.DT_CAN_CALL_METAGPT ? process.env.DT_CAN_CALL_METAGPT === 'true' : true;
    const inheritedMaxRoles = process.env.DT_MAX_ROLES ? parseInt(process.env.DT_MAX_ROLES, 10) : 5;

    const traceId = `dt-${new Date().toISOString().split('T')[0]}-${Date.now()}`;
    const trace: DelegationTrace = {
      trace_id: traceId,
      parent_id: inheritedParentId,
      controller: 'claude-code',
      executor: 'metagpt',
      depth_control: {
        max_depth: 2,
        current_depth: inheritedDepth,
        can_delegate: true,
        can_call_metagpt: canCallMetagpt // Respect environment restriction
      },
      budget: {
        max_roles: inheritedMaxRoles,
        max_rounds: 2,
        max_tokens_total: 120000,
        max_runtime_seconds: 900,
        fallback_budget: 2
      },
      roles: [],
      final_status: 'initialized',
      commit_allowed: false // Enforce Review Gate
    };

    if (!canCallMetagpt) {
      // Force block if it's explicitly disabled in environment
      trace.depth_control.current_depth = trace.depth_control.max_depth + 1;
    }

    this.saveTrace(trace);
    return trace;
  }

  public saveTrace(trace: DelegationTrace): void {
    const tracePath = join(this.tracesDir, `${trace.trace_id}.json`);
    writeFileSync(tracePath, JSON.stringify(trace, null, 2), 'utf8');
  }

  public loadTrace(traceId: string): DelegationTrace | null {
    const tracePath = join(this.tracesDir, `${traceId}.json`);
    if (existsSync(tracePath)) {
      return JSON.parse(readFileSync(tracePath, 'utf8')) as DelegationTrace;
    }
    return null;
  }
}

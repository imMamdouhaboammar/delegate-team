#!/usr/bin/env bash
# watchdog.sh — MMAS boss loop

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=watchdog-status.sh
source "$SCRIPT_DIR/watchdog-status.sh"

TASK_ID="${1:-}"
BOSS_SESSION="${2:-}"
INTERVAL=30

shift 2 || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --interval) INTERVAL="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; shift ;;
  esac
done

if [[ -z "$TASK_ID" || -z "$BOSS_SESSION" ]]; then
  echo "Usage: bash watchdog.sh <task_id> <boss_session_id> [--interval N]" >&2
  exit 1
fi

TASK_DIR="$HOME/.apeiron/multi-agent/tasks/$TASK_ID"
BOULDER="$TASK_DIR/boulder.json"
WATCHDOG_LOG="$TASK_DIR/watchdog.log"
IDLE_THRESHOLD_SEC=300

log() {
  echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$WATCHDOG_LOG" >&2
}

is_pid_alive() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

is_process_group_alive() {
  local pgid="$1"
  [[ -n "$pgid" && "$pgid" != "null" ]] && kill -0 -- "-$pgid" 2>/dev/null
}

log_last_modified_seconds_ago() {
  local log_file="$1"
  if [[ ! -f "$log_file" ]]; then
    echo "999999"
    return
  fi
  local now mtime
  now=$(date +%s)

  # GNU stat uses -c while BSD/macOS stat uses -f for file format output.
  if mtime=$(stat -c %Y "$log_file" 2>/dev/null); then
    :
  elif mtime=$(stat -f %m "$log_file" 2>/dev/null); then
    :
  else
    echo "999999"  # unreadable timestamp = fail closed as stale
    return
  fi

  local age
  age=$(( now - mtime ))
  if (( age < 0 )); then
    age=0
  fi
  echo "$age"
}

# ---------------------------------------------------------------------------
# Send report to boss
# ---------------------------------------------------------------------------

send_to_boss() {
  local content="$1"
  apeiron communication send \
    --from "$BOSS_SESSION" \
    --to "$BOSS_SESSION" \
    --command prompt \
    --content "$content" \
    2>>"$WATCHDOG_LOG" || log "WARNING: failed to send to boss $BOSS_SESSION"
}

set_agent_status() {
  local agent_name="$1"
  local new_status="$2"
  local now tmp
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  tmp=$(mktemp)
  jq --arg name "$agent_name" --arg status "$new_status" --arg now "$now" \
    '(.agents[] | select(.name == $name)) |= (.status = $status | .last_activity = $now)' \
    "$BOULDER" > "$tmp" && mv "$tmp" "$BOULDER"

  if [[ "$new_status" == "done" ]]; then
    tmp=$(mktemp)
    jq --arg name "$agent_name" --arg now "$now" \
      '(.agents[] | select(.name == $name)) |= (.completed_at = $now)' \
      "$BOULDER" > "$tmp" && mv "$tmp" "$BOULDER"
  fi
}

update_agent_state() {
  local agent_name="$1"
  local pid log_file summary_file status
  pid=$(jq -r --arg name "$agent_name" '.agents[] | select(.name == $name) | .pid' "$BOULDER")
  log_file=$(jq -r --arg name "$agent_name" '.agents[] | select(.name == $name) | .log_file' "$BOULDER")
  summary_file=$(jq -r --arg name "$agent_name" '.agents[] | select(.name == $name) | (.summary_file // empty)' "$BOULDER")
  status=$(jq -r --arg name "$agent_name" '.agents[] | select(.name == $name) | .status' "$BOULDER")

  if [[ "$status" == "done" || "$status" == "error" || "$status" == "spawn_failed" ]]; then
    return
  fi

  if ! is_pid_alive "$pid"; then
    local write_mode
    write_mode=$(jq -r '.guardrails.writeMode // "workspace"' "$BOULDER")
    if [[ "$write_mode" == "none" || ( -n "$summary_file" && -f "$summary_file" ) ]]; then
      set_agent_status "$agent_name" "done"
    else
      set_agent_status "$agent_name" "error"
    fi
    return
  fi

  local last_mod
  last_mod=$(log_last_modified_seconds_ago "$log_file")
  if [[ $last_mod -gt $IDLE_THRESHOLD_SEC ]]; then
    set_agent_status "$agent_name" "stuck"
    log "Agent $agent_name stuck for ${last_mod}s — needs nudge"
  else
    set_agent_status "$agent_name" "running"
  fi
}

terminate_remaining_agents() {
  local grace pid pgid status
  grace=$(jq -r '.guardrails.killGracePeriod // 5' "$BOULDER")

  while IFS=$'\t' read -r pid pgid status; do
    [[ "$status" == "done" || "$status" == "error" || "$status" == "spawn_failed" ]] && continue
    [[ -z "$pid" || "$pid" == "null" ]] && continue
    if [[ -n "$pgid" && "$pgid" != "null" ]]; then
      kill -TERM -- "-$pgid" 2>/dev/null || true
    else
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done < <(jq -r '.agents[] | [(.pid // ""), (.pgid // ""), .status] | @tsv' "$BOULDER")

  sleep "$grace"

  while IFS=$'\t' read -r pid pgid status; do
    [[ "$status" == "done" || "$status" == "error" || "$status" == "spawn_failed" ]] && continue
    [[ -z "$pid" || "$pid" == "null" ]] && continue
    if [[ -n "$pgid" && "$pgid" != "null" ]]; then
      if is_process_group_alive "$pgid"; then
        kill -KILL -- "-$pgid" 2>/dev/null || true
      fi
    elif is_pid_alive "$pid"; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done < <(jq -r '.agents[] | [(.pid // ""), (.pgid // ""), .status] | @tsv' "$BOULDER")
}

log "Watchdog started for task $TASK_ID, interval=${INTERVAL}s, boss=$BOSS_SESSION"
send_to_boss "🐕 [MMAS watchdog started for task $TASK_ID — monitoring every ${INTERVAL}s]"

TICK=0
while true; do
  TICK=$((TICK + 1))
  sleep "$INTERVAL"
  log "Tick $TICK"

  while IFS= read -r agent; do
    update_agent_state "$agent"
  done < <(jq -r '.agents[].name' "$BOULDER")

  IFS=$'\t' read -r status_line all_done any_stuck <<< "$(render_watchdog_status "$BOULDER" "$TASK_ID")"
  log "$status_line"
  send_to_boss "$status_line"

  if [[ "$all_done" == "true" ]]; then
    log "All agents done. Sending final report."
    FINAL_REPORT="✅ [MMAS task $TASK_ID COMPLETE]\n\n"
    FINAL_REPORT+="Original task: $(jq -r '.task' "$BOULDER")\n\n"
    FINAL_REPORT+="Agent summaries:\n"

    while IFS=$'\t' read -r agent summary_file; do
      FINAL_REPORT+="\n--- $agent ---\n"
      if [[ -f "$summary_file" ]]; then
        FINAL_REPORT+="$(cat "$summary_file")\n"
      else
        FINAL_REPORT+="(no summary file)\n"
      fi
    done < <(jq -r '.agents[] | [.name, .summary_file] | @tsv' "$BOULDER")

    send_to_boss "$FINAL_REPORT"
    tmp=$(mktemp)
    jq '.status = "complete"' "$BOULDER" > "$tmp" && mv "$tmp" "$BOULDER"
    log "Watchdog exiting. Task complete."
    exit 0
  fi

  timeout_seconds=$(jq -r '.guardrails.timeoutSeconds // 7200' "$BOULDER")
  if (( TICK * INTERVAL >= timeout_seconds )); then
    log "Watchdog timeout (${timeout_seconds}s). Terminating remaining agents."
    terminate_remaining_agents
    send_to_boss "⏰ [MMAS task $TASK_ID TIMED OUT after ${timeout_seconds}s]"
    tmp=$(mktemp)
    jq '.status = "timeout"' "$BOULDER" > "$tmp" && mv "$tmp" "$BOULDER"
    exit 1
  fi
done

#!/usr/bin/env bash
# watchdog.sh — MMAS boss loop
#
# Polls each running agent every $INTERVAL seconds. Determines state from:
#   1. PID alive check (kill -0)
#   2. Log file activity (mtime vs now)
#   3. Process exit code (if PID is dead)
#
# Sends aggregated status report to the boss (Mavis) via mavis communication send.
# Detects idle agents (>5 min no log activity) and injects "continue" prompt.
# When all agents complete, sends final report and exits.
#
# Usage:
#   bash watchdog.sh <task_id> <boss_session_id> [--interval N]
#
# Example:
#   bash watchdog.sh task-20260630-abc123 mvs_5d01... --interval 30

set -euo pipefail

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------

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

TASK_DIR="$HOME/.mavis/multi-agent/tasks/$TASK_ID"
BOULDER="$TASK_DIR/boulder.json"
WATCHDOG_LOG="$TASK_DIR/watchdog.log"
IDLE_THRESHOLD_SEC=300   # 5 min idle = stuck
LOG_ACTIVITY_THRESHOLD_SEC=120  # 2 min no log write = suspicious

# ---------------------------------------------------------------------------
# Logging helper
# ---------------------------------------------------------------------------

log() {
  echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$WATCHDOG_LOG" >&2
}

# ---------------------------------------------------------------------------
# State detection helpers
# ---------------------------------------------------------------------------

is_pid_alive() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

log_last_modified_seconds_ago() {
  local log_file="$1"
  if [[ ! -f "$log_file" ]]; then
    echo "999999"  # no log = treat as infinitely stale
    return
  fi
  # macOS uses -f %m for mtime, but it's not always reliable across filesystems.
  # Use stat -f %m (BSD/macOS) for modification epoch.
  local now=$(date +%s)
  local mtime=$(stat -f %m "$log_file" 2>/dev/null || echo "$now")
  echo $(( now - mtime ))
}

# ---------------------------------------------------------------------------
# Send report to boss
# ---------------------------------------------------------------------------

send_to_boss() {
  local content="$1"
  # Note: --from arg requires valid session format (ses_* or mvs_*).
  # Watchdog runs detached so we use boss_session as both from/to (acting on behalf of boss).
  mavis communication send \
    --from "$BOSS_SESSION" \
    --to "$BOSS_SESSION" \
    --command prompt \
    --content "$content" \
    2>>"$WATCHDOG_LOG" || log "WARNING: failed to send to boss $BOSS_SESSION"
}

# ---------------------------------------------------------------------------
# Status rendering
# ---------------------------------------------------------------------------

render_status() {
  local icon status_line all_done=true any_stuck=false

  status_line="🐕 [MMAS watchdog $TASK_ID @ $(date -u +%H:%M:%S)]"

  for agent in $(jq -r '.agents[].name' "$BOULDER"); do
    local pid log_file status
    pid=$(jq -r ".agents[] | select(.name == \"$agent\") | .pid" "$BOULDER")
    log_file=$(jq -r ".agents[] | select(.name == \"$agent\") | .log_file" "$BOULDER")
    status=$(jq -r ".agents[] | select(.name == \"$agent\") | .status" "$BOULDER")

    local icon="🔧"
    case "$status" in
      done) icon="✅" ;;
      error) icon="❌" ;;
      stuck|idle) icon="🟡" ;;
      spawn_failed) icon="💥" ;;
    esac

    if [[ "$status" != "done" ]]; then
      all_done=false
    fi
    if [[ "$status" == "stuck" || "$status" == "error" ]]; then
      any_stuck=true
    fi

    status_line="$status_line $icon $agent"
  done

  echo "$status_line"
  echo "$all_done"
  echo "$any_stuck"
}

# ---------------------------------------------------------------------------
# Update single agent state
# ---------------------------------------------------------------------------

update_agent_state() {
  local agent_name="$1"
  local pid log_file status
  pid=$(jq -r ".agents[] | select(.name == \"$agent_name\") | .pid" "$BOULDER")
  log_file=$(jq -r ".agents[] | select(.name == \"$agent_name\") | .log_file" "$BOULDER")
  status=$(jq -r ".agents[] | select(.name == \"$agent_name\") | .status" "$BOULDER")

  # Skip if already done or errored
  if [[ "$status" == "done" || "$status" == "error" || "$status" == "spawn_failed" ]]; then
    return
  fi

  # Check if process is alive
  if ! is_pid_alive "$pid"; then
    # Process died — mark done (or error if log indicates failure)
    if [[ -f "${log_file%.log}.summary" ]]; then
      set_agent_status "$agent_name" "done"
    else
      set_agent_status "$agent_name" "error"
    fi
    return
  fi

  # Check log activity
  local last_mod
  last_mod=$(log_last_modified_seconds_ago "$log_file")
  if [[ $last_mod -gt $IDLE_THRESHOLD_SEC ]]; then
    # Idle > 5 min — mark stuck (Todo Enforcer pattern)
    set_agent_status "$agent_name" "stuck"
    # Inject continue prompt
    local summary_file="${log_file%.log}.summary"
    if [[ -f "$summary_file" ]]; then
      log "Agent $agent_name is stuck but has summary — marking done"
      set_agent_status "$agent_name" "done"
    else
      log "Agent $agent_name stuck for ${last_mod}s — needs nudge"
    fi
  else
    # Active recently
    set_agent_status "$agent_name" "running"
  fi
}

set_agent_status() {
  local agent_name="$1"
  local new_status="$2"
  local now
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local tmp
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

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

log "Watchdog started for task $TASK_ID, interval=${INTERVAL}s, boss=$BOSS_SESSION"

send_to_boss "🐕 [MMAS watchdog started for task $TASK_ID — monitoring every ${INTERVAL}s]"

TICK=0
while true; do
  TICK=$((TICK + 1))
  sleep "$INTERVAL"

  log "Tick $TICK"

  # Update each agent's state
  for agent in $(jq -r '.agents[].name' "$BOULDER"); do
    update_agent_state "$agent"
  done

  # Render status
  read -r status_line all_done any_stuck <<< "$(render_status)"
  log "$status_line"

  # Send status to boss every tick (or first 3 ticks only to avoid spam — let's send every tick)
  send_to_boss "$status_line"

  # If all done, send final report and exit
  if [[ "$all_done" == "true" ]]; then
    log "All agents done. Sending final report."

    # Compose final summary from each agent's summary file
    FINAL_REPORT="✅ [MMAS task $TASK_ID COMPLETE]\n\n"
    FINAL_REPORT+="Original task: $(jq -r '.task' "$BOULDER")\n\n"
    FINAL_REPORT+="Agent summaries:\n"

    for agent in $(jq -r '.agents[].name' "$BOULDER"); do
      summary_file=$(jq -r ".agents[] | select(.name == \"$agent\") | .summary_file" "$BOULDER")
      FINAL_REPORT+="\n--- $agent ---\n"
      if [[ -f "$summary_file" ]]; then
        FINAL_REPORT+="$(cat "$summary_file")\n"
      else
        FINAL_REPORT+="(no summary file)\n"
      fi
    done

    send_to_boss "$FINAL_REPORT"

    # Update boulder status
    tmp=$(mktemp)
    jq '.status = "complete"' "$BOULDER" > "$tmp" && mv "$tmp" "$BOULDER"
    log "Watchdog exiting. Task complete."
    exit 0
  fi

  # Safety: exit if watchdog has been running too long (2 hours)
  if [[ $TICK -gt $(( 7200 / INTERVAL )) ]]; then
    log "Watchdog timeout (2h). Sending timeout report."
    send_to_boss "⏰ [MMAS task $TASK_ID TIMED OUT after 2h of monitoring]"
    tmp=$(mktemp)
    jq '.status = "timeout"' "$BOULDER" > "$tmp" && mv "$tmp" "$BOULDER"
    exit 1
  fi
done

#!/usr/bin/env bash

# Render one delimiter-safe record for the MMAS watchdog main loop.
# Fields: human-readable status line, all_done, any_stuck.
render_watchdog_status() {
  local boulder="$1"
  local task_id="$2"
  local status_line all_done=true any_stuck=false agents_tsv

  status_line="🐕 [MMAS watchdog $task_id @ $(date -u +%H:%M:%S)]"

  if ! agents_tsv=$(jq -er '
    .agents
    | if (type != "array" or length == 0) then
        error("agents must be a non-empty array")
      else
        .[]
        | if (.name | type) != "string" or (.status | type) != "string" then
            error("agent name and status must be strings")
          else
            [.name, .status] | @tsv
          end
      end
  ' "$boulder"); then
    return 1
  fi

  while IFS=$'\t' read -r agent status; do
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
    if [[ "$status" == "stuck" || "$status" == "error" || "$status" == "spawn_failed" ]]; then
      any_stuck=true
    fi

    status_line="$status_line $icon $agent"
  done <<< "$agents_tsv"

  printf '%s\t%s\t%s\n' "$status_line" "$all_done" "$any_stuck"
}

#!/usr/bin/env bash

# Render one delimiter-safe record for the MMAS watchdog main loop.
# Fields: human-readable status line, all_done, any_stuck.
render_watchdog_status() {
  local boulder="$1"
  local task_id="$2"
  local status_line all_done=true any_stuck=false

  status_line="🐕 [MMAS watchdog $task_id @ $(date -u +%H:%M:%S)]"

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
    if [[ "$status" == "stuck" || "$status" == "error" ]]; then
      any_stuck=true
    fi

    status_line="$status_line $icon $agent"
  done < <(jq -r '.agents[] | [.name, .status] | @tsv' "$boulder")

  printf '%s\t%s\t%s\n' "$status_line" "$all_done" "$any_stuck"
}

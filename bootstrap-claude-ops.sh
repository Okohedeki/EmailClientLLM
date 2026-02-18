#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Claude Code Ops Kit - Bootstrap Script
# Scaffolds the entire Claude Code workflow for any project.
# Idempotent: safe to re-run (skips existing files unless --force).
# =============================================================================

# --- Flags ---
FORCE=false
SKIP_GLOBAL=false
INIT_GIT=false
ENABLE_HOOKS=false
DRY_RUN=false

# --- Paths ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
GLOBAL_CLAUDE="$HOME/.claude"

# --- Counters ---
CREATED=0
SKIPPED=0
BACKED_UP=0

# =============================================================================
# Argument parsing
# =============================================================================
parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --force)        FORCE=true ;;
      --skip-global)  SKIP_GLOBAL=true ;;
      --init-git)     INIT_GIT=true ;;
      --enable-hooks) ENABLE_HOOKS=true ;;
      --dry-run)      DRY_RUN=true ;;
      -h|--help)
        echo "Usage: bootstrap-claude-ops.sh [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --force          Overwrite existing files (creates .bak backups)"
        echo "  --skip-global    Don't touch ~/.claude/"
        echo "  --init-git       Run git init after scaffolding"
        echo "  --enable-hooks   Wire hooks into settings.json"
        echo "  --dry-run        Show what would be created without writing"
        echo "  -h, --help       Show this help"
        exit 0
        ;;
      *) echo "Unknown option: $1"; exit 1 ;;
    esac
    shift
  done
}

# =============================================================================
# Helpers
# =============================================================================

# write_file PATH <<'EOF'
# content
# EOF
#
# Reads content from stdin. Uses heredocs to avoid all quoting issues.
write_file() {
  local path="$1"
  local content
  content="$(cat)"

  if [ "$DRY_RUN" = true ]; then
    echo "[DRY-RUN] Would create: $path"
    return
  fi

  if [ -f "$path" ] && [ "$FORCE" != true ]; then
    echo "[SKIP] $path"
    SKIPPED=$((SKIPPED + 1))
    return
  fi

  if [ -f "$path" ] && [ "$FORCE" = true ]; then
    cp "$path" "$path.bak"
    echo "[BACKUP] $path -> $path.bak"
    BACKED_UP=$((BACKED_UP + 1))
  fi

  mkdir -p "$(dirname "$path")"
  printf '%s\n' "$content" > "$path"
  echo "[CREATE] $path"
  CREATED=$((CREATED + 1))
}

ensure_dir() {
  local dir="$1"
  if [ "$DRY_RUN" = true ]; then
    echo "[DRY-RUN] Would create dir: $dir"
    return
  fi
  mkdir -p "$dir"
}

merge_json() {
  local path="$1"
  local new_json="$2"

  if [ "$DRY_RUN" = true ]; then
    echo "[DRY-RUN] Would merge into: $path"
    return
  fi

  python -c "
import json, os, sys
path = sys.argv[1]
new = json.loads(sys.argv[2])
existing = json.load(open(path)) if os.path.exists(path) else {}
existing.update({k: v for k, v in new.items() if k not in existing})
json.dump(existing, open(path, 'w'), indent=2)
print('[MERGE] ' + path)
" "$path" "$new_json"
}

# =============================================================================
# Phase 1: Core scaffold
# =============================================================================
create_directories() {
  echo ""
  echo "=== Creating directories ==="
  local dirs=(
    "$PROJECT_ROOT/.claude/skills/plan"
    "$PROJECT_ROOT/.claude/skills/implement"
    "$PROJECT_ROOT/.claude/skills/review"
    "$PROJECT_ROOT/.claude/skills/debug"
    "$PROJECT_ROOT/.claude/skills/test"
    "$PROJECT_ROOT/.claude/skills/pr"
    "$PROJECT_ROOT/.claude/agents.off"
    "$PROJECT_ROOT/.claude/hooks"
    "$PROJECT_ROOT/.claude/commands"
    "$PROJECT_ROOT/.claude/sessions"
    "$PROJECT_ROOT/scripts"
    "$PROJECT_ROOT/memory"
    "$PROJECT_ROOT/tools/claude-monitor/server"
    "$PROJECT_ROOT/tools/claude-monitor/web"
  )
  for d in "${dirs[@]}"; do
    ensure_dir "$d"
  done

  if [ "$SKIP_GLOBAL" != true ]; then
    local global_dirs=(
      "$GLOBAL_CLAUDE/skills/session-start"
      "$GLOBAL_CLAUDE/skills/session-update"
      "$GLOBAL_CLAUDE/skills/session-end"
      "$GLOBAL_CLAUDE/skills/session-list"
      "$GLOBAL_CLAUDE/skills/triage"
      "$GLOBAL_CLAUDE/skills/summarize"
      "$GLOBAL_CLAUDE/skills/risk-check"
      "$GLOBAL_CLAUDE/skills/agents-on"
      "$GLOBAL_CLAUDE/skills/agents-off"
      "$GLOBAL_CLAUDE/agents.off"
    )
    for d in "${global_dirs[@]}"; do
      ensure_dir "$d"
    done
  fi
}

write_claude_md() {
  echo ""
  echo "=== Writing CLAUDE.md ==="
  write_file "$PROJECT_ROOT/CLAUDE.md" <<'EOF'
# Claude Code Ops Kit

## Workflow
Explore -> Plan -> Implement -> Verify -> Review -> Ship
Use /triage first to assess complexity, then follow its recommendation.

## Commands (project-scoped, invoke with /project:name)
- Session: /project:session-start, /project:session-update, /project:session-end, /project:session-current, /project:session-list, /project:session-help
- Memory: /project:memory-compact (compact sessions into memory/memory.md)
- Utility: /project:checkpoint, /project:status, /project:init-feature

## Defaults
- Agents: OFF. Enable with /agents-on, disable with /agents-off
- Hooks: OFF. Enable via scripts/enable-hooks.sh
- Sessions: Track work with /project:session-start, /project:session-update, /project:session-end

## Key Paths
- Repo skills: .claude/skills/
- Commands: .claude/commands/
- Agents (disabled): .claude/agents.off/
- Hooks: .claude/hooks/
- Sessions: .claude/sessions/
- Memory: memory/
- Scripts: scripts/
- Monitor: tools/claude-monitor/ (start with: bash tools/claude-monitor/start.sh)

## Environment
Windows (MINGW64/Git Bash). Python available.
EOF
}

write_readme() {
  echo ""
  echo "=== Writing README.md ==="
  write_file "$PROJECT_ROOT/README.md" <<'README_EOF'
# Claude Code Ops Kit

A single bootstrap script that scaffolds a complete Claude Code workflow -- skills, agents, hooks, session tracking, and a real-time monitoring dashboard -- for any project.

Run it once to get a structured development workflow immediately. Run it again and nothing changes (idempotent).

## Quick Start

```bash
# From your project root:
bash bootstrap-claude-ops.sh

# Then open Claude Code in the same directory and try:
#   /project:session-start my-feature
#   /triage build a REST API
```

## What the Script Does

`bootstrap-claude-ops.sh` creates ~44 files across two locations:

| Location | What | Count |
|----------|------|-------|
| **Project** (`.claude/skills/`) | 6 repo-scoped slash commands | 6 |
| **Project** (`.claude/commands/`) | 10 project commands (sessions, memory, utils) | 10 |
| **Project** (`.claude/agents.off/`) | 5 agent definitions (disabled) | 5 |
| **Project** (`.claude/hooks/`) | 3 hook scripts (inactive) | 3 |
| **Project** (`scripts/`) | 4 toggle scripts for agents/hooks | 4 |
| **Project** (`.claude/sessions/`) | Session tracking directory | 1 |
| **Project** (`memory/`) | Persistent memory directory | 0 |
| **Project** (`tools/claude-monitor/`) | Monitoring server + web dashboard | 4 |
| **Project** (root) | `CLAUDE.md` + `README.md` + `.claude/settings.json` | 3 |
| **Global** (`~/.claude/skills/`) | 9 global slash commands | 9 |
| **Global** (`~/.claude/`) | Merged `settings.json` + `agents.off/` | 1 |

### File Tree

```
your-project/
  CLAUDE.md                              # Project instructions for Claude
  README.md                              # This file
  bootstrap-claude-ops.sh                # This script
  .claude/
    settings.json                        # Permissions (and hooks if opted-in)
    skills/
      plan/SKILL.md                      # /plan
      implement/SKILL.md                 # /implement
      review/SKILL.md                    # /review
      debug/SKILL.md                     # /debug
      test/SKILL.md                      # /test
      pr/SKILL.md                        # /pr
    commands/                            # Project commands (/project:name)
      session-start.md                   # /project:session-start
      session-update.md                  # /project:session-update
      session-end.md                     # /project:session-end
      session-current.md                 # /project:session-current
      session-list.md                    # /project:session-list
      session-help.md                    # /project:session-help
      memory-compact.md                  # /project:memory-compact
      checkpoint.md                      # /project:checkpoint
      status.md                          # /project:status
      init-feature.md                    # /project:init-feature
    agents.off/                          # Disabled agents (source of truth)
      explorer.md
      reviewer.md
      debugger.md
      tester.md
      designer.md
    hooks/                               # Hook scripts (inactive until opted-in)
      guard-outside-root.sh
      stop-gate.sh
      event-emitter.sh
    sessions/                            # Session tracking
      .current-session                   # Pointer to active session file
  scripts/
    enable-agents.sh
    disable-agents.sh
    enable-hooks.sh
    disable-hooks.sh
  memory/                                # Persistent memory (compacted sessions)
  tools/
    claude-monitor/
      server/app.py                      # Python event collector + API
      web/index.html                     # Real-time monitoring dashboard
      start.sh                           # Launch the monitor server
      stop.sh                            # Stop the monitor server

~/.claude/                               # Global (any repo)
  settings.json                          # Merged: preserves model, adds keys
  skills/
    session-start/SKILL.md               # /session-start
    session-update/SKILL.md              # /session-update
    session-end/SKILL.md                 # /session-end
    session-list/SKILL.md                # /session-list
    triage/SKILL.md                      # /triage
    summarize/SKILL.md                   # /summarize
    risk-check/SKILL.md                  # /risk-check
    agents-on/SKILL.md                   # /agents-on
    agents-off/SKILL.md                  # /agents-off
  agents.off/                            # Empty, for user's global agents
```

---

## Flags

```
bash bootstrap-claude-ops.sh [OPTIONS]
```

| Flag | Default | Effect |
|------|---------|--------|
| `--force` | off | Overwrite existing files. Creates `.bak` backup of each file before replacing it. |
| `--skip-global` | off | Skip all writes to `~/.claude/`. Useful if you only want project-local setup. |
| `--init-git` | off | Run `git init` in the project root after scaffolding. |
| `--enable-hooks` | off | Wire hook configuration into `.claude/settings.json` immediately. Without this flag, hooks exist as scripts but are not active. |
| `--dry-run` | off | Print what would be created without writing any files. |

### Examples

```bash
# Full setup with git
bash bootstrap-claude-ops.sh --init-git

# Preview what would happen
bash bootstrap-claude-ops.sh --dry-run

# Refresh all files (backs up originals)
bash bootstrap-claude-ops.sh --force

# Project-only, no global changes
bash bootstrap-claude-ops.sh --skip-global

# Activate hooks on first run
bash bootstrap-claude-ops.sh --enable-hooks
```

---

## Idempotency

The script is safe to run repeatedly:

- **Files**: Each file is checked with `[ -f "$path" ]` before writing. If it exists, the script prints `[SKIP]` and moves on.
- **`--force`**: When set, each existing file is copied to `file.bak` before being overwritten.
- **Directories**: Uses `mkdir -p` (no-op if already exists).
- **Global settings.json**: Merged via Python -- existing keys (like `model`) are preserved, new keys are added. Never overwritten.

---

## Skills Reference

### Global Skills (available in any repo)

| Command | What it does |
|---------|-------------|
| `/session-start [name]` | Create a timestamped session file and set it as active. |
| `/session-update [note]` | Append a progress entry to the active session with optional git diff stats. |
| `/session-end` | Close the active session with an auto-generated summary. |
| `/session-list` | Display a table of all sessions with dates and status. |
| `/triage [task]` | Scan the codebase and classify a task as Small/Medium/Large. Recommends which workflow path to follow. |
| `/summarize [target]` | Condense a file, diff, PR, or block of text into a structured summary. |
| `/risk-check [target]` | Assess breaking changes, security, performance, and reliability risks. Includes a rollback plan. |
| `/agents-on` | Copy agent definitions from `.claude/agents.off/` to `.claude/agents/` to activate them. |
| `/agents-off` | Remove agent definitions from `.claude/agents/` (originals stay safe in `agents.off/`). |

### Repo Skills (project-scoped)

| Command | What it does |
|---------|-------------|
| `/plan` | Design-first planning. Scales depth by complexity: S gets bullet points, L gets full architecture docs. Won't implement until you approve. |
| `/implement` | Build following the plan. Runs tests as it goes, ends with a quality gate checklist. |
| `/review` | Code review covering correctness, security (OWASP), performance, maintainability, and test coverage. Outputs a verdict. |
| `/debug` | Root cause analysis workflow: gather info, reproduce, isolate, fix minimally, write regression test. |
| `/test` | Write, run, or analyze test coverage. Detects test framework automatically. |
| `/pr` | Pre-PR checks (tests pass, no uncommitted changes, no conflicts) then creates a structured PR via `gh`. |

### Project Commands (`/project:name`)

Commands are prompt files in `.claude/commands/`. Invoke them as `/project:command-name`. Adapted from [claude-sessions](https://github.com/iannuttall/claude-sessions).

#### Session Commands

| Command | What it does |
|---------|-------------|
| `/project:session-start [name]` | Create a session file in `.claude/sessions/YYYY-MM-DD-HHMM-name.md`, set active. |
| `/project:session-update [notes]` | Append timestamped update with git status, todo status, and code changes. |
| `/project:session-end` | Close session with comprehensive summary (duration, git, todos, lessons, tips). |
| `/project:session-current` | Show active session status, duration, and recent updates. |
| `/project:session-list` | List all session files sorted by recent, highlight active session. |
| `/project:session-help` | Show help for all session commands with example workflow. |

#### Memory Commands

| Command | What it does |
|---------|-------------|
| `/project:memory-compact` | Compact all sessions into `memory/memory.md` -- extracts decisions, patterns, lessons, and gotchas. Pass "full" or "brief" for detail level. |

#### Utility Commands

| Command | What it does |
|---------|-------------|
| `/project:checkpoint [msg]` | Quick git commit of all changes. Auto-generates message if none provided. Updates active session. |
| `/project:status` | Dashboard showing git status, active session, agents, hooks, monitor, and memory state. |
| `/project:init-feature name` | Create `feature/name` branch + start a session tracking it. |

### Recommended Workflow

```
/project:session-start [name]
        |
        v
    /triage [task]  -----> Complexity: S / M / L
        |
        v
    /plan           -----> (skip for S, required for M/L)
        |
        v
    /implement      -----> builds + tests as it goes
        |
        v
    /test           -----> verify coverage
        |
        v
    /review         -----> quality gate
        |
        v
    /risk-check     -----> pre-ship safety check
        |
        v
    /pr             -----> ship it
        |
        v
/project:session-end
```

Phase mapping: **Explore** (`/triage`) -> **Plan** (`/plan`) -> **Implement** (`/implement`) -> **Verify** (`/test`) -> **Review** (`/review`) -> **Ship** (`/pr`)

---

## Agents

Five agents are included, all **disabled by default**. They live in `.claude/agents.off/` and are only loaded by Claude Code when copied to `.claude/agents/`.

| Agent | Model | Can Write? | Purpose |
|-------|-------|-----------|---------|
| `explorer` | haiku | No | Fast read-only codebase exploration. Finds files, traces dependencies, answers questions about code. |
| `reviewer` | sonnet | No | Code review analysis. Checks for OWASP vulnerabilities, identifies bugs, categorizes as Critical/Warning/Suggestion. |
| `debugger` | sonnet | Yes | Diagnose and fix bugs. Traces execution paths, applies minimal fixes, writes regression tests. |
| `tester` | sonnet | Yes | Write and run tests. Analyzes coverage gaps, generates test data and fixtures. |
| `designer` | sonnet | No | Technical architecture. Designs systems, evaluates trade-offs, maps data flows. |

### Enabling / Disabling

```bash
# Option A: Use the slash commands (inside Claude Code)
/agents-on       # copies agents.off/*.md -> agents/*.md
/agents-off      # removes agents/*.md

# Option B: Use the shell scripts
bash scripts/enable-agents.sh
bash scripts/disable-agents.sh
```

Both approaches require restarting or refreshing the Claude Code session.

---

## Hooks

Three hook scripts are included, all **inactive by default**. The scripts exist in `.claude/hooks/` but are not wired into settings.json unless you opt in.

### `guard-outside-root.sh` (PreToolUse: Bash)

A security guard that inspects every Bash command before execution. Denies:

- `..` path traversal
- UNC paths (`\\server\share`)
- `/mnt/` cross-filesystem access (WSL)
- Windows absolute paths (`C:\...`)
- Dangerous operations (`rm -rf`, `shutdown`, `reboot`, `mkfs`, etc.)

Uses Python to parse the hook's JSON input (no `jq` dependency).

### `stop-gate.sh` (Stop)

Runs the project's fast test suite before allowing Claude to stop working. If tests fail, it blocks the stop and asks Claude to fix them first.

- Detects `npm test` (Node) or `pytest` (Python) automatically
- Includes a loop guard (`CLAUDE_STOP_GATE_RAN` env var) to prevent re-entry

### `event-emitter.sh` (PreToolUse, PostToolUse, Stop)

Enriches each hook event with metadata (timestamp, hook type, project root, session ID) via Python, then POSTs the JSON to `http://localhost:3777/events` (fire-and-forget). Silent when the monitoring server isn't running. This is the data pipeline for claude-monitor.

When hooks are enabled, the event emitter fires on all three hook types -- giving the monitor full visibility into what Claude Code is doing.

### Enabling / Disabling Hooks

```bash
# Option A: Bootstrap with hooks active from the start
bash bootstrap-claude-ops.sh --enable-hooks

# Option B: Enable after the fact
bash scripts/enable-hooks.sh    # adds hooks to .claude/settings.json
                                 # removes disableAllHooks from ~/.claude/settings.json

# Disable
bash scripts/disable-hooks.sh   # removes hooks from .claude/settings.json
                                 # restores disableAllHooks in ~/.claude/settings.json
```

Restart your Claude Code session after toggling hooks.

---

## Session Tracking

Sessions give you a log of what happened during a block of work. Session commands are adapted from [claude-sessions](https://github.com/iannuttall/claude-sessions).

### How It Works

1. `/project:session-start my-feature` creates `.claude/sessions/2025-01-15-1430-my-feature.md` with goals and an empty progress section.
2. `/project:session-update shipped the auth middleware` appends a timestamped entry with git status, todo progress, and code changes.
3. `/project:session-end` appends a comprehensive summary (duration, all files changed, todos, accomplishments, lessons learned, tips for future devs), then clears the active pointer.
4. `/project:session-current` shows the active session status and duration.
5. `/project:session-list` lists all sessions sorted by most recent.
6. `/project:session-help` shows full help and example workflow.

The active session is tracked via `.claude/sessions/.current-session` (contains the filename of the current session).

### Memory System

Over time, session files accumulate. Use `/project:memory-compact` to distill them into `memory/memory.md` -- a persistent knowledge base of architectural decisions, patterns, lessons, and gotchas. This file persists across sessions and gives Claude (or a new developer) immediate context about the project's history.

---

## claude-monitor

A real-time monitoring dashboard for Claude Code activity. Tracks every tool use, skill invocation, agent spawn, file access, and hook event -- all stored in SQLite and displayed in a live web dashboard.

**Zero dependencies** beyond Python 3.7+ stdlib. No npm, no pip, no Docker.

### Quick Start

```bash
# Start the monitor server (background)
bash tools/claude-monitor/start.sh

# Enable hooks so Claude Code sends events to the monitor
bash scripts/enable-hooks.sh

# Open the dashboard
# http://localhost:3777

# When done, stop the server
bash tools/claude-monitor/stop.sh
```

### Architecture

```
Claude Code session
    |
    |  PreToolUse / PostToolUse / Stop hooks
    v
event-emitter.sh
    |  enriches with: timestamp, hook_type, project_root, session_id
    |  POST JSON (fire-and-forget, async)
    v
localhost:3777/events  (tools/claude-monitor/server/app.py)
    |  parses JSON, extracts structured fields
    |  stores in SQLite (tools/claude-monitor/server/monitor.db)
    v
REST API  (/api/events, /api/stats, /api/events/:id, /api/health)
    |
    v
Web Dashboard  (tools/claude-monitor/web/index.html)
    auto-refreshes every 3 seconds
```

### What It Tracks

| Category | How |
|----------|-----|
| **Tool usage** | Every tool call (Bash, Read, Write, Edit, Grep, Glob, etc.) with input/output previews |
| **Skills** | Detects `/triage`, `/plan`, `/implement`, etc. when the Skill tool is invoked |
| **Agents & subagents** | Detects agent spawns from the Task tool (explorer, reviewer, debugger, etc.) |
| **Files** | Extracts file paths from Read, Write, Edit, Glob, and Grep tool inputs |
| **Hooks** | Counts PreToolUse, PostToolUse, and Stop events separately |
| **Sessions** | Groups events by Claude Code session ID, shows first/last seen timestamps |
| **Guard decisions** | Tracks allow/deny decisions from the guard-outside-root hook |
| **Hourly activity** | Aggregates events by hour for a timeline chart |

### Dashboard

The dashboard (`http://localhost:3777`) is a single-page app with:

- **Summary cards** -- Total events, unique tools, skills invoked, files touched, agents used, sessions
- **Live event feed** -- Scrolling list of events (newest first), click any event for full JSON detail
- **Tool usage chart** -- Horizontal bar chart with color-coded tools
- **Tabbed panel** -- Skills / Agents / Hooks / Files / Sessions with bar charts and lists
- **Hourly activity timeline** -- Bar chart of events per hour
- **Auto-refresh** -- Polls every 3 seconds (toggle on/off)
- **Clear data** -- Wipe all events and start fresh

Dark theme, responsive layout, no external dependencies.

### API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/events` | POST | Ingest a hook event (JSON body) |
| `/api/events` | GET | Query events. Params: `limit`, `offset`, `tool`, `hook_type`, `session`, `since` |
| `/api/events/:id` | GET | Full event detail including raw JSON |
| `/api/stats` | GET | Aggregated statistics (tools, skills, agents, files, sessions, hourly) |
| `/api/events` | DELETE | Clear all events |
| `/api/health` | GET | Server status check |
| `/` | GET | Serve the dashboard |

### Event Enrichment

The `event-emitter.sh` hook enriches raw hook JSON with metadata before posting:

```json
{
  "tool_name": "Bash",
  "tool_input": { "command": "npm test" },
  "_hook_type": "PostToolUse",
  "_timestamp": "2025-01-15T14:30:00+00:00",
  "_project_root": "/h/claude-workflow",
  "_session_id": "abc-123"
}
```

The server then extracts structured fields (tool name, file paths, skill names, agent names) and stores them in indexed SQLite columns for fast querying.

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MONITOR_PORT` | `3777` | Port for the server and event ingestion |

Set via environment: `MONITOR_PORT=8080 bash tools/claude-monitor/start.sh`

### Data Location

- **Database**: `tools/claude-monitor/server/monitor.db` (SQLite, auto-created on first run)
- **PID file**: `tools/claude-monitor/server/monitor.pid`

The database is gitignored-safe (add `*.db` to `.gitignore`). To reset, stop the server and delete `monitor.db`.

---

## Script Internals

### How `write_file` Works

Every file write goes through a single function:

```
write_file PATH <<'EOF'
content here
EOF
```

1. **Dry-run?** Print `[DRY-RUN]` and return.
2. **File exists and no `--force`?** Print `[SKIP]` and return.
3. **File exists and `--force`?** Copy to `file.bak`, then overwrite.
4. **Otherwise:** `mkdir -p` the parent directory and write the content.

Using heredocs with a quoted delimiter (`<<'EOF'`) avoids all shell quoting and variable expansion issues -- the content is written exactly as-is.

### How `merge_json` Works

Global `settings.json` is never overwritten. Instead, a Python one-liner:

```python
existing.update({k: v for k, v in new.items() if k not in existing})
```

This adds new keys but never replaces existing ones (preserving your `model`, `apiKey`, etc.).

### Execution Order

```
parse_args()
create_directories()          # mkdir -p for entire tree
write_claude_md()             # CLAUDE.md
write_readme()                # README.md
write_project_settings()      # .claude/settings.json
merge_global_settings()       # ~/.claude/settings.json (merge, not overwrite)
write_repo_skills()           # 6 repo SKILL.md files
write_global_skills()         # 9 global SKILL.md files (skipped with --skip-global)
create_sessions_dir()         # .claude/sessions/ + .current-session
write_commands()              # 10 command .md files in .claude/commands/
write_agent_definitions()     # 5 agent .md files in agents.off/
write_toggle_scripts()        # enable-agents.sh, disable-agents.sh
write_hook_scripts()          # 3 hook .sh files
write_hook_toggle_scripts()   # enable-hooks.sh, disable-hooks.sh
write_monitor_files()         # server/app.py, web/index.html, start.sh, stop.sh
git init (if --init-git)
validate()                    # checks every expected file, prints report
```

### Validation Report

At the end of every run (except `--dry-run`), the script checks:

- Every expected file exists (`[OK]` or `[MISSING]`) -- including all 10 command files
- `.claude/agents/` is empty (agents disabled as expected)
- `hooks` key is absent from settings.json (unless `--enable-hooks`)
- `memory/` directory exists
- All global files exist (unless `--skip-global`)

---

## Requirements

- **Bash** (Git Bash / MINGW64 on Windows, or native on Linux/macOS)
- **Python 3.7+** (for JSON merging, hook input parsing, and the monitoring server; stdlib only)
- **No other dependencies** (`jq`, `node`, `pip install`, etc. are not required)

---

## Portability

The script was built for Windows (MINGW64/Git Bash) but works on any system with Bash and Python:

- All paths use POSIX style internally (Git Bash translates Windows paths)
- Python is invoked as `python` (adjust to `python3` if needed on your system)
- No Windows-specific commands are used in the script itself
- The guard hook's deny rules cover both Windows and Unix path patterns

---

## Uninstalling

To remove everything the script created:

```bash
# Project files
rm -rf .claude/ scripts/ memory/ tools/ CLAUDE.md README.md

# Global files (careful -- this removes all global skills)
rm -rf ~/.claude/skills/ ~/.claude/agents.off/

# Or to remove only specific global skills:
rm -rf ~/.claude/skills/{session-start,session-update,session-end,session-list}
rm -rf ~/.claude/skills/{triage,summarize,risk-check,agents-on,agents-off}
```

The global `settings.json` will retain the `disableAllHooks` key. Remove it manually if unwanted:

```bash
python -c "
import json
p = '$HOME/.claude/settings.json'
s = json.load(open(p))
s.pop('disableAllHooks', None)
json.dump(s, open(p, 'w'), indent=2)
"
```
README_EOF
}

write_project_settings() {
  echo ""
  echo "=== Writing project settings ==="

  if [ "$ENABLE_HOOKS" = true ]; then
    write_file "$PROJECT_ROOT/.claude/settings.json" <<'EOF'
{
  "permissions": {
    "allow": [
      "Read",
      "Glob",
      "Grep",
      "Bash(git *)",
      "Bash(npm test*)",
      "Bash(npm run *)",
      "Bash(npx *)",
      "Bash(python *)",
      "Bash(ls *)",
      "Bash(cat *)"
    ],
    "deny": [
      "Bash(rm -rf /)",
      "Bash(rm -rf ~)",
      "Bash(: > *)",
      "Bash(shutdown*)",
      "Bash(reboot*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/guard-outside-root.sh"
          }
        ]
      },
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/event-emitter.sh PreToolUse",
            "timeout": 3000
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/event-emitter.sh PostToolUse",
            "timeout": 3000
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/stop-gate.sh"
          }
        ]
      },
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/event-emitter.sh Stop",
            "timeout": 3000
          }
        ]
      }
    ]
  }
}
EOF
  else
    write_file "$PROJECT_ROOT/.claude/settings.json" <<'EOF'
{
  "permissions": {
    "allow": [
      "Read",
      "Glob",
      "Grep",
      "Bash(git *)",
      "Bash(npm test*)",
      "Bash(npm run *)",
      "Bash(npx *)",
      "Bash(python *)",
      "Bash(ls *)",
      "Bash(cat *)"
    ],
    "deny": [
      "Bash(rm -rf /)",
      "Bash(rm -rf ~)",
      "Bash(: > *)",
      "Bash(shutdown*)",
      "Bash(reboot*)"
    ]
  }
}
EOF
  fi
}

merge_global_settings() {
  echo ""
  echo "=== Merging global settings ==="
  if [ "$SKIP_GLOBAL" = true ]; then
    echo "[SKIP] Global settings (--skip-global)"
    return
  fi
  merge_json "$GLOBAL_CLAUDE/settings.json" '{"disableAllHooks": true}'
}

# =============================================================================
# Repo Skills (6)
# =============================================================================
write_repo_skills() {
  echo ""
  echo "=== Writing repo skills ==="

  # --- /plan ---
  write_file "$PROJECT_ROOT/.claude/skills/plan/SKILL.md" <<'SKILL_EOF'
---
name: plan
description: Design-first planning with complexity-based depth
user_invocable: true
---

# /plan - Design-First Planning

When the user invokes /plan, follow this process:

## 1. Understand the Request
- Read the user's task description carefully
- If no /triage was run first, do a quick complexity assessment (S/M/L)

## 2. Explore Before Planning
- Use Glob and Grep to find relevant existing code
- Read key files that will be affected
- Identify patterns and conventions already in use

## 3. Create the Plan

### For Small tasks (S):
- Brief approach (3-5 bullet points)
- List files to modify
- Note any risks

### For Medium tasks (M):
- Detailed step-by-step plan
- List all files to create/modify/delete
- Identify dependencies and ordering
- Note edge cases and risks
- Suggest test approach

### For Large tasks (L):
- Full architectural design
- Break into phases/milestones
- Dependency graph between components
- Risk assessment with mitigations
- Testing strategy per phase
- Consider if task should be split into multiple PRs

## 4. Present for Approval
- Show the plan clearly with markdown formatting
- Ask user to approve, modify, or reject
- Do NOT start implementing until approved

## Output Format
```markdown
# Plan: [Task Title]

## Complexity: [S/M/L]
## Approach
[Description]

## Steps
1. [Step with file paths]
2. ...

## Files Affected
- [path] - [what changes]

## Risks
- [risk and mitigation]

## Test Plan
- [what to test]
```
SKILL_EOF

  # --- /implement ---
  write_file "$PROJECT_ROOT/.claude/skills/implement/SKILL.md" <<'SKILL_EOF'
---
name: implement
description: Build following plan, test as you go, quality gate at end
user_invocable: true
---

# /implement - Complexity-Routed Implementation

When the user invokes /implement, follow this process:

## 1. Check for Plan
- Look for a recent /plan output in conversation
- If no plan exists, ask: "Run /plan first, or should I do a quick plan inline?"

## 2. Implementation Strategy

### Small (S) - Direct Implementation
- Implement changes directly
- Run tests after each change
- Self-review before reporting done

### Medium (M) - Step-by-Step
- Follow plan steps in order
- After each step: run relevant tests
- Commit logical units (if git is initialized)
- Report progress after each major step

### Large (L) - Phased with Checkpoints
- Implement one phase at a time
- After each phase: run tests, self-review
- Checkpoint with user between phases
- Do NOT proceed to next phase without confirmation

## 3. Quality Gate (before reporting done)
Run this checklist:
- [ ] All planned changes implemented
- [ ] No unintended side effects in modified files
- [ ] Tests pass (run them)
- [ ] No obvious security issues (check OWASP basics)
- [ ] Code follows existing project conventions
- [ ] No leftover debug code or TODOs from this session

## 4. Report
```markdown
## Implementation Complete

### Changes Made
- [file]: [what changed]

### Tests
- [test results summary]

### Notes
- [anything the user should know]

### Suggested Next Steps
- [e.g., run /review, run /test for more coverage]
```
SKILL_EOF

  # --- /review ---
  write_file "$PROJECT_ROOT/.claude/skills/review/SKILL.md" <<'SKILL_EOF'
---
name: review
description: Code review with quality gates
user_invocable: true
---

# /review - Code Review

When the user invokes /review, follow this process:

## 1. Determine Scope
- If argument given (file path, PR number): review that
- If no argument: review all uncommitted changes (git diff)
- If no git: ask user what to review

## 2. Review Checklist

### Correctness
- Logic errors or off-by-one bugs
- Null/undefined handling
- Edge cases not covered
- Race conditions or async issues

### Security
- Input validation and sanitization
- Injection vulnerabilities (SQL, XSS, command)
- Authentication/authorization gaps
- Secrets or credentials in code
- OWASP Top 10 considerations

### Performance
- Unnecessary loops or repeated work
- Missing indexes on DB queries
- Large memory allocations
- N+1 query patterns
- Missing caching opportunities

### Maintainability
- Clear naming and structure
- Appropriate abstraction level
- Dead code or unused imports
- Missing error handling
- Code duplication

### Test Coverage
- Are critical paths tested?
- Are edge cases tested?
- Are error paths tested?
- Test quality (not just quantity)

## 3. Output Format
```markdown
## Code Review: [scope]

### Summary
[1-2 sentence overall assessment]

### Issues Found

#### Critical (must fix)
- [file:line] [issue description]

#### Warning (should fix)
- [file:line] [issue description]

#### Suggestion (nice to have)
- [file:line] [issue description]

### Verdict: [APPROVE / REQUEST CHANGES / NEEDS DISCUSSION]
```
SKILL_EOF

  # --- /debug ---
  write_file "$PROJECT_ROOT/.claude/skills/debug/SKILL.md" <<'SKILL_EOF'
---
name: debug
description: Diagnose and fix bugs with root cause analysis
user_invocable: true
---

# /debug - Diagnose and Fix

When the user invokes /debug, follow this process:

## 1. Gather Information
- What is the expected behavior?
- What is the actual behavior?
- When did it start (if known)?
- Read error messages/logs carefully

## 2. Reproduce
- Try to reproduce the issue by reading the relevant code path
- Identify the exact point of failure

## 3. Root Cause Analysis
- Trace the code path from entry to failure
- Use Grep to find related code and callers
- Check recent changes that might have caused this
- Look for similar patterns elsewhere that work correctly

## 4. Fix
- Make the minimal change to fix the root cause
- Do NOT refactor surrounding code (unless it caused the bug)
- Preserve existing behavior for non-buggy paths

## 5. Verify
- Confirm the fix addresses the root cause
- Check for similar bugs elsewhere (same pattern)
- Run existing tests
- Write a regression test if possible

## 6. Report
```markdown
## Debug Report

### Problem
[Description of the bug]

### Root Cause
[What was actually wrong and why]

### Fix
[What was changed and why this fixes it]

### Files Modified
- [file]: [change description]

### Regression Test
[Test added or why not]

### Related
[Any similar patterns that might have the same issue]
```
SKILL_EOF

  # --- /test ---
  write_file "$PROJECT_ROOT/.claude/skills/test/SKILL.md" <<'SKILL_EOF'
---
name: test
description: Write, run, and improve tests
user_invocable: true
---

# /test - Test Management

When the user invokes /test, follow this process:

## 1. Determine Intent
- `/test` (no args): run existing test suite
- `/test [file/function]`: write tests for specified code
- `/test coverage`: analyze and improve test coverage

## 2. Running Tests
- Detect test framework from package.json, pytest.ini, etc.
- Run tests and report results clearly
- On failure: show relevant error with context

## 3. Writing Tests
When writing new tests:
- Follow existing test patterns and conventions in the project
- Test the happy path first
- Add edge cases: null, empty, boundary values
- Add error cases: invalid input, network failures
- Use descriptive test names that explain the scenario
- Keep tests independent (no shared mutable state)

## 4. Coverage Analysis
- Identify untested functions/branches
- Prioritize: critical paths > edge cases > unlikely paths
- Suggest which tests would add the most value

## 5. Output Format
```markdown
## Test Results

### Suite: [name]
- Total: [n] | Passed: [n] | Failed: [n] | Skipped: [n]

### Failures
- [test name]: [failure reason]

### New Tests Written
- [test file]: [what it covers]

### Coverage Gaps
- [file/function]: [what is not tested]
```
SKILL_EOF

  # --- /pr ---
  write_file "$PROJECT_ROOT/.claude/skills/pr/SKILL.md" <<'SKILL_EOF'
---
name: pr
description: Pre-PR checks and structured PR creation
user_invocable: true
---

# /pr - Pull Request Creation

When the user invokes /pr, follow this process:

## 1. Pre-PR Checklist
Before creating the PR, verify:
- [ ] All tests pass
- [ ] No uncommitted changes remain
- [ ] Branch is up to date with base branch
- [ ] No merge conflicts
- [ ] No debug/temp code left behind

## 2. Analyze Changes
- Run `git diff main...HEAD` (or appropriate base branch)
- Categorize changes: feature, bugfix, refactor, docs, etc.
- Identify the key changes vs. supporting changes

## 3. Create PR
Use `gh pr create` with structured format:

```bash
gh pr create --title "[type]: [concise description]" --body "$(cat <<'PRBODY'
## Summary
[1-3 bullet points describing what and why]

## Changes
- [Key change 1]
- [Key change 2]

## Testing
- [How this was tested]
- [Test results]

## Risk Assessment
- Breaking changes: [yes/no, details]
- Rollback plan: [how to revert if needed]
PRBODY
)"
```

## 4. Report
- Show the PR URL
- Note any warnings from pre-PR checks
- Suggest reviewers if team conventions are known
SKILL_EOF
}

# =============================================================================
# Global Skills (9)
# =============================================================================
write_global_skills() {
  echo ""
  echo "=== Writing global skills ==="

  # --- /session-start ---
  write_file "$GLOBAL_CLAUDE/skills/session-start/SKILL.md" <<'SKILL_EOF'
---
name: session-start
description: Begin a tracked work session
user_invocable: true
---

# /session-start - Begin Tracked Session

When the user invokes /session-start [name], do the following:

## 1. Create Session File
- Generate timestamp: YYYY-MM-DD_HH-MM
- Session file: `sessions/[timestamp]_[name].md`
- Ensure `sessions/` directory exists

## 2. Write Session Header
```markdown
# Session: [name]
- Started: [ISO timestamp]
- Status: ACTIVE

## Goals
- [Ask user or infer from context]

## Progress Log
```

## 3. Set Active Session
- Write the session filename to `sessions/.current-session`

## 4. Confirm
Report: "Session started: [filename]. Use /session-update to log progress."
SKILL_EOF

  # --- /session-update ---
  write_file "$GLOBAL_CLAUDE/skills/session-update/SKILL.md" <<'SKILL_EOF'
---
name: session-update
description: Log progress in current session
user_invocable: true
---

# /session-update - Log Session Progress

When the user invokes /session-update [note], do the following:

## 1. Find Active Session
- Read `sessions/.current-session` to get the active session file
- If no active session, tell user to run /session-start first

## 2. Gather Context
- Current timestamp
- The user's note (if provided)
- If git is available: `git diff --stat` for recent changes

## 3. Append Entry
Append to the session file:
```markdown
### [timestamp]
[user note or auto-generated summary]

**Changes:**
[git diff stat or "no git changes"]
```

## 4. Confirm
Report: "Session updated with [n] changes noted."
SKILL_EOF

  # --- /session-end ---
  write_file "$GLOBAL_CLAUDE/skills/session-end/SKILL.md" <<'SKILL_EOF'
---
name: session-end
description: Close and summarize work session
user_invocable: true
---

# /session-end - Close Session

When the user invokes /session-end, do the following:

## 1. Find Active Session
- Read `sessions/.current-session`
- If no active session, report "No active session found"

## 2. Generate Summary
Read the session file and create a closing summary:
```markdown
## Session Summary
- Duration: [calculated from start time]
- Status: COMPLETED

### Accomplishments
- [Bullet list of what was done, derived from progress log]

### Open Items
- [Anything mentioned but not completed]

### Key Decisions
- [Important choices made during session]
```

## 3. Append summary to session file and change Status to COMPLETED

## 4. Clear Active Session
- Remove or empty `sessions/.current-session`

## 5. Confirm
Report: "Session closed. Summary written to [filename]."
SKILL_EOF

  # --- /session-list ---
  write_file "$GLOBAL_CLAUDE/skills/session-list/SKILL.md" <<'SKILL_EOF'
---
name: session-list
description: List all tracked sessions
user_invocable: true
---

# /session-list - View All Sessions

When the user invokes /session-list, do the following:

## 1. Find Sessions
- List all `.md` files in `sessions/` directory
- Read the first few lines of each to get name, date, and status

## 2. Display Table
```markdown
| # | Date       | Name           | Status    |
|---|------------|----------------|-----------|
| 1 | 2025-01-15 | feature-auth   | COMPLETED |
| 2 | 2025-01-16 | bugfix-login   | ACTIVE    |
```

## 3. Show Active
- If there is a current active session (from .current-session), highlight it
- Show: "Active session: [name]" or "No active session"
SKILL_EOF

  # --- /triage ---
  write_file "$GLOBAL_CLAUDE/skills/triage/SKILL.md" <<'SKILL_EOF'
---
name: triage
description: Quick-scan task and classify complexity
user_invocable: true
---

# /triage - Task Complexity Assessment

When the user invokes /triage [task description], do the following:

## 1. Quick Scan
- Read the task description
- Scan the codebase structure (Glob for key files)
- Identify affected areas

## 2. Classify Complexity

### Small (S) - Direct Implementation
Criteria (most of these true):
- Single file or 2-3 closely related files
- Clear, well-defined change
- Low risk of side effects
- Existing patterns to follow
- < 1 hour estimated effort

### Medium (M) - Planned Implementation
Criteria (most of these true):
- 3-10 files affected
- Some design decisions needed
- Moderate risk of side effects
- May need new patterns
- Cross-cutting concerns (tests, docs)

### Large (L) - Phased Implementation
Criteria (any of these true):
- 10+ files affected
- Significant architecture decisions
- High risk or breaking changes
- Multiple phases needed
- New subsystems or major refactoring

## 3. Recommend Workflow
```markdown
## Triage: [task summary]

### Complexity: [S/M/L]

### Assessment
- Files likely affected: [count and list key ones]
- Risk level: [Low/Medium/High]
- Key concerns: [what could go wrong]

### Recommended Workflow
[S] -> /implement directly (simple enough to skip /plan)
[M] -> /plan first, then /implement, then /test
[L] -> /plan (detailed), then /implement (phased), /test, /review

### Quick Notes
- [Any important context discovered during scan]
```
SKILL_EOF

  # --- /summarize ---
  write_file "$GLOBAL_CLAUDE/skills/summarize/SKILL.md" <<'SKILL_EOF'
---
name: summarize
description: Condense file, diff, PR, or text into structured summary
user_invocable: true
---

# /summarize - Structured Summarization

When the user invokes /summarize [target], do the following:

## 1. Identify Target
- File path: read and summarize the file
- "diff" or no arg: summarize current git diff
- PR number: summarize PR changes
- Pasted text: summarize the provided text

## 2. Create Summary
```markdown
## Summary: [target]

### Overview
[1-2 sentence high-level summary]

### Key Points
- [Important point 1]
- [Important point 2]
- [Important point 3]

### Details
[Structured breakdown by section/component/change type]

### Action Items
- [If applicable: what needs attention or follow-up]
```

## 3. Adapt to Context
- For code files: focus on purpose, API, dependencies
- For diffs: focus on what changed and why
- For PRs: focus on scope, risk, review needs
- For text: focus on key decisions and action items
SKILL_EOF

  # --- /risk-check ---
  write_file "$GLOBAL_CLAUDE/skills/risk-check/SKILL.md" <<'SKILL_EOF'
---
name: risk-check
description: Assess risk before taking action
user_invocable: true
---

# /risk-check - Risk Assessment

When the user invokes /risk-check [target], do the following:

## 1. Identify What to Assess
- If target is a file/diff: assess the changes
- If target is a description: assess the proposed action
- If no target: assess current uncommitted changes

## 2. Risk Categories

### Breaking Changes
- API contract changes
- Database schema changes
- Configuration format changes
- Dependency version bumps

### Security
- New input vectors
- Authentication/authorization changes
- Secrets management
- Third-party dependencies

### Performance
- New database queries
- Loop complexity changes
- Memory allocation patterns
- Network call additions

### Reliability
- Error handling coverage
- Fallback mechanisms
- Timeout handling
- Data consistency

## 3. Output
```markdown
## Risk Assessment: [target]

### Overall Risk: [LOW / MEDIUM / HIGH / CRITICAL]

| Category       | Risk   | Details                    |
|---------------|--------|----------------------------|
| Breaking      | [L/M/H]| [brief explanation]        |
| Security      | [L/M/H]| [brief explanation]        |
| Performance   | [L/M/H]| [brief explanation]        |
| Reliability   | [L/M/H]| [brief explanation]        |

### Recommendations
- [Specific action to mitigate each medium+ risk]

### Rollback Plan
- [How to revert if something goes wrong]
```
SKILL_EOF

  # --- /agents-on ---
  write_file "$GLOBAL_CLAUDE/skills/agents-on/SKILL.md" <<'SKILL_EOF'
---
name: agents-on
description: Enable project agents
user_invocable: true
---

# /agents-on - Enable Agents

When the user invokes /agents-on, do the following:

## 1. Check for Agent Definitions
- Look for `.claude/agents.off/` directory in the project root
- If it does not exist or is empty, report "No agent definitions found in .claude/agents.off/"

## 2. Enable Agents
- Create `.claude/agents/` directory if it does not exist
- Copy all `.md` files from `.claude/agents.off/` to `.claude/agents/`
- Do NOT remove files from agents.off/ (keep as source of truth)

## 3. Report
```
Agents enabled:
- explorer (haiku) - read-only codebase exploration
- reviewer (sonnet) - code review analysis
- debugger (sonnet) - diagnose and fix bugs
- tester (sonnet) - write and run tests
- designer (sonnet) - technical architecture
```

Note: Agents take effect when a new Claude Code session starts or the current session is refreshed.
SKILL_EOF

  # --- /agents-off ---
  write_file "$GLOBAL_CLAUDE/skills/agents-off/SKILL.md" <<'SKILL_EOF'
---
name: agents-off
description: Disable project agents
user_invocable: true
---

# /agents-off - Disable Agents

When the user invokes /agents-off, do the following:

## 1. Check for Active Agents
- Look for `.claude/agents/` directory in the project root
- If it does not exist or is empty, report "No active agents found"

## 2. Disable Agents
- Remove all `.md` files from `.claude/agents/`
- Optionally remove the `.claude/agents/` directory itself
- The source definitions remain safe in `.claude/agents.off/`

## 3. Report
```
Agents disabled. All agent definitions remain in .claude/agents.off/
Re-enable anytime with /agents-on
```

Note: Agents are removed on next Claude Code session start or refresh.
SKILL_EOF
}

# =============================================================================
# Phase 2: Agent definitions
# =============================================================================
write_agent_definitions() {
  echo ""
  echo "=== Writing agent definitions ==="

  write_file "$PROJECT_ROOT/.claude/agents.off/explorer.md" <<'AGENT_EOF'
---
name: explorer
model: haiku
tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Explorer Agent

You are a fast, read-only codebase exploration agent. Your job is to quickly find and understand code.

## Capabilities
- Search for files, patterns, and definitions
- Read and analyze code structure
- Answer questions about the codebase
- Map dependencies and call graphs

## Constraints
- You are READ-ONLY. Never modify files.
- Do not use Write or Edit tools.
- Focus on speed over thoroughness for initial scans.
- Report findings concisely with file paths and line numbers.
AGENT_EOF

  write_file "$PROJECT_ROOT/.claude/agents.off/reviewer.md" <<'AGENT_EOF'
---
name: reviewer
model: sonnet
tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Reviewer Agent

You are a code review specialist. Analyze code for correctness, security, performance, and maintainability.

## Capabilities
- Review diffs and changed files
- Check for common vulnerability patterns (OWASP Top 10)
- Assess code quality and test coverage
- Identify potential bugs and edge cases

## Constraints
- You are READ-ONLY. Never modify files.
- Do not use Write or Edit tools.
- Be specific: reference file paths and line numbers.
- Categorize findings as Critical / Warning / Suggestion.
AGENT_EOF

  write_file "$PROJECT_ROOT/.claude/agents.off/debugger.md" <<'AGENT_EOF'
---
name: debugger
model: sonnet
tools:
  - Read
  - Edit
  - Bash
  - Grep
  - Glob
---

# Debugger Agent

You are a debugging specialist. Diagnose issues through systematic root cause analysis.

## Capabilities
- Trace code execution paths
- Read logs and error messages
- Identify root causes
- Apply minimal targeted fixes
- Write regression tests

## Approach
1. Reproduce: understand the failure
2. Isolate: narrow down the cause
3. Identify: find the root cause (not just symptoms)
4. Fix: make the minimal correct change
5. Verify: confirm the fix works and nothing else broke
AGENT_EOF

  write_file "$PROJECT_ROOT/.claude/agents.off/tester.md" <<'AGENT_EOF'
---
name: tester
model: sonnet
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
---

# Tester Agent

You are a testing specialist. Write comprehensive tests and analyze test coverage.

## Capabilities
- Write unit, integration, and end-to-end tests
- Analyze code coverage gaps
- Run test suites and report results
- Generate test data and fixtures

## Principles
- Follow existing test patterns in the project
- Test behavior, not implementation
- Cover: happy path, edge cases, error cases
- Keep tests independent and deterministic
- Use descriptive test names that explain the scenario
AGENT_EOF

  write_file "$PROJECT_ROOT/.claude/agents.off/designer.md" <<'AGENT_EOF'
---
name: designer
model: sonnet
tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Designer Agent

You are a technical architecture and design specialist. Help design systems and plan implementations.

## Capabilities
- Analyze existing architecture
- Design new components and systems
- Evaluate trade-offs between approaches
- Create technical design documents
- Map dependencies and data flows

## Constraints
- You are READ-ONLY. Never modify files.
- Do not use Write or Edit tools.
- Present multiple options with trade-offs when applicable.
- Consider scalability, maintainability, and team conventions.
AGENT_EOF
}

# =============================================================================
# Phase 2: Toggle scripts
# =============================================================================
write_toggle_scripts() {
  echo ""
  echo "=== Writing toggle scripts ==="

  write_file "$PROJECT_ROOT/scripts/enable-agents.sh" <<'SCRIPT_EOF'
#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$PROJECT_ROOT/.claude/agents.off"
TARGET="$PROJECT_ROOT/.claude/agents"

if [ ! -d "$SOURCE" ] || [ -z "$(ls -A "$SOURCE" 2>/dev/null)" ]; then
  echo "No agent definitions found in .claude/agents.off/"
  exit 1
fi

mkdir -p "$TARGET"
cp "$SOURCE"/*.md "$TARGET"/
echo "Agents enabled:"
for f in "$TARGET"/*.md; do
  echo "  - $(basename "$f" .md)"
done
echo ""
echo "Restart or refresh your Claude Code session for changes to take effect."
SCRIPT_EOF

  write_file "$PROJECT_ROOT/scripts/disable-agents.sh" <<'SCRIPT_EOF'
#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$PROJECT_ROOT/.claude/agents"

if [ ! -d "$TARGET" ] || [ -z "$(ls -A "$TARGET" 2>/dev/null)" ]; then
  echo "No active agents found."
  exit 0
fi

rm -f "$TARGET"/*.md
rmdir "$TARGET" 2>/dev/null || true
echo "Agents disabled. Definitions remain in .claude/agents.off/"
echo "Restart or refresh your Claude Code session for changes to take effect."
SCRIPT_EOF
}

# =============================================================================
# Phase 3: Hook scripts
# =============================================================================
write_hook_scripts() {
  echo ""
  echo "=== Writing hook scripts ==="

  # --- guard-outside-root.sh ---
  write_file "$PROJECT_ROOT/.claude/hooks/guard-outside-root.sh" <<'HOOK_EOF'
#!/usr/bin/env bash
# PreToolUse hook: blocks Bash commands that operate outside the project root.
# Reads tool input JSON from stdin.

set -euo pipefail

# Read JSON input from stdin
INPUT="$(cat)"

# Extract the command using Python (jq not available)
COMMAND="$(echo "$INPUT" | python -c "
import json, sys
data = json.load(sys.stdin)
# Handle both direct command and nested tool_input
if 'command' in data:
    print(data['command'])
elif 'tool_input' in data and 'command' in data['tool_input']:
    print(data['tool_input']['command'])
else:
    print('')
" 2>/dev/null || echo "")"

if [ -z "$COMMAND" ]; then
  exit 0  # No command found, allow
fi

# Get project root
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Check for dangerous patterns
DENY=false
REASON=""

# Block .. traversal
if echo "$COMMAND" | grep -qE '\.\.(\/|\\|$)'; then
  DENY=true
  REASON="Path traversal (..) detected"
fi

# Block UNC paths
if echo "$COMMAND" | grep -qE '^(//|\\\\)'; then
  DENY=true
  REASON="UNC path detected"
fi

# Block /mnt/ access (WSL cross-filesystem)
if echo "$COMMAND" | grep -qE '/mnt/[a-zA-Z]'; then
  DENY=true
  REASON="Cross-filesystem access via /mnt/ detected"
fi

# Block Windows absolute paths outside project drive
if echo "$COMMAND" | grep -qE '^[A-Za-z]:\\'; then
  DENY=true
  REASON="Windows absolute path detected"
fi

# Block dangerous commands targeting outside root
if echo "$COMMAND" | grep -qiE 'rm -rf|rmdir|del /|format |shutdown|reboot|mkfs'; then
  DENY=true
  REASON="Dangerous operation detected"
fi

if [ "$DENY" = true ]; then
  # Output JSON to deny
  printf '{"decision": "deny", "reason": "%s"}\n' "$REASON"
  exit 0
fi

# Allow by default
exit 0
HOOK_EOF

  # --- stop-gate.sh ---
  write_file "$PROJECT_ROOT/.claude/hooks/stop-gate.sh" <<'HOOK_EOF'
#!/usr/bin/env bash
# Stop hook: runs fast tests before allowing Claude to stop.
# Includes loop guard to prevent re-entry.

set -euo pipefail

# Loop guard: if we already ran the stop gate this cycle, skip
if [ "${CLAUDE_STOP_GATE_RAN:-}" = "1" ]; then
  exit 0
fi

export CLAUDE_STOP_GATE_RAN=1

# Check if a test runner is available
if [ -f "package.json" ]; then
  if grep -q '"test"' package.json 2>/dev/null; then
    echo "Running tests before stop..."
    if npm test --bail 2>&1; then
      echo "Tests passed."
      exit 0
    else
      printf '{"decision": "block", "reason": "Tests failed. Please fix before stopping."}\n'
      exit 0
    fi
  fi
elif [ -f "pytest.ini" ] || [ -f "pyproject.toml" ] || [ -f "setup.py" ]; then
  echo "Running tests before stop..."
  if python -m pytest --tb=short -q 2>&1; then
    echo "Tests passed."
    exit 0
  else
    printf '{"decision": "block", "reason": "Tests failed. Please fix before stopping."}\n'
    exit 0
  fi
fi

# No test runner found, allow stop
exit 0
HOOK_EOF

  # --- event-emitter.sh ---
  write_file "$PROJECT_ROOT/.claude/hooks/event-emitter.sh" <<'HOOK_EOF'
#!/usr/bin/env bash
# Hook event emitter: enriches events with metadata and posts to claude-monitor.
# Usage in hook config: bash .claude/hooks/event-emitter.sh <hook_type>
# Only active when the monitoring server is running at localhost:3777.

HOOK_TYPE="${1:-unknown}"
INPUT="$(cat)"

# Enrich with metadata using Python
ENRICHED="$(echo "$INPUT" | python -c "
import json, sys, os
from datetime import datetime, timezone

try:
    data = json.load(sys.stdin)
except Exception:
    data = {}

data['_hook_type'] = sys.argv[1]
data['_timestamp'] = datetime.now(timezone.utc).isoformat()
data['_project_root'] = os.getcwd()
data['_session_id'] = os.environ.get('CLAUDE_SESSION_ID', '')
print(json.dumps(data))
" "$HOOK_TYPE" 2>/dev/null || echo "$INPUT")"

# Fire-and-forget POST to monitoring server
if command -v curl &>/dev/null; then
  curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "$ENRICHED" \
    --connect-timeout 1 \
    --max-time 2 \
    "http://localhost:${MONITOR_PORT:-3777}/events" &>/dev/null &
fi

exit 0
HOOK_EOF
}

# =============================================================================
# Phase 3: Hook toggle scripts
# =============================================================================
write_hook_toggle_scripts() {
  echo ""
  echo "=== Writing hook toggle scripts ==="

  write_file "$PROJECT_ROOT/scripts/enable-hooks.sh" <<'SCRIPT_EOF'
#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETTINGS="$PROJECT_ROOT/.claude/settings.json"

if [ ! -f "$SETTINGS" ]; then
  echo "Error: $SETTINGS not found. Run bootstrap-claude-ops.sh first."
  exit 1
fi

# Use Python to add hooks config to settings.json
python -c "
import json, sys

settings_path = sys.argv[1]
with open(settings_path) as f:
    settings = json.load(f)

hooks = {
    'PreToolUse': [
        {
            'matcher': 'Bash',
            'hooks': [
                {
                    'type': 'command',
                    'command': 'bash .claude/hooks/guard-outside-root.sh'
                }
            ]
        },
        {
            'matcher': '',
            'hooks': [
                {
                    'type': 'command',
                    'command': 'bash .claude/hooks/event-emitter.sh PreToolUse',
                    'timeout': 3000
                }
            ]
        }
    ],
    'PostToolUse': [
        {
            'matcher': '',
            'hooks': [
                {
                    'type': 'command',
                    'command': 'bash .claude/hooks/event-emitter.sh PostToolUse',
                    'timeout': 3000
                }
            ]
        }
    ],
    'Stop': [
        {
            'matcher': '',
            'hooks': [
                {
                    'type': 'command',
                    'command': 'bash .claude/hooks/stop-gate.sh'
                }
            ]
        },
        {
            'matcher': '',
            'hooks': [
                {
                    'type': 'command',
                    'command': 'bash .claude/hooks/event-emitter.sh Stop',
                    'timeout': 3000
                }
            ]
        }
    ]
}

settings['hooks'] = hooks
with open(settings_path, 'w') as f:
    json.dump(settings, f, indent=2)

print('Hooks enabled in ' + settings_path)
" "$SETTINGS"

# Also disable global disableAllHooks if set
GLOBAL_SETTINGS="$HOME/.claude/settings.json"
if [ -f "$GLOBAL_SETTINGS" ]; then
  python -c "
import json, sys
path = sys.argv[1]
with open(path) as f:
    s = json.load(f)
if 'disableAllHooks' in s:
    del s['disableAllHooks']
    with open(path, 'w') as f:
        json.dump(s, f, indent=2)
    print('Removed disableAllHooks from ' + path)
" "$GLOBAL_SETTINGS"
fi

echo ""
echo "Hooks are now active. Restart your Claude Code session for changes to take effect."
echo "Hooks installed:"
echo "  - guard-outside-root.sh (PreToolUse:Bash) - blocks outside-root commands"
echo "  - event-emitter.sh (PreToolUse, PostToolUse, Stop) - posts to monitoring server"
echo "  - stop-gate.sh (Stop) - runs tests before stopping"
SCRIPT_EOF

  write_file "$PROJECT_ROOT/scripts/disable-hooks.sh" <<'SCRIPT_EOF'
#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETTINGS="$PROJECT_ROOT/.claude/settings.json"

if [ ! -f "$SETTINGS" ]; then
  echo "Error: $SETTINGS not found."
  exit 1
fi

# Use Python to remove hooks config from settings.json
python -c "
import json, sys

settings_path = sys.argv[1]
with open(settings_path) as f:
    settings = json.load(f)

if 'hooks' in settings:
    del settings['hooks']
    with open(settings_path, 'w') as f:
        json.dump(settings, f, indent=2)
    print('Hooks removed from ' + settings_path)
else:
    print('No hooks found in ' + settings_path)
" "$SETTINGS"

# Re-enable global disableAllHooks
GLOBAL_SETTINGS="$HOME/.claude/settings.json"
if [ -f "$GLOBAL_SETTINGS" ]; then
  python -c "
import json, sys
path = sys.argv[1]
with open(path) as f:
    s = json.load(f)
s['disableAllHooks'] = True
with open(path, 'w') as f:
    json.dump(s, f, indent=2)
print('Set disableAllHooks=true in ' + path)
" "$GLOBAL_SETTINGS"
fi

echo ""
echo "Hooks disabled. Restart your Claude Code session for changes to take effect."
SCRIPT_EOF
}

# =============================================================================
# Phase 4: Monitoring service
# =============================================================================
write_monitor_files() {
  echo ""
  echo "=== Writing monitoring service ==="

  # --- Server: app.py ---
  write_file "$PROJECT_ROOT/tools/claude-monitor/server/app.py" <<'MONITOR_EOF'
#!/usr/bin/env python3
"""
Claude Code Monitor - Event Collection Server

A lightweight HTTP server that collects hook events from Claude Code,
stores them in SQLite, and serves a monitoring dashboard.

Requires: Python 3.7+ (stdlib only, no pip packages)
Port: 3777 (default)
"""

import json
import sqlite3
import os
import sys
import signal
import threading
import mimetypes
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timezone
from pathlib import Path

# --- Configuration ---
PORT = int(os.environ.get("MONITOR_PORT", 3777))
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "monitor.db"
WEB_DIR = BASE_DIR.parent / "web"
PID_FILE = BASE_DIR / "monitor.pid"
MAX_OUTPUT_PREVIEW = 500

# --- Database ---
SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    hook_type TEXT,
    session_id TEXT,
    tool_name TEXT,
    tool_input_preview TEXT,
    tool_output_preview TEXT,
    file_path TEXT,
    skill_name TEXT,
    agent_name TEXT,
    duration_ms INTEGER,
    decision TEXT,
    raw_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_tool ON events(tool_name);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_hook ON events(hook_type);
"""

_local = threading.local()


def get_db():
    if not hasattr(_local, "conn"):
        _local.conn = sqlite3.connect(str(DB_PATH), timeout=5)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
        _local.conn.execute("PRAGMA busy_timeout=3000")
    return _local.conn


def init_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.executescript(SCHEMA)
    conn.close()


def extract_fields(raw):
    fields = {
        "timestamp": raw.get("_timestamp", datetime.now(timezone.utc).isoformat()),
        "hook_type": raw.get("_hook_type", raw.get("hook_type", "unknown")),
        "session_id": raw.get("_session_id", raw.get("session_id", "")),
        "tool_name": raw.get("tool_name", ""),
        "tool_input_preview": "",
        "tool_output_preview": "",
        "file_path": "",
        "skill_name": "",
        "agent_name": "",
        "duration_ms": raw.get("duration_ms"),
        "decision": raw.get("decision", ""),
    }

    tool_input = raw.get("tool_input", {})
    if isinstance(tool_input, dict):
        if "command" in tool_input:
            fields["tool_input_preview"] = str(tool_input["command"])[:MAX_OUTPUT_PREVIEW]
        elif "file_path" in tool_input:
            fields["tool_input_preview"] = tool_input["file_path"]
            fields["file_path"] = tool_input["file_path"]
        elif "pattern" in tool_input:
            fields["tool_input_preview"] = str(tool_input.get("pattern", ""))[:MAX_OUTPUT_PREVIEW]
        elif "query" in tool_input:
            fields["tool_input_preview"] = str(tool_input["query"])[:MAX_OUTPUT_PREVIEW]
        elif "skill" in tool_input:
            fields["skill_name"] = tool_input["skill"]
            fields["tool_input_preview"] = "/" + tool_input["skill"]
        else:
            fields["tool_input_preview"] = json.dumps(tool_input)[:MAX_OUTPUT_PREVIEW]
    elif tool_input:
        fields["tool_input_preview"] = str(tool_input)[:MAX_OUTPUT_PREVIEW]

    tool = fields["tool_name"]
    if tool in ("Read", "Write", "Edit", "NotebookEdit") and isinstance(tool_input, dict):
        fields["file_path"] = tool_input.get("file_path", "")
    elif tool == "Glob" and isinstance(tool_input, dict):
        fields["file_path"] = tool_input.get("path", "") or tool_input.get("pattern", "")
    elif tool == "Grep" and isinstance(tool_input, dict):
        fields["file_path"] = tool_input.get("path", "")

    tool_output = raw.get("tool_output", "")
    if isinstance(tool_output, dict):
        fields["tool_output_preview"] = json.dumps(tool_output)[:MAX_OUTPUT_PREVIEW]
    elif tool_output:
        fields["tool_output_preview"] = str(tool_output)[:MAX_OUTPUT_PREVIEW]

    if tool == "Skill" and isinstance(tool_input, dict):
        fields["skill_name"] = tool_input.get("skill", "")
    if tool == "Task" and isinstance(tool_input, dict):
        fields["agent_name"] = tool_input.get("subagent_type", tool_input.get("agent", ""))

    return fields


def store_event(raw_json_str):
    try:
        raw = json.loads(raw_json_str)
    except json.JSONDecodeError:
        raw = {"_raw_text": raw_json_str}

    fields = extract_fields(raw)
    db = get_db()
    db.execute(
        """INSERT INTO events
           (timestamp, hook_type, session_id, tool_name, tool_input_preview,
            tool_output_preview, file_path, skill_name, agent_name,
            duration_ms, decision, raw_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            fields["timestamp"], fields["hook_type"], fields["session_id"],
            fields["tool_name"], fields["tool_input_preview"],
            fields["tool_output_preview"], fields["file_path"],
            fields["skill_name"], fields["agent_name"],
            fields["duration_ms"], fields["decision"], raw_json_str,
        ),
    )
    db.commit()


def query_events(params):
    db = get_db()
    where, args = [], []
    if params.get("hook_type"):
        where.append("hook_type = ?"); args.append(params["hook_type"][0])
    if params.get("tool"):
        where.append("tool_name = ?"); args.append(params["tool"][0])
    if params.get("session"):
        where.append("session_id = ?"); args.append(params["session"][0])
    if params.get("since"):
        where.append("timestamp >= ?"); args.append(params["since"][0])
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    limit = min(int(params.get("limit", [200])[0]), 1000)
    offset = int(params.get("offset", [0])[0])
    rows = db.execute(
        f"""SELECT id, timestamp, hook_type, session_id, tool_name,
                   tool_input_preview, tool_output_preview, file_path,
                   skill_name, agent_name, duration_ms, decision
            FROM events {clause} ORDER BY id DESC LIMIT ? OFFSET ?""",
        args + [limit, offset],
    ).fetchall()
    return [dict(r) for r in rows]


def get_stats():
    db = get_db()
    total = db.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    tool_counts = db.execute(
        "SELECT tool_name, COUNT(*) as cnt FROM events WHERE tool_name != '' GROUP BY tool_name ORDER BY cnt DESC"
    ).fetchall()
    hook_counts = db.execute(
        "SELECT hook_type, COUNT(*) as cnt FROM events WHERE hook_type != '' GROUP BY hook_type ORDER BY cnt DESC"
    ).fetchall()
    skill_counts = db.execute(
        "SELECT skill_name, COUNT(*) as cnt FROM events WHERE skill_name != '' GROUP BY skill_name ORDER BY cnt DESC"
    ).fetchall()
    agent_counts = db.execute(
        "SELECT agent_name, COUNT(*) as cnt FROM events WHERE agent_name != '' GROUP BY agent_name ORDER BY cnt DESC"
    ).fetchall()
    file_counts = db.execute(
        "SELECT file_path, COUNT(*) as cnt FROM events WHERE file_path != '' GROUP BY file_path ORDER BY cnt DESC LIMIT 30"
    ).fetchall()
    sessions = db.execute(
        """SELECT session_id, COUNT(*) as cnt, MIN(timestamp) as first_seen, MAX(timestamp) as last_seen
           FROM events WHERE session_id != '' GROUP BY session_id ORDER BY last_seen DESC LIMIT 20"""
    ).fetchall()
    hourly = db.execute(
        """SELECT strftime('%Y-%m-%dT%H:00:00', timestamp) as hour, COUNT(*) as cnt
           FROM events GROUP BY hour ORDER BY hour DESC LIMIT 48"""
    ).fetchall()
    decisions = db.execute(
        "SELECT decision, COUNT(*) as cnt FROM events WHERE decision != '' GROUP BY decision"
    ).fetchall()
    return {
        "total_events": total,
        "tools": [dict(r) for r in tool_counts],
        "hooks": [dict(r) for r in hook_counts],
        "skills": [dict(r) for r in skill_counts],
        "agents": [dict(r) for r in agent_counts],
        "files": [dict(r) for r in file_counts],
        "sessions": [dict(r) for r in sessions],
        "hourly_activity": [dict(r) for r in hourly],
        "decisions": [dict(r) for r in decisions],
    }


def get_event_detail(event_id):
    db = get_db()
    row = db.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if row:
        d = dict(row)
        try:
            d["raw_json"] = json.loads(d["raw_json"])
        except (json.JSONDecodeError, TypeError):
            pass
        return d
    return None


class MonitorHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        sys.stderr.write("[monitor] %s\n" % (args[0],))

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json_response(self, data, status=200):
        body = json.dumps(data, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def _error(self, status, message):
        self._json_response({"error": message}, status)

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/events":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length).decode("utf-8") if length else ""
                if body:
                    store_event(body)
                    self._json_response({"status": "ok"}, 201)
                else:
                    self._error(400, "Empty body")
            except Exception as e:
                self._error(500, str(e))
        else:
            self._error(404, "Not found")

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/events":
            try:
                db = get_db()
                db.execute("DELETE FROM events")
                db.commit()
                self._json_response({"status": "cleared"})
            except Exception as e:
                self._error(500, str(e))
        else:
            self._error(404, "Not found")

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        params = parse_qs(parsed.query)
        if path == "/api/events":
            self._json_response(query_events(params))
        elif path == "/api/stats":
            self._json_response(get_stats())
        elif path.startswith("/api/events/"):
            try:
                eid = int(path.split("/")[-1])
                detail = get_event_detail(eid)
                if detail:
                    self._json_response(detail)
                else:
                    self._error(404, "Event not found")
            except ValueError:
                self._error(400, "Invalid event ID")
        elif path == "/api/health":
            self._json_response({"status": "ok", "port": PORT, "db": str(DB_PATH)})
        else:
            self._serve_static(path)

    def _serve_static(self, path):
        if path == "" or path == "/":
            path = "/index.html"
        file_path = WEB_DIR / path.lstrip("/")
        try:
            file_path = file_path.resolve()
            if not str(file_path).startswith(str(WEB_DIR.resolve())):
                self._error(403, "Forbidden"); return
        except (ValueError, OSError):
            self._error(400, "Bad path"); return
        if not file_path.is_file():
            self._error(404, "Not found: " + path); return
        mime, _ = mimetypes.guess_type(str(file_path))
        if mime is None:
            mime = "application/octet-stream"
        try:
            content = file_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self._cors()
            self.send_header("Content-Length", len(content))
            self.end_headers()
            self.wfile.write(content)
        except IOError:
            self._error(500, "Read error")


def write_pid():
    PID_FILE.write_text(str(os.getpid()))

def remove_pid():
    try:
        PID_FILE.unlink()
    except FileNotFoundError:
        pass

def shutdown_handler(signum, frame):
    print("\n[monitor] Received signal %d, shutting down..." % signum)
    remove_pid()
    sys.exit(0)

def main():
    init_db()
    write_pid()
    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)
    server = HTTPServer(("0.0.0.0", PORT), MonitorHandler)
    print("[monitor] Claude Code Monitor running on http://localhost:%d" % PORT)
    print("[monitor] Dashboard: http://localhost:%d/" % PORT)
    print("[monitor] Database: %s" % DB_PATH)
    print("[monitor] PID: %d" % os.getpid())
    print("[monitor] Press Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        remove_pid()
        print("[monitor] Stopped.")

if __name__ == "__main__":
    main()
MONITOR_EOF

  # --- Dashboard: index.html ---
  write_file "$PROJECT_ROOT/tools/claude-monitor/web/index.html" <<'MONITOR_EOF'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude Code Monitor</title>
<style>
  :root {
    --bg:#0d1117; --surface:#161b22; --surface2:#1c2129;
    --border:#30363d; --text:#c9d1d9; --text-dim:#8b949e;
    --accent:#58a6ff; --green:#3fb950; --yellow:#d29922;
    --red:#f85149; --purple:#bc8cff; --orange:#f0883e;
    --radius:8px;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
    background:var(--bg); color:var(--text); line-height:1.5; min-height:100vh;
  }
  header {
    background:var(--surface); border-bottom:1px solid var(--border);
    padding:12px 24px; display:flex; align-items:center; justify-content:space-between;
    position:sticky; top:0; z-index:100;
  }
  header h1 { font-size:16px; font-weight:600; }
  header h1 span { color:var(--accent); }
  .header-right { display:flex; align-items:center; gap:16px; font-size:13px; }
  .status-dot { width:8px; height:8px; border-radius:50%; display:inline-block; margin-right:6px; }
  .status-dot.ok { background:var(--green); }
  .status-dot.err { background:var(--red); }
  .toggle-btn {
    background:var(--surface2); border:1px solid var(--border);
    color:var(--text-dim); padding:4px 10px; border-radius:4px; cursor:pointer; font-size:12px;
  }
  .toggle-btn.active { color:var(--green); border-color:var(--green); }
  .clear-btn {
    background:transparent; border:1px solid var(--border);
    color:var(--red); padding:4px 10px; border-radius:4px; cursor:pointer; font-size:12px;
  }
  .clear-btn:hover { background:rgba(248,81,73,0.1); }
  .cards {
    display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
    gap:12px; padding:16px 24px;
  }
  .card {
    background:var(--surface); border:1px solid var(--border);
    border-radius:var(--radius); padding:16px;
  }
  .card .label { font-size:11px; text-transform:uppercase; color:var(--text-dim); letter-spacing:.5px; }
  .card .value { font-size:28px; font-weight:700; margin-top:4px; }
  .card .sub { font-size:11px; color:var(--text-dim); margin-top:2px; }
  .grid {
    display:grid; grid-template-columns:1fr 380px; gap:16px; padding:0 24px 24px;
  }
  @media(max-width:900px) { .grid { grid-template-columns:1fr; } }
  .panel {
    background:var(--surface); border:1px solid var(--border);
    border-radius:var(--radius); overflow:hidden;
  }
  .panel-header {
    padding:12px 16px; border-bottom:1px solid var(--border);
    font-size:13px; font-weight:600; display:flex; justify-content:space-between; align-items:center;
  }
  .panel-header .count { color:var(--text-dim); font-weight:400; }
  .panel-body { padding:0; max-height:520px; overflow-y:auto; }
  .panel-body.short { max-height:280px; }
  .event-row {
    display:grid; grid-template-columns:90px 90px 1fr; gap:8px;
    padding:8px 16px; border-bottom:1px solid var(--border);
    font-size:12px; align-items:start; transition:background .15s;
  }
  .event-row:hover { background:var(--surface2); }
  .event-row .time { color:var(--text-dim); font-family:monospace; font-size:11px; }
  .event-row .tool { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .event-row .preview {
    color:var(--text-dim); white-space:nowrap; overflow:hidden;
    text-overflow:ellipsis; font-family:monospace; font-size:11px;
  }
  .tool-Bash { color:var(--green); }
  .tool-Read { color:var(--accent); }
  .tool-Write,.tool-Edit { color:var(--yellow); }
  .tool-Grep,.tool-Glob { color:var(--purple); }
  .tool-Task { color:var(--orange); }
  .tool-Skill { color:var(--red); }
  .bar-row { display:flex; align-items:center; gap:8px; padding:6px 16px; font-size:12px; }
  .bar-label { width:80px; text-align:right; flex-shrink:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .bar-track { flex:1; height:18px; background:var(--surface2); border-radius:3px; overflow:hidden; }
  .bar-fill { height:100%; border-radius:3px; transition:width .4s ease; min-width:2px; }
  .bar-count { width:40px; text-align:right; color:var(--text-dim); font-family:monospace; font-size:11px; flex-shrink:0; }
  .file-row { display:flex; justify-content:space-between; padding:5px 16px; font-size:12px; border-bottom:1px solid var(--border); }
  .file-row:hover { background:var(--surface2); }
  .file-path { font-family:monospace; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; color:var(--accent); }
  .file-count { margin-left:12px; color:var(--text-dim); font-family:monospace; font-size:11px; flex-shrink:0; }
  .session-row { display:grid; grid-template-columns:1fr 60px 110px; gap:8px; padding:6px 16px; font-size:12px; border-bottom:1px solid var(--border); }
  .session-row:hover { background:var(--surface2); }
  .session-id { font-family:monospace; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .tabs { display:flex; gap:0; border-bottom:1px solid var(--border); }
  .tab { padding:8px 16px; font-size:12px; cursor:pointer; color:var(--text-dim); border-bottom:2px solid transparent; transition:all .15s; }
  .tab:hover { color:var(--text); }
  .tab.active { color:var(--accent); border-bottom-color:var(--accent); }
  .tab-content { display:none; }
  .tab-content.active { display:block; }
  .badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:500; }
  .badge-skill { background:rgba(248,81,73,.15); color:var(--red); }
  .badge-agent { background:rgba(240,136,62,.15); color:var(--orange); }
  .badge-hook { background:rgba(188,140,255,.15); color:var(--purple); }
  .empty { padding:40px 16px; text-align:center; color:var(--text-dim); font-size:13px; }
  ::-webkit-scrollbar { width:6px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:var(--border); border-radius:3px; }
  .modal-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:200; align-items:center; justify-content:center; }
  .modal-overlay.open { display:flex; }
  .modal { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); width:90%; max-width:700px; max-height:80vh; overflow-y:auto; padding:20px; }
  .modal h3 { font-size:14px; margin-bottom:12px; }
  .modal pre { background:var(--bg); padding:12px; border-radius:4px; font-size:11px; overflow-x:auto; white-space:pre-wrap; word-break:break-all; }
  .modal-close { float:right; background:none; border:none; color:var(--text-dim); cursor:pointer; font-size:18px; }
</style>
</head>
<body>
<header>
  <h1><span>Claude Code</span> Monitor</h1>
  <div class="header-right">
    <span id="status"><span class="status-dot err"></span>Connecting...</span>
    <button class="toggle-btn active" id="autoRefresh" onclick="toggleRefresh()">Auto-refresh</button>
    <button class="clear-btn" onclick="clearData()">Clear data</button>
  </div>
</header>
<div class="cards" id="cards">
  <div class="card"><div class="label">Total Events</div><div class="value" id="stat-total">-</div><div class="sub" id="stat-rate"></div></div>
  <div class="card"><div class="label">Tools Used</div><div class="value" id="stat-tools">-</div><div class="sub" id="stat-top-tool"></div></div>
  <div class="card"><div class="label">Skills Invoked</div><div class="value" id="stat-skills">-</div><div class="sub" id="stat-top-skill"></div></div>
  <div class="card"><div class="label">Files Touched</div><div class="value" id="stat-files">-</div><div class="sub" id="stat-top-file"></div></div>
  <div class="card"><div class="label">Agents/Subagents</div><div class="value" id="stat-agents">-</div><div class="sub" id="stat-top-agent"></div></div>
  <div class="card"><div class="label">Sessions</div><div class="value" id="stat-sessions">-</div><div class="sub" id="stat-session-info"></div></div>
</div>
<div class="grid">
  <div class="panel">
    <div class="panel-header">Live Event Feed <span class="count" id="event-count"></span></div>
    <div class="panel-body" id="event-feed"><div class="empty">Waiting for events...</div></div>
  </div>
  <div style="display:flex;flex-direction:column;gap:16px;">
    <div class="panel">
      <div class="panel-header">Tool Usage</div>
      <div class="panel-body short" id="tool-chart"></div>
    </div>
    <div class="panel">
      <div class="tabs">
        <div class="tab active" data-tab="tab-skills" onclick="switchTab(this)">Skills</div>
        <div class="tab" data-tab="tab-agents" onclick="switchTab(this)">Agents</div>
        <div class="tab" data-tab="tab-hooks" onclick="switchTab(this)">Hooks</div>
        <div class="tab" data-tab="tab-files" onclick="switchTab(this)">Files</div>
        <div class="tab" data-tab="tab-sessions" onclick="switchTab(this)">Sessions</div>
      </div>
      <div class="tab-content active" id="tab-skills"><div class="panel-body short" id="skill-list"><div class="empty">No skills used yet</div></div></div>
      <div class="tab-content" id="tab-agents"><div class="panel-body short" id="agent-list"><div class="empty">No agents used yet</div></div></div>
      <div class="tab-content" id="tab-hooks"><div class="panel-body short" id="hook-list"><div class="empty">No hook data yet</div></div></div>
      <div class="tab-content" id="tab-files"><div class="panel-body short" id="file-list"><div class="empty">No file activity yet</div></div></div>
      <div class="tab-content" id="tab-sessions"><div class="panel-body short" id="session-list"><div class="empty">No sessions yet</div></div></div>
    </div>
    <div class="panel">
      <div class="panel-header">Hourly Activity</div>
      <div class="panel-body short" id="timeline-chart"></div>
    </div>
  </div>
</div>
<div class="modal-overlay" id="modal" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3 id="modal-title">Event Detail</h3>
    <pre id="modal-body"></pre>
  </div>
</div>
<script>
const API=window.location.origin;let refreshInterval=null,autoRefreshOn=true,lastEventId=0;
async function fetchJSON(p){try{const r=await fetch(API+p);if(!r.ok)throw new Error(r.status);return await r.json()}catch(e){setStatus(false);return null}}
function setStatus(ok){document.getElementById('status').innerHTML=ok?'<span class="status-dot ok"></span>Connected':'<span class="status-dot err"></span>Disconnected'}
function escapeHtml(s){return s?s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'):''}
function shortenPath(p){if(!p)return'';const a=p.replace(/\\/g,'/').split('/');return a.length<=3?a.join('/'):'.../'+a.slice(-3).join('/')}
function renderCards(s){
  document.getElementById('stat-total').textContent=s.total_events.toLocaleString();
  document.getElementById('stat-tools').textContent=s.tools.length;
  document.getElementById('stat-skills').textContent=s.skills.length;
  document.getElementById('stat-files').textContent=s.files.length;
  document.getElementById('stat-agents').textContent=s.agents.length;
  document.getElementById('stat-sessions').textContent=s.sessions.length;
  document.getElementById('stat-top-tool').textContent=s.tools[0]?'Top: '+s.tools[0].tool_name:'';
  document.getElementById('stat-top-skill').textContent=s.skills[0]?'Top: /'+s.skills[0].skill_name:'';
  document.getElementById('stat-top-file').textContent=s.files[0]?shortenPath(s.files[0].file_path):'';
  document.getElementById('stat-top-agent').textContent=s.agents[0]?'Top: '+s.agents[0].agent_name:'';
  document.getElementById('stat-session-info').textContent=s.sessions[0]?'Latest: '+s.sessions[0].session_id.slice(0,12):'';
  if(s.hourly_activity.length>0){const r=s.hourly_activity.slice(0,3),a=Math.round(r.reduce((x,h)=>x+h.cnt,0)/r.length);document.getElementById('stat-rate').textContent='~'+a+'/hr recently'}
}
function renderToolChart(t){
  const el=document.getElementById('tool-chart');
  if(!t.length){el.innerHTML='<div class="empty">No tool data yet</div>';return}
  const m=t[0].cnt,c={Bash:'var(--green)',Read:'var(--accent)',Write:'var(--yellow)',Edit:'var(--yellow)',Grep:'var(--purple)',Glob:'var(--purple)',Task:'var(--orange)',Skill:'var(--red)'};
  el.innerHTML=t.map(x=>'<div class="bar-row"><div class="bar-label">'+x.tool_name+'</div><div class="bar-track"><div class="bar-fill" style="width:'+(x.cnt/m*100).toFixed(1)+'%;background:'+(c[x.tool_name]||'var(--text-dim)')+'"></div></div><div class="bar-count">'+x.cnt+'</div></div>').join('')
}
function renderEvents(ev){
  const el=document.getElementById('event-feed');
  if(!ev.length){el.innerHTML='<div class="empty">Waiting for events...</div>';return}
  document.getElementById('event-count').textContent='('+ev.length+')';
  el.innerHTML=ev.map(e=>{
    const t=e.timestamp?new Date(e.timestamp).toLocaleTimeString():'--:--';
    const p=e.skill_name?'/'+e.skill_name:e.agent_name?'agent:'+e.agent_name:e.tool_input_preview||e.hook_type||'';
    return '<div class="event-row" onclick="showDetail('+e.id+')" style="cursor:pointer" title="Click for details"><span class="time">'+t+'</span><span class="tool tool-'+(e.tool_name||'')+'">'+(e.tool_name||e.hook_type||'?')+'</span><span class="preview">'+escapeHtml(p)+'</span></div>'
  }).join('');
  if(ev.length>0&&ev[0].id>lastEventId)lastEventId=ev[0].id
}
function renderBarList(id,items,key,cls,color){
  const el=document.getElementById(id);
  if(!items.length){el.innerHTML='<div class="empty">No data yet</div>';return}
  const m=items[0].cnt;
  el.innerHTML=items.map(x=>'<div class="bar-row"><div class="bar-label"><span class="badge badge-'+cls+'">'+(cls==='skill'?'/':'')+x[key]+'</span></div><div class="bar-track"><div class="bar-fill" style="width:'+(x.cnt/m*100).toFixed(1)+'%;background:var(--'+color+')"></div></div><div class="bar-count">'+x.cnt+'</div></div>').join('')
}
function renderFiles(f){
  const el=document.getElementById('file-list');
  if(!f.length){el.innerHTML='<div class="empty">No file activity yet</div>';return}
  el.innerHTML=f.map(x=>'<div class="file-row"><span class="file-path" title="'+escapeHtml(x.file_path)+'">'+shortenPath(x.file_path)+'</span><span class="file-count">'+x.cnt+'</span></div>').join('')
}
function renderSessions(s){
  const el=document.getElementById('session-list');
  if(!s.length){el.innerHTML='<div class="empty">No sessions yet</div>';return}
  el.innerHTML=s.map(x=>'<div class="session-row"><span class="session-id" title="'+escapeHtml(x.session_id)+'">'+x.session_id.slice(0,20)+'</span><span style="text-align:right;color:var(--text-dim);font-family:monospace;font-size:11px">'+x.cnt+'</span><span style="font-size:11px;color:var(--text-dim)">'+new Date(x.last_seen).toLocaleString()+'</span></div>').join('')
}
function renderTimeline(h){
  const el=document.getElementById('timeline-chart');
  if(!h.length){el.innerHTML='<div class="empty">No activity data</div>';return}
  const m=Math.max(...h.map(x=>x.cnt)),d=h.slice(0,24).reverse();
  el.innerHTML=d.map(x=>{const l=new Date(x.hour).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});return '<div class="bar-row"><div class="bar-label">'+l+'</div><div class="bar-track"><div class="bar-fill" style="width:'+(x.cnt/m*100).toFixed(1)+'%;background:var(--accent)"></div></div><div class="bar-count">'+x.cnt+'</div></div>'}).join('')
}
async function showDetail(id){const d=await fetchJSON('/api/events/'+id);if(!d)return;document.getElementById('modal-title').textContent='Event #'+d.id+' - '+(d.tool_name||d.hook_type||'unknown');document.getElementById('modal-body').textContent=JSON.stringify(d.raw_json||d,null,2);document.getElementById('modal').classList.add('open')}
function closeModal(){document.getElementById('modal').classList.remove('open')}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
function switchTab(t){document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tab-content').forEach(x=>x.classList.remove('active'));t.classList.add('active');document.getElementById(t.dataset.tab).classList.add('active')}
async function refresh(){
  const[stats,events]=await Promise.all([fetchJSON('/api/stats'),fetchJSON('/api/events?limit=100')]);
  if(stats){setStatus(true);renderCards(stats);renderToolChart(stats.tools);renderBarList('skill-list',stats.skills,'skill_name','skill','red');renderBarList('agent-list',stats.agents,'agent_name','agent','orange');renderBarList('hook-list',stats.hooks,'hook_type','hook','purple');renderFiles(stats.files);renderSessions(stats.sessions);renderTimeline(stats.hourly_activity)}
  if(events)renderEvents(events)
}
function toggleRefresh(){autoRefreshOn=!autoRefreshOn;const b=document.getElementById('autoRefresh');if(autoRefreshOn){b.classList.add('active');b.textContent='Auto-refresh';startRefresh()}else{b.classList.remove('active');b.textContent='Paused';stopRefresh()}}
function startRefresh(){if(refreshInterval)clearInterval(refreshInterval);refreshInterval=setInterval(refresh,3000)}
function stopRefresh(){if(refreshInterval){clearInterval(refreshInterval);refreshInterval=null}}
async function clearData(){if(!confirm('Clear all collected events? This cannot be undone.'))return;await fetch(API+'/api/events',{method:'DELETE'});refresh()}
refresh();startRefresh();
</script>
</body>
</html>
MONITOR_EOF

  # --- start.sh ---
  write_file "$PROJECT_ROOT/tools/claude-monitor/start.sh" <<'MONITOR_EOF'
#!/usr/bin/env bash
set -euo pipefail

MONITOR_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$MONITOR_DIR/server"
PID_FILE="$SERVER_DIR/monitor.pid"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "[monitor] Already running (PID $PID)"
    echo "[monitor] Dashboard: http://localhost:${MONITOR_PORT:-3777}/"
    exit 0
  else
    echo "[monitor] Stale PID file found, cleaning up..."
    rm -f "$PID_FILE"
  fi
fi

echo "[monitor] Starting Claude Code Monitor..."
python "$SERVER_DIR/app.py" &
sleep 1

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  echo "[monitor] Running (PID $PID)"
  echo "[monitor] Dashboard: http://localhost:${MONITOR_PORT:-3777}/"
  echo "[monitor] Stop with: bash $(dirname "$0")/stop.sh"
else
  echo "[monitor] Failed to start. Check for port conflicts on ${MONITOR_PORT:-3777}."
  exit 1
fi
MONITOR_EOF

  # --- stop.sh ---
  write_file "$PROJECT_ROOT/tools/claude-monitor/stop.sh" <<'MONITOR_EOF'
#!/usr/bin/env bash
set -euo pipefail

MONITOR_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$MONITOR_DIR/server/monitor.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "[monitor] Not running (no PID file found)"
  exit 0
fi

PID=$(cat "$PID_FILE")
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID" 2>/dev/null || TASKKILL //F //PID "$PID" 2>/dev/null || true
  sleep 1
  rm -f "$PID_FILE"
  echo "[monitor] Stopped (PID $PID)"
else
  TASKKILL //F //PID "$PID" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "[monitor] Stopped (PID $PID)"
fi
MONITOR_EOF
}

# =============================================================================
# Session support
# =============================================================================
create_sessions_dir() {
  echo ""
  echo "=== Creating sessions directory ==="
  ensure_dir "$PROJECT_ROOT/.claude/sessions"
  if [ "$DRY_RUN" != true ]; then
    if [ ! -f "$PROJECT_ROOT/.claude/sessions/.current-session" ]; then
      touch "$PROJECT_ROOT/.claude/sessions/.current-session"
      echo "[CREATE] .claude/sessions/.current-session"
      CREATED=$((CREATED + 1))
    else
      if [ "$FORCE" = true ]; then
        cp "$PROJECT_ROOT/.claude/sessions/.current-session" "$PROJECT_ROOT/.claude/sessions/.current-session.bak"
        : > "$PROJECT_ROOT/.claude/sessions/.current-session"
        echo "[BACKUP+CREATE] .claude/sessions/.current-session"
        BACKED_UP=$((BACKED_UP + 1))
      else
        echo "[SKIP] .claude/sessions/.current-session"
        SKIPPED=$((SKIPPED + 1))
      fi
    fi
  else
    echo "[DRY-RUN] Would create: .claude/sessions/.current-session"
  fi
}

# =============================================================================
# Phase 5: Commands (.claude/commands/)
# =============================================================================
write_commands() {
  echo ""
  echo "=== Writing project commands ==="

  # --- /project:session-start ---
  write_file "$PROJECT_ROOT/.claude/commands/session-start.md" <<'CMD_EOF'
Start a new development session by creating a session file in `.claude/sessions/` with the format `YYYY-MM-DD-HHMM-$ARGUMENTS.md` (or just `YYYY-MM-DD-HHMM.md` if no name provided).

The session file should begin with:
1. Session name and timestamp as the title
2. Session overview section with start time
3. Goals section (ask user for goals if not clear)
4. Empty progress section ready for updates

After creating the file, create or update `.claude/sessions/.current-session` to track the active session filename.

Confirm the session has started and remind the user they can:
- Update it with `/project:session-update`
- End it with `/project:session-end`
CMD_EOF

  # --- /project:session-update ---
  write_file "$PROJECT_ROOT/.claude/commands/session-update.md" <<'CMD_EOF'
Update the current development session by:

1. Check if `.claude/sessions/.current-session` exists to find the active session
2. If no active session, inform user to start one with `/project:session-start`
3. If session exists, append to the session file with:
   - Current timestamp
   - The update: $ARGUMENTS (or if no arguments, summarize recent activities)
   - Git status summary:
     * Files added/modified/deleted (from `git status --porcelain`)
     * Current branch and last commit
   - Todo list status:
     * Number of completed/in-progress/pending tasks
     * List any newly completed tasks
   - Any issues encountered
   - Solutions implemented
   - Code changes made

Keep updates concise but comprehensive for future reference.

Example format:
```
### Update - 2025-06-16 12:15 PM

**Summary**: Implemented user authentication

**Git Changes**:
- Modified: app/middleware.ts, lib/auth.ts
- Added: app/login/page.tsx
- Current branch: main (commit: abc123)

**Todo Progress**: 3 completed, 1 in progress, 2 pending
- Completed: Set up auth middleware
- Completed: Create login page
- Completed: Add logout functionality

**Details**: [user's update or automatic summary]
```
CMD_EOF

  # --- /project:session-end ---
  write_file "$PROJECT_ROOT/.claude/commands/session-end.md" <<'CMD_EOF'
End the current development session by:

1. Check `.claude/sessions/.current-session` for the active session
2. If no active session, inform user there's nothing to end
3. If session exists, append a comprehensive summary including:
   - Session duration
   - Git summary:
     * Total files changed (added/modified/deleted)
     * List all changed files with change type
     * Number of commits made (if any)
     * Final git status
   - Todo summary:
     * Total tasks completed/remaining
     * List all completed tasks
     * List any incomplete tasks with status
   - Key accomplishments
   - All features implemented
   - Problems encountered and solutions
   - Breaking changes or important findings
   - Dependencies added/removed
   - Configuration changes
   - Deployment steps taken
   - Lessons learned
   - What wasn't completed
   - Tips for future developers

4. Empty the `.claude/sessions/.current-session` file (don't remove it, just clear its contents)
5. Inform user the session has been documented

The summary should be thorough enough that another developer (or AI) can understand everything that happened without reading the entire session.
CMD_EOF

  # --- /project:session-current ---
  write_file "$PROJECT_ROOT/.claude/commands/session-current.md" <<'CMD_EOF'
Show the current session status by:

1. Check if `.claude/sessions/.current-session` exists
2. If no active session, inform user and suggest starting one
3. If active session exists:
   - Show session name and filename
   - Calculate and show duration since start
   - Show last few updates
   - Show current goals/tasks
   - Remind user of available commands

Keep the output concise and informative.
CMD_EOF

  # --- /project:session-list ---
  write_file "$PROJECT_ROOT/.claude/commands/session-list.md" <<'CMD_EOF'
List all development sessions by:

1. Check if `.claude/sessions/` directory exists
2. List all `.md` files (excluding hidden files and `.current-session`)
3. For each session file:
   - Show the filename
   - Extract and show the session title
   - Show the date/time
   - Show first few lines of the overview if available
4. If `.claude/sessions/.current-session` exists, highlight which session is currently active
5. Sort by most recent first

Present in a clean, readable format.
CMD_EOF

  # --- /project:session-help ---
  write_file "$PROJECT_ROOT/.claude/commands/session-help.md" <<'CMD_EOF'
Show help for the session management system:

## Session Management Commands

The session system helps document development work for future reference.

### Available Commands:

- `/project:session-start [name]` - Start a new session with optional name
- `/project:session-update [notes]` - Add notes to current session
- `/project:session-end` - End session with comprehensive summary
- `/project:session-list` - List all session files
- `/project:session-current` - Show current session status
- `/project:session-help` - Show this help

### How It Works:

1. Sessions are markdown files in `.claude/sessions/`
2. Files use `YYYY-MM-DD-HHMM-name.md` format
3. Only one session can be active at a time
4. Sessions track progress, issues, solutions, and learnings

### Best Practices:

- Start a session when beginning significant work
- Update regularly with important changes or findings
- End with thorough summary for future reference
- Review past sessions before starting similar work

### Example Workflow:

```
/project:session-start refactor-auth
/project:session-update Added Google OAuth restriction
/project:session-update Fixed Next.js 15 params Promise issue
/project:session-end
```
CMD_EOF

  # --- /project:memory-compact ---
  write_file "$PROJECT_ROOT/.claude/commands/memory-compact.md" <<'CMD_EOF'
Compact session history into a persistent memory file.

## Instructions

1. Read all session files in `.claude/sessions/` (all `.md` files, excluding `.current-session`)
2. Read the existing memory file at `memory/memory.md` if it exists
3. For each session, extract:
   - Key accomplishments and features implemented
   - Important architectural decisions made
   - Recurring patterns or conventions established
   - Lessons learned and debugging insights
   - Dependencies added or configuration changes
   - Breaking changes introduced
   - Tips for future development
4. Merge with existing memory content (don't duplicate entries already captured)
5. Write the consolidated memory to `memory/memory.md` in this format:

```markdown
# Project Memory

> Auto-generated from session history. Last compacted: [timestamp]

## Architecture & Decisions
- [Key architectural choices and why they were made]

## Patterns & Conventions
- [Coding patterns, naming conventions, project structure rules]

## Key Features
- [Summary of major features built, with dates]

## Known Issues & Gotchas
- [Things that tripped you up, edge cases, workarounds]

## Dependencies & Config
- [Important packages, environment variables, config files]

## Lessons Learned
- [Debugging insights, performance tips, what worked/didn't]
```

6. Report how many sessions were processed and what was added to memory.

If `$ARGUMENTS` is "full", include more detail. If "brief", keep it minimal.
CMD_EOF

  # --- /project:checkpoint ---
  write_file "$PROJECT_ROOT/.claude/commands/checkpoint.md" <<'CMD_EOF'
Create a quick git checkpoint of current work.

## Instructions

1. Run `git status` to see what has changed
2. If there are no changes, inform the user "Nothing to checkpoint"
3. If there are changes:
   - Stage all modified and new files (but warn about any sensitive files like .env, credentials, secrets)
   - Generate a concise commit message summarizing the changes
   - If `$ARGUMENTS` is provided, use it as the commit message instead
   - Create the commit
4. If there is an active session (check `.claude/sessions/.current-session`), append a session update noting the checkpoint
5. Report what was committed (files changed, insertions, deletions)

This is a quick save point, not a polished commit. Use /project:pr for proper PR-ready commits.
CMD_EOF

  # --- /project:status ---
  write_file "$PROJECT_ROOT/.claude/commands/status.md" <<'CMD_EOF'
Show a comprehensive project status dashboard.

## Instructions

Gather and display:

### Git Status
- Current branch
- Uncommitted changes (modified/staged/untracked counts)
- Last commit (hash, message, time ago)
- Commits ahead/behind remote (if tracking)

### Active Session
- Check `.claude/sessions/.current-session`
- If active: show name, duration, number of updates
- If none: show "No active session"

### Agents
- Check if `.claude/agents/` exists and has files -> "ENABLED (N agents)"
- Otherwise check `.claude/agents.off/` -> "DISABLED (N available)"

### Hooks
- Check if `.claude/settings.json` contains "hooks" key -> "ENABLED"
- Otherwise -> "DISABLED"

### Monitor
- Try to reach `http://localhost:${MONITOR_PORT:-3777}/api/health`
- If reachable: "RUNNING on port NNNN"
- If not: "NOT RUNNING"

### Memory
- Check if `memory/memory.md` exists
- If yes: show last compacted date and line count
- If no: "No memory file yet. Run /project:memory-compact to create one."

Format as a clean, scannable dashboard.
CMD_EOF

  # --- /project:init-feature ---
  write_file "$PROJECT_ROOT/.claude/commands/init-feature.md" <<'CMD_EOF'
Initialize a new feature branch with session tracking.

## Instructions

1. Require `$ARGUMENTS` as the feature name. If not provided, ask for it.
2. Create a new git branch: `feature/$ARGUMENTS` (from current branch)
3. Start a new session: create a session file in `.claude/sessions/` named with today's date and the feature name
4. Set it as the active session in `.claude/sessions/.current-session`
5. Write initial session content:
   - Title: the feature name
   - Branch: feature/$ARGUMENTS
   - Base branch: whatever branch we branched from
   - Goals: ask user or leave placeholder
6. Report:
   - Branch created and checked out
   - Session started
   - Remind user of next steps: `/triage`, `/plan`, or start implementing
CMD_EOF
}

# =============================================================================
# Phase 6: Validation
# =============================================================================
validate() {
  echo ""
  echo "=== Validation Report ==="
  local pass=0
  local fail=0

  check_exists() {
    local path="$1"
    local label="$2"
    if [ -e "$path" ]; then
      echo "  [OK]      $label"
      pass=$((pass + 1))
    else
      echo "  [MISSING] $label"
      fail=$((fail + 1))
    fi
  }

  echo "--- Project files ---"
  check_exists "$PROJECT_ROOT/CLAUDE.md" "CLAUDE.md"
  check_exists "$PROJECT_ROOT/README.md" "README.md"
  check_exists "$PROJECT_ROOT/.claude/settings.json" ".claude/settings.json"
  check_exists "$PROJECT_ROOT/.claude/skills/plan/SKILL.md" ".claude/skills/plan/SKILL.md"
  check_exists "$PROJECT_ROOT/.claude/skills/implement/SKILL.md" ".claude/skills/implement/SKILL.md"
  check_exists "$PROJECT_ROOT/.claude/skills/review/SKILL.md" ".claude/skills/review/SKILL.md"
  check_exists "$PROJECT_ROOT/.claude/skills/debug/SKILL.md" ".claude/skills/debug/SKILL.md"
  check_exists "$PROJECT_ROOT/.claude/skills/test/SKILL.md" ".claude/skills/test/SKILL.md"
  check_exists "$PROJECT_ROOT/.claude/skills/pr/SKILL.md" ".claude/skills/pr/SKILL.md"
  check_exists "$PROJECT_ROOT/.claude/agents.off/explorer.md" ".claude/agents.off/explorer.md"
  check_exists "$PROJECT_ROOT/.claude/agents.off/reviewer.md" ".claude/agents.off/reviewer.md"
  check_exists "$PROJECT_ROOT/.claude/agents.off/debugger.md" ".claude/agents.off/debugger.md"
  check_exists "$PROJECT_ROOT/.claude/agents.off/tester.md" ".claude/agents.off/tester.md"
  check_exists "$PROJECT_ROOT/.claude/agents.off/designer.md" ".claude/agents.off/designer.md"
  check_exists "$PROJECT_ROOT/.claude/hooks/guard-outside-root.sh" ".claude/hooks/guard-outside-root.sh"
  check_exists "$PROJECT_ROOT/.claude/hooks/stop-gate.sh" ".claude/hooks/stop-gate.sh"
  check_exists "$PROJECT_ROOT/.claude/hooks/event-emitter.sh" ".claude/hooks/event-emitter.sh"
  check_exists "$PROJECT_ROOT/scripts/enable-agents.sh" "scripts/enable-agents.sh"
  check_exists "$PROJECT_ROOT/scripts/disable-agents.sh" "scripts/disable-agents.sh"
  check_exists "$PROJECT_ROOT/scripts/enable-hooks.sh" "scripts/enable-hooks.sh"
  check_exists "$PROJECT_ROOT/scripts/disable-hooks.sh" "scripts/disable-hooks.sh"
  check_exists "$PROJECT_ROOT/.claude/sessions/.current-session" ".claude/sessions/.current-session"

  echo ""
  echo "--- Commands ---"
  check_exists "$PROJECT_ROOT/.claude/commands/session-start.md" ".claude/commands/session-start.md"
  check_exists "$PROJECT_ROOT/.claude/commands/session-update.md" ".claude/commands/session-update.md"
  check_exists "$PROJECT_ROOT/.claude/commands/session-end.md" ".claude/commands/session-end.md"
  check_exists "$PROJECT_ROOT/.claude/commands/session-current.md" ".claude/commands/session-current.md"
  check_exists "$PROJECT_ROOT/.claude/commands/session-list.md" ".claude/commands/session-list.md"
  check_exists "$PROJECT_ROOT/.claude/commands/session-help.md" ".claude/commands/session-help.md"
  check_exists "$PROJECT_ROOT/.claude/commands/memory-compact.md" ".claude/commands/memory-compact.md"
  check_exists "$PROJECT_ROOT/.claude/commands/checkpoint.md" ".claude/commands/checkpoint.md"
  check_exists "$PROJECT_ROOT/.claude/commands/status.md" ".claude/commands/status.md"
  check_exists "$PROJECT_ROOT/.claude/commands/init-feature.md" ".claude/commands/init-feature.md"

  echo ""
  echo "--- Memory ---"
  check_exists "$PROJECT_ROOT/memory" "memory/"

  echo ""
  echo "--- Monitor ---"
  check_exists "$PROJECT_ROOT/tools/claude-monitor/server/app.py" "tools/claude-monitor/server/app.py"
  check_exists "$PROJECT_ROOT/tools/claude-monitor/web/index.html" "tools/claude-monitor/web/index.html"
  check_exists "$PROJECT_ROOT/tools/claude-monitor/start.sh" "tools/claude-monitor/start.sh"
  check_exists "$PROJECT_ROOT/tools/claude-monitor/stop.sh" "tools/claude-monitor/stop.sh"

  echo ""
  echo "--- Agents status ---"
  if [ -d "$PROJECT_ROOT/.claude/agents" ] && [ -n "$(ls -A "$PROJECT_ROOT/.claude/agents" 2>/dev/null)" ]; then
    echo "  [WARN] Agents are ENABLED (.claude/agents/ is not empty)"
  else
    echo "  [OK]   Agents are DISABLED (as expected)"
  fi

  echo ""
  echo "--- Hooks status ---"
  if [ "$ENABLE_HOOKS" = true ]; then
    if grep -q '"hooks"' "$PROJECT_ROOT/.claude/settings.json" 2>/dev/null; then
      echo "  [OK]   Hooks are ENABLED in settings.json (--enable-hooks was set)"
    else
      echo "  [WARN] Hooks NOT found in settings.json despite --enable-hooks"
    fi
  else
    if grep -q '"hooks"' "$PROJECT_ROOT/.claude/settings.json" 2>/dev/null; then
      echo "  [WARN] Hooks found in settings.json (unexpected without --enable-hooks)"
    else
      echo "  [OK]   Hooks are NOT in settings.json (as expected)"
    fi
  fi

  if [ "$SKIP_GLOBAL" != true ]; then
    echo ""
    echo "--- Global files ---"
    check_exists "$GLOBAL_CLAUDE/settings.json" "~/.claude/settings.json"
    check_exists "$GLOBAL_CLAUDE/skills/session-start/SKILL.md" "~/.claude/skills/session-start/SKILL.md"
    check_exists "$GLOBAL_CLAUDE/skills/session-update/SKILL.md" "~/.claude/skills/session-update/SKILL.md"
    check_exists "$GLOBAL_CLAUDE/skills/session-end/SKILL.md" "~/.claude/skills/session-end/SKILL.md"
    check_exists "$GLOBAL_CLAUDE/skills/session-list/SKILL.md" "~/.claude/skills/session-list/SKILL.md"
    check_exists "$GLOBAL_CLAUDE/skills/triage/SKILL.md" "~/.claude/skills/triage/SKILL.md"
    check_exists "$GLOBAL_CLAUDE/skills/summarize/SKILL.md" "~/.claude/skills/summarize/SKILL.md"
    check_exists "$GLOBAL_CLAUDE/skills/risk-check/SKILL.md" "~/.claude/skills/risk-check/SKILL.md"
    check_exists "$GLOBAL_CLAUDE/skills/agents-on/SKILL.md" "~/.claude/skills/agents-on/SKILL.md"
    check_exists "$GLOBAL_CLAUDE/skills/agents-off/SKILL.md" "~/.claude/skills/agents-off/SKILL.md"
    check_exists "$GLOBAL_CLAUDE/agents.off" "~/.claude/agents.off/"
  fi

  echo ""
  echo "=== Results: $pass passed, $fail failed ==="
}

# =============================================================================
# Main
# =============================================================================
main() {
  parse_args "$@"

  echo "============================================="
  echo "  Claude Code Ops Kit - Bootstrap"
  echo "============================================="
  echo "Project root: $PROJECT_ROOT"
  echo "Global Claude: $GLOBAL_CLAUDE"
  echo "Flags: force=$FORCE skip-global=$SKIP_GLOBAL init-git=$INIT_GIT enable-hooks=$ENABLE_HOOKS dry-run=$DRY_RUN"
  echo ""

  create_directories
  write_claude_md
  write_readme
  write_project_settings
  merge_global_settings
  write_repo_skills
  if [ "$SKIP_GLOBAL" != true ]; then
    write_global_skills
  fi
  create_sessions_dir
  write_commands
  write_agent_definitions
  write_toggle_scripts
  write_hook_scripts
  write_hook_toggle_scripts
  write_monitor_files

  if [ "$INIT_GIT" = true ]; then
    echo ""
    echo "=== Initializing git ==="
    if [ "$DRY_RUN" = true ]; then
      echo "[DRY-RUN] Would run: git init"
    else
      git init "$PROJECT_ROOT"
    fi
  fi

  if [ "$DRY_RUN" != true ]; then
    validate
  fi

  echo ""
  echo "============================================="
  if [ "$DRY_RUN" = true ]; then
    echo "  Dry run complete. No files were written."
  else
    echo "  Bootstrap complete!"
    echo "  Created: $CREATED | Skipped: $SKIPPED | Backed up: $BACKED_UP"
  fi
  echo "============================================="
  echo ""
  echo "Next steps:"
  echo "  1. Open Claude Code in this directory"
  echo "  2. Run /project:session-start my-feature"
  echo "  3. Run /triage to assess your first task"
  echo "  4. Follow the recommended workflow"
  echo ""
  echo "Optional:"
  echo "  - Enable agents:  bash scripts/enable-agents.sh"
  echo "  - Enable hooks:   bash scripts/enable-hooks.sh"
  echo "  - Start monitor:  bash tools/claude-monitor/start.sh"
  echo "  - Project status:  /project:status"
  echo "  - Compact memory:  /project:memory-compact"
  echo ""
}

main "$@"

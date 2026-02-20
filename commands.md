# MailDeck Commands

All commands return JSON: `{ ok, data }` or `{ ok, error }`.

```bash
npm run maildeck --workspace=packages/sync-daemon -- <command> [flags]
```

## Quick Reference

| Command | What it does |
|---------|-------------|
| `setup` | Interactive account + send mode setup |
| `start` | Start daemon in background |
| `stop` | Stop daemon |
| `status` | Check if daemon is running, last sync, accounts |
| `sync` | One-shot sync (no daemon needed) |
| `send` | Send email immediately via SMTP |
| `compose` | Drop draft in outbox for daemon to send |
| `search <query>` | Search threads + message bodies |
| `read <thread_id>` | Read a thread's messages |
| `threads` | List recent threads |

## Examples

```bash
# Check what's going on
maildeck status
maildeck threads --limit 5

# Sync recent mail
maildeck sync
maildeck sync --days 30 --max 500

# Find emails about a topic
maildeck search "invoice"
maildeck search "John Smith"

# Read a specific thread (use thread_id from search or threads)
maildeck read 00q48zzm

# Send an email right now (bypasses outbox)
maildeck send --to "alice@example.com" --subject "Meeting tomorrow" --body "Are we still on for 2pm?"

# Send to multiple people with CC
maildeck send --to "alice@example.com,bob@example.com" --cc "manager@example.com" --subject "Q1 Report" --body "Attached is the Q1 report."

# Queue a draft in the outbox (daemon sends it)
maildeck compose --to "alice@example.com" --subject "Follow up" --body "Just checking in on the proposal."

# Daemon lifecycle
maildeck start
maildeck status
maildeck stop
```

## Flags

**sync:** `--account EMAIL`, `--days N` (default 7), `--max N` (default 200)

**send / compose:** `--to ADDR` (required), `--subject TEXT` (required), `--body TEXT` (required), `--cc ADDR`, `--account EMAIL`

**threads:** `--limit N` (default 20), `--account EMAIL`

**read:** `--account EMAIL`

**start:** `--account EMAIL`

## Daemon Lifecycle

```
maildeck setup   →  configure account + send mode (one-time)
maildeck start   →  launch background daemon (writes ~/.maildeck/daemon.pid)
maildeck status  →  check running state
maildeck stop    →  graceful shutdown
```

## Send Modes (set during setup)

- **Require approval** (default) — compose creates drafts as `pending_review`
- **Auto-send** — compose creates drafts as `ready_to_send`, daemon sends immediately

## Data Location

```
~/.maildeck/
├── config.json
├── daemon.pid
├── logs/sync.log
└── accounts/<email>/
    ├── account.json
    ├── index/threads.jsonl
    ├── index/contacts.jsonl
    ├── threads/<id>/thread.json
    ├── threads/<id>/messages/*.md
    ├── threads/<id>/attachments/
    ├── outbox/*.json
    ├── sent/*.json
    └── failed/*.json
```

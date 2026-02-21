# MailDeck Commands

All commands return JSON: `{ ok, data }` or `{ ok, error }`.

```bash
npx maildeck <command> [flags]
```

## Quick Reference

| Command | What it does |
|---------|-------------|
| `setup` | Interactive account + send mode setup |
| `start` | Start daemon in background |
| `stop` | Stop daemon |
| `status` | Check if daemon is running, last sync, accounts |
| `sync` | One-shot sync (incremental if previous sync exists) |
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

# Sync recent mail (incremental if last_uid exists, full otherwise)
maildeck sync
maildeck sync --days 30 --max 500
maildeck sync --full              # force a full sync

# Find emails about a topic
maildeck search "invoice"
maildeck search "John Smith"

# Read a specific thread (use thread_id from search or threads)
maildeck read 00q48zzm

# Send an email right now (bypasses outbox)
maildeck send --to "alice@example.com" --subject "Meeting tomorrow" --body "Are we still on for 2pm?"

# Send with attachments
maildeck send --to "alice@example.com" --subject "Q1 Report" --body "See attached." --attach report.pdf --attach chart.png

# Send to multiple people with CC
maildeck send --to "alice@example.com,bob@example.com" --cc "manager@example.com" --subject "Q1 Report" --body "Attached is the Q1 report."

# Send without signature
maildeck send --to "alice@example.com" --subject "Quick note" --body "Thanks!" --no-signature

# Queue a draft in the outbox (daemon sends it)
maildeck compose --to "alice@example.com" --subject "Follow up" --body "Just checking in on the proposal."

# Daemon lifecycle
maildeck start
maildeck status
maildeck stop
```

## Flags

**sync:** `--account EMAIL`, `--days N` (default 7), `--max N` (default 200), `--full` (force full sync)

**send / compose:** `--to ADDR` (required), `--subject TEXT` (required), `--body TEXT` (required), `--cc ADDR`, `--account EMAIL`, `--attach FILE` (repeatable), `--no-signature`

**threads:** `--limit N` (default 20), `--account EMAIL`

**read:** `--account EMAIL`

**start:** `--account EMAIL`

## Sync Behavior

- **First sync** (no stored `last_uid`): full sync — fetches last N days of mail from `[Gmail]/All Mail`
- **Subsequent syncs**: incremental — only fetches messages with UID > stored `last_uid`
- **Daemon polling**: same logic, polls every 60s with incremental sync
- **`--full` flag**: forces a full sync even if `last_uid` exists
- `last_uid` is persisted in `account.json` and survives daemon restarts

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

## Signatures

- Per-account signature file: `~/.maildeck/accounts/<email>/signature.txt`
- Auto-appended to `send` and `compose` with `-- \n` separator
- Skip with `--no-signature` flag

## Data Location

```
~/.maildeck/
├── config.json
├── daemon.pid
├── logs/sync.log
└── accounts/<email>/
    ├── account.json          # includes last_uid for incremental sync
    ├── signature.txt
    ├── index/threads.jsonl
    ├── index/contacts.jsonl
    ├── threads/<id>/thread.json
    ├── threads/<id>/messages/*.md
    ├── threads/<id>/attachments/
    ├── outbox/*.json
    ├── sent/*.json
    └── failed/*.json
```

# MailDeck — Local Email Access

Your user's email is synced locally. You do NOT need API keys, OAuth tokens, or network access. Just run CLI commands.

All commands return JSON. Run them via Bash:
```bash
npx tsx packages/sync-daemon/src/cli/maildeck.ts <command> [flags]
```

## Reading Email

```bash
# List recent threads
npx tsx packages/sync-daemon/src/cli/maildeck.ts threads --limit 10

# Search for emails (searches subject, sender, body)
npx tsx packages/sync-daemon/src/cli/maildeck.ts search "meeting notes"

# Read a specific thread (get thread_id from search or threads)
npx tsx packages/sync-daemon/src/cli/maildeck.ts read abc123
```

## Sending Email

```bash
# Send immediately (bypasses outbox, no daemon needed)
npx tsx packages/sync-daemon/src/cli/maildeck.ts send \
  --to "alice@example.com" \
  --subject "Quick question" \
  --body "Are we still on for tomorrow?"

# Queue a draft in the outbox (daemon sends it)
npx tsx packages/sync-daemon/src/cli/maildeck.ts compose \
  --to "alice@example.com" \
  --subject "Follow up" \
  --body "Just checking in."

# Multiple recipients + CC
npx tsx packages/sync-daemon/src/cli/maildeck.ts send \
  --to "alice@example.com,bob@example.com" \
  --cc "manager@example.com" \
  --subject "Q1 Report" \
  --body "Here are the numbers."
```

## Syncing & Status

```bash
# Check daemon status and last sync time
npx tsx packages/sync-daemon/src/cli/maildeck.ts status

# Pull latest mail (one-shot, no daemon needed)
npx tsx packages/sync-daemon/src/cli/maildeck.ts sync

# Sync more history
npx tsx packages/sync-daemon/src/cli/maildeck.ts sync --days 30 --max 500
```

## Typical Workflow

1. `status` — check last sync time, decide if you need fresh data
2. `sync` — pull latest if needed
3. `threads` or `search` — find what you're looking for
4. `read <thread_id>` — read the full conversation
5. `send` or `compose` — reply or write new email

## Response Format

Every command returns:
```json
{ "ok": true, "data": { ... } }
{ "ok": false, "error": "..." }
```

## Important Notes

- `send` sends immediately. `compose` queues a draft (may need human approval depending on config).
- Search is case-insensitive substring matching across index fields and message bodies.
- Thread IDs come from `threads` or `search` output — use them with `read`.
- You can also read the raw files directly at `~/.maildeck/accounts/<email>/` if needed:
  - `index/threads.jsonl` — one JSON per line, grep-friendly
  - `threads/<id>/messages/*.md` — YAML frontmatter + clean body text

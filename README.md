# ClawMail3

Agent-native local email client. Syncs Gmail to `~/.clawmail3/` as a filesystem format any AI agent can read natively.

## Install

```bash
npm install -g clawmail3
```

Requires **Node.js 18+** and a Gmail account with an [App Password](https://myaccount.google.com/apppasswords).

## Quick Start

```bash
# 1. Connect your Gmail account
clawmail3 setup

# 2. Sync recent mail
clawmail3 sync

# 3. Read your inbox
clawmail3 threads --limit 10

# 4. Search for emails
clawmail3 search "meeting notes"

# 5. Read a thread
clawmail3 read <thread_id>

# 6. Send an email
clawmail3 send --to "alice@example.com" --subject "Hello" --body "Hi there!"
```

## CLI Reference

Every command returns structured JSON: `{ ok: true, data: ... }` or `{ ok: false, error: "..." }`.

| Command | Description | Key Flags |
|---------|-------------|-----------|
| `setup` | Interactive account setup | — |
| `start` | Start background sync daemon | `--account` |
| `stop` | Stop running daemon | — |
| `status` | Show daemon & account status | — |
| `sync` | One-shot sync | `--account`, `--days`, `--max` |
| `send` | Send email immediately | `--to`, `--subject`, `--body`, `--cc`, `--attach`, `--no-signature` |
| `compose` | Queue draft in outbox | `--to`, `--subject`, `--body`, `--cc`, `--attach`, `--no-signature` |
| `search` | Search messages | positional query |
| `read` | Read a thread | positional thread_id |
| `threads` | List recent threads | `--limit N` |

### Attachments

Use `--attach` (repeatable) to attach files:

```bash
clawmail3 send --to "bob@example.com" --subject "Report" --body "See attached" \
  --attach ./report.pdf --attach ./data.csv
```

### Signatures

Set a signature during `clawmail3 setup`, or create `~/.clawmail3/accounts/<email>/signature.txt` manually. Signatures are auto-appended to all outgoing email. Use `--no-signature` to skip.

## Filesystem Format

```
~/.clawmail3/
├── config.json
├── daemon.pid
└── accounts/
    └── you@gmail.com/
        ├── account.json
        ├── signature.txt
        ├── index/
        │   ├── threads.jsonl      # one JSON object per line
        │   ├── contacts.jsonl
        │   └── commitments.jsonl
        ├── threads/
        │   └── <thread_id>/
        │       ├── thread.json    # metadata, participants, labels
        │       ├── messages/
        │       │   └── *.md       # YAML frontmatter + clean body text
        │       └── attachments/
        │           └── *.pdf, *.jpg, ...
        ├── outbox/                # pending drafts
        ├── sent/                  # sent drafts
        └── failed/               # failed drafts
```

Messages are stored as Markdown with YAML frontmatter — readable by any tool, language, or agent:

```markdown
---
id: msg_12345
from: alice@example.com
from_name: Alice Smith
to: you@gmail.com
date: "2026-02-18T15:30:00Z"
---

Hey, are we still on for tomorrow's meeting?
```

## Authentication

**Default: App Password (recommended)**
- No Google Cloud Console needed
- Works with IMAP + SMTP
- Credentials stored in OS keychain (Windows Credential Manager / macOS Keychain / Linux libsecret)

**Advanced: Gmail OAuth**
- Requires Google Cloud project with Gmail API enabled
- Full Gmail API access (labels, push notifications)

## For AI Agents

ClawMail3 is designed for AI agents to control programmatically:

```bash
# All commands return JSON — pipe to jq, parse in code, etc.
clawmail3 threads --limit 5 | jq '.data.threads[].subject'

# Agents can grep the filesystem directly
grep -r "invoice" ~/.clawmail3/accounts/*/threads/*/messages/
```

The filesystem format is intentionally simple: JSONL indexes for fast scanning, Markdown messages for natural language processing, and structured JSON metadata for programmatic access.

## License

GPL-3.0

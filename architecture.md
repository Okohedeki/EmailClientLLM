# MailDeck — Agent-Native Local Email Client

## Project Summary

MailDeck is a local desktop email client that syncs your Gmail (and later other providers) to your machine and stores everything in a clean, structured, filesystem-based format that any AI agent — OpenClaw, Claude Code, Codex, or a custom agent — can read and act on natively using their existing file tools.

**The core idea:** The agent never needs your API keys. It never makes network calls to Gmail. It just reads local files. The email client handles the connection to Google. The agent handles the thinking.

---

## The Problem

Today, when an AI agent like OpenClaw needs to interact with your email, it must:

1. Hold your Gmail OAuth credentials (security risk — stored in plaintext JSON config)
2. Make REST API calls to Google's servers on every interaction (slow, network-dependent)
3. Parse raw Gmail API responses: MIME-encoded, nested HTML, base64 attachments, repeated quoted reply chains (wastes 80%+ of tokens on structural noise)
4. Re-parse the same threads every time it revisits a conversation (no local cache)
5. Require a dedicated Gmail skill with OAuth setup, Google Cloud Console project, consent screen configuration, and "unsafe app" warnings

This is how every agent framework currently works with email. It's fragile, expensive, insecure, and slow.

## The Solution

MailDeck sits between Gmail and the agent. It:

- **Syncs** your Gmail continuously to local storage
- **Cleans** raw email into plain-text markdown with separated metadata
- **Stores** everything on disk in a format optimized for ripgrep, glob, and file-read — the exact tools Claude Code and OpenClaw already use
- **Watches** an outbox directory for agent-drafted messages and sends them via Gmail
- **Never exposes** credentials to the agent layer

The agent just reads files. It already knows how to do that.

---

## Why Filesystem (Not SQLite, Not a Local API)

### How agents actually search

**Claude Code** uses three primary tools for discovery:
- **Grep** — built on ripgrep (`rg`). Regex search across file contents. This is the primary search mechanism.
- **Glob** — file pattern matching (`**/*.md`, `inbox/*.json`). Used to find files by name/path.
- **Read** — reads file contents, supports text and binary formats.

**OpenClaw** uses:
- **read** — reads file contents
- **exec** — runs shell commands including `grep`, `cat`, `head`, `tail`, `less`, `sort`, `uniq`, `wc`, `awk`, `sed`
- **write/edit** — creates and modifies files

**Codex / other agents** — virtually all agent frameworks ultimately shell out to filesystem operations.

### Why not SQLite?

- Agents cannot `rg` into a SQLite database. They'd need a wrapper CLI or a custom tool.
- Adds a dependency and abstraction layer between the agent and the data.
- Breaks the universality — not every agent framework can query SQLite natively.
- Debugging is harder for humans too (can't just `cat` a file).

### Why not a local REST API (localhost server)?

- Requires the email client to be running for the agent to access data (fragile coupling).
- Agents would need an HTTP tool or custom skill to call it.
- Adds complexity with zero benefit over reading files that are already on disk.
- If the API server crashes, the agent loses access to everything.

### Why filesystem wins

- **Universal interface.** Every agent framework can read files. No plugins, no skills, no custom tools needed.
- **ripgrep-native.** Claude Code's Grep tool and OpenClaw's exec+grep work directly on files. ripgrep is extremely fast — it can search millions of lines in milliseconds.
- **Glob-native.** Finding "all unread emails from this week" is a glob pattern, not a database query.
- **Offline by default.** Data persists even if the sync daemon stops. The agent works on whatever was last synced.
- **Human-debuggable.** You can `cat`, `ls`, `grep` the data yourself.
- **Git-friendly.** You could version-control your email state if you wanted to.

---

## Storage Format

### Directory Structure

```
~/.maildeck/
├── config.json                     # User config (credentials stored in OS keychain, not here)
├── accounts/
│   └── user@gmail.com/
│       ├── account.json            # Account metadata, sync state, last sync timestamp
│       ├── labels.json             # Gmail label definitions and IDs
│       │
│       ├── index/
│       │   ├── threads.jsonl       # One JSON object per line, per thread (master index)
│       │   ├── contacts.jsonl      # One JSON object per line, per known contact
│       │   └── commitments.jsonl   # Extracted promises/deadlines from sent mail
│       │
│       ├── threads/
│       │   ├── 18d4a7f2b3c1e001/
│       │   │   ├── thread.json     # Thread metadata (participants, labels, state, dates)
│       │   │   ├── messages/
│       │   │   │   ├── 20260210T140000Z__msg18d4a7f2b3c1e001_001.md
│       │   │   │   ├── 20260214T103000Z__msg18d4a7f2b3c1e001_003.md
│       │   │   │   └── 20260217T093000Z__msg18d4a7f2b3c1e001_005.md
│       │   │   └── attachments/
│       │   │       └── proposal_v3.pdf
│       │   └── 18d4a7f2b3c1e002/
│       │       ├── thread.json
│       │       ├── messages/
│       │       │   └── 20260217T080000Z__msg18d4a7f2b3c1e002_001.md
│       │       └── attachments/
│       │
│       ├── outbox/                 # Agent drops drafts here → daemon sends them
│       │   └── draft_001.json
│       │
│       ├── sent/                   # Sent confirmations
│       │   └── sent_001.json
│       │
│       └── failed/                 # Failed sends with error metadata
│           └── failed_001.json
│
└── logs/
    └── sync.log                    # Sync daemon activity log
```

### Why JSONL for Indexes

JSONL (JSON Lines) is the optimal index format because:

- **ripgrep searches it instantly.** Each line is a self-contained JSON object. `rg "mike@acme.com" threads.jsonl` returns every thread involving Mike in milliseconds, even with 100K+ threads.
- **Glob + grep compose naturally.** Find unread threads: `rg '"unread":true' threads.jsonl`. Find threads with label: `rg '"label":"IMPORTANT"' threads.jsonl`.
- **Appendable.** New threads get appended. No rewriting the whole file.
- **Streamable.** Agents can `head -50 threads.jsonl` to get the 50 most recent threads without loading the entire index.
- **Standard format.** Every language has JSONL parsers. `jq` works on it. Python, Node, Rust all handle it trivially.

### threads.jsonl — Master Thread Index

Each line is one JSON object representing a thread. Sorted by last-updated descending (newest first), so `head` gives you the most recent activity.

```jsonl
{"id":"18d4a7f2b3c1e001","subject":"Re: Johnson deal pricing","from":"mike@acme.com","from_name":"Mike Chen","participants":["mike@acme.com","you@gmail.com"],"labels":["INBOX","IMPORTANT"],"unread":true,"starred":false,"msg_count":5,"last_date":"2026-02-17T09:30:00Z","first_date":"2026-02-10T14:00:00Z","snippet":"Can we revisit the implementation fees? I think...","has_attachments":true,"size_bytes":24500}
{"id":"18d4a7f2b3c1e002","subject":"Team standup notes - Feb 17","from":"sarah@company.com","from_name":"Sarah Lopez","participants":["sarah@company.com","team@company.com","you@gmail.com"],"labels":["INBOX"],"unread":false,"starred":false,"msg_count":1,"last_date":"2026-02-17T08:00:00Z","first_date":"2026-02-17T08:00:00Z","snippet":"Here are the standup notes from this morning...","has_attachments":false,"size_bytes":3200}
```

**Agent usage examples:**
```bash
# Find all unread threads
rg '"unread":true' ~/.maildeck/accounts/user@gmail.com/index/threads.jsonl

# Find all threads from mike@acme.com
rg 'mike@acme.com' ~/.maildeck/accounts/user@gmail.com/index/threads.jsonl

# Find threads with attachments
rg '"has_attachments":true' ~/.maildeck/accounts/user@gmail.com/index/threads.jsonl

# Find threads containing "pricing" in the subject or snippet
rg -i 'pricing' ~/.maildeck/accounts/user@gmail.com/index/threads.jsonl

# Count unread threads
rg -c '"unread":true' ~/.maildeck/accounts/user@gmail.com/index/threads.jsonl

# Get the 10 most recent threads (file is sorted newest-first)
head -10 ~/.maildeck/accounts/user@gmail.com/index/threads.jsonl
```

### contacts.jsonl — Contact Index

```jsonl
{"email":"mike@acme.com","name":"Mike Chen","first_seen":"2024-06-15","last_seen":"2026-02-17","msg_count":142,"labels_common":["IMPORTANT","INBOX"],"is_frequent":true}
{"email":"sarah@company.com","name":"Sarah Lopez","first_seen":"2025-01-10","last_seen":"2026-02-17","msg_count":89,"labels_common":["INBOX"],"is_frequent":true}
```

### commitments.jsonl — Extracted Promises & Deadlines

Populated by scanning sent messages for temporal language. Deterministic extraction (regex for dates, simple patterns for "I'll", "we will", "by Friday", etc.), not AI-dependent.

```jsonl
{"thread_id":"18d4a7f2b3c1e001","date_made":"2026-02-15","to":"mike@acme.com","commitment":"Send revised pricing by end of week","deadline":"2026-02-21","status":"open"}
```

### thread.json — Thread Metadata

```json
{
  "id": "18d4a7f2b3c1e001",
  "subject": "Re: Johnson deal pricing",
  "labels": ["INBOX", "IMPORTANT"],
  "unread": true,
  "starred": false,
  "participants": [
    { "email": "mike@acme.com", "name": "Mike Chen", "role": "external" },
    { "email": "you@gmail.com", "name": "You", "role": "self" }
  ],
  "message_count": 5,
  "first_date": "2026-02-10T14:00:00Z",
  "last_date": "2026-02-17T09:30:00Z",
  "has_attachments": true,
  "attachments": [
    { "filename": "proposal_v3.pdf", "mime": "application/pdf", "size_bytes": 184320 }
  ]
}
```

### Message Filenames (Stable + Glob-Friendly)

MailDeck does **not** use `001.md/002.md` as canonical message IDs because Gmail messages can arrive out of order (history backfill, label changes, delayed fetches). Renumbering breaks stable references.

Instead, message files are named with a **sortable timestamp prefix** and a **stable message identifier**:

```
<UTC_ISO_BASIC>__msg<gmail_message_id>.md
```

Example:
```
20260217T093000Z__msg18d4a7f2b3c1e001_005.md
```

**Why this wins:**
- `ls` naturally shows chronological order.
- No renumbering ever. New messages slot in by timestamp.
- Agents can still glob `messages/*.md` and read in sorted order.
- Easy time filtering via glob:
  - `messages/202602*.md` — all messages from Feb 2026
  - `messages/20260217*.md` — all messages from a specific day

### Individual Message (Clean Body)

Example file: `20260217T093000Z__msg18d4a7f2b3c1e001_005.md`

```markdown
---
id: msg_18d4a7f2b3c1e001_005
gmail_message_id: 18d4a7f2b3c1e001_005
thread_id: 18d4a7f2b3c1e001
rfc822_message_id: "<CAK7abc123@mail.gmail.com>"
in_reply_to: "<CAJ9xyz789@mail.gmail.com>"
references: ["<CAJ9xyz789@mail.gmail.com>", "<CAK1def456@mail.gmail.com>"]
from: mike@acme.com
from_name: Mike Chen
to: you@gmail.com
date: 2026-02-17T09:30:00Z
---

Can we revisit the implementation fees? I think the base rate works, but $15K for implementation feels steep given we're handling most of the integration on our end.

I've attached the revised proposal with our suggested breakdown. Take a look at section 3 when you get a chance.
```

Key decisions for message files:
- **YAML frontmatter** includes all identifiers needed for correct threading/replies: `thread_id`, `gmail_message_id`, plus header-derived `rfc822_message_id`, `in_reply_to`, `references` when available.
- **Body is clean plain text.** No HTML. No signatures. No quoted reply chains. Just what the person actually wrote in this specific message.
- **Timestamp-prefixed filenames** so `ls` and glob give chronological order without sequential numbering.
- **Signature stripping and quote removal** done at sync time using deterministic libraries (not AI).

### Outbox Draft Contract

```json
{
  "action": "reply",
  "thread_id": "18d4a7f2b3c1e001",
  "in_reply_to": "msg_18d4a7f2b3c1e001_005",
  "to": ["mike@acme.com"],
  "subject": "Re: Johnson deal pricing",
  "body": "Mike, thanks for sending that over. I've reviewed section 3...",
  "created_at": "2026-02-17T10:00:00Z",
  "created_by": "agent",

  "status": "pending_review"
}
```

### Outbox Draft State Machine (Daemon Contract)

Outbox files are the send API. The daemon watches `outbox/` and processes drafts based on `status`.

Allowed statuses:
- `pending_review` — waiting for human review (UI-only workflow)
- `ready_to_send` — approved or review disabled; daemon may send
- `sending` — daemon has claimed it (internal/transient)
- `sent` — moved to `sent/` with confirmation metadata
- `failed` — moved to `failed/` with error metadata

**Atomicity rule:** drafts must be written via atomic rename (`.tmp` → `.json`) to avoid partial reads.

**Daemon send rules:**
- If `review_before_send = true` (configured at setup):
  - daemon **never** sends `pending_review` drafts
  - GUI flips `pending_review` → `ready_to_send` on human approval
- If `review_before_send = false`:
  - daemon treats new drafts as immediately eligible
  - either agents set `status: "ready_to_send"` directly, or daemon auto-promotes `pending_review` → `ready_to_send` on ingest

### Setup Flag: Review Before Send

MailDeck setup includes a single user-facing safety toggle in `config.json`:

```json
{
  "review_before_send": true
}
```

Behavior:
- `true` (default): sending requires a UI review step. Drafts remain `pending_review` until approved in the GUI.
- `false`: no review gate. Drafts are sent automatically when they become `ready_to_send`.

This keeps the MVP minimal while supporting both "fully automatic agent sending" and "human-in-the-loop" workflows without exposing credentials to agents.

---

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                      HUMAN                          │
│              (reviews, overrides)                    │
└──────────────────────┬──────────────────────────────┘
                       │ GUI (Tauri)
┌──────────────────────▼──────────────────────────────┐
│                                                     │
│    ┌──────────────┐          ┌──────────────────┐   │
│    │  Sync Daemon │          │    Agent (any)    │   │
│    │              │          │                   │   │
│    │  Gmail OAuth ◄──────┐   │  OpenClaw         │   │
│    │  IMAP/SMTP   │      │   │  Claude Code      │   │
│    │              │      │   │  Codex             │   │
│    └──────┬───────┘      │   │  Custom script     │   │
│           │              │   └────────┬──────────┘   │
│           │ writes       │            │ reads/writes │
│           ▼              │            ▼              │
│    ┌─────────────────────┴──────────────────────┐   │
│    │                                             │   │
│    │            ~/.maildeck/                      │   │
│    │                                             │   │
│    │    index/threads.jsonl   (grep target)      │   │
│    │    index/contacts.jsonl  (grep target)      │   │
│    │    threads/*/thread.json (glob + read)      │   │
│    │    threads/*/messages/*.md (glob + read)    │   │
│    │    outbox/*.json          (agent writes)    │   │
│    │                                             │   │
│    └─────────────────────────────────────────────┘   │
│                     LOCAL DISK                       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. Sync Daemon (Background Process)

**Language:** Node.js (TypeScript) or Rust
**Responsibility:** The only component that talks to Gmail.

- Authenticates via Gmail OAuth 2.0 (credentials stored in OS keychain — macOS Keychain, Linux Secret Service, Windows Credential Manager — never in plaintext config files)
- On first run: full sync of inbox (configurable depth — last 30 days, 90 days, all)
- After first run: incremental sync via Gmail push notifications (Pub/Sub) or polling (every 30-60 seconds)
- For each new/updated message:
  - Strips HTML to plain text (using `turndown` or `html-to-text`)
  - Removes signatures (using `email-reply-parser` or `talon` port)
  - Removes quoted reply chains (keep only the new content per message)
  - Extracts metadata into structured JSON
  - Downloads attachments to thread directory
  - Updates `threads.jsonl` index (insert or update the line for this thread)
  - Updates `contacts.jsonl` if new sender seen
- Watches `outbox/` directory for new draft files
  - Validates draft JSON schema
  - Processes drafts according to state machine (see Outbox Draft State Machine)
  - Respects `review_before_send` config flag
  - On send success: moves to `sent/` with confirmation metadata
  - On send failure: moves to `failed/` with error metadata
- Writes activity to `logs/sync.log`

**Key libraries:**
- `googleapis` (official Google API client) or `imapflow` (IMAP)
- `html-to-text` or `turndown` (HTML → plain text)
- `mailparser` (MIME parsing)
- `email-reply-parser` (signature/quote stripping — port of GitHub's Ruby library)
- `chokidar` (filesystem watcher for outbox)
- `keytar` (OS keychain access)

#### 2. GUI (Desktop Application)

**Framework:** Tauri (Rust backend + web frontend)
**Why Tauri over Electron:** ~10x smaller binary, lower memory usage, native OS keychain integration, Rust backend can share code with sync daemon if written in Rust.

**The GUI is a review/override layer, not the primary interface.** The agent operates on the filesystem. The human uses the GUI to:

- View inbox (reads from the same `threads.jsonl` and message files the agent reads)
- Review and approve agent-drafted replies in `outbox/`
- Override agent decisions (edit drafts, mark threads as human-only)
- Configure sync settings (which labels to sync, sync depth, polling frequency)
- Initial Gmail OAuth setup (opens browser for consent flow)
- View sync status and errors

**The GUI reads the same data the agent reads.** There is no separate data store. If the agent modifies a file, the GUI reflects it. If the human approves a draft in the GUI, the file in `outbox/` gets updated and the sync daemon picks it up.

#### 3. Agent Interface (Filesystem Convention)

There is no agent-specific code in MailDeck. The agent interface IS the filesystem. Any program that can read files and write JSON can interact with MailDeck.

**To provide an OpenClaw skill**, you'd write a `SKILL.md` that says:

```markdown
# MailDeck — Local Email Access

Your user's email is synced locally to `~/.maildeck/accounts/<email>/`.
You do NOT need Gmail API keys or OAuth tokens. Just read files.

## Reading email

- Thread index: `~/.maildeck/accounts/*/index/threads.jsonl` (one JSON per line, grep-searchable)
- Thread details: `~/.maildeck/accounts/*/threads/<thread_id>/thread.json`
- Message bodies: `~/.maildeck/accounts/*/threads/<thread_id>/messages/*.md`
- Attachments: `~/.maildeck/accounts/*/threads/<thread_id>/attachments/`

## Searching

Use grep/rg on threads.jsonl:
- Unread: `rg '"unread":true' threads.jsonl`
- From specific sender: `rg 'mike@acme.com' threads.jsonl`
- By subject keyword: `rg -i 'pricing' threads.jsonl`

## Sending email

Write a JSON file to `~/.maildeck/accounts/<email>/outbox/`:
{
  "action": "reply" | "compose",
  "thread_id": "..." (for replies),
  "to": ["recipient@example.com"],
  "subject": "...",
  "body": "...",
  "status": "pending_review"
}

The sync daemon will pick it up. If review_before_send is enabled, it waits for human approval in the GUI. If disabled, it sends automatically.
```

For **Claude Code**, no skill is needed. It already knows how to read files and grep. You just point it at the directory:

> "My email is synced locally at ~/.maildeck/. The index is in index/threads.jsonl (JSONL, one thread per line, grep-searchable). Message bodies are in threads/<id>/messages/*.md (timestamp-prefixed, chronological). To reply, write a JSON file to outbox/ with status: pending_review."

That's the entire integration.

---

## Email Cleaning Pipeline (Deterministic, Token-Reducing)

Goal: produce **minimal, high-signal** message bodies so agents spend tokens on intent, not structure — while preserving enough metadata to support **correct replies and sending**.

This pipeline is deterministic (no AI). It runs on every ingested message.

### Outputs per message

For each message file (`threads/<id>/messages/<timestamp>__msg<id>.md`):

- **YAML frontmatter** includes all identifiers needed for correct threading/replies: `thread_id`, `gmail_message_id`, plus header-derived `rfc822_message_id`, `in_reply_to`, `references` when available.
- **Body** is the *new content only* (no quoted history), aggressively token-reduced but conservative about deleting meaningful content.

Optionally (recommended for debugging + future improvements):
- Store raw source alongside (e.g., `raw.eml` or `raw.json` in the thread directory) so cleaning can be improved without data loss.

### Step 1: MIME Decode (Lossless parse)
- Parse Gmail/IMAP payload → extract headers + text/plain + text/html + attachments
- Prefer `text/plain` when present
- If only HTML exists, convert to text (preserve links)

### Step 2: HTML → Clean Text (Structure reduction)
- Convert HTML to plain text with minimal formatting:
  - Keep paragraphs + bullet structure
  - Collapse decorative whitespace
  - Normalize Unicode to NFC

### Step 3: Quote Chain Removal (Major token win)
Remove quoted history blocks such as:
- `On <date>, <name> wrote:` sections
- `-----Original Message-----`
- Deep reply chains
- Forwarded headers (`From:`, `Sent:`, `To:`, `Subject:`) that indicate quoted content

**Result:** keep only what was newly written in this message.

### Step 4: Signature + Disclaimer Stripping (Token win, conservative)
Remove:
- Standard signature separators (`--`, `__`)
- "Sent from my iPhone"
- Long corporate disclaimers / confidentiality footers

Conservative rule: if stripping would remove too much (e.g., cleaned text becomes extremely short while original was long), fall back to a less aggressive mode.

### Step 5: Noise Normalization (Small token win)
- Collapse >2 blank lines to max 2
- Trim leading/trailing whitespace
- Remove common tracking junk (optional): e.g., `utm_*` query params in links (keep base URL)

### Step 6: Snippet Generation (Index efficiency)
Generate a short snippet (first ~200–300 chars of cleaned body) and store it in:
- `threads.jsonl` line for fast skim/search without opening files

### Step 7: Attachment Handling (Minimal, correctness-first)
- Download attachments into `threads/<id>/attachments/`
- Record attachment metadata in `thread.json`
- Do **not** attempt heavy extraction by default in MVP (keep fast + reliable)

### Step 8: Write Message + Update Thread/Indexes
- Write the message `.md` (frontmatter + cleaned body)
- Update `thread.json` (participants, labels, unread, last_date, attachment list)
- Upsert/refresh `threads.jsonl` and `contacts.jsonl`

### Token-Reduction Contract (What "clean" guarantees)

The cleaned body **excludes:**
- HTML markup
- Quoted reply history
- Repeated headers/forward blocks
- Signatures and disclaimers when safely detectable

The cleaned body **preserves:**
- The actual new request/intent
- Any numeric details, dates, and action items
- References to attachments ("see section 3", "attached file", etc.)

---

## Security Model

### Credentials
- Gmail OAuth refresh token stored in **OS keychain** (macOS Keychain, libsecret on Linux, Windows Credential Manager)
- Never written to disk in plaintext
- Never accessible to the agent — the agent reads `~/.maildeck/` files, the keychain is a separate system-level store
- Config file at `~/.maildeck/config.json` stores only non-sensitive settings (sync interval, labels to sync, account email addresses)

### Agent Isolation
- The agent reads and writes to `~/.maildeck/` only
- It has **no access** to OAuth tokens, refresh tokens, or any authentication material
- It cannot make Gmail API calls (it has no credentials to do so)
- If a malicious OpenClaw skill runs, the worst it can do is read your locally-synced email and write drafts to the outbox — it cannot exfiltrate your Google account credentials
- Drafts with `status: "pending_review"` still need human sign-off in the GUI when `review_before_send` is enabled

### Filesystem Permissions
- `~/.maildeck/` directory: `700` (owner only)
- JSONL indexes: `644` (readable by agent processes running as same user)
- Outbox: `755` (agent needs write access)
- Config: `600` (owner only, contains account identifiers)

---

## Technology Stack

| Component       | Technology                | Rationale                                                    |
|-----------------|---------------------------|--------------------------------------------------------------|
| Sync daemon     | Node.js + TypeScript      | Best Gmail API client library ecosystem; `googleapis` is official Google-maintained |
| MIME parsing     | `mailparser`              | Battle-tested, handles edge cases (inline images, nested MIME, charset issues) |
| HTML → text      | `html-to-text`            | Configurable, preserves links and basic structure             |
| Quote stripping  | `email-reply-parser`      | GitHub's algorithm, ported to JS. Handles "On X, Y wrote:" patterns across languages |
| Keychain         | `keytar`                  | Cross-platform OS keychain access (macOS, Linux, Windows)     |
| FS watcher       | `chokidar`                | Reliable cross-platform file watching for outbox              |
| Desktop GUI      | Tauri 2.0                 | Small binary (~5MB vs Electron's 150MB+), native performance, Rust backend |
| GUI frontend     | React + Tailwind          | Fast to develop, component-based, good Tauri integration      |
| Process manager  | systemd (Linux) / launchd (macOS) | Daemon management for sync process                   |

---

## Build & Run

### First Run (User)
1. Install MailDeck (single binary via Tauri)
2. Open app → click "Add Gmail Account"
3. Browser opens → standard Google OAuth consent flow
4. Token stored in OS keychain, sync begins
5. Wait for initial sync to complete (progress bar in GUI)
6. `~/.maildeck/` is now populated and ready for agents

### Agent Setup (OpenClaw)
1. Copy `SKILL.md` (above) to OpenClaw's workspace skills directory
2. Tell the agent: "My email is in ~/.maildeck/"
3. Done. No API keys. No OAuth. No Google Cloud Console.

### Agent Setup (Claude Code)
1. Add to `CLAUDE.md` or tell Claude in conversation:
   > "My email is synced at ~/.maildeck/. Index is threads.jsonl (JSONL, ripgrep-friendly). Messages are threads/<id>/messages/*.md. Write drafts to outbox/ as JSON."
2. Done.

---

## Scope — Gmail MVP

This is a Gmail-only MVP. Everything below ships together as a single working product.

### Sync Daemon
- Gmail OAuth 2.0 authentication (credentials in OS keychain)
- Full initial sync of inbox (configurable depth — last 30/90 days or all)
- Incremental sync via polling (every 30-60 seconds)
- MIME parsing → clean markdown messages (HTML stripping, quote removal, signature removal)
- JSONL index generation and maintenance (threads, contacts)
- Attachment downloading and storage
- Outbox watcher — picks up agent-written draft JSON files and sends via Gmail API
- Sync logging

### Storage Layer
- Full directory structure as specified above
- threads.jsonl master index (sorted newest-first, ripgrep-searchable)
- contacts.jsonl contact index
- Per-thread directories with thread.json metadata + timestamp-prefixed .md message files + attachments/
- Outbox + sent + failed directories for agent-driven sends

### Desktop GUI (Tauri)
- Gmail OAuth setup flow (opens browser, stores token in keychain)
- Inbox view (reads from threads.jsonl and message files)
- Thread view (reads from thread directory)
- Draft approval queue (watches outbox/ for `pending_review` drafts, flips to `ready_to_send` on approve)
- Sync status indicator
- Basic settings (sync depth, polling interval, `review_before_send` toggle)

### Agent Integration
- OpenClaw SKILL.md file
- Claude Code CLAUDE.md snippet
- Both just describe the filesystem convention — no code, no plugins, no API keys

---

## Open Questions

1. **JSONL rewrite strategy:** For very large inboxes (500K+ threads), the full-file rewrite of threads.jsonl on every sync could become slow. Consider sharding by month (`threads_2026_02.jsonl`) or maintaining a hot file (last 30 days) + cold archive. For MVP, full rewrite is fine — under 100K threads it takes <100ms.

2. **Multi-account:** The `accounts/<email>/` structure supports this, but the OpenClaw skill would need to know which account to target. Default to first/only account, allow agent to specify.

3. **Rate limits:** Gmail API has rate limits (250 quota units per second for users). The sync daemon needs to respect these, especially on first full sync. Exponential backoff + batch API calls.

4. **Tauri vs. Electron:** Tauri is smaller and faster but has a smaller ecosystem. If rich GUI features are needed (complex email rendering, embedded browser for HTML emails), Electron might be pragmatic. Decision can be deferred — the sync daemon and storage format are GUI-independent.
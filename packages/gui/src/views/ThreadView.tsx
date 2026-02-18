import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { readThreadMeta, readMessages, readConfig } from "../ipc";
import type { ThreadMeta } from "../ipc";

interface MessageFile {
  filename: string;
  content: string;
}

interface ParsedMessage {
  frontmatter: Record<string, string>;
  body: string;
}

export default function ThreadView() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const [meta, setMeta] = useState<ThreadMeta | null>(null);
  const [messages, setMessages] = useState<MessageFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!threadId) return;
    loadThread();
  }, [threadId]);

  async function loadThread() {
    try {
      const config = await readConfig();
      const email = config.accounts[0];
      const [threadMeta, msgs] = await Promise.all([
        readThreadMeta(email, threadId!),
        readMessages(email, threadId!),
      ]);
      setMeta(threadMeta);
      setMessages(msgs);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Back button */}
      <button
        onClick={() => navigate("/")}
        className="text-sm text-gray-400 hover:text-gray-200 mb-4 transition-colors"
      >
        ← Back to inbox
      </button>

      {/* Thread header */}
      {meta && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold">{meta.subject}</h2>
          <div className="flex flex-wrap gap-2 mt-2">
            {meta.labels.map((label) => (
              <span
                key={label}
                className="px-2 py-0.5 text-xs rounded-full bg-surface-2 text-gray-400"
              >
                {label}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {meta.message_count} messages · {meta.participants.length}{" "}
            participants
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex flex-col gap-4">
        {messages.map((msg) => {
          const parsed = parseMessage(msg.content);
          return (
            <MessageCard
              key={msg.filename}
              from={parsed.frontmatter.from ?? ""}
              fromName={parsed.frontmatter.from_name ?? ""}
              date={parsed.frontmatter.date ?? ""}
              body={parsed.body}
            />
          );
        })}
      </div>
    </div>
  );
}

function MessageCard({
  from,
  fromName,
  date,
  body,
}: {
  from: string;
  fromName: string;
  date: string;
  body: string;
}) {
  const dateStr = date
    ? new Date(date).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="bg-surface-1 rounded-lg p-4 border border-surface-3">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <span className="text-sm font-medium text-gray-200">
            {fromName || from}
          </span>
          {fromName && (
            <span className="text-xs text-gray-500 ml-2">&lt;{from}&gt;</span>
          )}
        </div>
        <span className="text-xs text-gray-500">{dateStr}</span>
      </div>
      <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
        {body}
      </div>
    </div>
  );
}

/**
 * Parse a markdown message file with YAML frontmatter.
 */
function parseMessage(content: string): ParsedMessage {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    return { frontmatter: {}, body: content };
  }

  const frontmatter: Record<string, string> = {};
  for (const line of fmMatch[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim().replace(/^"(.*)"$/, "$1");
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body: fmMatch[2].trim() };
}

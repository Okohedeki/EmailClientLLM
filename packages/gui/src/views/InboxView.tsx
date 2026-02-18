import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { readThreadsIndex, readConfig } from "../ipc";
import type { ThreadIndexEntry } from "../ipc";

export default function InboxView() {
  const [threads, setThreads] = useState<ThreadIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadThreads();
  }, []);

  async function loadThreads() {
    try {
      const config = await readConfig();
      if (config.accounts.length === 0) {
        navigate("/setup");
        return;
      }
      const entries = await readThreadsIndex(config.accounts[0]);
      setThreads(entries);
    } catch (err: any) {
      setError(err.message ?? "Failed to load threads");
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-xl font-semibold mb-4">Inbox</h2>

      {threads.length === 0 ? (
        <p className="text-gray-500">No threads synced yet.</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {threads.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              onClick={() => navigate(`/thread/${thread.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ThreadRow({
  thread,
  onClick,
}: {
  thread: ThreadIndexEntry;
  onClick: () => void;
}) {
  const date = new Date(thread.last_date);
  const dateStr = formatRelativeDate(date);

  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-3 px-4 py-3 rounded-lg text-left transition-colors hover:bg-surface-2 ${
        thread.unread ? "bg-surface-1" : ""
      }`}
    >
      {/* Unread indicator */}
      <div className="mt-2 w-2 h-2 flex-shrink-0">
        {thread.unread && <div className="w-2 h-2 rounded-full bg-accent" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className={`text-sm truncate ${
              thread.unread ? "font-semibold text-gray-100" : "text-gray-300"
            }`}
          >
            {thread.from_name || thread.from}
          </span>
          {thread.msg_count > 1 && (
            <span className="text-xs text-gray-500">{thread.msg_count}</span>
          )}
          <span className="ml-auto text-xs text-gray-500 flex-shrink-0">
            {dateStr}
          </span>
        </div>
        <p
          className={`text-sm truncate ${
            thread.unread ? "text-gray-200" : "text-gray-400"
          }`}
        >
          {thread.subject}
        </p>
        <p className="text-xs text-gray-500 truncate mt-0.5">
          {thread.snippet}
        </p>
      </div>

      {/* Indicators */}
      <div className="flex gap-1 items-center flex-shrink-0 mt-1">
        {thread.starred && <span className="text-yellow-400 text-xs">★</span>}
        {thread.has_attachments && <span className="text-gray-500 text-xs">📎</span>}
      </div>
    </button>
  );
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  } else {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
}

function Loading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="m-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
      {message}
    </div>
  );
}

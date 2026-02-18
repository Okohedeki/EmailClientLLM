import { useState, useEffect } from "react";
import { readOutboxDrafts, approveDraft, readConfig } from "../ipc";
import type { OutboxDraft } from "../ipc";

interface DraftEntry {
  filename: string;
  draft: OutboxDraft;
}

export default function OutboxView() {
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDrafts();
  }, []);

  async function loadDrafts() {
    try {
      const config = await readConfig();
      if (config.accounts.length === 0) return;
      const entries = await readOutboxDrafts(config.accounts[0]);
      setDrafts(entries);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(email: string, filename: string) {
    try {
      await approveDraft(email, filename);
      loadDrafts(); // refresh
    } catch {
      // silent
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
      <h2 className="text-xl font-semibold mb-4">Outbox</h2>
      <p className="text-sm text-gray-500 mb-6">
        Drafts created by agents appear here for review before sending.
      </p>

      {drafts.length === 0 ? (
        <p className="text-gray-500">No pending drafts.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {drafts.map(({ filename, draft }) => (
            <DraftCard
              key={filename}
              filename={filename}
              draft={draft}
              onApprove={(f) => handleApprove(draft.to[0], f)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DraftCard({
  filename,
  draft,
  onApprove,
}: {
  filename: string;
  draft: OutboxDraft;
  onApprove: (filename: string) => void;
}) {
  const statusColors: Record<string, string> = {
    pending_review: "bg-yellow-500/20 text-yellow-400",
    ready_to_send: "bg-blue-500/20 text-blue-400",
    sending: "bg-purple-500/20 text-purple-400",
    sent: "bg-green-500/20 text-green-400",
    failed: "bg-red-500/20 text-red-400",
  };

  return (
    <div className="bg-surface-1 rounded-lg p-4 border border-surface-3">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-sm font-medium text-gray-200">{draft.subject}</p>
          <p className="text-xs text-gray-500">
            To: {draft.to.join(", ")} · {draft.action}
          </p>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            statusColors[draft.status] ?? "bg-gray-500/20 text-gray-400"
          }`}
        >
          {draft.status}
        </span>
      </div>

      <div className="text-sm text-gray-300 whitespace-pre-wrap mt-2 mb-3 max-h-32 overflow-auto">
        {draft.body}
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>By: {draft.created_by}</span>
        {draft.created_at && (
          <span>
            ·{" "}
            {new Date(draft.created_at).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
        {draft.status === "pending_review" && (
          <button
            onClick={() => onApprove(filename)}
            className="ml-auto px-3 py-1 bg-accent hover:bg-accent-hover text-white rounded-md text-xs font-medium transition-colors"
          >
            Approve & Send
          </button>
        )}
      </div>
    </div>
  );
}

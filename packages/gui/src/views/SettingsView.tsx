import { useState, useEffect } from "react";
import { readConfig, writeConfig, readAccountMeta } from "../ipc";
import type { AppConfig, AccountMeta } from "../ipc";

export default function SettingsView() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [accounts, setAccounts] = useState<AccountMeta[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const cfg = await readConfig();
      setConfig(cfg);

      const metas = await Promise.all(
        cfg.accounts.map((email) => readAccountMeta(email))
      );
      setAccounts(metas);
    } catch {
      // silent
    }
  }

  async function handleToggleReview() {
    if (!config) return;
    const updated = {
      ...config,
      review_before_send: !config.review_before_send,
    };
    setSaving(true);
    try {
      await writeConfig(updated);
      setConfig(updated);
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-xl font-semibold mb-6">Settings</h2>

      {/* Review before send toggle */}
      <section className="bg-surface-1 rounded-lg p-4 border border-surface-3 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-200">
              Review before send
            </p>
            <p className="text-xs text-gray-500 mt-1">
              When enabled, agent-created drafts require manual approval before
              sending.
            </p>
          </div>
          <button
            onClick={handleToggleReview}
            disabled={saving}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              config.review_before_send ? "bg-accent" : "bg-surface-3"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                config.review_before_send ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>
      </section>

      {/* Accounts */}
      <section className="bg-surface-1 rounded-lg p-4 border border-surface-3">
        <h3 className="text-sm font-medium text-gray-200 mb-3">Accounts</h3>
        {accounts.length === 0 ? (
          <p className="text-sm text-gray-500">No accounts configured.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {accounts.map((acc) => (
              <div
                key={acc.email}
                className="flex items-center justify-between py-2"
              >
                <div>
                  <p className="text-sm text-gray-200">{acc.email}</p>
                  <p className="text-xs text-gray-500">
                    Last sync:{" "}
                    {acc.last_sync
                      ? new Date(acc.last_sync).toLocaleString()
                      : "Never"}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    acc.sync_state === "syncing"
                      ? "bg-blue-500/20 text-blue-400"
                      : acc.sync_state === "error"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-green-500/20 text-green-400"
                  }`}
                >
                  {acc.sync_state}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

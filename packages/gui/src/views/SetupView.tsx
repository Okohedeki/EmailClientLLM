import { useNavigate } from "react-router-dom";
import { readConfig } from "../ipc";
import { useEffect, useState } from "react";

export default function SetupView() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // If already configured, redirect to inbox
    readConfig().then((config) => {
      if (config.accounts.length > 0) {
        navigate("/");
      } else {
        setChecking(false);
      }
    });
  }, []);

  if (checking) return null;

  return (
    <div className="flex items-center justify-center min-h-screen bg-surface-0">
      <div className="w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-accent mb-2">MailDeck</h1>
        <p className="text-gray-400 text-sm mb-8">
          Agent-native email for your local machine
        </p>

        <div className="bg-surface-1 rounded-lg p-6 border border-surface-3">
          <h2 className="text-sm font-medium text-gray-200 mb-3">
            Connect your Gmail
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            Run the setup command in your terminal to connect a Gmail account:
          </p>
          <code className="block bg-surface-0 text-accent text-sm px-4 py-3 rounded-lg font-mono mb-4">
            npm run setup --workspace=packages/sync-daemon
          </code>
          <p className="text-xs text-gray-500 mb-4">
            This will securely store your credentials in the OS keychain and
            sync your recent email to ~/.maildeck/
          </p>
          <button
            onClick={() => navigate("/")}
            className="w-full py-2 bg-surface-2 hover:bg-surface-3 text-gray-300 rounded-lg text-sm transition-colors"
          >
            I've already set up — go to Inbox
          </button>
        </div>
      </div>
    </div>
  );
}

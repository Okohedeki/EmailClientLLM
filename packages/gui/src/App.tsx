import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import InboxView from "./views/InboxView";
import ThreadView from "./views/ThreadView";
import OutboxView from "./views/OutboxView";
import SettingsView from "./views/SettingsView";
import SetupView from "./views/SetupView";

export default function App() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupView />} />
      <Route element={<Layout />}>
        <Route path="/" element={<InboxView />} />
        <Route path="/thread/:threadId" element={<ThreadView />} />
        <Route path="/outbox" element={<OutboxView />} />
        <Route path="/settings" element={<SettingsView />} />
      </Route>
    </Routes>
  );
}

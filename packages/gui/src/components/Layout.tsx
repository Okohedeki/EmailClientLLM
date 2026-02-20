import { Outlet, NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "Inbox" },
  { to: "/outbox", label: "Outbox" },
  { to: "/settings", label: "Settings" },
];

export default function Layout() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <nav className="w-56 bg-surface-1 border-r border-surface-3 flex flex-col p-4 gap-1">
        <h1 className="text-lg font-bold text-accent mb-6 px-2">ClawMail3</h1>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-accent/15 text-accent"
                  : "text-gray-400 hover:text-gray-200 hover:bg-surface-2"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
        <div className="mt-auto">
          <SyncStatus />
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-surface-0">
        <Outlet />
      </main>
    </div>
  );
}

function SyncStatus() {
  return (
    <div className="px-2 py-2 text-xs text-gray-500">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        Synced
      </div>
    </div>
  );
}

"use client";

import { useCallback, useRef, useSyncExternalStore, useState } from "react";
import Sidebar from "../Sidebar";
import Header from "../Header";
import Breadcrumbs from "../Breadcrumbs";
import NotificationToast from "../NotificationToast";
import MaintenanceBanner from "../MaintenanceBanner";
import {
  AirUpdateProvider,
  AirUpdatePopup,
  AirUpdateBanner,
  AirUpdateProgress,
} from "../air-update";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";
const isE2EMode = process.env.NEXT_PUBLIC_OZROUTER_E2E_MODE === "1";

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const getSnapshot = useCallback(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  }, []);

  const subscribe = useCallback((onStoreChange: () => void) => {
    const handler = (e: StorageEvent) => {
      if (e.key === SIDEBAR_COLLAPSED_KEY) onStoreChange();
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const collapsed = useSyncExternalStore(subscribe, getSnapshot, () => true);

  const [hovered, setHovered] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (!collapsed) return;
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHovered(true), 150);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = null;
    setHovered(false);
  };

  // When user manually expands, clear hover state
  const handleToggleCollapse = () => {
    const next = !collapsed;
    setHovered(false);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
    window.dispatchEvent(
      new StorageEvent("storage", { key: SIDEBAR_COLLAPSED_KEY, newValue: String(next) })
    );
  };

  // Sidebar appears expanded when: actually expanded OR hovered while collapsed
  const visualCollapsed = collapsed && !hovered;

  return (
    <AirUpdateProvider>
      <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-bg">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar - Desktop */}
        <div
          className={`hidden min-h-0 lg:block relative z-30 shrink-0 transition-all duration-300 ease-in-out ${
            collapsed ? "w-16" : "w-80"
          }`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div
            className={`h-full ${
              hovered && collapsed
                ? "absolute inset-y-0 left-0 z-40 w-80 shadow-2xl shadow-black/20"
                : ""
            }`}
          >
            <Sidebar collapsed={visualCollapsed} onToggleCollapse={handleToggleCollapse} />
          </div>
        </div>

        {/* Sidebar - Mobile: full viewport height with proper scroll containment */}
        <div
          className={`fixed inset-y-0 left-0 z-50 transform lg:hidden transition-transform duration-300 ease-in-out h-dvh overflow-y-auto ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>

        {/* Main content */}
        <main
          id="main-content"
          className="relative flex min-h-0 flex-1 min-w-0 flex-col transition-colors duration-300"
        >
          <Header onMenuClick={() => setSidebarOpen(true)} />
          {!isE2EMode && <MaintenanceBanner />}
          <AirUpdateBanner />
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar p-4 sm:p-6 lg:p-10">
            <div className="max-w-7xl mx-auto w-full">
              <Breadcrumbs />
              {children}
            </div>
          </div>
        </main>

        {/* Global notification toast system */}
        <NotificationToast />

        {/* Air Update — global update popup + progress overlay */}
        <AirUpdatePopup />
        <AirUpdateProgress />
      </div>
    </AirUpdateProvider>
  );
}

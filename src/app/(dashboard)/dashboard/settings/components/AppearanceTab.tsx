"use client";

import { useState, useEffect } from "react";
import { Button, Card, Toggle } from "@/shared/components";
import { useTheme } from "@/shared/hooks/useTheme";
import { cn } from "@/shared/utils/cn";
import { useTranslations } from "next-intl";
import {
  COMBO_CONFIG_MODE_SETTING_KEY,
  normalizeComboConfigMode,
  type ComboConfigMode,
} from "@/shared/constants/comboConfigMode";
import {
  HIDDEN_SIDEBAR_ITEMS_SETTING_KEY,
  SIDEBAR_SECTIONS,
  SIDEBAR_SETTINGS_UPDATED_EVENT,
  normalizeHiddenSidebarItems,
  type HideableSidebarItemId,
} from "@/shared/constants/sidebarVisibility";

export default function AppearanceTab() {
  const { theme, setTheme, isDark } = useTheme();
  const t = useTranslations("settings");
  const tSidebar = useTranslations("sidebar");
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const hiddenSidebarItems = normalizeHiddenSidebarItems(
    settings[HIDDEN_SIDEBAR_ITEMS_SETTING_KEY]
  );
  const hiddenSidebarSet = new Set(hiddenSidebarItems);
  const comboConfigMode = normalizeComboConfigMode(settings[COMBO_CONFIG_MODE_SETTING_KEY]);
  const showCloudflaredTunnel = settings.hideEndpointCloudflaredTunnel !== true;
  const showTailscaleFunnel = settings.hideEndpointTailscaleFunnel !== true;
  const showNgrokTunnel = settings.hideEndpointNgrokTunnel !== true;

  const getSettingsLabel = (key: string, fallback: string) =>
    typeof t.has === "function" && t.has(key) ? t(key) : fallback;
  const getSidebarLabel = (key: string, fallback: string) =>
    typeof tSidebar.has === "function" && tSidebar.has(key) ? tSidebar(key) : fallback;

  const themeOptionLabels: Record<string, string> = {
    light: t("themeLight"),
    dark: t("themeDark"),
    system: t("themeSystem"),
  };

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setSettings({
          ...data,
          [HIDDEN_SIDEBAR_ITEMS_SETTING_KEY]: normalizeHiddenSidebarItems(
            data[HIDDEN_SIDEBAR_ITEMS_SETTING_KEY]
          ),
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const updateSetting = async (key: string, value: any) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (res.ok) {
        setSettings((prev) => ({
          ...prev,
          [key]:
            key === HIDDEN_SIDEBAR_ITEMS_SETTING_KEY ? normalizeHiddenSidebarItems(value) : value,
        }));
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent(SIDEBAR_SETTINGS_UPDATED_EVENT, {
              detail: { [key]: value },
            })
          );
        }
      }
    } catch (err) {
      console.error(`Failed to update ${key}:`, err);
    }
  };

  const comboConfigModeOptions: Array<{
    id: ComboConfigMode;
    icon: string;
    title: string;
    description: string;
  }> = [
    {
      id: "guided",
      icon: "route",
      title: getSettingsLabel("comboConfigModeGuided", "Guided"),
      description: getSettingsLabel(
        "comboConfigModeGuidedDesc",
        "Use the current step-by-step combo builder."
      ),
    },
    {
      id: "expert",
      icon: "tune",
      title: getSettingsLabel("comboConfigModeExpert", "Expert"),
      description: getSettingsLabel(
        "comboConfigModeExpertDesc",
        "Show every combo option on one page and enable direct model entry."
      ),
    },
  ];

  const showDebug = settings.debugMode === true;
  const sidebarSections = SIDEBAR_SECTIONS.filter(
    (section) => section.visibility !== "debug" || showDebug
  ).map((section) => ({
    ...section,
    title: getSidebarLabel(section.titleKey, section.titleFallback),
    items: section.items.map((item) => ({ ...item, label: tSidebar(item.i18nKey) })),
  }));

  const toggleSidebarItem = (itemId: HideableSidebarItemId) => {
    const nextHiddenItems = hiddenSidebarSet.has(itemId)
      ? hiddenSidebarItems.filter((id) => id !== itemId)
      : [...hiddenSidebarItems, itemId];

    updateSetting(HIDDEN_SIDEBAR_ITEMS_SETTING_KEY, nextHiddenItems);
  };

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
            palette
          </span>
        </div>
        <h3 className="text-lg font-semibold">{t("appearance")}</h3>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">{t("darkMode")}</p>
            <p className="text-sm text-text-muted">{t("switchThemes")}</p>
          </div>
          <Toggle checked={isDark} onChange={() => setTheme(isDark ? "light" : "dark")} />
        </div>

        <div className="pt-4 border-t border-border">
          <div
            role="tablist"
            aria-label={t("themeSelectionAria")}
            className="inline-flex p-1 rounded-lg bg-black/5 dark:bg-white/5"
          >
            {["light", "dark", "system"].map((option) => (
              <button
                key={option}
                role="tab"
                aria-selected={theme === option}
                onClick={() => setTheme(option)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all",
                  theme === option
                    ? "bg-white dark:bg-white/10 text-text-main shadow-sm"
                    : "text-text-muted hover:text-text-main"
                )}
              >
                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                  {option === "light" ? "light_mode" : option === "dark" ? "dark_mode" : "contrast"}
                </span>
                <span>{themeOptionLabels[option] || option}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <div className="mb-3">
            <p className="font-medium">
              {getSettingsLabel("endpointTunnelVisibility", "Endpoint tunnel visibility")}
            </p>
            <p className="text-sm text-text-muted">
              {getSettingsLabel(
                "endpointTunnelVisibilityDesc",
                "Hide tunnel controls from the Endpoint page without changing tunnel state."
              )}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-surface/40 divide-y divide-border/70">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="font-medium">
                  {getSettingsLabel("showCloudflareTunnel", "Cloudflare Quick Tunnel")}
                </p>
                <p className="text-sm text-text-muted">
                  {getSettingsLabel(
                    "showCloudflareTunnelDesc",
                    "Show Cloudflare Quick Tunnel controls on the Endpoint page."
                  )}
                </p>
              </div>
              <Toggle
                checked={showCloudflaredTunnel}
                onChange={(checked) => updateSetting("hideEndpointCloudflaredTunnel", !checked)}
                disabled={loading}
              />
            </div>

            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="font-medium">
                  {getSettingsLabel("showTailscaleFunnel", "Tailscale Funnel")}
                </p>
                <p className="text-sm text-text-muted">
                  {getSettingsLabel(
                    "showTailscaleFunnelDesc",
                    "Show Tailscale Funnel controls on the Endpoint page."
                  )}
                </p>
              </div>
              <Toggle
                checked={showTailscaleFunnel}
                onChange={(checked) => updateSetting("hideEndpointTailscaleFunnel", !checked)}
                disabled={loading}
              />
            </div>

            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="font-medium">{getSettingsLabel("showNgrokTunnel", "ngrok Tunnel")}</p>
                <p className="text-sm text-text-muted">
                  {getSettingsLabel(
                    "showNgrokTunnelDesc",
                    "Show ngrok Tunnel controls on the Endpoint page."
                  )}
                </p>
              </div>
              <Toggle
                checked={showNgrokTunnel}
                onChange={(checked) => updateSetting("hideEndpointNgrokTunnel", !checked)}
                disabled={loading}
              />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <div className="mb-3">
            <p className="font-medium">
              {getSettingsLabel("comboConfigMode", "Combo configuration mode")}
            </p>
            <p className="text-sm text-text-muted">
              {getSettingsLabel(
                "comboConfigModeDesc",
                "Choose how the combo create and edit dialog is organized."
              )}
            </p>
          </div>

          <div
            role="radiogroup"
            aria-label={getSettingsLabel("comboConfigMode", "Combo configuration mode")}
            className="grid grid-cols-1 sm:grid-cols-2 gap-2"
          >
            {comboConfigModeOptions.map((option) => {
              const active = comboConfigMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={loading}
                  onClick={() => updateSetting(COMBO_CONFIG_MODE_SETTING_KEY, option.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-60",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-surface/40 text-text-main hover:border-primary/40"
                  )}
                >
                  <span className="material-symbols-outlined mt-0.5 text-[20px]" aria-hidden="true">
                    {option.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{option.title}</span>
                    <span
                      className={cn(
                        "mt-0.5 block text-xs",
                        active ? "text-primary/80" : "text-text-muted"
                      )}
                    >
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <div className="mb-3">
            <p className="font-medium">{t("sidebarVisibilityToggle")}</p>
            <p className="text-sm text-text-muted">
              {getSettingsLabel(
                "sidebarVisibilityDesc",
                "Hide any sidebar navigation entry to reduce visual clutter without disabling any features"
              )}
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {sidebarSections.map((section) => (
              <div key={section.id} className="rounded-lg border border-border bg-surface/40">
                <div className="px-4 py-3 border-b border-border/70">
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-muted/70">
                    {section.title}
                  </p>
                </div>

                <div className="divide-y divide-border/70">
                  {section.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <p className="font-medium">{item.label}</p>
                      <Toggle
                        checked={!hiddenSidebarSet.has(item.id)}
                        onChange={() => toggleSidebarItem(item.id)}
                        disabled={loading}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-text-muted">
            {getSettingsLabel(
              "sidebarVisibilityHint",
              "Any sidebar section is hidden automatically when all of its entries are hidden"
            )}
          </p>
        </div>

        <div className="pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t("hideHealthLogs")}</p>
              <p className="text-sm text-text-muted">{t("hideHealthLogsDesc")}</p>
            </div>
            <Toggle
              checked={settings.hideHealthCheckLogs === true}
              onChange={() => updateSetting("hideHealthCheckLogs", !settings.hideHealthCheckLogs)}
              disabled={loading}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

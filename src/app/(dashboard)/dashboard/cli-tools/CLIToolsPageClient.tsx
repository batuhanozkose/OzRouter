"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardSkeleton } from "@/shared/components";
import { CLI_TOOLS } from "@/shared/constants/cliTools";
import {
  PROVIDER_MODELS,
  getModelsByProviderId,
  PROVIDER_ID_TO_ALIAS,
} from "@/shared/constants/models";
import {
  ClaudeToolCard,
  CodexToolCard,
  DroidToolCard,
  OpenClawToolCard,
  ClineToolCard,
  KiloToolCard,
  DefaultToolCard,
  AntigravityToolCard,
  CopilotToolCard,
  CustomCliCard,
} from "./components";
import RemoteInstanceBar from "./components/RemoteInstanceBar";
import RemoteInstanceModal from "./components/RemoteInstanceModal";
import { useTranslations } from "next-intl";

const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL;

export default function CLIToolsPageClient({ machineId: _machineId }) {
  const t = useTranslations("cliTools");
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedTool, setExpandedTool] = useState(null);
  const [modelMappings, setModelMappings] = useState({});
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [apiKeys, setApiKeys] = useState([]);
  const [toolStatuses, setToolStatuses] = useState({});
  const [statusesLoaded, setStatusesLoaded] = useState(false);
  const [dynamicModels, setDynamicModels] = useState([]);
  const [activeTab, setActiveTab] = useState<"local" | "remote">("local");
  const [remoteInstances, setRemoteInstances] = useState<any[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [remoteStatuses, setRemoteStatuses] = useState<Record<string, any>>({});
  const [remoteStatusLoading, setRemoteStatusLoading] = useState(false);
  const [showInstanceModal, setShowInstanceModal] = useState(false);
  const [editingInstance, setEditingInstance] = useState<any>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const translateOrFallback = useCallback(
    (key, fallback, values = undefined) => {
      try {
        const translated = t(key, values);
        return translated === key || translated === `cliTools.${key}` ? fallback : translated;
      } catch {
        return fallback;
      }
    },
    [t]
  );

  const fetchRemoteInstances = async () => {
    try {
      const res = await fetch("/api/remote-instances");
      if (res.ok) {
        const data = await res.json();
        setRemoteInstances(data.instances || []);
      }
    } catch (error) {
      console.log("Error fetching remote instances:", error);
    }
  };

  const fetchRemoteStatus = async (instanceId: string, options: { silent?: boolean } = {}) => {
    if (!options.silent) setRemoteStatusLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await fetch("/api/cli-tools/remote/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId }),
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await res.json();
      if (res.ok) {
        setRemoteStatuses(data);
      } else {
        setRemoteStatuses({ _error: data.message || data.error || "Connection failed" });
      }
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? "Remote scan timed out while opening SSH connection"
          : "Request failed";
      setRemoteStatuses({ _error: message });
    } finally {
      clearTimeout(timeoutId);
      if (!options.silent) setRemoteStatusLoading(false);
    }
  };

  const handleSaveInstance = async (data: any) => {
    const res = await fetch("/api/remote-instances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to save instance");
    }
    await fetchRemoteInstances();
  };

  const handleDeleteInstance = async (id: string) => {
    await fetch(`/api/remote-instances?id=${id}`, { method: "DELETE" });
    if (selectedInstanceId === id) setSelectedInstanceId(null);
    await fetchRemoteInstances();
  };

  const handleTestConnection = async (id: string) => {
    try {
      const res = await fetch("/api/remote-instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _action: "test", id }),
      });
      const data = await res.json();
      setTestResult(data);
      setTimeout(() => setTestResult(null), 5000);
    } catch (error: any) {
      setTestResult({ success: false, error: error.message });
      setTimeout(() => setTestResult(null), 5000);
    }
  };

  const loadCloudSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setCloudEnabled(data.cloudEnabled || false);
      }
    } catch (error) {
      console.log("Error loading cloud settings:", error);
    }
  };

  const fetchApiKeys = async () => {
    try {
      const res = await fetch("/api/cli-tools/keys");
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data.keys || []);
      }
    } catch (error) {
      console.log("Error fetching API keys:", error);
    }
  };

  const fetchToolStatuses = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s client timeout
      const res = await fetch("/api/cli-tools/status", { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        setToolStatuses(data || {});
      }
    } catch (error) {
      // Timeout or network error — proceed without statuses
      console.log("CLI tool status check timed out or failed:", error);
    } finally {
      setStatusesLoaded(true);
    }
  };

  const fetchConnections = async () => {
    try {
      const res = await fetch("/api/providers");
      const data = await res.json();
      if (res.ok) {
        setConnections(data.connections || []);
      }
    } catch (error) {
      console.log("Error fetching connections:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDynamicModels = async () => {
    try {
      const res = await fetch("/v1/models");
      if (res.ok) {
        const data = await res.json();
        setDynamicModels(data?.data || []);
      }
    } catch (error) {
      console.log("Error fetching dynamic models:", error);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchConnections();
    loadCloudSettings();
    fetchApiKeys();
    fetchToolStatuses();
    fetchDynamicModels();
    fetchRemoteInstances();
  }, []);

  const getActiveProviders = () => {
    return connections.filter((c) => c.isActive !== false);
  };

  const getAllAvailableModels = () => {
    const activeProviders = getActiveProviders();
    const models = [];
    const seenModels = new Set();

    // First: add static models from the constants
    activeProviders.forEach((conn) => {
      const alias = PROVIDER_ID_TO_ALIAS[conn.provider] || conn.provider;
      const providerModels = getModelsByProviderId(conn.provider);
      providerModels.forEach((m) => {
        const modelValue = `${alias}/${m.id}`;
        if (!seenModels.has(modelValue)) {
          seenModels.add(modelValue);
          models.push({
            value: modelValue,
            label: `${alias}/${m.id}`,
            provider: conn.provider,
            alias: alias,
            connectionName: conn.name,
            modelId: m.id,
          });
        }
      });
    });

    // Second: add dynamic models from /v1/models (fills gaps for Kiro, OpenCode, custom providers)
    const activeProviderIds = new Set(activeProviders.map((c) => c.provider));
    const activeAliases = new Set(
      activeProviders.map((c) => PROVIDER_ID_TO_ALIAS[c.provider] || c.provider)
    );
    dynamicModels.forEach((dm) => {
      const modelId = dm.id || dm;
      if (seenModels.has(modelId)) return;
      // Parse alias/model format
      const slashIdx = modelId.indexOf("/");
      if (slashIdx === -1) return;
      const alias = modelId.substring(0, slashIdx);
      const bareModel = modelId.substring(slashIdx + 1);
      if (!activeAliases.has(alias) && !activeProviderIds.has(alias)) return;
      seenModels.add(modelId);
      models.push({
        value: modelId,
        label: modelId,
        provider: alias,
        alias: alias,
        connectionName: "",
        modelId: bareModel,
      });
    });

    return models;
  };

  const handleModelMappingChange = useCallback((toolId, modelAlias, targetModel) => {
    setModelMappings((prev) => {
      // Prevent unnecessary updates if value hasn't changed
      if (prev[toolId]?.[modelAlias] === targetModel) {
        return prev;
      }
      return {
        ...prev,
        [toolId]: {
          ...prev[toolId],
          [modelAlias]: targetModel,
        },
      };
    });
  }, []);

  const getBaseUrl = () => {
    if (cloudEnabled && CLOUD_URL) {
      return CLOUD_URL;
    }
    // Use window.location.origin directly so reverse-proxy deployments keep the right origin.
    // Per @alpgul feedback: don't use baseUrl prop (has port duplication issues)
    if (typeof window !== "undefined") {
      return window.location.origin;
    }
    return "http://localhost:20128";
  };

  if (loading || !statusesLoaded) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  const availableModels = getAllAvailableModels();
  const hasActiveProviders = availableModels.length > 0;
  const toolEntries = Object.entries(CLI_TOOLS);

  const renderToolCard = (toolId: string, tool: any, isRemote = false) => {
    const statusSource = isRemote ? remoteStatuses : toolStatuses;
    const commonProps = {
      tool,
      isExpanded: expandedTool === toolId,
      onToggle: () => setExpandedTool(expandedTool === toolId ? null : toolId),
      baseUrl: getBaseUrl(),
      apiKeys,
      batchStatus: statusSource[toolId] || null,
      lastConfiguredAt: statusSource[toolId]?.lastConfiguredAt || null,
      isRemote,
      instanceId: isRemote ? selectedInstanceId : null,
      onConfigApplied: isRemote
        ? () => selectedInstanceId && fetchRemoteStatus(selectedInstanceId, { silent: true })
        : undefined,
    };

    switch (toolId) {
      case "claude":
        return (
          <ClaudeToolCard
            key={toolId}
            {...commonProps}
            activeProviders={getActiveProviders()}
            modelMappings={modelMappings[toolId] || {}}
            onModelMappingChange={(alias, target) =>
              handleModelMappingChange(toolId, alias, target)
            }
            hasActiveProviders={hasActiveProviders}
            cloudEnabled={cloudEnabled}
          />
        );
      case "codex":
        return (
          <CodexToolCard
            key={toolId}
            {...commonProps}
            activeProviders={getActiveProviders()}
            cloudEnabled={cloudEnabled}
          />
        );
      case "droid":
        return (
          <DroidToolCard
            key={toolId}
            {...commonProps}
            activeProviders={getActiveProviders()}
            hasActiveProviders={hasActiveProviders}
            cloudEnabled={cloudEnabled}
          />
        );
      case "openclaw":
        return (
          <OpenClawToolCard
            key={toolId}
            {...commonProps}
            activeProviders={getActiveProviders()}
            hasActiveProviders={hasActiveProviders}
            cloudEnabled={cloudEnabled}
          />
        );
      case "antigravity":
        return (
          <AntigravityToolCard
            key={toolId}
            {...commonProps}
            activeProviders={getActiveProviders()}
            hasActiveProviders={hasActiveProviders}
            cloudEnabled={cloudEnabled}
          />
        );
      case "cline":
        return (
          <ClineToolCard
            key={toolId}
            {...commonProps}
            activeProviders={getActiveProviders()}
            hasActiveProviders={hasActiveProviders}
            cloudEnabled={cloudEnabled}
          />
        );
      case "kilo":
        return (
          <KiloToolCard
            key={toolId}
            {...commonProps}
            activeProviders={getActiveProviders()}
            hasActiveProviders={hasActiveProviders}
            cloudEnabled={cloudEnabled}
          />
        );
      case "copilot":
        return (
          <CopilotToolCard
            key={toolId}
            {...commonProps}
            activeProviders={getActiveProviders()}
            hasActiveProviders={hasActiveProviders}
            cloudEnabled={cloudEnabled}
          />
        );
      case "custom":
        return (
          <CustomCliCard
            key={toolId}
            {...commonProps}
            availableModels={availableModels}
            hasActiveProviders={hasActiveProviders}
            cloudEnabled={cloudEnabled}
          />
        );
      default:
        // #487: Any tool with configType "mitm" should use the MITM card (Start/Stop controls)
        if (tool.configType === "mitm") {
          return (
            <AntigravityToolCard
              key={toolId}
              {...commonProps}
              activeProviders={getActiveProviders()}
              hasActiveProviders={hasActiveProviders}
              cloudEnabled={cloudEnabled}
            />
          );
        }
        return (
          <DefaultToolCard
            key={toolId}
            toolId={toolId}
            {...commonProps}
            activeProviders={getActiveProviders()}
            cloudEnabled={cloudEnabled}
          />
        );
    }
  };

  const getToolDocsHref = (toolId, tool) => {
    if (typeof tool.docsUrl === "string" && tool.docsUrl.trim()) {
      return tool.docsUrl.trim();
    }
    return `/docs?section=cli-tools&tool=${toolId}`;
  };

  const getToolUseCase = (toolId, tool) => {
    const fallbackDescription = translateOrFallback(`toolDescriptions.${toolId}`, tool.description);
    return translateOrFallback(`toolUseCases.${toolId}`, fallbackDescription);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-lg bg-black/5 dark:bg-white/5 w-fit">
        <button
          onClick={() => setActiveTab("local")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
            activeTab === "local"
              ? "bg-white dark:bg-white/10 text-text-main shadow-sm"
              : "text-text-muted hover:text-text-main"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">terminal</span>
          {t("localTab")}
        </button>
        <button
          onClick={() => setActiveTab("remote")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
            activeTab === "remote"
              ? "bg-white dark:bg-white/10 text-text-main shadow-sm"
              : "text-text-muted hover:text-text-main"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">dns</span>
          {t("remoteTab")}
        </button>
      </div>

      {activeTab === "local" ? (
        <>
          {!hasActiveProviders && (
            <Card className="border-yellow-500/50 bg-yellow-500/5">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-yellow-500">warning</span>
                <div>
                  <p className="font-medium text-yellow-600 dark:text-yellow-400">
                    {t("noActiveProviders")}
                  </p>
                  <p className="text-sm text-text-muted">{t("noActiveProvidersDesc")}</p>
                </div>
              </div>
            </Card>
          )}
          <div className="flex flex-col gap-4">
            {toolEntries.map(([toolId, tool]) => {
              const docsHref = getToolDocsHref(toolId, tool);
              const isExternalDocs = /^https?:\/\//i.test(docsHref);
              return (
                <div key={toolId} className="flex flex-col gap-2.5">
                  {renderToolCard(toolId, tool)}
                  <div className="rounded-lg border border-border/50 bg-black/[0.02] dark:bg-white/[0.02] p-3">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                          {t("whenToUseLabel")}
                        </p>
                        <p className="text-xs text-text-muted mt-1 break-words">
                          {getToolUseCase(toolId, tool)}
                        </p>
                      </div>
                      <a
                        href={docsHref}
                        target={isExternalDocs ? "_blank" : undefined}
                        rel={isExternalDocs ? "noopener noreferrer" : undefined}
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
                      >
                        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                          menu_book
                        </span>
                        {t("openToolDocs")}
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {/* Test result toast */}
          {testResult && (
            <div
              className={`rounded-lg px-4 py-2 text-sm ${
                testResult.success
                  ? "bg-green-500/10 text-green-600 border border-green-500/30"
                  : "bg-red-500/10 text-red-600 border border-red-500/30"
              }`}
            >
              {testResult.success ? t("connectionSuccess") : t("connectionFailed")}
              {testResult.error && <>: {testResult.error}</>}
            </div>
          )}

          <Card>
            <RemoteInstanceBar
              instances={remoteInstances}
              selectedId={selectedInstanceId}
              onSelect={(id) => {
                setSelectedInstanceId(id);
                fetchRemoteStatus(id);
              }}
              onAdd={() => {
                setEditingInstance(null);
                setShowInstanceModal(true);
              }}
              onEdit={(inst) => {
                setEditingInstance(inst);
                setShowInstanceModal(true);
              }}
              onDelete={handleDeleteInstance}
              onTest={handleTestConnection}
              onRefresh={(id) => fetchRemoteStatus(id)}
            />
          </Card>

          {showInstanceModal && (
            <RemoteInstanceModal
              instance={editingInstance}
              onSave={handleSaveInstance}
              onClose={() => setShowInstanceModal(false)}
            />
          )}

          {!selectedInstanceId ? (
            <Card>
              <div className="flex flex-col items-center gap-3 py-8 text-text-muted">
                <span className="material-symbols-outlined text-[48px]">dns</span>
                <p>{t("selectOrAddRemoteInstance")}</p>
              </div>
            </Card>
          ) : remoteStatusLoading ? (
            <div className="flex flex-col gap-4">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : remoteStatuses._error ? (
            <Card className="border-red-500/30">
              <div className="flex items-center gap-3 p-4 text-sm text-red-400">
                <span className="material-symbols-outlined">error</span>
                <span>{remoteStatuses._error}</span>
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {toolEntries.map(([toolId, tool]) => (
                <div key={toolId}>{renderToolCard(toolId, tool, true)}</div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

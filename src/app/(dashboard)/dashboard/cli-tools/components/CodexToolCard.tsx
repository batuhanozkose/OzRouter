"use client";

/* eslint-disable react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/set-state-in-effect */

import { useState, useEffect } from "react";
import { Card, Button, ModelSelectModal, ManualConfigModal } from "@/shared/components";
import InstallProgressModal from "./InstallProgressModal";
import { runRemoteInstall } from "./remoteInstall";
import Image from "next/image";
import CliStatusBadge from "./CliStatusBadge";
import { useTranslations } from "next-intl";

export default function CodexToolCard({
  tool,
  isExpanded,
  onToggle,
  baseUrl,
  apiKeys,
  activeProviders,
  cloudEnabled,
  batchStatus,
  lastConfiguredAt,
  isRemote = false,
  instanceId = null,
  onConfigApplied,
}) {
  const t = useTranslations("cliTools");
  const [codexStatus, setCodexStatus] = useState(null);
  const [checkingCodex, setCheckingCodex] = useState(false);
  const [applying, setApplying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState(null);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installOutput, setInstallOutput] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [selectedApiKey, setSelectedApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("gpt-5.5");
  const CODEX_DEFAULT_MODELS = [
    "gpt-5.5",
    "gpt-5.3-codex",
    "gpt-5.4",
    "gpt-5.2-codex",
    "gpt-5.1-codex-max",
    "gpt-5.2",
    "gpt-5.1-codex-mini",
  ];
  const [modelMappings, setModelMappings] = useState<Record<string, string>>({});
  const [reasoningEffort, setReasoningEffort] = useState("xhigh");
  const [wireApi, setWireApi] = useState("chat");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTarget, setModalTarget] = useState<string | null>(null); // null = default model, string = mapping key
  const [modelAliases, setModelAliases] = useState({});
  const [showManualConfigModal, setShowManualConfigModal] = useState(false);
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  // Profiles state
  const [profiles, setProfiles] = useState([]);
  const [showProfiles, setShowProfiles] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [activatingProfile, setActivatingProfile] = useState(null);
  // Backups state
  const [backups, setBackups] = useState([]);
  const [showBackups, setShowBackups] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(null);
  const cliReady = !!(codexStatus?.installed && codexStatus?.runnable);
  const canApplySettings = !!selectedModel && (!cloudEnabled || !!selectedApiKey);

  useEffect(() => {
    // Store the key *id* so the backend can resolve the real secret from DB
    if (apiKeys?.length > 0 && !selectedApiKey) {
      setSelectedApiKey(apiKeys[0].id);
    }
  }, [apiKeys, selectedApiKey]);

  useEffect(() => {
    if (isExpanded && !codexStatus) {
      checkCodexStatus();
      fetchModelAliases();
      if (!isRemote) {
        fetchProfiles();
        fetchBackups();
      }
    }
  }, [isExpanded, codexStatus]);

  const fetchModelAliases = async () => {
    try {
      const res = await fetch("/api/models/alias");
      const data = await res.json();
      if (res.ok) setModelAliases(data.aliases || {});
    } catch (error) {
      console.log("Error fetching model aliases:", error);
    }
  };

  // Parse config content
  useEffect(() => {
    if (codexStatus?.config) {
      const modelMatch = codexStatus.config.match(/^model\s*=\s*"([^"]+)"/im);
      if (modelMatch) setSelectedModel(modelMatch[1]);

      const effortMatch = codexStatus.config.match(/^model_reasoning_effort\s*=\s*"([^"]+)"/im);
      if (effortMatch) setReasoningEffort(effortMatch[1]);

      const wireMatch = codexStatus.config.match(/^wire_api\s*=\s*"([^"]+)"/im);
      if (wireMatch) setWireApi(wireMatch[1]);

      const newMappings: Record<string, string> = {};
      const migrationsBlock = codexStatus.config.split("[notice.model_migrations]")[1];
      if (migrationsBlock) {
        const nextSectionIdx = migrationsBlock.indexOf("[");
        const chunk =
          nextSectionIdx === -1 ? migrationsBlock : migrationsBlock.substring(0, nextSectionIdx);
        const lines = chunk.split("\n");
        for (const line of lines) {
          const match = line.match(/^"([^"]+)"\s*=\s*"([^"]+)"/);
          if (match) newMappings[match[1]] = match[2];
        }
      }
      setModelMappings(newMappings);
    }
  }, [codexStatus]);

  const getConfigStatus = () => {
    if (!cliReady) return null;
    if (isRemote && codexStatus?.hasOzRouter) return "configured";
    if (!codexStatus.config) return "not_configured";
    const hasBaseUrl =
      codexStatus.config.includes(baseUrl) ||
      codexStatus.config.includes("localhost") ||
      codexStatus.config.includes("127.0.0.1");
    return hasBaseUrl ? "configured" : "other";
  };

  const configStatus = getConfigStatus();

  // Use batch status as fallback when card hasn't been expanded yet
  const effectiveConfigStatus =
    configStatus ||
    (batchStatus?.configStatus === "unknown" ? "not_configured" : batchStatus?.configStatus) ||
    null;

  const getEffectiveBaseUrl = () => {
    const url = customBaseUrl || baseUrl;
    return url.replace(/\/v1\/?$/, "").replace(/\/api\/?$/, "") + "/api/v1";
  };

  const getDisplayUrl = () => {
    const url = customBaseUrl || baseUrl;
    return url.replace(/\/v1\/?$/, "").replace(/\/api\/?$/, "") + "/api/v1";
  };

  // Return the raw key value for the selected API key (used in env export command)
  const getSelectedKeyDisplay = () => {
    if (!selectedApiKey) return "<YOUR_OZROUTER_API_KEY>";
    const matched = apiKeys?.find((k) => k.id === selectedApiKey);
    // rawKey is the unmasked key from /api/cli-tools/keys; fall back to masked key
    return matched?.rawKey || matched?.key || "<YOUR_OZROUTER_API_KEY>";
  };

  const checkCodexStatus = async () => {
    setCheckingCodex(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      if (isRemote) {
        const res = await fetch("/api/cli-tools/remote/tool-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instanceId, toolId: "codex" }),
          signal: controller.signal,
        });
        const data = await res.json();
        setCodexStatus(data);
      } else {
        const res = await fetch("/api/cli-tools/codex-settings", { signal: controller.signal });
        const data = await res.json();
        setCodexStatus(data);
      }
    } catch (error: any) {
      setCodexStatus({
        installed: false,
        error: error.name === "AbortError" ? "Timeout" : error.message,
      });
    } finally {
      clearTimeout(timer);
      setCheckingCodex(false);
    }
  };

  const handleApplySettings = async () => {
    setApplying(true);
    setMessage(null);
    try {
      // Use sk_ozrouter for localhost if no key, otherwise use selected key
      const keyToUse =
        selectedApiKey && selectedApiKey.trim()
          ? selectedApiKey
          : !cloudEnabled
            ? "sk_ozrouter"
            : selectedApiKey;

      // Send both apiKey (as fallback) and keyId to look up the unmasked string natively
      if (isRemote) {
        const res = await fetch("/api/cli-tools/remote/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instanceId,
            toolId: "codex",
            baseUrl: getEffectiveBaseUrl(),
            apiKey: keyToUse,
            keyId: selectedApiKey,
            model: selectedModel || CODEX_DEFAULT_MODELS[0],
            reasoningEffort,
            wireApi,
            modelMappings,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          if (data.requiresEnvExport) {
            setMessage({
              type: "warning",
              text: t("codexEnvExportWarning"),
              envCommand: `export OPENAI_API_KEY="${getSelectedKeyDisplay()}"`,
            });
          } else {
            setMessage({ type: "success", text: t("settingsApplied") });
          }
          await checkCodexStatus();
          onConfigApplied?.();
        } else {
          setMessage({
            type: "error",
            text:
              (typeof data.error === "string" ? data.error : data.error?.message) ||
              t("failedApplySettings"),
          });
        }
      } else {
        const res = await fetch("/api/cli-tools/codex-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseUrl: getEffectiveBaseUrl(),
            apiKey: keyToUse,
            keyId: selectedApiKey,
            model: selectedModel || CODEX_DEFAULT_MODELS[0],
            reasoningEffort,
            wireApi,
            modelMappings,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          if (data.requiresEnvExport) {
            setMessage({
              type: "warning",
              text: t("codexEnvExportWarning"),
              envCommand: `export OPENAI_API_KEY="${getSelectedKeyDisplay()}"`,
            });
          } else {
            setMessage({ type: "success", text: t("settingsApplied") });
          }
          checkCodexStatus();
        } else {
          setMessage({
            type: "error",
            text:
              (typeof data.error === "string" ? data.error : data.error?.message) ||
              t("failedApplySettings"),
          });
        }
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setApplying(false);
    }
  };

  const handleResetSettings = async () => {
    setRestoring(true);
    setMessage(null);
    try {
      if (isRemote) {
        const res = await fetch("/api/cli-tools/remote/apply", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instanceId, toolId: "codex" }),
        });
        const data = await res.json();
        if (res.ok) {
          setMessage({ type: "success", text: t("settingsReset") });
          setSelectedModel("");
          await checkCodexStatus();
          onConfigApplied?.();
        } else {
          setMessage({
            type: "error",
            text:
              (typeof data.error === "string" ? data.error : data.error?.message) ||
              t("failedResetSettings"),
          });
        }
      } else {
        const res = await fetch("/api/cli-tools/codex-settings", { method: "DELETE" });
        const data = await res.json();
        if (res.ok) {
          setMessage({ type: "success", text: t("settingsReset") });
          setSelectedModel("");
          checkCodexStatus();
        } else {
          setMessage({
            type: "error",
            text:
              (typeof data.error === "string" ? data.error : data.error?.message) ||
              t("failedResetSettings"),
          });
        }
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setRestoring(false);
    }
  };

  const handleModelSelect = (model) => {
    if (modalTarget) {
      // Writing to a model mapping alias
      setModelMappings({ ...modelMappings, [modalTarget]: model.value });
    } else {
      // Writing to the default model
      setSelectedModel(model.value);
    }
    setModalOpen(false);
    setModalTarget(null);
  };

  // ── Profiles ──
  const fetchProfiles = async () => {
    try {
      const res = await fetch("/api/cli-tools/codex-profiles");
      const data = await res.json();
      if (res.ok) setProfiles(data.profiles || []);
    } catch (error) {
      console.log("Error fetching profiles:", error);
    }
  };

  const handleSaveProfile = async () => {
    if (!newProfileName.trim()) return;
    setSavingProfile(true);
    setMessage(null);
    try {
      const res = await fetch("/api/cli-tools/codex-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProfileName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: t("profileSaved", { name: newProfileName }) });
        setNewProfileName("");
        fetchProfiles();
      } else {
        setMessage({
          type: "error",
          text:
            (typeof data.error === "string" ? data.error : data.error?.message) ||
            t("failedSaveProfile"),
        });
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleActivateProfile = async (profileId) => {
    setActivatingProfile(profileId);
    setMessage(null);
    try {
      const res = await fetch("/api/cli-tools/codex-profiles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: data.message || t("profileActivated") });
        checkCodexStatus();
        fetchBackups();
      } else {
        setMessage({
          type: "error",
          text:
            (typeof data.error === "string" ? data.error : data.error?.message) ||
            t("failedActivateProfile"),
        });
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setActivatingProfile(null);
    }
  };

  const handleDeleteProfile = async (profileId) => {
    try {
      const res = await fetch("/api/cli-tools/codex-profiles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });
      if (res.ok) fetchProfiles();
    } catch (error) {
      console.log("Error deleting profile:", error);
    }
  };

  // ── Backups ──
  const fetchBackups = async () => {
    try {
      const res = await fetch("/api/cli-tools/backups?tool=codex");
      const data = await res.json();
      if (res.ok) setBackups(data.backups || []);
    } catch (error) {
      console.log("Error fetching backups:", error);
    }
  };

  const handleRestoreBackup = async (backupId) => {
    setRestoringBackup(backupId);
    setMessage(null);
    try {
      const res = await fetch("/api/cli-tools/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "codex", backupId }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: t("backupRestored") });
        checkCodexStatus();
        fetchBackups();
      } else {
        setMessage({
          type: "error",
          text:
            (typeof data.error === "string" ? data.error : data.error?.message) ||
            t("failedRestore"),
        });
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setRestoringBackup(null);
    }
  };

  const getManualConfigs = () => {
    const keyToUse = !cloudEnabled ? "sk_ozrouter" : "<YOUR_OZROUTER_API_KEY>";
    const useCustomProvider = wireApi === "responses";

    let configContent = `# OzRouter Configuration for Codex CLI
model = "${selectedModel || CODEX_DEFAULT_MODELS[0]}"`;

    if (reasoningEffort && reasoningEffort !== "none") {
      configContent += `\nmodel_reasoning_effort = "${reasoningEffort}"`;
    }

    if (useCustomProvider) {
      configContent += `
model_provider = "ozrouter"

[model_providers.ozrouter]
name = "OzRouter"
base_url = "${getEffectiveBaseUrl()}"
wire_api = "responses"
env_key = "OPENAI_API_KEY"
`;
    } else {
      configContent += `

# Built-in OpenAI provider pointed to OzRouter
openai_base_url = "${getEffectiveBaseUrl()}"
`;
    }

    if (Object.keys(modelMappings).length > 0) {
      configContent += "\n[notice.model_migrations]\n";
      for (const [from, to] of Object.entries(modelMappings)) {
        if (to) {
          configContent += `"${from}" = "${to}"\n`;
        }
      }
    }

    const configs = [
      {
        filename: "~/.codex/config.toml",
        content: configContent,
      },
    ];

    if (!useCustomProvider) {
      // Chat mode: auth.json is read by the built-in OpenAI provider
      const authContent = JSON.stringify({ OPENAI_API_KEY: keyToUse }, null, 2);
      configs.push({
        filename: "~/.codex/auth.json",
        content: authContent,
      });
    } else {
      // Responses mode: env variable required, show export command
      configs.push({
        filename: "Environment Variable (required)",
        content: `# Codex CLI custom providers read the API key from environment variables only.\n# Add this to your ~/.bashrc or ~/.zshrc:\nexport OPENAI_API_KEY="${keyToUse}"`,
      });
    }

    return configs;
  };

  return (
    <Card padding="sm" className="overflow-hidden">
      <div className="flex items-center justify-between hover:cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <div className="size-8 flex items-center justify-center shrink-0">
            <Image
              src="/providers/codex.png"
              alt={tool.name}
              width={32}
              height={32}
              className="size-8 object-contain rounded-lg"
              sizes="32px"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm">{tool.name}</h3>
              <CliStatusBadge
                effectiveConfigStatus={effectiveConfigStatus}
                batchStatus={batchStatus}
                lastConfiguredAt={lastConfiguredAt}
              />
            </div>
            <p className="text-xs text-text-muted truncate">{t("toolDescriptions.codex")}</p>
          </div>
        </div>
        <span
          className={`material-symbols-outlined text-text-muted text-[20px] transition-transform ${isExpanded ? "rotate-180" : ""}`}
        >
          expand_more
        </span>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-border flex flex-col gap-4">
          {checkingCodex && (
            <div className="flex items-center gap-2 text-text-muted">
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              <span>{t("checkingCli", { tool: "Codex" })}</span>
            </div>
          )}

          {!checkingCodex && codexStatus && !cliReady && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <span className="material-symbols-outlined text-yellow-500">warning</span>
                <div className="flex-1">
                  <p className="font-medium text-yellow-600 dark:text-yellow-400">
                    {codexStatus.installed
                      ? t("cliNotRunnable", { tool: "Codex" })
                      : t("cliNotInstalled", { tool: "Codex" })}
                  </p>
                  <p className="text-sm text-text-muted">
                    {codexStatus.installed
                      ? t("cliFoundFailedHealthcheck", {
                          tool: "Codex",
                          reason: codexStatus.reason ? ` (${codexStatus.reason})` : "",
                        })
                      : t("installCodexPrompt")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowInstallGuide(!showInstallGuide)}
                >
                  <span className="material-symbols-outlined text-[18px] mr-1">
                    {showInstallGuide ? "expand_less" : "help"}
                  </span>
                  {showInstallGuide ? t("hide") : t("howToInstall")}
                </Button>
              </div>
              {showInstallGuide && (
                <div className="p-4 bg-surface border border-border rounded-lg">
                  <h4 className="font-medium mb-3">{t("installationGuide")}</h4>
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="text-text-muted mb-1">{t("platforms")}</p>
                      <code className="block px-3 py-2 bg-black/5 dark:bg-white/5 rounded font-mono text-xs">
                        npm install -g @openai/codex
                      </code>
                    </div>
                    <p className="text-text-muted">
                      {t("afterInstallationRun")}{" "}
                      <code className="px-1 bg-black/5 dark:bg-white/5 rounded">codex</code>{" "}
                      {t("toVerify")}
                    </p>
                    <div className="pt-2 border-t border-border">
                      <p className="text-text-muted text-xs">
                        {t("codexAuthNotePrefix")}{" "}
                        <code className="px-1 bg-black/5 dark:bg-white/5 rounded">
                          ~/.codex/auth.json
                        </code>{" "}
                        {t("codexAuthNoteMiddle")}{" "}
                        <code className="px-1 bg-black/5 dark:bg-white/5 rounded">
                          OPENAI_API_KEY
                        </code>
                        . {t("codexAuthNoteSuffix")}
                      </p>
                    </div>
                    {isRemote && !cliReady && (
                      <div className="pt-2 border-t border-border">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={async () => {
                            if (!instanceId) return;
                            setShowInstallModal(true);
                            setInstalling(true);
                            setInstallOutput("");
                            setInstallError(null);
                            try {
                              const result = await runRemoteInstall({
                                instanceId,
                                toolId: "codex",
                                onOutput: setInstallOutput,
                              });
                              if (result.success) {
                                await checkCodexStatus();
                                onConfigApplied?.();
                              } else {
                                setInstallError(result.output || "Install failed");
                              }
                            } catch (err: any) {
                              setInstallError(err.message);
                            } finally {
                              setInstalling(false);
                            }
                          }}
                          loading={installing}
                        >
                          <span className="material-symbols-outlined text-[16px]">download</span>
                          {t("install")}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {!checkingCodex && cliReady && (
            <>
              <div className="flex flex-col gap-2">
                {/* Current Base URL */}
                {codexStatus?.config &&
                  (() => {
                    const parsed = codexStatus.config.match(/base_url\s*=\s*"([^"]+)"/);
                    const currentBaseUrl = parsed ? parsed[1] : null;
                    return currentBaseUrl ? (
                      <div className="flex items-center gap-2">
                        <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">
                          {t("current")}
                        </span>
                        <span className="material-symbols-outlined text-text-muted text-[14px]">
                          arrow_forward
                        </span>
                        <span className="flex-1 px-2 py-1.5 text-xs text-text-muted truncate">
                          {currentBaseUrl}
                        </span>
                      </div>
                    ) : null;
                  })()}

                {/* Base URL */}
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">
                    {t("baseUrl")}
                  </span>
                  <span className="material-symbols-outlined text-text-muted text-[14px]">
                    arrow_forward
                  </span>
                  <input
                    type="text"
                    value={getDisplayUrl()}
                    onChange={(e) => setCustomBaseUrl(e.target.value)}
                    placeholder={t("baseUrlPlaceholder")}
                    className="flex-1 px-2 py-1.5 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  {customBaseUrl && customBaseUrl !== `${baseUrl}/v1` && (
                    <button
                      onClick={() => setCustomBaseUrl("")}
                      className="p-1 text-text-muted hover:text-primary rounded transition-colors"
                      title={t("resetToDefault")}
                    >
                      <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                    </button>
                  )}
                </div>

                {/* API Key */}
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">
                    {t("apiKey")}
                  </span>
                  <span className="material-symbols-outlined text-text-muted text-[14px]">
                    arrow_forward
                  </span>
                  {apiKeys.length > 0 ? (
                    <select
                      value={selectedApiKey}
                      onChange={(e) => setSelectedApiKey(e.target.value)}
                      className="flex-1 px-2 py-1.5 bg-surface rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary/50"
                    >
                      {apiKeys.map((key) => (
                        <option key={key.id} value={key.id}>
                          {key.key}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="flex-1 text-xs text-text-muted px-2 py-1.5">
                      {cloudEnabled ? t("noApiKeysCreateOne") : t("defaultOzRouterKey")}
                    </span>
                  )}
                </div>

                {/* Default Model */}
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">
                    {t("model")}
                  </span>
                  <span className="material-symbols-outlined text-text-muted text-[14px]">
                    arrow_forward
                  </span>
                  <button
                    onClick={() => {
                      setModalTarget(null);
                      setModalOpen(true);
                    }}
                    disabled={!activeProviders?.length}
                    className={`px-2 py-1.5 rounded border text-xs transition-colors shrink-0 whitespace-nowrap ${activeProviders?.length ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}
                  >
                    {t("selectModel")}
                  </button>
                  <input
                    type="text"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    placeholder="gpt-5.5"
                    className="flex-1 px-2 py-1.5 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  {selectedModel && (
                    <button
                      onClick={() => setSelectedModel("")}
                      className="p-1 text-text-muted hover:text-red-500 rounded transition-colors"
                      title={t("clear")}
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  )}
                </div>

                {/* Reasoning Effort */}
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">
                    Reasoning Effort
                  </span>
                  <span className="material-symbols-outlined text-text-muted text-[14px]">
                    arrow_forward
                  </span>
                  <select
                    value={reasoningEffort}
                    onChange={(e) => setReasoningEffort(e.target.value)}
                    className="flex-1 px-2 py-1.5 bg-surface rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    <option value="none">None</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="xhigh">XHigh</option>
                  </select>
                </div>

                {/* Wire API */}
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">
                    Wire API
                  </span>
                  <span className="material-symbols-outlined text-text-muted text-[14px]">
                    arrow_forward
                  </span>
                  <select
                    value={wireApi}
                    onChange={(e) => setWireApi(e.target.value)}
                    className="flex-1 px-2 py-1.5 bg-surface rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    <option value="chat">Chat Completions (/chat/completions)</option>
                    <option value="responses">Responses API (/responses)</option>
                  </select>
                </div>

                <div className="h-px bg-border/50 my-2"></div>

                <div className="text-[11px] text-text-muted mb-2 font-medium uppercase tracking-wider text-right">
                  Model Aliases ([notice.model_migrations])
                </div>
                {CODEX_DEFAULT_MODELS.map((defaultModel) => (
                  <div key={defaultModel} className="flex items-center gap-2 group">
                    <span className="w-32 shrink-0 text-[11px] font-mono text-text-main text-right truncate opacity-70 group-hover:opacity-100 transition-opacity">
                      {defaultModel}
                    </span>
                    <span className="material-symbols-outlined text-border group-hover:text-primary transition-colors text-[14px]">
                      arrow_forward
                    </span>
                    <button
                      onClick={() => {
                        setModalTarget(defaultModel);
                        setModalOpen(true);
                      }}
                      disabled={!activeProviders?.length}
                      className={`px-2 py-1.5 rounded border text-xs transition-colors shrink-0 whitespace-nowrap ${activeProviders?.length ? "bg-surface border-border text-text-main hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}
                    >
                      {t("selectModel")}
                    </button>
                    <input
                      type="text"
                      value={modelMappings[defaultModel] || ""}
                      onChange={(e) =>
                        setModelMappings({ ...modelMappings, [defaultModel]: e.target.value })
                      }
                      placeholder={`Route ${defaultModel} to...`}
                      className="flex-1 px-2 py-1.5 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    {modelMappings[defaultModel] && (
                      <button
                        onClick={() => {
                          const next = { ...modelMappings };
                          delete next[defaultModel];
                          setModelMappings(next);
                        }}
                        className="p-1 text-text-muted hover:text-red-500 rounded transition-colors"
                        title={t("clear")}
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {message && (
                <div
                  className={`flex flex-col gap-1.5 px-2 py-1.5 rounded text-xs ${
                    message.type === "success"
                      ? "bg-green-500/10 text-green-600"
                      : message.type === "warning"
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "bg-red-500/10 text-red-600"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[14px]">
                      {message.type === "success"
                        ? "check_circle"
                        : message.type === "warning"
                          ? "warning"
                          : "error"}
                    </span>
                    <span>{message.text}</span>
                  </div>
                  {message.envCommand && (
                    <div className="ml-5 flex items-center gap-1.5">
                      <code className="flex-1 px-2 py-1 bg-black/5 dark:bg-white/5 rounded font-mono text-[11px] select-all">
                        {message.envCommand}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(message.envCommand);
                        }}
                        className="p-0.5 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                        title={t("copy")}
                      >
                        <span className="material-symbols-outlined text-[14px]">content_copy</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleApplySettings}
                  disabled={!canApplySettings}
                  loading={applying}
                >
                  <span className="material-symbols-outlined text-[14px] mr-1">save</span>
                  {t("apply")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetSettings}
                  disabled={!codexStatus.hasOzRouter}
                  loading={restoring}
                >
                  <span className="material-symbols-outlined text-[14px] mr-1">restore</span>
                  {t("reset")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowManualConfigModal(true)}>
                  <span className="material-symbols-outlined text-[14px] mr-1">content_copy</span>
                  {t("manualConfig")}
                </Button>
                <div className="flex-1" />
                {!isRemote && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowProfiles(!showProfiles);
                        if (!showProfiles) fetchProfiles();
                      }}
                    >
                      <span className="material-symbols-outlined text-[14px] mr-1">
                        manage_accounts
                      </span>
                      {t("profiles")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowBackups(!showBackups);
                        if (!showBackups) fetchBackups();
                      }}
                    >
                      <span className="material-symbols-outlined text-[14px] mr-1">history</span>
                      {t("backups")}
                      {backups.length > 0 && ` (${backups.length})`}
                    </Button>
                  </>
                )}
              </div>

              {/* Profiles Section */}
              {!isRemote && showProfiles && (
                <div className="mt-2 p-3 bg-surface border border-border rounded-lg">
                  <h4 className="text-xs font-semibold text-text-main mb-2 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">manage_accounts</span>
                    {t("savedProfiles")}
                  </h4>
                  {profiles.length === 0 ? (
                    <p className="text-xs text-text-muted">{t("noProfilesYet")}</p>
                  ) : (
                    <div className="space-y-1.5 mb-3">
                      {profiles.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-2 px-2 py-1.5 bg-black/5 dark:bg-white/5 rounded text-xs"
                        >
                          <span className="material-symbols-outlined text-[14px] text-text-muted">
                            person
                          </span>
                          <span className="font-medium flex-1 truncate">{p.name}</span>
                          <span
                            className="text-text-muted truncate max-w-[140px]"
                            title={p.authLabel}
                          >
                            {p.authLabel}
                          </span>
                          <button
                            onClick={() => handleActivateProfile(p.id)}
                            disabled={activatingProfile === p.id}
                            className="px-2 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
                          >
                            {activatingProfile === p.id ? "..." : t("activate")}
                          </button>
                          <button
                            onClick={() => handleDeleteProfile(p.id)}
                            className="p-0.5 text-text-muted hover:text-red-500 transition-colors"
                            title={t("deleteProfile")}
                          >
                            <span className="material-symbols-outlined text-[14px]">delete</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      placeholder={t("profileNamePlaceholder")}
                      className="flex-1 px-2 py-1.5 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                      onKeyDown={(e) => e.key === "Enter" && handleSaveProfile()}
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSaveProfile}
                      disabled={!newProfileName.trim()}
                      loading={savingProfile}
                    >
                      <span className="material-symbols-outlined text-[14px] mr-1">save</span>
                      {t("saveCurrent")}
                    </Button>
                  </div>
                </div>
              )}

              {/* Backups Section */}
              {!isRemote && showBackups && (
                <div className="mt-2 p-3 bg-surface border border-border rounded-lg">
                  <h4 className="text-xs font-semibold text-text-main mb-2 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">history</span>
                    {t("configBackups")}
                  </h4>
                  {backups.length === 0 ? (
                    <p className="text-xs text-text-muted">{t("noBackupsYet")}</p>
                  ) : (
                    <div className="space-y-1.5">
                      {backups.map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center gap-2 px-2 py-1.5 bg-black/5 dark:bg-white/5 rounded text-xs"
                        >
                          <span className="material-symbols-outlined text-[14px] text-text-muted">
                            description
                          </span>
                          <span className="flex-1 truncate font-mono" title={b.id}>
                            {b.id}
                          </span>
                          <span className="text-text-muted whitespace-nowrap">
                            {new Date(b.createdAt).toLocaleString()}
                          </span>
                          <button
                            onClick={() => handleRestoreBackup(b.id)}
                            disabled={restoringBackup === b.id}
                            className="px-2 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
                          >
                            {restoringBackup === b.id ? "..." : t("restore")}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <ModelSelectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelect={handleModelSelect}
        selectedModel={selectedModel}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title={t("selectModelForTool", { tool: "Codex" })}
      />

      <ManualConfigModal
        isOpen={showManualConfigModal}
        onClose={() => setShowManualConfigModal(false)}
        title={t("codexManualConfiguration")}
        configs={getManualConfigs()}
      />
      <InstallProgressModal
        open={showInstallModal}
        output={installOutput}
        error={installError}
        installing={installing}
        onClose={() => setShowInstallModal(false)}
      />
    </Card>
  );
}

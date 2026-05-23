"use client";

import { useState } from "react";
import { Button, Card } from "@/shared/components";
import { useTranslations } from "next-intl";
import type { RemoteInstancePublic } from "@/lib/db/remoteInstances";
import { parseSshConnectionString } from "./remoteInstanceParsing";

interface RemoteInstanceModalProps {
  instance: RemoteInstancePublic | null;
  onSave: (data: {
    label: string;
    host: string;
    port: number;
    username: string;
    authType: "password" | "privateKey";
    password?: string;
    privateKey?: string;
  }) => Promise<void>;
  onClose: () => void;
}

export default function RemoteInstanceModal({
  instance,
  onSave,
  onClose,
}: RemoteInstanceModalProps) {
  const t = useTranslations("cliTools");
  const isEdit = !!instance;

  const [label, setLabel] = useState(instance?.label || "");
  const [host, setHost] = useState(instance?.host || "");
  const [port, setPort] = useState(instance?.port || 22);
  const [username, setUsername] = useState(instance?.username || "");
  const [authType, setAuthType] = useState<"password" | "privateKey">(
    instance?.authType || "password"
  );
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [quickConnect, setQuickConnect] = useState("");

  const handleQuickConnect = (value?: string) => {
    const input = value ?? quickConnect;
    const parsed = parseSshConnectionString(input);
    if (parsed.username) setUsername(parsed.username);
    if (parsed.host) setHost(parsed.host);
    if (parsed.port) setPort(parsed.port);
    if (!label && parsed.host) {
      setLabel(parsed.host);
    }
  };

  const handleSave = async () => {
    setError("");

    if (!label.trim()) {
      setError("Label is required");
      return;
    }
    if (!host.trim()) {
      setError("Host is required");
      return;
    }
    if (!username.trim()) {
      setError("Username is required");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        label: label.trim(),
        host: host.trim(),
        port,
        username: username.trim(),
        authType,
        password: authType === "password" ? password : undefined,
        privateKey: authType === "privateKey" ? privateKey : undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            {isEdit ? t("editRemoteInstance") : t("addRemoteInstance")}
          </h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-main">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {!isEdit && (
            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/10 mb-1">
              <label className="block text-sm font-medium mb-1">{t("quickConnect")}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={quickConnect}
                  onChange={(e) => setQuickConnect(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleQuickConnect(quickConnect);
                    }
                  }}
                  placeholder="ssh user@host -p 22"
                  className="flex-1 h-10 px-3 rounded-lg bg-surface border border-border text-sm text-text-main focus:outline-none focus:border-primary font-mono"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleQuickConnect(quickConnect)}
                >
                  {t("parse")}
                </Button>
              </div>
              <p className="text-xs text-text-muted mt-1">{t("quickConnectHint")}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">{t("label")}</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="My Server"
              className="w-full h-10 px-3 rounded-lg bg-surface border border-border text-sm text-text-main focus:outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">{t("host")}</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.100"
                className="w-full h-10 px-3 rounded-lg bg-surface border border-border text-sm text-text-main focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("port")}</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-lg bg-surface border border-border text-sm text-text-main focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t("username")}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="root"
              className="w-full h-10 px-3 rounded-lg bg-surface border border-border text-sm text-text-main focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t("authType")}</label>
            <div className="flex gap-1 p-1 rounded-lg bg-black/5 dark:bg-white/5">
              <button
                onClick={() => setAuthType("password")}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  authType === "password"
                    ? "bg-white dark:bg-white/10 text-text-main shadow-sm"
                    : "text-text-muted hover:text-text-main"
                }`}
              >
                {t("password")}
              </button>
              <button
                onClick={() => setAuthType("privateKey")}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  authType === "privateKey"
                    ? "bg-white dark:bg-white/10 text-text-main shadow-sm"
                    : "text-text-muted hover:text-text-main"
                }`}
              >
                {t("privateKey")}
              </button>
            </div>
          </div>

          {authType === "password" ? (
            <div>
              <label className="block text-sm font-medium mb-1">{t("password")}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isEdit ? t("leaveBlankToKeep") : ""}
                className="w-full h-10 px-3 rounded-lg bg-surface border border-border text-sm text-text-main focus:outline-none focus:border-primary"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-1">{t("privateKey")}</label>
              <textarea
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder={isEdit ? t("leaveBlankToKeep") : "-----BEGIN OPENSSH PRIVATE KEY-----"}
                rows={6}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm text-text-main focus:outline-none focus:border-primary font-mono"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t("testing") : isEdit ? t("save") : t("add")}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

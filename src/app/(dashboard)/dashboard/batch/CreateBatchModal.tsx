"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";

interface CreateBatchModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const SUPPORTED_ENDPOINTS = [
  "/v1/chat/completions",
  "/v1/embeddings",
  "/v1/completions",
  "/v1/moderations",
  "/v1/images/generations",
  "/v1/videos/generations",
  "/v1/responses",
];

const ENDPOINT_LABELS: Record<string, string> = {
  "/v1/chat/completions": "Chat Completions",
  "/v1/embeddings": "Embeddings",
  "/v1/completions": "Completions (Legacy)",
  "/v1/moderations": "Moderations",
  "/v1/images/generations": "Image Generation",
  "/v1/videos/generations": "Video Generation",
  "/v1/responses": "Responses",
};

export default function CreateBatchModal({ open, onClose, onCreated }: CreateBatchModalProps) {
  const t = useTranslations("batch");

  const [endpoint, setEndpoint] = useState(SUPPORTED_ENDPOINTS[0]);
  const [completionWindow] = useState("24h");
  const [model, setModel] = useState("");
  const [step, setStep] = useState<"idle" | "uploading" | "creating" | "done" | "error">("idle");
  const [statusLines, setStatusLines] = useState<string[]>([]);
  const [createdBatchId, setCreatedBatchId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const addStatus = (line: string) => setStatusLines((prev) => [...prev, line]);

  const handleCreate = async () => {
    setStatusLines([]);
    setErrorMessage(null);

    if (!selectedFile) {
      setErrorMessage(t("selectFile"));
      return;
    }

    addStatus(`${t("validatingFile")}: ${selectedFile.name}`);
    const rawContent = await selectedFile.text();
    const lines = rawContent.split("\n").filter((l) => l.trim());
    if (lines.length === 0) {
      setErrorMessage(t("emptyFile"));
      return;
    }
    for (let i = 0; i < lines.length; i++) {
      try {
        JSON.parse(lines[i]);
      } catch {
        setErrorMessage(`Invalid JSON at line ${i + 1}: ${lines[i].slice(0, 80)}${lines[i].length > 80 ? "…" : ""}`);
        return;
      }
    }
    addStatus(`✓ ${lines.length} ${lines.length === 1 ? "line" : "lines"} valid`);

    try {
      setStep("uploading");
      addStatus(t("uploadingFile"));
      const fileRes = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: selectedFile.name,
          purpose: "batch",
          content: rawContent,
        }),
      });

      if (!fileRes.ok) {
        const err = await fileRes.json();
        addStatus(`✗ ${err.error?.message || t("fileUploadFailed")}`);
        setStep("error");
        return;
      }

      const fileData = await fileRes.json();
      addStatus(`✓ ${t("fileUploaded")}: ${fileData.id}`);

      setStep("creating");
      addStatus(t("creatingBatch"));

      const batchRes = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input_file_id: fileData.id,
          endpoint,
          completion_window: completionWindow,
          model: model.trim() || undefined,
        }),
      });

      if (!batchRes.ok) {
        const err = await batchRes.json();
        addStatus(`✗ ${err.error?.message || t("batchCreateFailed")}`);
        setStep("error");
        return;
      }

      const batchData = await batchRes.json();
      addStatus(`✓ ${t("batchCreated")}: ${batchData.id}`);
      setCreatedBatchId(batchData.id);
      setStep("done");

      setTimeout(() => {
        onCreated();
        handleClose();
      }, 2000);
    } catch (error: any) {
      addStatus(`✗ ${error.message}`);
      setStep("error");
    }
  };

  const handleClose = () => {
    setStep("idle");
    setStatusLines([]);
    setCreatedBatchId(null);
    setErrorMessage(null);
    setSelectedFile(null);
    onClose();
  };

  if (!open) return null;

  const currentEndpointLabel = ENDPOINT_LABELS[endpoint] || endpoint;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-[var(--card-bg,#1e1e2e)] rounded-xl border border-[var(--border,#333)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border,#333)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary,#fff)]">
            {t("createBatch")}
          </h3>
          <button onClick={handleClose} className="text-[var(--text-secondary,#aaa)] hover:text-[var(--text-primary,#fff)]">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* Endpoint selector */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary,#aaa)] mb-1">
              {t("batchEndpoint")}
            </label>
            <select
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border,#333)]
                bg-[var(--surface,#0f0f1a)] text-[var(--text-primary,#fff)]
                focus:outline-none focus:border-[var(--accent,#7c3aed)]"
            >
              {SUPPORTED_ENDPOINTS.map((ep) => (
                <option key={ep} value={ep}>
                  {ENDPOINT_LABELS[ep]} ({ep})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--text-muted,#666)]">
              {t("batchTrafficSaved")}
            </p>
          </div>

          {/* Template download */}
          <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--surface,#0f0f1a)] border border-[var(--border,#333)]">
            <span className="material-symbols-outlined text-[var(--accent,#7c3aed)] text-[20px]">download</span>
            <div className="flex-1">
              <p className="text-sm text-[var(--text-primary,#fff)]">{t("downloadTemplate")}</p>
              <p className="text-xs text-[var(--text-muted,#666)]">
                {t("downloadTemplateDesc", { endpoint: currentEndpointLabel })}
              </p>
            </div>
            <a
              href={`/api/batches/template?endpoint=${encodeURIComponent(endpoint)}`}
              download="batch_template.jsonl"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
                bg-[var(--card-bg,#1e1e2e)] border border-[var(--border,#333)]
                text-[var(--text-primary,#fff)] hover:border-[var(--accent,#7c3aed)]
                transition-all whitespace-nowrap"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="material-symbols-outlined text-[16px]">file_download</span>
              {t("downloadTemplateBtn")}
            </a>
          </div>

          {/* File uploader */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary,#aaa)] mb-2">
              {t("uploadBatchFile")}
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 p-8 rounded-lg border-2 border-dashed
                border-[var(--border,#333)] hover:border-[var(--accent,#7c3aed)]
                bg-[var(--surface,#0f0f1a)] cursor-pointer transition-colors"
            >
              {selectedFile ? (
                <>
                  <span className="material-symbols-outlined text-3xl text-green-400">description</span>
                  <p className="text-sm text-[var(--text-primary,#fff)] font-medium">{selectedFile.name}</p>
                  <p className="text-xs text-[var(--text-secondary,#aaa)]">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setErrorMessage(null); }}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    {t("remove")}
                  </button>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-3xl text-[var(--text-secondary,#aaa)]">upload_file</span>
                  <p className="text-sm text-[var(--text-secondary,#aaa)]">{t("clickOrDropJsonl")}</p>
                  <p className="text-xs text-[var(--text-muted,#666)]">JSONL, max 512 MB</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".jsonl,.json,.txt"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) { setSelectedFile(file); setErrorMessage(null); }
                }}
              />
            </div>
            {errorMessage && (
              <p className="mt-1 text-xs text-red-400">{errorMessage}</p>
            )}
          </div>

          {/* Model (optional) */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary,#aaa)] mb-1">
              {t("modelOptional")}
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o"
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border,#333)]
                bg-[var(--surface,#0f0f1a)] text-[var(--text-primary,#fff)]
                focus:outline-none focus:border-[var(--accent,#7c3aed)]
                placeholder:text-[var(--text-muted,#666)]"
            />
          </div>

          {/* Progress / Status */}
          {step !== "idle" && (
            <div className="p-4 rounded-lg bg-[var(--surface,#0f0f1a)] border border-[var(--border,#333)]">
              <div className="flex items-center gap-3 mb-3">
                {step === "uploading" || step === "creating" ? (
                  <div className="w-5 h-5 border-2 border-[var(--accent,#7c3aed)]/20 rounded-full border-t-[var(--accent,#7c3aed)] animate-spin" />
                ) : step === "done" ? (
                  <span className="material-symbols-outlined text-green-400 text-[20px]">check_circle</span>
                ) : (
                  <span className="material-symbols-outlined text-red-400 text-[20px]">error</span>
                )}
                <span className="text-sm font-medium text-[var(--text-primary,#fff)]">
                  {step === "uploading"
                    ? t("uploadingFile")
                    : step === "creating"
                      ? t("creatingBatch")
                      : step === "done"
                        ? t("batchCreatedSuccess")
                        : t("batchCreateFailed")}
                </span>
              </div>
              {statusLines.length > 0 && (
                <div className="space-y-1">
                  {statusLines.map((line, i) => (
                    <p key={i} className="text-xs font-mono text-[var(--text-secondary,#aaa)]">{line}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-[var(--border,#333)]">
          <p className="text-xs text-[var(--text-muted,#666)]">
            {t("completionWindow")}: {completionWindow}
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-[var(--text-secondary,#aaa)]
                hover:text-[var(--text-primary,#fff)] transition-colors rounded-lg"
            >
              {t("cancel")}
            </button>
            <button
              onClick={handleCreate}
              disabled={step === "uploading" || step === "creating"}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg
                bg-[var(--accent,#7c3aed)] text-white hover:opacity-90
                transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              {t("create")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

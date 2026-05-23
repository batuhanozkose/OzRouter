"use client";

import { Button } from "@/shared/components";
import { useTranslations } from "next-intl";
import type { RemoteInstancePublic } from "@/lib/db/remoteInstances";

interface RemoteInstanceBarProps {
  instances: RemoteInstancePublic[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onEdit: (instance: RemoteInstancePublic) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
  onRefresh: (id: string) => void;
}

export default function RemoteInstanceBar({
  instances,
  selectedId,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  onTest,
  onRefresh,
}: RemoteInstanceBarProps) {
  const t = useTranslations("cliTools");

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <label className="text-sm font-medium text-text-muted">{t("remoteInstance")}</label>
      <select
        value={selectedId ?? ""}
        onChange={(e) => {
          if (e.target.value) onSelect(e.target.value);
        }}
        className="h-10 px-3 rounded-lg bg-surface border border-border text-sm text-text-main focus:outline-none focus:border-primary min-w-[200px]"
      >
        <option value="">{t("selectInstance")}</option>
        {instances.map((inst) => (
          <option key={inst.id} value={inst.id}>
            {inst.label} ({inst.username}@{inst.host}:{inst.port})
          </option>
        ))}
      </select>
      <Button variant="secondary" size="sm" onClick={onAdd}>
        <span className="material-symbols-outlined text-[16px]">add</span>
        {t("addRemoteInstance")}
      </Button>
      {selectedId && (
        <>
          <Button variant="secondary" size="sm" onClick={() => onTest(selectedId)}>
            <span className="material-symbols-outlined text-[16px]">network_ping</span>
            {t("testConnection")}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onRefresh(selectedId)}>
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            {t("refresh")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const inst = instances.find((i) => i.id === selectedId);
              if (inst) onEdit(inst);
            }}
          >
            <span className="material-symbols-outlined text-[16px]">edit</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (window.confirm(t("deleteInstanceConfirm"))) {
                onDelete(selectedId);
              }
            }}
          >
            <span className="material-symbols-outlined text-[16px] text-red-500">delete</span>
          </Button>
        </>
      )}
    </div>
  );
}

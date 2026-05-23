"use client";

import { useState, useCallback } from "react";
import { SegmentedControl } from "@/shared/components";
import BudgetTab from "../usage/components/BudgetTab";
import PricingTab from "../settings/components/PricingTab";
import CostOverviewTab from "./CostOverviewTab";
import { useTranslations } from "next-intl";

export default function CostsPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [refreshKey, setRefreshKey] = useState(0);
  const t = useTranslations("costs");
  const ts = useTranslations("settings");

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[28px]">payments</span>
            {t("title")}
          </h1>
          <p className="text-sm text-text-muted mt-1">{t("pageDescription")}</p>
        </div>
        <button
          onClick={handleRefresh}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-surface transition-colors"
          title={t("refresh")}
        >
          <span className="material-symbols-outlined text-base">refresh</span>
          {t("refresh")}
        </button>
      </div>

      <SegmentedControl
        options={[
          { value: "overview", label: t("overview") },
          { value: "budget", label: t("budget") },
          { value: "pricing", label: ts("pricing") },
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "overview" && <CostOverviewTab key={`overview-${refreshKey}`} />}
      {activeTab === "budget" && <BudgetTab key={`budget-${refreshKey}`} />}
      {activeTab === "pricing" && <PricingTab key={`pricing-${refreshKey}`} />}
    </div>
  );
}

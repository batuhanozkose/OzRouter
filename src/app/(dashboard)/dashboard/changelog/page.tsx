"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/shared/components";
import ChangelogViewer from "./components/ChangelogViewer";

export default function ChangelogPage() {
  const t = useTranslations("sidebar");
  const title = typeof t.has === "function" && t.has("changelog") ? t("changelog") : "Changelog";

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-main">{title}</h1>
          <p className="text-sm text-text-muted mt-1">
            Stay up to date with the latest platform features and announcements.
          </p>
        </div>
      </div>

      <Card className="min-h-[500px] overflow-hidden" padding="none">
        <ChangelogViewer />
      </Card>
    </div>
  );
}

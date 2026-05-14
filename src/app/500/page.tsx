import ErrorPageScaffold from "@/shared/components/ErrorPageScaffold";
import { useTranslations } from "next-intl";

export default function InternalServerErrorPage() {
  const t = useTranslations("errorPages.500");

  return (
    <ErrorPageScaffold
      code="500"
      icon="warning"
      title={t("title")}
      description={t("description")}
      suggestions={[t("suggestion1"), t("suggestion2"), t("suggestion3")]}
      primaryAction={{ href: "/dashboard/health", label: t("primaryAction") }}
      secondaryAction={{ href: "/dashboard/logs", label: t("secondaryAction") }}
    />
  );
}

import ErrorPageScaffold from "@/shared/components/ErrorPageScaffold";
import { useTranslations } from "next-intl";

export default function BadRequestPage() {
  const t = useTranslations("errorPages.400");

  return (
    <ErrorPageScaffold
      code="400"
      icon="rule"
      title={t("title")}
      description={t("description")}
      suggestions={[t("suggestion1"), t("suggestion2"), t("suggestion3")]}
      primaryAction={{ href: "/docs", label: t("primaryAction") }}
      secondaryAction={{ href: "/dashboard/translator", label: t("secondaryAction") }}
    />
  );
}

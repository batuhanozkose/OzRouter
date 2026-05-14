import ErrorPageScaffold from "@/shared/components/ErrorPageScaffold";
import { useTranslations } from "next-intl";

export default function TooManyRequestsPage() {
  const t = useTranslations("errorPages.429");

  return (
    <ErrorPageScaffold
      code="429"
      icon="hourglass_top"
      title={t("title")}
      description={t("description")}
      suggestions={[t("suggestion1"), t("suggestion2"), t("suggestion3")]}
      primaryAction={{
        href: "/dashboard/settings?tab=resilience",
        label: t("primaryAction"),
      }}
      secondaryAction={{ href: "/dashboard/combos", label: t("secondaryAction") }}
    />
  );
}

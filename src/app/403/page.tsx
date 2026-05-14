import ErrorPageScaffold from "@/shared/components/ErrorPageScaffold";
import { useTranslations } from "next-intl";

export default function ForbiddenStatusPage() {
  const t = useTranslations("errorPages.403");

  return (
    <ErrorPageScaffold
      code="403"
      icon="gpp_bad"
      title={t("title")}
      description={t("description")}
      suggestions={[t("suggestion1"), t("suggestion2"), t("suggestion3")]}
      primaryAction={{ href: "/forbidden", label: t("primaryAction") }}
      secondaryAction={{
        href: "/dashboard/settings?tab=security",
        label: t("secondaryAction"),
      }}
    />
  );
}

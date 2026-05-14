import ErrorPageScaffold from "@/shared/components/ErrorPageScaffold";
import { useTranslations } from "next-intl";

export default function UnauthorizedPage() {
  const t = useTranslations("errorPages.401");

  return (
    <ErrorPageScaffold
      code="401"
      icon="lock"
      title={t("title")}
      description={t("description")}
      suggestions={[t("suggestion1"), t("suggestion2"), t("suggestion3")]}
      primaryAction={{ href: "/login", label: t("primaryAction") }}
      secondaryAction={{ href: "/dashboard/api-manager", label: t("secondaryAction") }}
    />
  );
}

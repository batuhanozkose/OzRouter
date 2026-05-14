import ErrorPageScaffold from "@/shared/components/ErrorPageScaffold";
import { useTranslations } from "next-intl";

export default function RequestTimeoutPage() {
  const t = useTranslations("errorPages.408");

  return (
    <ErrorPageScaffold
      code="408"
      icon="timer_off"
      title={t("title")}
      description={t("description")}
      suggestions={[t("suggestion1"), t("suggestion2"), t("suggestion3")]}
      primaryAction={{ href: "/dashboard/endpoint", label: t("primaryAction") }}
      secondaryAction={{ href: "/status", label: t("secondaryAction") }}
    />
  );
}

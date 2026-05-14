import ErrorPageScaffold from "@/shared/components/ErrorPageScaffold";
import { useTranslations } from "next-intl";

export default function ServiceUnavailablePage() {
  const t = useTranslations("errorPages.503");

  return (
    <ErrorPageScaffold
      code="503"
      icon="build_circle"
      title={t("title")}
      description={t("description")}
      suggestions={[t("suggestion1"), t("suggestion2"), t("suggestion3")]}
      primaryAction={{ href: "/maintenance", label: t("primaryAction") }}
      secondaryAction={{ href: "/status", label: t("secondaryAction") }}
    />
  );
}

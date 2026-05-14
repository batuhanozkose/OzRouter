import ErrorPageScaffold from "@/shared/components/ErrorPageScaffold";
import { useTranslations } from "next-intl";

export default function BadGatewayPage() {
  const t = useTranslations("errorPages.502");

  return (
    <ErrorPageScaffold
      code="502"
      icon="hub"
      title={t("title")}
      description={t("description")}
      suggestions={[t("suggestion1"), t("suggestion2"), t("suggestion3")]}
      primaryAction={{ href: "/dashboard/providers", label: t("primaryAction") }}
      secondaryAction={{ href: "/dashboard/translator", label: t("secondaryAction") }}
    />
  );
}

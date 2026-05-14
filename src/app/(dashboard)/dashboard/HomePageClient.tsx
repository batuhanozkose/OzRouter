"use client";

import DashboardOverview from "./overview/DashboardOverview";

interface Props {
  machineId: string;
}

export default function HomePageClient({ machineId }: Props) {
  return <DashboardOverview machineId={machineId} />;
}

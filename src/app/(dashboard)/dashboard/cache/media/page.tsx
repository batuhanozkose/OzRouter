import { permanentRedirect } from "next/navigation";

export default function MediaPage() {
  permanentRedirect("/dashboard/studio");
}

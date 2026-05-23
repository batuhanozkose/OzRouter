import { permanentRedirect } from "next/navigation";

export default function PlaygroundRedirect() {
  permanentRedirect("/dashboard/studio");
}

export async function runRemoteInstall({
  instanceId,
  toolId,
  onOutput,
}: {
  instanceId: string;
  toolId: string;
  onOutput: (output: string) => void;
}): Promise<{ success: boolean; output: string }> {
  const res = await fetch("/api/cli-tools/remote/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instanceId, toolId }),
  });

  if (!res.body) {
    const data = await res.json();
    throw new Error(data.error || "Install request failed");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let output = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    output += chunk;
    onOutput(output);
  }

  output += decoder.decode();
  onOutput(output);

  return {
    success: res.ok && output.includes("OZROUTER_INSTALL_STATUS=success"),
    output,
  };
}

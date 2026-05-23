"use server";

import { NextRequest, NextResponse } from "next/server";
import { requireCliToolsAuth } from "@/lib/api/requireCliToolsAuth";
import { applyRemoteToolConfig, resetRemoteToolConfig } from "@/shared/services/remoteCliRuntime";
import { getInstance } from "@/lib/db/remoteInstances";
import { getApiKeyById } from "@/lib/localDb";
import { getRuntimePorts } from "@/lib/runtime/ports";

const { apiPort } = getRuntimePorts();

export async function POST(request: NextRequest) {
  const authError = await requireCliToolsAuth(request);
  if (authError) return authError;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    instanceId,
    toolId,
    baseUrl,
    apiKey,
    keyId,
    model,
    env,
    reasoningEffort,
    wireApi,
    modelMappings,
  } = body;

  if (!instanceId || !toolId) {
    return NextResponse.json({ error: "instanceId and toolId are required" }, { status: 400 });
  }

  const instance = getInstance(instanceId);
  if (!instance) {
    return NextResponse.json({ error: "Remote instance not found" }, { status: 404 });
  }

  let resolvedApiKey = apiKey;
  if (keyId && !resolvedApiKey) {
    try {
      const keyRecord = await getApiKeyById(keyId);
      if (keyRecord && keyRecord.key) {
        resolvedApiKey = keyRecord.key;
      }
    } catch {}
  }

  if (!resolvedApiKey) {
    return NextResponse.json({ error: "No API key provided or resolved" }, { status: 400 });
  }

  try {
    await applyRemoteToolConfig(instanceId, toolId, {
      baseUrl: baseUrl || `http://localhost:${apiPort}/v1`,
      apiKey: resolvedApiKey,
      model: model || undefined,
      env: env || undefined,
      reasoningEffort: reasoningEffort || undefined,
      wireApi: wireApi || undefined,
      modelMappings: modelMappings || undefined,
    });

    return NextResponse.json({
      success: true,
      message: `${toolId} config applied on remote`,
      requiresEnvExport: toolId === "codex" && wireApi === "responses",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to apply config" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authError = await requireCliToolsAuth(request);
  if (authError) return authError;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { instanceId, toolId } = body;

  if (!instanceId || !toolId) {
    return NextResponse.json({ error: "instanceId and toolId are required" }, { status: 400 });
  }

  try {
    await resetRemoteToolConfig(instanceId, toolId);
    return NextResponse.json({ success: true, message: `${toolId} config reset on remote` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to reset config" }, { status: 500 });
  }
}

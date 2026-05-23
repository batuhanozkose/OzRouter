"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, Select } from "@/shared/components";
import { AI_PROVIDERS, ALIAS_TO_ID } from "@/shared/constants/providers";
import { pickDisplayValue } from "@/shared/utils/maskEmail";
import useEmailPrivacyStore from "@/store/emailPrivacyStore";

interface ModelInfo {
  id: string;
  object: string;
  owned_by: string;
}

interface ProviderOption {
  value: string;
  label: string;
}

interface ConnectionOption {
  id: string;
  name: string;
  email?: string;
  provider: string;
  authType: string;
}

type EndpointId =
  | "chat"
  | "responses"
  | "images"
  | "speech"
  | "transcription"
  | "embeddings"
  | "rerank"
  | "search"
  | "video"
  | "music";

type StudioResult = {
  endpoint: EndpointId;
  status: number | null;
  duration: number | null;
  text: string;
  data: any;
  audioUrl: string | null;
};

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

const ENDPOINTS: Array<{
  id: EndpointId;
  icon: string;
  path: string;
  noModel?: boolean;
  file?: "audio" | "image";
}> = [
  {
    id: "chat",
    icon: "chat",
    path: "/v1/chat/completions",
    file: "image",
  },
  {
    id: "responses",
    icon: "forum",
    path: "/v1/responses",
  },
  {
    id: "images",
    icon: "image",
    path: "/v1/images/generations",
    file: "image",
  },
  {
    id: "speech",
    icon: "record_voice_over",
    path: "/v1/audio/speech",
  },
  {
    id: "transcription",
    icon: "mic",
    path: "/v1/audio/transcriptions",
    file: "audio",
  },
  {
    id: "embeddings",
    icon: "hub",
    path: "/v1/embeddings",
  },
  {
    id: "rerank",
    icon: "sort",
    path: "/v1/rerank",
  },
  {
    id: "search",
    icon: "travel_explore",
    path: "/v1/search",
    noModel: true,
  },
  {
    id: "video",
    icon: "videocam",
    path: "/v1/videos/generations",
  },
  {
    id: "music",
    icon: "music_note",
    path: "/v1/music/generations",
  },
];

const DEFAULT_MODEL_BY_ENDPOINT: Partial<Record<EndpointId, string>> = {
  speech: "openai/tts-1",
  transcription: "deepgram/nova-3",
  images: "openai/gpt-image-1",
  video: "comfyui/animatediff",
  music: "comfyui/stable-audio",
  rerank: "cohere/rerank-english-v3.0",
};

function canonicalizeModelId(modelId: string): string {
  const slashIndex = modelId.indexOf("/");
  if (slashIndex <= 0) return modelId;

  const provider = modelId.slice(0, slashIndex);
  const model = modelId.slice(slashIndex + 1);
  return `${ALIAS_TO_ID[provider] || provider}/${model}`;
}

function canonicalizeModelList(modelList: ModelInfo[]): ModelInfo[] {
  const deduped = new Map<string, ModelInfo>();

  for (const model of modelList) {
    const canonicalId = canonicalizeModelId(model.id);
    if (deduped.has(canonicalId)) continue;
    deduped.set(canonicalId, { ...model, id: canonicalId });
  }

  return Array.from(deduped.values());
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function safeJson(value: any): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function readSseDelta(eventPayload: string): string {
  if (!eventPayload || eventPayload === "[DONE]") return "";

  try {
    const parsed = JSON.parse(eventPayload);
    return (
      parsed.choices?.[0]?.delta?.content ||
      parsed.choices?.[0]?.message?.content ||
      parsed.delta ||
      parsed.output_text_delta ||
      ""
    );
  } catch {
    return "";
  }
}

function endpointSupportsProvider(endpoint: EndpointId, modelId: string): boolean {
  if (!modelId.includes("/")) return true;
  const lower = modelId.toLowerCase();

  if (endpoint === "images") {
    return /(image|gpt-image|dall|flux|sd|stable|midjourney|imagen|seedream|topaz|nano-banana)/.test(
      lower
    );
  }
  if (endpoint === "speech") {
    return /(tts|speech|aura|sonic|play|voice|melo|fastpitch|tacotron)/.test(lower);
  }
  if (endpoint === "transcription") {
    return /(whisper|transcri|asr|nova|universal|parakeet|deepgram|assemblyai|groq)/.test(lower);
  }
  if (endpoint === "rerank") {
    return /rerank/.test(lower);
  }
  if (endpoint === "video") {
    return /(video|animatediff|svd|runway|comfyui|sdwebui)/.test(lower);
  }
  if (endpoint === "music") {
    return /(music|audio|stable-audio|musicgen|suno|udio|comfyui)/.test(lower);
  }

  return true;
}

function getModelOptions(
  models: ModelInfo[],
  endpoint: EndpointId,
  provider: string,
  idToPrefix?: Record<string, string>
): ProviderOption[] {
  const prefix = idToPrefix ? idToProviderPrefix(provider, idToPrefix) : undefined;
  return models
    .filter((model) => {
      if (!provider) return true;
      const matchesProvider = model.id.startsWith(`${provider}/`);
      if (matchesProvider) return true;
      if (prefix) {
        return model.id.startsWith(`${prefix}/`);
      }
      return false;
    })
    .filter((model) => endpointSupportsProvider(endpoint, model.id))
    .map((model) => ({ value: model.id, label: model.id }));
}

function pickModelForEndpoint(
  models: ModelInfo[],
  endpoint: EndpointId,
  provider: string,
  idToPrefix?: Record<string, string>
): string {
  const options = getModelOptions(models, endpoint, provider, idToPrefix);
  const preferred = DEFAULT_MODEL_BY_ENDPOINT[endpoint];
  return options.find((model) => model.value === preferred)?.value || options[0]?.value || "";
}

function buildProviderOptionsFromConnections(
  connections: ConnectionOption[],
  idToPrefix?: Record<string, string>
): ProviderOption[] {
  const providerIds = new Set<string>();
  const prefixToProviderId = new Map<string, string>();

  for (const connection of connections) {
    const provider = ALIAS_TO_ID[connection.provider] || connection.provider;
    if (provider) {
      providerIds.add(provider);
      const prefix = idToPrefix?.[connection.provider];
      if (prefix && prefix !== provider) {
        prefixToProviderId.set(prefix, provider);
      }
    }
  }

  const options: ProviderOption[] = [];

  for (const provider of Array.from(providerIds).sort()) {
    const prefix = idToProviderPrefix(provider, idToPrefix);
    const displayPrefix = prefix && prefix !== provider ? prefix : "";
    const label =
      AI_PROVIDERS[provider]?.name ||
      (displayPrefix ? `${displayPrefix} (${provider.slice(0, 24)}…)` : provider);
    options.push({ value: provider, label });
  }

  return options;
}

function idToProviderPrefix(
  providerId: string,
  idToPrefix?: Record<string, string>
): string | undefined {
  if (!idToPrefix) return undefined;
  for (const [nodeId, prefix] of Object.entries(idToPrefix)) {
    if (nodeId === providerId || ALIAS_TO_ID[nodeId] === providerId) return prefix;
  }
  return undefined;
}

function buildPayload(
  endpoint: EndpointId,
  model: string,
  prompt: string,
  advanced: { temperature?: number; maxTokens?: number; topP?: number },
  conversationHistory?: Message[]
) {
  const trimmed = prompt.trim();

  switch (endpoint) {
    case "chat":
      return {
        model,
        messages: [
          ...(conversationHistory || []),
          { role: "user" as const, content: trimmed || "Hello. Say hi in one sentence." },
        ],
        stream: true,
        temperature: advanced.temperature ?? 0.7,
        max_tokens: advanced.maxTokens ?? 1024,
        top_p: advanced.topP ?? 1.0,
      };
    case "responses":
      return {
        model,
        input: trimmed || "Hello. Say hi in one sentence.",
        stream: false,
        temperature: advanced.temperature ?? 0.7,
        max_output_tokens: advanced.maxTokens ?? 1024,
        top_p: advanced.topP ?? 1.0,
      };
    case "images":
      return {
        model,
        prompt: trimmed || "A beautiful sunset over mountains",
        n: 1,
        size: "1024x1024",
      };
    case "speech":
      return {
        model,
        input: trimmed || "Hello, this is a test of the text-to-speech endpoint.",
        voice: "alloy",
        response_format: "mp3",
      };
    case "embeddings":
      return { model, input: trimmed || "Hello world", encoding_format: "float" };
    case "rerank":
      return {
        model,
        query: trimmed || "What is the capital of France?",
        documents: [
          "Paris is the capital of France.",
          "London is the capital of England.",
          "Berlin is the capital of Germany.",
        ],
        top_n: 2,
      };
    case "search":
      return {
        query: trimmed || "latest AI developments",
        max_results: 5,
        search_type: "web",
      };
    case "video":
      return {
        model,
        prompt: trimmed || "A timelapse of a sunset over the ocean",
        n: 1,
      };
    case "music":
      return {
        model,
        prompt: trimmed || "Calm ambient piano music with soft reverb",
        duration: 10,
      };
    case "transcription":
      return { model, language: "en" };
  }
}

function ImageResult({ data }: { data: any }) {
  const images: Array<{ url?: string; b64_json?: string; revised_prompt?: string }> =
    data?.data || [];
  if (!images.length) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {images.map((image, index) => {
        const src = image.url || (image.b64_json ? `data:image/png;base64,${image.b64_json}` : "");
        if (!src) return null;
        return (
          <div
            key={`${src.slice(0, 48)}-${index}`}
            className="overflow-hidden rounded-lg border border-border bg-surface"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={image.revised_prompt || `Generated image ${index + 1}`}
              className="w-full"
            />
            {image.revised_prompt && (
              <p
                className="truncate px-3 py-2 text-xs text-text-muted"
                title={image.revised_prompt}
              >
                {image.revised_prompt}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function StudioPage() {
  const t = useTranslations("playground");
  const ts = useCallback((key: string) => t(`studio.${key}`), [t]);
  const emailsVisible = useEmailPrivacyStore((s) => s.emailsVisible);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [allConnections, setAllConnections] = useState<ConnectionOption[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointId>("chat");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedConnection, setSelectedConnection] = useState("");
  const [providerIdToPrefix, setProviderIdToPrefix] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [topP, setTopP] = useState(1.0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StudioResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const endpoint = ENDPOINTS.find((item) => item.id === selectedEndpoint) || ENDPOINTS[0];
  const endpointLabel = (id: EndpointId) => ts(`endpoints.${id}.label`);
  const endpointPrompt = (id: EndpointId) => ts(`endpoints.${id}.prompt`);
  const endpointPlaceholder = (id: EndpointId) => ts(`endpoints.${id}.placeholder`);
  const requiresModel = !endpoint.noModel;

  useEffect(() => {
    Promise.all([
      fetch("/v1/models").then((res) => res.json()),
      fetch("/api/providers/client").then((res) => res.json()),
      fetch("/api/provider-nodes").then((res) => res.json()),
    ])
      .then(([modelsData, providersData, nodesData]) => {
        const modelList = canonicalizeModelList((modelsData?.data || []) as ModelInfo[]);
        const conns: ConnectionOption[] = [];

        const idToPrefix: Record<string, string> = {};
        for (const node of nodesData?.nodes || []) {
          if (node.id && node.prefix) {
            idToPrefix[node.id] = node.prefix;
          }
        }
        setProviderIdToPrefix(idToPrefix);

        for (const conn of providersData?.connections || []) {
          conns.push({
            id: conn.id,
            name: conn.name || conn.id,
            email: conn.email,
            provider: ALIAS_TO_ID[conn.provider] || conn.provider,
            authType: conn.authType || "apiKey",
          });
        }

        const options = buildProviderOptionsFromConnections(conns, idToPrefix);
        const firstProvider = options[0]?.value || "";
        setModels(modelList);
        setAllConnections(conns);
        setProviders(options);
        setSelectedProvider(firstProvider);
        setSelectedModel(pickModelForEndpoint(modelList, "chat", firstProvider, idToPrefix));
      })
      .catch(() => {});
  }, []);

  const providerConnections = allConnections.filter((connection) => {
    if (!selectedProvider) return false;
    const resolvedProvider = ALIAS_TO_ID[selectedProvider] || selectedProvider;
    return connection.provider === resolvedProvider || connection.provider === selectedProvider;
  });

  const filteredModels = useMemo(() => {
    return getModelOptions(models, selectedEndpoint, selectedProvider, providerIdToPrefix);
  }, [models, selectedEndpoint, selectedProvider, providerIdToPrefix]);

  const advancedParams = useMemo(
    () => ({
      temperature,
      maxTokens,
      topP,
    }),
    [temperature, maxTokens, topP]
  );

  const payloadForPreview = useMemo(() => {
    try {
      return buildPayload(
        selectedEndpoint,
        selectedModel,
        prompt,
        advancedParams,
        selectedEndpoint === "chat" ? messages : undefined
      );
    } catch {
      return {};
    }
  }, [prompt, selectedEndpoint, selectedModel, advancedParams, messages]);

  const [codeFormat, setCodeFormat] = useState<"curl" | "openai-js" | "openai-py">("curl");

  const requestPreview = useMemo(() => {
    const path = endpoint.path.startsWith("/") ? endpoint.path : `/${endpoint.path}`;
    const apiUrl = `http://localhost:20128/api${path}`;
    const payloadJson = JSON.stringify(payloadForPreview, null, 2);

    switch (codeFormat) {
      case "curl":
        return `curl -X POST "${apiUrl}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payloadForPreview).replace(/'/g, "'\\''")}'`;
      case "openai-js":
        return `const OpenAI = require("openai");

const client = new OpenAI({
  baseURL: "${apiUrl}",
  apiKey: "sk_ozrouter",
});

const response = await client.${endpoint.id === "chat" ? "chat.completions.create" : endpoint.id === "responses" ? "responses.create" : endpoint.id === "embeddings" ? "embeddings.create" : endpoint.id + ".create"}({
${Object.entries(payloadForPreview)
  .filter(([k]) => !["stream"].includes(k))
  .map(([k, v]) => `  ${k}: ${typeof v === "string" ? `"${v}"` : JSON.stringify(v)},`)
  .join("\n")}
});`;
      case "openai-py":
        return `from openai import OpenAI

client = OpenAI(
    base_url="${apiUrl}",
    api_key="sk_ozrouter",
)

response = client.${endpoint.id === "chat" ? "chat.completions.create" : endpoint.id === "responses" ? "responses.create" : endpoint.id === "embeddings" ? "embeddings.create" : endpoint.id + ".create"}(
${Object.entries(payloadForPreview)
  .filter(([k]) => !["stream"].includes(k))
  .map(([k, v]) => `    ${k}=${typeof v === "string" ? `"${v}"` : JSON.stringify(v)},`)
  .join("\n")}
)`;
    }
  }, [codeFormat, endpoint, payloadForPreview]);

  const clearOutput = () => {
    setResult(null);
    setError(null);
    setMessages([]);
  };

  const handleEndpointChange = (nextEndpoint: EndpointId) => {
    setSelectedEndpoint(nextEndpoint);
    setSelectedModel(
      pickModelForEndpoint(models, nextEndpoint, selectedProvider, providerIdToPrefix)
    );
    setPrompt("");
    setTemperature(0.7);
    setMaxTokens(1024);
    setTopP(1.0);
    setUploadedFile(null);
    setUploadedImages([]);
    clearOutput();
  };

  const handleImageFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const encoded = await Promise.all(files.map(fileToDataUrl));
    setUploadedImages((current) => [...current, ...encoded].slice(0, 4));
  };

  const handleSend = async () => {
    if (requiresModel && !selectedModel) return;
    if (selectedEndpoint === "transcription" && !uploadedFile) {
      setError(ts("errors.selectAudioFile"));
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    if (selectedEndpoint === "chat") {
      setMessages((prev) => [...prev, { role: "user", content: prompt.trim() }]);
      setPrompt("");
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const started = Date.now();

    try {
      const headers: Record<string, string> = {};
      if (selectedConnection) headers["X-OzRouter-Connection"] = selectedConnection;

      let response: Response;
      if (selectedEndpoint === "transcription") {
        const payload = buildPayload(selectedEndpoint, selectedModel, prompt, advancedParams);
        const form = new FormData();
        if (uploadedFile) form.append("file", uploadedFile);
        for (const [key, value] of Object.entries(payload)) {
          form.append(key, String(value));
        }
        response = await fetch(`/api${endpoint.path}`, {
          method: "POST",
          headers,
          body: form,
          signal: controller.signal,
        });
      } else {
        let payload = buildPayload(
          selectedEndpoint,
          selectedModel,
          prompt,
          advancedParams,
          selectedEndpoint === "chat" ? messages : undefined
        );
        if (selectedEndpoint === "chat" && uploadedImages.length > 0) {
          payload = {
            ...payload,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: prompt.trim() || "Describe these images." },
                  ...uploadedImages.map((url) => ({ type: "image_url", image_url: { url } })),
                ],
              },
            ],
          };
        }
        if (selectedEndpoint === "images" && uploadedImages.length > 0) {
          payload = {
            ...payload,
            image_url: uploadedImages[0],
            imageUrls: uploadedImages,
          };
        }
        response = await fetch(`/api${endpoint.path}`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      }

      const duration = Date.now() - started;
      const contentType = response.headers.get("content-type") || "";

      if (contentType.startsWith("audio/")) {
        const blob = await response.blob();
        setResult({
          endpoint: selectedEndpoint,
          status: response.status,
          duration,
          text: ts("messages.audioGenerated"),
          data: { contentType },
          audioUrl: URL.createObjectURL(blob),
        });
        return;
      }

      if (contentType.includes("text/event-stream")) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let raw = "";
        let assistantText = "";
        let pending = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            const chunk = done ? decoder.decode() : decoder.decode(value, { stream: true });
            raw += chunk;
            pending += chunk;

            const events = pending.split(/\r?\n\r?\n/);
            pending = events.pop() || "";

            for (const event of events) {
              const data = event
                .split(/\r?\n/)
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.replace(/^data:\s?/, ""))
                .join("\n")
                .trim();
              assistantText += readSseDelta(data);
            }

            if (done) break;
          }

          const trailingData = pending
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.replace(/^data:\s?/, ""))
            .join("\n")
            .trim();
          assistantText += readSseDelta(trailingData);
        }

        if (!assistantText) {
          for (const line of raw.split(/\r?\n/)) {
            if (!line.startsWith("data:")) continue;
            assistantText += readSseDelta(line.replace(/^data:\s?/, "").trim());
          }
        }

        if (selectedEndpoint === "chat") {
          setMessages((prev) => [...prev, { role: "assistant", content: assistantText }]);
        }

        setResult({
          endpoint: selectedEndpoint,
          status: response.status,
          duration,
          text: assistantText || raw,
          data: raw,
          audioUrl: null,
        });
        return;
      }

      const data = await response.json().catch(async () => ({ text: await response.text() }));
      const text =
        data?.choices?.[0]?.message?.content ||
        data?.output_text ||
        data?.text ||
        data?.data?.[0]?.embedding?.slice?.(0, 8)?.join(", ") ||
        safeJson(data);

      if (selectedEndpoint === "chat") {
        setMessages((prev) => [...prev, { role: "assistant", content: text }]);
      }

      setResult({
        endpoint: selectedEndpoint,
        status: response.status,
        duration,
        text,
        data,
        audioUrl: null,
      });
    } catch (err: any) {
      if (err.name === "AbortError") {
        setError(ts("errors.cancelled"));
      } else {
        setError(err.message || ts("errors.requestFailed"));
      }
    } finally {
      setLoading(false);
    }
  };

  const canSend =
    !loading &&
    (!requiresModel || Boolean(selectedModel)) &&
    (selectedEndpoint !== "transcription" || Boolean(uploadedFile));

  const handlePromptKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;

    event.preventDefault();
    if (canSend) {
      void handleSend();
    }
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-text-main">Studio</h1>
        <p className="max-w-3xl text-sm text-text-muted">{ts("description")}</p>
      </div>

      {/* Chat / main area */}
      <div className="grid min-h-[520px] gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <div className="flex min-h-[520px] flex-col">
            <div className="border-b border-border p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="info" size="sm">
                  {endpointLabel(endpoint.id)}
                </Badge>
                <span className="text-sm text-text-muted">{endpointPrompt(endpoint.id)}</span>
              </div>
              {requiresModel && (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-muted">
                      {t("provider")}
                    </label>
                    <Select
                      value={selectedProvider}
                      onChange={(event: any) => {
                        const nextProvider = event.target.value;
                        setSelectedProvider(nextProvider);
                        setSelectedModel(
                          pickModelForEndpoint(
                            models,
                            selectedEndpoint,
                            nextProvider,
                            providerIdToPrefix
                          )
                        );
                        setSelectedConnection("");
                      }}
                      options={providers}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-muted">
                      {t("model")}
                    </label>
                    <Select
                      value={selectedModel}
                      onChange={(event: any) => setSelectedModel(event.target.value)}
                      options={filteredModels}
                      placeholder={ts("selectModel")}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-muted">
                      {t("accountKey")}
                    </label>
                    <Select
                      value={selectedConnection}
                      onChange={(event: any) => setSelectedConnection(event.target.value)}
                      options={[
                        {
                          value: "",
                          label:
                            providerConnections.length > 0
                              ? t("autoAccounts", { count: providerConnections.length })
                              : t("noAccounts"),
                        },
                        ...providerConnections.map((connection) => ({
                          value: connection.id,
                          label: pickDisplayValue(
                            [connection.name, connection.email],
                            emailsVisible,
                            connection.id
                          ),
                        })),
                      ]}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 space-y-4 overflow-auto p-4">
              {selectedEndpoint === "chat" && messages.length > 0 ? (
                <>
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap ${
                          msg.role === "user"
                            ? "bg-primary/10 text-text-main"
                            : "border border-border bg-surface text-text-main"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="max-w-[88%] rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-muted">
                        <span className="material-symbols-outlined mr-2 animate-spin align-[-4px] text-[17px] text-primary">
                          progress_activity
                        </span>
                        {ts("messages.running")}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="max-w-[78%] rounded-lg bg-primary/10 px-4 py-3 text-sm text-text-main">
                    {prompt.trim() || endpointPlaceholder(endpoint.id)}
                  </div>

                  {uploadedFile && (
                    <div className="max-w-[78%] rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-muted">
                      <span className="material-symbols-outlined mr-1 align-[-4px] text-[17px]">
                        attach_file
                      </span>
                      {uploadedFile.name}
                    </div>
                  )}

                  {uploadedImages.length > 0 && (
                    <div className="flex max-w-[78%] flex-wrap gap-2 rounded-lg border border-border bg-surface p-3">
                      {uploadedImages.map((src, index) => (
                        <div
                          key={`${src.slice(0, 32)}-${index}`}
                          className="relative size-20 overflow-hidden rounded border border-border"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={src}
                            alt={ts("attachedImage").replace("{index}", String(index + 1))}
                            className="size-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {loading && (
                    <div className="ml-auto max-w-[78%] rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-muted">
                      <span className="material-symbols-outlined mr-2 animate-spin align-[-4px] text-[17px] text-primary">
                        progress_activity
                      </span>
                      {ts("messages.running")}
                    </div>
                  )}

                  {error && (
                    <div className="ml-auto max-w-[78%] rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                      {error}
                    </div>
                  )}

                  {result && (
                    <div className="ml-auto max-w-[88%] space-y-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-main">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                        {result.status !== null && (
                          <Badge
                            variant={
                              result.status >= 200 && result.status < 300 ? "success" : "error"
                            }
                            size="sm"
                          >
                            {result.status}
                          </Badge>
                        )}
                        {result.duration !== null && <span>{result.duration}ms</span>}
                      </div>

                      {result.audioUrl ? (
                        <audio controls src={result.audioUrl} className="w-full" autoPlay />
                      ) : result.endpoint === "images" ? (
                        <ImageResult data={result.data} />
                      ) : (
                        <div className="whitespace-pre-wrap leading-relaxed">
                          {String(result.text || ts("messages.noResponse"))}
                        </div>
                      )}

                      <details>
                        <summary className="cursor-pointer text-xs text-text-muted hover:text-text-main">
                          {ts("rawResponse")}
                        </summary>
                        <pre className="mt-2 max-h-80 overflow-auto rounded bg-black/20 p-3 text-xs text-text-muted">
                          {typeof result.data === "string" ? result.data : safeJson(result.data)}
                        </pre>
                      </details>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="border-t border-border p-4">
              {(endpoint.file === "audio" || endpoint.file === "image") && (
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  {endpoint.file === "audio" ? (
                    <input
                      type="file"
                      accept="audio/*,video/*"
                      onChange={(event) => setUploadedFile(event.target.files?.[0] || null)}
                      className="text-sm text-text-muted file:mr-3 file:rounded file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-sm file:text-primary"
                    />
                  ) : (
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageFileChange}
                      className="text-sm text-text-muted file:mr-3 file:rounded file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-sm file:text-primary"
                    />
                  )}
                  {(uploadedFile || uploadedImages.length > 0) && (
                    <button
                      type="button"
                      onClick={() => {
                        setUploadedFile(null);
                        setUploadedImages([]);
                      }}
                      className="text-xs text-text-muted hover:text-red-400"
                    >
                      {ts("clearAttachments")}
                    </button>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={handlePromptKeyDown}
                  placeholder={endpointPlaceholder(endpoint.id)}
                  rows={3}
                  className="min-h-[72px] flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-muted/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <div className="flex flex-col gap-2">
                  {loading ? (
                    <Button
                      icon="stop"
                      variant="secondary"
                      onClick={() => abortRef.current?.abort()}
                    >
                      {ts("stop")}
                    </Button>
                  ) : (
                    <Button icon="send" onClick={handleSend} disabled={!canSend}>
                      {ts("run")}
                    </Button>
                  )}
                  <Button icon="delete" variant="ghost" onClick={clearOutput}>
                    {ts("clear")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="p-4">
              <button
                type="button"
                onClick={() => setAdvancedOpen((open) => !open)}
                className="flex w-full items-center justify-between text-left text-sm font-medium text-text-main"
              >
                {ts("advanced")}
                <span className="material-symbols-outlined text-[18px]">
                  {advancedOpen ? "expand_less" : "expand_more"}
                </span>
              </button>

              {advancedOpen && (
                <div className="mt-4 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-text-muted">Temperature</label>
                      <span className="text-xs font-mono text-text-main">
                        {temperature.toFixed(1)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none bg-[var(--border,#333)] accent-[var(--accent,#7c3aed)] cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-text-muted">Max tokens</label>
                      <span className="text-xs font-mono text-text-main">{maxTokens}</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="16384"
                      step="1"
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none bg-[var(--border,#333)] accent-[var(--accent,#7c3aed)] cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-text-muted">Top P</label>
                      <span className="text-xs font-mono text-text-main">{topP.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={topP}
                      onChange={(e) => setTopP(parseFloat(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none bg-[var(--border,#333)] accent-[var(--accent,#7c3aed)] cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-main">{ts("requestPreview")}</h2>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg bg-[var(--surface,#0f0f1a)] p-0.5">
                    {(["curl", "openai-js", "openai-py"] as const).map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => setCodeFormat(fmt)}
                        className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all ${
                          codeFormat === fmt
                            ? "bg-[var(--card-bg,#1e1e2e)] text-[var(--text-primary,#fff)] shadow"
                            : "text-[var(--text-secondary,#aaa)] hover:text-[var(--text-primary,#fff)]"
                        }`}
                      >
                        {fmt === "curl" ? "curl" : fmt === "openai-js" ? "Node.js" : "Python"}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(requestPreview).catch(() => {})}
                    className="text-xs text-primary hover:underline"
                  >
                    {t("copy")}
                  </button>
                </div>
              </div>
              <pre className="max-h-[360px] overflow-auto rounded-lg bg-black/20 p-3 text-xs text-text-muted whitespace-pre-wrap">
                {requestPreview}
              </pre>
            </div>
          </Card>
        </div>
      </div>

      {/* Endpoint selector grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-10">
        {ENDPOINTS.map((item) => {
          const active = item.id === selectedEndpoint;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleEndpointChange(item.id)}
              className={`flex h-20 flex-col items-center justify-center gap-1 rounded-lg border px-2 text-center text-xs transition-colors ${
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-surface/50 text-text-muted hover:bg-surface hover:text-text-main"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              <span className="font-medium">{endpointLabel(item.id)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

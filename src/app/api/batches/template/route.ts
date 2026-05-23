"use server";

import { NextRequest, NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

const TEMPLATES: Record<string, string> = {
  "/v1/chat/completions": `{"custom_id": "req-1", "method": "POST", "url": "/v1/chat/completions", "body": {"model": "gpt-4o-mini", "messages": [{"role": "system", "content": "You are a helpful assistant."}, {"role": "user", "content": "Hello world!"}], "max_tokens": 100}}
{"custom_id": "req-2", "method": "POST", "url": "/v1/chat/completions", "body": {"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "What is 2+2?"}], "max_tokens": 100}}`,

  "/v1/embeddings": `{"custom_id": "emb-1", "method": "POST", "url": "/v1/embeddings", "body": {"model": "text-embedding-3-small", "input": "Hello world"}}
{"custom_id": "emb-2", "method": "POST", "url": "/v1/embeddings", "body": {"model": "text-embedding-3-small", "input": ["What is AI?", "Explain machine learning."]}}`,

  "/v1/completions": `{"custom_id": "comp-1", "method": "POST", "url": "/v1/completions", "body": {"model": "gpt-3.5-turbo-instruct", "prompt": "Explain quantum computing in one sentence.", "max_tokens": 50}}
{"custom_id": "comp-2", "method": "POST", "url": "/v1/completions", "body": {"model": "gpt-3.5-turbo-instruct", "prompt": "What is the capital of France?", "max_tokens": 20}}`,

  "/v1/responses": `{"custom_id": "resp-1", "method": "POST", "url": "/v1/responses", "body": {"model": "gpt-4o-mini", "input": "Hello world!"}}
{"custom_id": "resp-2", "method": "POST", "url": "/v1/responses", "body": {"model": "gpt-4o-mini", "input": "What is 2+2?"}}`,

  "/v1/moderations": `{"custom_id": "mod-1", "method": "POST", "url": "/v1/moderations", "body": {"model": "omni-moderation-latest", "input": "I want to harm someone."}}
{"custom_id": "mod-2", "method": "POST", "url": "/v1/moderations", "body": {"model": "omni-moderation-latest", "input": "Thank you for your help!"}}`,
};

export async function GET(request: NextRequest) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get("endpoint") || "/v1/chat/completions";
  const content = TEMPLATES[endpoint] || TEMPLATES["/v1/chat/completions"];

  return new NextResponse(content, {
    headers: {
      "Content-Type": "application/jsonl",
      "Content-Disposition": `attachment; filename="batch_template.jsonl"`,
    },
  });
}

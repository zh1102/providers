import { NextResponse } from "next/server";

export const runtime = "edge";
const ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as null | { apiKey?: string; model?: string; prompt?: string; ratio?: string; duration?: number };
  const apiKey = body?.apiKey?.trim();
  const model = body?.model?.trim();
  const prompt = body?.prompt?.trim();
  if (!apiKey || !model || !prompt) return NextResponse.json({ error: "Seedance Key、模型接入点和提示词均为必填。" }, { status: 400 });
  if (!/^[a-zA-Z0-9._:-]{2,160}$/.test(model)) return NextResponse.json({ error: "Seedance 模型接入点格式无效。" }, { status: 400 });
  if (prompt.length > 5000) return NextResponse.json({ error: "单条视频提示词不能超过5000字符。" }, { status: 400 });
  const duration = Math.min(15, Math.max(2, Number(body?.duration) || 5));
  const ratio = ["16:9", "9:16", "1:1"].includes(body?.ratio ?? "") ? body?.ratio : "16:9";
  try {
    const upstream = await fetch(ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, content: [{ type: "text", text: `${prompt} --ratio ${ratio} --duration ${duration}` }] }), signal: AbortSignal.timeout(30_000) });
    const payload = (await upstream.json()) as Record<string, unknown>;
    if (!upstream.ok) return NextResponse.json({ error: (payload.error as { message?: string } | undefined)?.message ?? "Seedance 任务创建失败。" }, { status: upstream.status });
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "暂时无法连接火山方舟。" }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const apiKey = request.headers.get("x-ark-api-key")?.trim();
  const taskId = url.searchParams.get("taskId")?.trim() ?? "";
  if (!apiKey || !/^[a-zA-Z0-9_-]{6,160}$/.test(taskId)) return NextResponse.json({ error: "Seedance Key 或任务 ID 无效。" }, { status: 400 });
  try {
    const upstream = await fetch(`${ENDPOINT}/${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(30_000) });
    return NextResponse.json(await upstream.json(), { status: upstream.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "暂时无法查询 Seedance 任务。" }, { status: 502 });
  }
}

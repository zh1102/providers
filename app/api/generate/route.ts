import { NextResponse } from "next/server";
import { stagePrompts, type WorkflowStage } from "./prompts";

export const runtime = "edge";
type TextProvider = "openai" | "deepseek" | "zhipu";
type RequestBody = { apiKey?: string; provider?: TextProvider; model?: string; stage?: WorkflowStage; project?: Record<string, string>; previousContext?: string; currentDraft?: string; revision?: string };

// 固定官方接口，防止本接口被用作访问任意地址的开放代理。
const endpoints: Record<TextProvider, string> = {
  openai: "https://api.openai.com/v1/responses",
  deepseek: "https://api.deepseek.com/chat/completions",
  zhipu: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
};
const defaults: Record<TextProvider, string> = { openai: "gpt-5.6-terra", deepseek: "deepseek-flash", zhipu: "glm-4.5-flash" };

function responseText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  if (typeof data.output_text === "string") return data.output_text;
  return (data.output ?? []).flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("\n").trim();
}

function chatText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  return (payload as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content?.trim() ?? "";
}

function safeMessage(provider: TextProvider, status: number, raw: unknown): string {
  const name = provider === "openai" ? "OpenAI" : provider === "deepseek" ? "DeepSeek" : "智谱 GLM";
  if (status === 401) return `${name} API Key 无效，请检查后重试。`;
  if (status === 429) return `${name} 额度不足或请求过快，请检查账户。`;
  if (status === 403) return `${name} 拒绝了请求，请检查模型权限和账户状态。`;
  const message = raw && typeof raw === "object" ? (raw as { error?: { message?: string } }).error?.message : undefined;
  return message && message.length < 240 ? message : `${name} 暂时没有完成这次生成，请稍后重试。`;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RequestBody | null;
  if (!body) return NextResponse.json({ error: "请求内容无法读取。" }, { status: 400 });
  const provider = body.provider ?? "openai";
  const apiKey = body.apiKey?.trim();
  const stage = body.stage;
  if (!(provider in endpoints)) return NextResponse.json({ error: "文本服务商无效。" }, { status: 400 });
  const model = body.model?.trim() || defaults[provider];
  if (!apiKey) return NextResponse.json({ error: "请先填写所选服务商的 API Key。" }, { status: 400 });
  if (!stage || !(stage in stagePrompts)) return NextResponse.json({ error: "创作步骤无效。" }, { status: 400 });
  if (!/^[a-zA-Z0-9._:-]{2,100}$/.test(model)) return NextResponse.json({ error: "模型名称无效。" }, { status: 400 });

  const input = [
    `【项目设定】\n${JSON.stringify(body.project ?? {}, null, 2)}`,
    body.previousContext ? `【此前已经确认的创作结果】\n${body.previousContext}` : "",
    body.currentDraft ? `【当前步骤上一版草稿】\n${body.currentDraft}` : "",
    body.revision ? `【用户本次修改或补充要求】\n${body.revision}` : "【用户本次要求】\n请生成当前步骤的第一版结果。",
  ].filter(Boolean).join("\n\n");

  // OpenAI 使用 Responses API；DeepSeek 与智谱使用兼容的聊天补全协议。
  const upstreamBody = provider === "openai"
    ? { model, instructions: stagePrompts[stage], input, store: false, max_output_tokens: stage === "storyboard" ? 12000 : 8000 }
    : { model, messages: [{ role: "system", content: stagePrompts[stage] }, { role: "user", content: input }], max_tokens: stage === "storyboard" ? 12000 : 8000, stream: false };
  try {
    const upstream = await fetch(endpoints[provider], { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(upstreamBody), signal: AbortSignal.timeout(120_000) });
    const payload = (await upstream.json()) as unknown;
    if (!upstream.ok) return NextResponse.json({ error: safeMessage(provider, upstream.status, payload) }, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
    const text = provider === "openai" ? responseText(payload) : chatText(payload);
    if (!text) return NextResponse.json({ error: "模型返回了空结果，请重试。" }, { status: 502 });
    return NextResponse.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return NextResponse.json({ error: timedOut ? "生成请求超过120秒，请缩短输入后重试。" : "暂时无法连接所选模型服务，请检查网络后重试。" }, { status: 502 });
  }
}

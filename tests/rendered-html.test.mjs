import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders the chuanzhangAIshijie creative workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /船长AI视界/);
  assert.match(html, /船长AI视界公众号二维码/);
  assert.match(html, /故事创作/);
  assert.match(html, /真人感人像提示词/);
  assert.match(html, /静态图像提示词/);
  assert.match(html, /最终分镜/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("rejects an unsupported text provider before making an upstream request", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `api-${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "unknown", apiKey: "secret", stage: "story" }),
  }), {}, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 400);
  assert.match(await response.text(), /文本服务商无效/);
});

test("rejects an invalid Seedance task before making an upstream request", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `video-${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(new Request("http://localhost/api/video", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apiKey: "", model: "", prompt: "" }),
  }), {}, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 400);
  assert.match(await response.text(), /均为必填/);
});

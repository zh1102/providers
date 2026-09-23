"use client";

import { useEffect, useMemo, useState } from "react";

type StageId = "story" | "portrait" | "visual" | "storyboard";
type TextProvider = "openai" | "deepseek" | "zhipu";

const providerModels: Record<TextProvider, Array<{ value: string; label: string }>> = {
  openai: [
    { value: "gpt-5.6-terra", label: "GPT-5.6 Terra · 均衡" },
    { value: "gpt-5.6", label: "GPT-5.6 · 质量" },
    { value: "gpt-5.6-luna", label: "GPT-5.6 Luna · 速度" },
  ],
  deepseek: [
    { value: "deepseek-flash", label: "DeepSeek Flash" },
    { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  ],
  zhipu: [
    { value: "glm-4.5-flash", label: "GLM-4.5 Flash" },
    { value: "glm-4.5", label: "GLM-4.5" },
  ],
};

type ProjectState = {
  name: string;
  idea: string;
  format: string;
  genre: string;
  ratio: string;
  style: string;
  outputs: Partial<Record<StageId, string>>;
};

const stages: Array<{ id: StageId; number: string; eyebrow: string; title: string; description: string; button: string }> = [
  { id: "story", number: "01", eyebrow: "从灵感到完整剧本", title: "故事创作", description: "完成破题、人物、世界观、结构、分场、剧本、自检与评分。", button: "生成01故事草稿" },
  { id: "portrait", number: "02", eyebrow: "锁定人物身份", title: "真人感人像提示词", description: "为主要人物建立统一身份、脸部、服装、光线和真人摄影基准。", button: "生成02真人提示词" },
  { id: "visual", number: "03", eyebrow: "把剧本变成静帧", title: "静态图像提示词", description: "输出场景、道具、人物和关键帧的中英双语七段式提示词。", button: "生成03静态提示词" },
  { id: "storyboard", number: "04", eyebrow: "分镜与人物情绪", title: "最终分镜", description: "确认资产与时间划分，输出逐镜动作、构图、机位、表情和音效。", button: "生成04最终分镜" },
];

const emptyProject: ProjectState = {
  name: "未命名影片",
  idea: "",
  format: "1—3分钟概念短片",
  genre: "悬疑",
  ratio: "9:16 竖屏",
  style: "电影写实，克制、有真实摄影质感",
  outputs: {},
};

const exampleIdeas = [
  "一个失去记忆的女孩，每天醒来都会收到未来的自己寄来的照片。",
  "深夜末班地铁里，老人发现所有乘客都是年轻时的自己。",
  "古代女将军凯旋回城，却在城门下看见已经战死的爱人。",
];

function downloadProject(project: ProjectState) {
  const sections = stages
    .filter((stage) => project.outputs[stage.id])
    .map(
      (stage) =>
        `## ${stage.number} ${stage.title}\n\n${project.outputs[stage.id]}`,
    )
    .join("\n\n---\n\n");
  const text = `# ${project.name}\n\n> ${project.idea}\n\n- 体量：${project.format}\n- 类型：${project.genre}\n- 比例：${project.ratio}\n- 风格：${project.style}\n\n${sections}`;
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${project.name || "船长AI创作项目"}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [project, setProject] = useState<ProjectState>(emptyProject);
  const [activeStage, setActiveStage] = useState<StageId>("story");
  const [provider, setProvider] = useState<TextProvider>("deepseek");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("deepseek-flash");
  const [seedanceKey, setSeedanceKey] = useState("");
  const [seedanceModel, setSeedanceModel] = useState("");
  const [videoPrompt, setVideoPrompt] = useState("");
  const [videoTask, setVideoTask] = useState<{ id?: string; status?: string; videoUrl?: string }>({});
  const [videoLoading, setVideoLoading] = useState(false);
  const [rememberKey, setRememberKey] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [revision, setRevision] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // 延迟到当前 effect 之后恢复本地草稿，避免同步连锁渲染。
    queueMicrotask(() => {
      try {
        const storedProject = localStorage.getItem("captain-ai-project");
        const storedModel = localStorage.getItem("captain-ai-model");
        const storedProvider = localStorage.getItem("captain-ai-provider") as TextProvider | null;
        const selectedProvider = storedProvider && storedProvider in providerModels ? storedProvider : "deepseek";
        const storedKey = localStorage.getItem(`captain-ai-api-key-${selectedProvider}`);
        if (storedProject) setProject(JSON.parse(storedProject));
        if (storedProvider && storedProvider in providerModels) setProvider(storedProvider);
        if (storedModel) setModel(storedModel);
        if (storedKey) {
          setApiKey(storedKey);
          setRememberKey(true);
        }
      } catch {
        // 损坏的本地草稿不能阻塞工作台启动。
      } finally {
        setHydrated(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("captain-ai-project", JSON.stringify(project));
  }, [project, hydrated]);

  const currentIndex = stages.findIndex((stage) => stage.id === activeStage);
  const currentStage = stages[currentIndex];
  const currentOutput = project.outputs[activeStage] ?? "";
  const completedCount = stages.filter((stage) => project.outputs[stage.id]).length;

  const previousContext = useMemo(
    () =>
      stages
        .slice(0, currentIndex)
        .filter((stage) => project.outputs[stage.id])
        .map(
          (stage) =>
            `【${stage.title}】\n${project.outputs[stage.id]}`,
        )
        .join("\n\n"),
    [currentIndex, project.outputs],
  );

  function updateProject<K extends keyof ProjectState>(
    key: K,
    value: ProjectState[K],
  ) {
    setProject((current) => ({ ...current, [key]: value }));
  }

  function saveSettings() {
    localStorage.setItem("captain-ai-provider", provider);
    localStorage.setItem("captain-ai-model", model);
    if (rememberKey) {
      localStorage.setItem(`captain-ai-api-key-${provider}`, apiKey);
    } else {
      localStorage.removeItem(`captain-ai-api-key-${provider}`);
    }
    setSettingsOpen(false);
    setError("");
  }

  function resetProject() {
    if (!window.confirm("新建项目会清空当前本地草稿，是否继续？")) return;
    setProject(emptyProject);
    setActiveStage("story");
    setRevision("");
    setError("");
  }

  async function generate() {
    setError("");
    if (!apiKey.trim()) {
      setSettingsOpen(true);
      setError("请先填写所选文本服务商的 API Key。");
      return;
    }
    if (!project.idea.trim()) {
      setError("先写下一句话灵感，再开始创作。");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          provider,
          model: model.trim(),
          stage: activeStage,
          project: {
            name: project.name,
            idea: project.idea,
            format: project.format,
            genre: project.genre,
            ratio: project.ratio,
            style: project.style,
          },
          previousContext,
          currentDraft: currentOutput,
          revision: revision.trim(),
        }),
      });
      const data = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || !data.text) {
        throw new Error(data.error || "生成失败，请稍后重试。");
      }
      setProject((current) => ({
        ...current,
        outputs: { ...current.outputs, [activeStage]: data.text },
      }));
      setRevision("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "生成失败，请稍后重试。",
      );
    } finally {
      setLoading(false);
    }
  }

  function continueToNext() {
    if (currentIndex < stages.length - 1) {
      setActiveStage(stages[currentIndex + 1].id);
      setRevision("");
      setError("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function createVideoTask() {
    setError("");
    if (!seedanceKey.trim() || !seedanceModel.trim() || !videoPrompt.trim()) {
      setError("请填写火山方舟 Key、Seedance 模型接入点和一条视频提示词。");
      return;
    }
    setVideoLoading(true);
    try {
      const response = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: seedanceKey.trim(), model: seedanceModel.trim(), prompt: videoPrompt.trim(), ratio: project.ratio.startsWith("9:16") ? "9:16" : project.ratio.startsWith("1:1") ? "1:1" : "16:9", duration: 5 }),
      });
      const data = (await response.json()) as { id?: string; status?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error || "Seedance 任务创建失败。");
      setVideoTask({ id: data.id, status: data.status ?? "queued" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Seedance 任务创建失败。");
    } finally {
      setVideoLoading(false);
    }
  }

  async function refreshVideoTask() {
    if (!videoTask.id || !seedanceKey.trim()) return;
    setVideoLoading(true);
    try {
      const response = await fetch(`/api/video?taskId=${encodeURIComponent(videoTask.id)}`, { headers: { "x-ark-api-key": seedanceKey.trim() } });
      const data = (await response.json()) as { status?: string; content?: { video_url?: string }; error?: { message?: string } | string };
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "查询失败。");
      setVideoTask({ id: videoTask.id, status: data.status, videoUrl: data.content?.video_url });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Seedance 状态查询失败。");
    } finally {
      setVideoLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setActiveStage("story")}>
          <span className="brand-mark">船</span>
          <span>
            <strong>船长AI视界</strong>
            <small>创作工作台</small>
          </span>
        </button>
        <div className="topbar-actions">
          <span className="save-state">
            <i />
            草稿已保存在本机
          </span>
          <button className="ghost-button" onClick={resetProject}>
            新建项目
          </button>
          <button className="ghost-button" onClick={() => downloadProject(project)}>
            导出项目
          </button>
          <button
            className={`api-button ${apiKey ? "connected" : ""}`}
            onClick={() => setSettingsOpen(true)}
          >
            <span className="api-dot" />
            {apiKey ? "API 已填写" : "设置 API"}
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="project-block">
            <label htmlFor="project-name">当前项目</label>
            <input
              id="project-name"
              value={project.name}
              onChange={(event) => updateProject("name", event.target.value)}
              aria-label="项目名称"
            />
            <div className="progress-row">
              <span>{completedCount} / {stages.length} 已完成</span>
              <span>{Math.round((completedCount / stages.length) * 100)}%</span>
            </div>
            <div className="progress-track">
              <span style={{ width: `${(completedCount / stages.length) * 100}%` }} />
            </div>
          </div>

          <nav className="stage-nav" aria-label="创作步骤">
            {stages.map((stage, index) => {
              const isActive = stage.id === activeStage;
              const isDone = Boolean(project.outputs[stage.id]);
              // 只有此前阶段均已产出并确认，才能进入后续阶段。
              const isLocked = stages.slice(0, index).some((previous) => !project.outputs[previous.id]);
              return (
                <button
                  key={stage.id}
                  className={`${isActive ? "active" : ""} ${isDone ? "done" : ""}`}
                  onClick={() => {
                    if (isLocked) return;
                    setActiveStage(stage.id);
                    setRevision("");
                    setError("");
                  }}
                  disabled={isLocked}
                >
                  <span className="stage-index">{isDone ? "✓" : stage.number}</span>
                  <span>
                    <small>{stage.eyebrow}</small>
                    <strong>{stage.title}</strong>
                  </span>
                  {index < stages.length - 1 && <i className="stage-line" />}
                </button>
              );
            })}
          </nav>

          <div className="privacy-note">
            <span>KEY</span>
            <p>
              你的 API Key 不进入项目文件，也不会保存在本站服务器。
            </p>
          </div>
        </aside>

        <section className="content">
          <div className="content-head">
            <div>
              <span className="section-number">{currentStage.number}</span>
              <p>{currentStage.eyebrow}</p>
              <h1>{currentStage.title}</h1>
              <div className="orange-rule" />
              <p className="stage-description">{currentStage.description}</p>
            </div>
            <div className="stage-pager">
              <span>{currentIndex + 1}</span>
              <i />
              <span>{stages.length}</span>
            </div>
          </div>

          {activeStage === "story" && (
            <section className="brief-card">
              <div className="card-heading">
                <div>
                  <span>CREATIVE BRIEF</span>
                  <h2>这次想讲一个什么故事？</h2>
                </div>
                <em>必填</em>
              </div>
              <textarea
                className="idea-input"
                value={project.idea}
                onChange={(event) => updateProject("idea", event.target.value)}
                placeholder="写下一句话灵感，不需要完整。例如：一个失去记忆的女孩，每天收到未来的自己寄来的照片……"
              />
              <div className="idea-examples">
                <span>没有头绪？试试：</span>
                {exampleIdeas.map((idea, index) => (
                  <button key={idea} onClick={() => updateProject("idea", idea)}>
                    灵感 {index + 1}
                  </button>
                ))}
              </div>
              <div className="brief-grid">
                <label>
                  影片体量
                  <select
                    value={project.format}
                    onChange={(event) => updateProject("format", event.target.value)}
                  >
                    <option>1—3分钟概念短片</option>
                    <option>5—10分钟短片</option>
                    <option>长片</option>
                    <option>多集微短剧</option>
                  </select>
                </label>
                <label>
                  故事类型
                  <select
                    value={project.genre}
                    onChange={(event) => updateProject("genre", event.target.value)}
                  >
                    <option>悬疑</option>
                    <option>爱情</option>
                    <option>科幻</option>
                    <option>动作</option>
                    <option>喜剧</option>
                    <option>奇幻</option>
                    <option>现实主义</option>
                  </select>
                </label>
                <label>
                  画面比例
                  <select
                    value={project.ratio}
                    onChange={(event) => updateProject("ratio", event.target.value)}
                  >
                    <option>9:16 竖屏</option>
                    <option>16:9 横屏</option>
                    <option>2.39:1 宽银幕</option>
                    <option>1:1 方形</option>
                  </select>
                </label>
                <label>
                  视觉方向
                  <input
                    value={project.style}
                    onChange={(event) => updateProject("style", event.target.value)}
                  />
                </label>
              </div>
            </section>
          )}

          {activeStage !== "story" && (
            <section className="context-strip">
              <div>
                <span>创作依据</span>
                <strong>{project.name}</strong>
              </div>
              <p>{project.idea}</p>
              <button onClick={() => setActiveStage("story")}>修改基础设定</button>
            </section>
          )}

          {currentOutput && (
            <section className="output-card">
              <div className="output-head">
                <div>
                  <span>AI OUTPUT · {currentStage.number}</span>
                  <h2>{currentStage.title}结果</h2>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(currentOutput)}
                  className="copy-button"
                >
                  复制结果
                </button>
              </div>
              <article>{currentOutput}</article>
            </section>
          )}

          <section className="action-card">
            <label htmlFor="revision">
              {currentOutput ? "需要修改什么？" : "补充要求（可选）"}
            </label>
            <textarea
              id="revision"
              value={revision}
              onChange={(event) => setRevision(event.target.value)}
              placeholder={
                currentOutput
                  ? "只写要调整的部分，例如：让主角更克制，结尾不要反转……"
                  : "例如：不需要对白、偏冷色、人物要有东方气质……"
              }
            />
            {error && <p className="error-message">{error}</p>}
            <div className="action-row">
              <p>
                <span className="spark">✦</span>
                {currentOutput
                  ? "修改会保留已经确认的方向，只重做当前步骤。"
                  : "系统会读取此前已经确认的全部创作结果。"}
              </p>
              <div>
                <button
                  className="generate-button"
                  onClick={generate}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner" />
                      正在创作
                    </>
                  ) : (
                    <>
                      <span>✦</span>
                      {currentOutput ? "按意见重新生成" : currentStage.button}
                    </>
                  )}
                </button>
                {currentOutput && currentIndex < stages.length - 1 && (
                  <button className="continue-button" onClick={continueToNext}>
                    确认并进入下一步
                    <span>→</span>
                  </button>
                )}
                {currentOutput && currentIndex === stages.length - 1 && (
                  <button
                    className="continue-button"
                    onClick={() => downloadProject(project)}
                  >
                    导出完整项目
                    <span>↓</span>
                  </button>
                )}
              </div>
            </div>
          </section>

          {activeStage === "storyboard" && currentOutput && (
            <section className="action-card video-card">
              <label htmlFor="video-prompt">Seedance 单条视频生成</label>
              <p>从04结果中复制一条不超过15秒的视频提示词。任务由你的火山方舟账号计费。</p>
              <textarea id="video-prompt" value={videoPrompt} onChange={(event) => setVideoPrompt(event.target.value)} placeholder="粘贴一条 Seedance 视频提示词……" />
              <div className="action-row">
                <p>{videoTask.id ? `任务：${videoTask.id} · ${videoTask.status ?? "未知"}` : "尚未创建视频任务"}</p>
                <div>
                  <button className="generate-button" onClick={createVideoTask} disabled={videoLoading}>{videoLoading ? "处理中" : "创建视频任务"}</button>
                  {videoTask.id && <button className="continue-button" onClick={refreshVideoTask} disabled={videoLoading}>查询状态</button>}
                </div>
              </div>
              {videoTask.videoUrl && <a className="key-help" href={videoTask.videoUrl} target="_blank" rel="noreferrer">打开生成视频 ↗</a>}
            </section>
          )}
        </section>
      </div>

      <section className="official-account" aria-labelledby="official-account-title">
        <img
          src="/wechat-official-account-qr.jpg"
          alt="船长AI视界公众号二维码"
          width="258"
          height="258"
        />
        <div>
          <span>WECHAT OFFICIAL ACCOUNT</span>
          <h2 id="official-account-title">关注船长AI视界</h2>
          <p>
            分享 AI 影视故事创作、图像提示词、真人摄影质感、人物情绪表演、
            影视分镜与视频生成工作流。扫码获取技能更新、创作案例和实用方法。
          </p>
        </div>
      </section>

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <button
              className="modal-close"
              onClick={() => setSettingsOpen(false)}
              aria-label="关闭设置"
            >
              ×
            </button>
            <span className="modal-kicker">AI CONNECTION</span>
            <h2 id="settings-title">连接你自己的 AI 服务</h2>
            <p className="modal-intro">
              文本生成支持 OpenAI、DeepSeek 和智谱 GLM；视频生成使用火山方舟 Seedance。费用由各自账户结算。
            </p>
            <label>
              文本服务商
              <select value={provider} onChange={(event) => {
                const next = event.target.value as TextProvider;
                setProvider(next);
                setModel(providerModels[next][0].value);
                setApiKey(localStorage.getItem(`captain-ai-api-key-${next}`) ?? "");
              }}>
                <option value="deepseek">DeepSeek</option>
                <option value="zhipu">智谱 GLM</option>
                <option value="openai">OpenAI</option>
              </select>
            </label>
            <label>
              {provider === "openai" ? "OpenAI" : provider === "deepseek" ? "DeepSeek" : "智谱 GLM"} API Key
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="填写所选服务商的 API Key"
                autoComplete="off"
              />
            </label>
            <label>
              使用模型
              <select value={model} onChange={(event) => setModel(event.target.value)}>
                {providerModels[provider].map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label>
              火山方舟 API Key（仅视频生成）
              <input type="password" value={seedanceKey} onChange={(event) => setSeedanceKey(event.target.value)} placeholder="填写 Ark API Key" autoComplete="off" />
            </label>
            <label>
              Seedance 模型接入点 ID
              <input value={seedanceModel} onChange={(event) => setSeedanceModel(event.target.value)} placeholder="在方舟控制台复制接入点 ID" />
            </label>
            <label className="remember-row">
              <input
                type="checkbox"
                checked={rememberKey}
                onChange={(event) => setRememberKey(event.target.checked)}
              />
              <span>
                <strong>仅保存在这台设备</strong>
                <small>取消勾选后，关闭页面即需要重新填写。</small>
              </span>
            </label>
            <div className="security-box">
              <strong>Key 如何使用？</strong>
              <p>
                Key 只在点击生成时发送到本站转发接口，再交给所选官方服务；接口不会写入数据库。火山方舟 Key 默认不持久保存。
              </p>
            </div>
            <a
              href={provider === "deepseek" ? "https://platform.deepseek.com/api_keys" : provider === "zhipu" ? "https://open.bigmodel.cn/usercenter/apikeys" : "https://platform.openai.com/api-keys"}
              target="_blank"
              rel="noreferrer"
              className="key-help"
            >
              前往所选服务商创建 API Key
              <span>↗</span>
            </a>
            <button className="save-settings" onClick={saveSettings}>
              保存并开始使用
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

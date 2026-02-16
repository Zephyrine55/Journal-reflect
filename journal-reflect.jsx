import { useState, useEffect, useRef } from "react";
import * as mammoth from "mammoth";

// ─── Background & Utilities ───
const GradientBg = () => (
  <div style={{ position: "fixed", inset: 0, zIndex: 0, background: "linear-gradient(135deg, #0a0a0f 0%, #12121f 40%, #1a1028 70%, #0f0f1a 100%)" }}>
    <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(ellipse at 20% 50%, rgba(120,80,200,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(200,120,80,0.05) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(80,120,200,0.06) 0%, transparent 50%)" }} />
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.03 }}>
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" /></filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
  </div>
);

const Spinner = ({ text }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <div style={{ width: 20, height: 20, border: "2px solid rgba(200,170,255,0.2)", borderTopColor: "rgba(200,170,255,0.8)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    <span style={{ color: "rgba(200,170,255,0.7)", fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>{text || "AI 正在思考中..."}</span>
  </div>
);

const exampleText = `今天和朋友聊了很久，聊到了未来的方向。我发现自己其实一直在回避"我到底想做什么"这个问题。下午试着用 Claude 做了一个小 demo，虽然很简陋但居然跑通了，有一种久违的成就感。晚上看了一部纪录片，讲的是一个普通人如何从零开始做独立游戏，很受触动。

这周开始早睡计划，前三天都做到了，第四天破功了。但我觉得能坚持三天已经是进步。

周末去了一个新的咖啡馆，环境很好，适合工作。遇到了一个也在做 side project 的人，聊了很多，感觉找到了同类。`;

// ─── Shared Styles ───
const cardStyle = {
  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 16, padding: "32px", backdropFilter: "blur(20px)", width: "100%", maxWidth: 640,
};
const btnPrimary = {
  background: "linear-gradient(135deg, rgba(180,140,255,0.9), rgba(140,100,220,0.9))",
  color: "#fff", border: "none", borderRadius: 12, padding: "14px 32px",
  fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
  transition: "all 0.2s ease", letterSpacing: "0.02em",
};
const btnSecondary = {
  background: "rgba(255,255,255,0.05)", color: "rgba(200,170,255,0.8)",
  border: "1px solid rgba(200,170,255,0.15)", borderRadius: 12, padding: "12px 24px",
  fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
  transition: "all 0.2s ease",
};

// ─── Tab Button ───
const TabBtn = ({ active, icon, label, onClick }) => (
  <button onClick={onClick} style={{
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    padding: "10px 0", fontSize: 13, fontWeight: active ? 600 : 400,
    color: active ? "rgba(200,170,255,0.95)" : "rgba(255,255,255,0.35)",
    background: active ? "rgba(180,140,255,0.08)" : "transparent",
    border: "1px solid", borderColor: active ? "rgba(180,140,255,0.2)" : "rgba(255,255,255,0.04)",
    borderRadius: 10, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
    transition: "all 0.2s ease",
  }}>
    <span style={{ fontSize: 16 }}>{icon}</span>{label}
  </button>
);

// ─── File Chips ───
const FileChip = ({ name, onRemove }) => (
  <div style={{
    display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px",
    background: "rgba(180,140,255,0.08)", border: "1px solid rgba(180,140,255,0.15)",
    borderRadius: 8, fontSize: 12, color: "rgba(200,170,255,0.8)",
  }}>
    <span>📄</span>
    <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
    <span onClick={onRemove} style={{ cursor: "pointer", opacity: 0.5, marginLeft: 2 }}>✕</span>
  </div>
);

// ─── Main App ───
export default function JournalReflect() {
  const [step, setStep] = useState("input");
  const [inputMode, setInputMode] = useState("type"); // type | voice | file
  const [journalText, setJournalText] = useState("");
  const [files, setFiles] = useState([]); // {name, text}
  const [isRecording, setIsRecording] = useState(false);
  const [highlights, setHighlights] = useState(null);
  const [interviewQs, setInterviewQs] = useState(null);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState(null);
  const [processingMsg, setProcessingMsg] = useState("");
  const [fadeIn, setFadeIn] = useState(true);

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    setFadeIn(false);
    const t = setTimeout(() => setFadeIn(true), 50);
    return () => clearTimeout(t);
  }, [step]);

  // ── AI call ──
  const callAI = async (messages) => {
    const msgArray = typeof messages === "string"
      ? [{ role: "user", content: messages }]
      : messages;
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: msgArray }),
    });
    const data = await response.json();
    return data.content?.map(i => i.text || "").join("\n") || "";
  };

  const parseJSON = (text) => {
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  };

  // ── Voice Recognition ──
  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("你的浏览器不支持语音识别，请使用 Chrome");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setJournalText(prev => prev + finalTranscript);
      }
    };

    recognition.onerror = (e) => {
      if (e.error !== "no-speech") setError("语音识别出错: " + e.error);
      setIsRecording(false);
    };
    recognition.onend = () => setIsRecording(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setError(null);
  };

  // ── File Upload & Parse ──
  const handleFileUpload = async (e) => {
    const uploadedFiles = Array.from(e.target.files);
    if (!uploadedFiles.length) return;
    setError(null);

    for (const file of uploadedFiles) {
      const ext = file.name.split(".").pop().toLowerCase();
      try {
        let text = "";
        if (ext === "txt" || ext === "md" || ext === "csv") {
          text = await file.text();
        } else if (ext === "docx") {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          text = result.value;
        } else if (ext === "pdf") {
          const base64 = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result.split(",")[1]);
            r.onerror = () => rej(new Error("读取文件失败"));
            r.readAsDataURL(file);
          });
          setProcessingMsg("正在解析 PDF...");
          setStep("processing");
          const pdfResponse = await callAI([{
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
              { type: "text", text: "请提取这个 PDF 中的所有文字内容，原样输出，不要添加任何解释或前缀。" }
            ]
          }]);
          text = pdfResponse;
          setStep("input");
        } else if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
          const mimeMap = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
          const base64 = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result.split(",")[1]);
            r.onerror = () => rej(new Error("读取文件失败"));
            r.readAsDataURL(file);
          });
          setProcessingMsg("正在识别图片文字...");
          setStep("processing");
          const ocrResponse = await callAI([{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mimeMap[ext], data: base64 } },
              { type: "text", text: "请提取这张图片中的所有文字内容，原样输出，不要添加任何解释或前缀。如果是聊天截图，请按对话顺序提取。" }
            ]
          }]);
          text = ocrResponse;
          setStep("input");
        } else {
          setError(`不支持 .${ext} 格式，请上传 txt/md/docx/pdf/图片`);
          continue;
        }

        if (text.trim()) {
          setFiles(prev => [...prev, { name: file.name, text: text.trim() }]);
        }
      } catch (err) {
        setError(`解析 ${file.name} 失败: ${err.message}`);
        setStep("input");
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

  // ── Combine all input ──
  const getAllText = () => {
    const parts = [];
    if (journalText.trim()) parts.push(journalText.trim());
    files.forEach(f => parts.push(`【${f.name}】\n${f.text}`));
    return parts.join("\n\n---\n\n");
  };

  const hasContent = journalText.trim().length > 0 || files.length > 0;

  // ── Submit ──
  const handleSubmit = async () => {
    const text = getAllText();
    if (!text) return;
    setError(null);
    setProcessingMsg("正在提取高光时刻...");
    setStep("processing");
    try {
      const hlText = await callAI(`你是一个温暖而有洞察力的生活教练。请阅读以下日记/周记/月记内容，提取出 3-5 个"高光时刻"。

高光时刻的标准：
- 让作者感到成就感、喜悦、或成长的瞬间
- 突破舒适区或尝试新事物的时刻
- 与他人产生深度连接的时刻
- 对自我有新认知或新发现的时刻

请只返回 JSON，不要有任何其他文字、前缀或 markdown：
{"highlights": [{"title": "简短标题", "detail": "一句话描述这个高光时刻", "emoji": "一个合适的emoji"}]}

日记内容：
${text}`);
      const hlData = parseJSON(hlText);
      setHighlights(hlData.highlights);
      setStep("highlights");
    } catch (err) {
      setError(err.message || "解析失败，请重试");
      setStep("input");
    }
  };

  const generateQuestions = async () => {
    setProcessingMsg("正在生成访谈问题...");
    setStep("processing");
    setError(null);
    try {
      const text = getAllText();
      const qText = await callAI(`你是一个富有同理心的访谈者。基于以下日记内容和提取的高光时刻，生成 5-7 个深度访谈问题。

这些问题应该：
- 帮助作者更深入地反思自己的经历和感受
- 引导作者发现自己可能忽略的成长和变化
- 温暖但有深度，不要泛泛而谈
- 有些问题可以是出人意料的角度

请只返回 JSON，不要有任何其他文字、前缀或 markdown：
{"questions": [{"id": 1, "question": "问题内容", "intent": "这个问题想要探索的方向（简短）"}]}

日记内容：
${text}

高光时刻：
${JSON.stringify(highlights)}`);
      const qData = parseJSON(qText);
      setInterviewQs(qData.questions);
      setStep("interview");
    } catch (err) {
      setError(err.message || "生成问题失败，请重试");
      setStep("highlights");
    }
  };

  const resetAll = () => {
    setStep("input"); setJournalText(""); setFiles([]);
    setHighlights(null); setInterviewQs(null); setAnswers({}); setError(null);
  };

  const containerStyle = {
    position: "relative", zIndex: 1, minHeight: "100vh", display: "flex",
    flexDirection: "column", alignItems: "center", padding: "40px 20px",
    fontFamily: "'DM Sans', sans-serif", opacity: fadeIn ? 1 : 0, transition: "opacity 0.4s ease",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700&family=Noto+Serif+SC:wght@400;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 20px rgba(180,140,255,0.1); } 50% { box-shadow: 0 0 40px rgba(180,140,255,0.2); } }
        @keyframes pulseRing { 0%, 100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.15); opacity: 1; } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow-x: hidden; }
        textarea:focus, input:focus { outline: none; }
        button:hover { transform: translateY(-1px); filter: brightness(1.1); }
        button:active { transform: translateY(0); }
        ::selection { background: rgba(180,140,255,0.3); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(200,170,255,0.2); border-radius: 4px; }
      `}</style>

      <GradientBg />

      <div style={containerStyle}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 44, animation: "fadeUp 0.6s ease" }}>
          <div style={{ fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(200,170,255,0.45)", marginBottom: 14, fontWeight: 500 }}>
            Journal → Reflect → Grow
          </div>
          <h1 style={{ fontFamily: "'Noto Serif SC', serif", fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 700, color: "rgba(255,255,255,0.92)", lineHeight: 1.3, marginBottom: 10 }}>
            回声 · Echo
          </h1>
          <p style={{ color: "rgba(255,255,255,0.38)", fontSize: 14, maxWidth: 440, lineHeight: 1.7, margin: "0 auto" }}>
            打字、语音、上传文件 — 用你最舒服的方式输入日记，<br />AI 帮你找到高光时刻，生成专属访谈问题
          </p>
        </div>

        {/* ═══ INPUT STEP ═══ */}
        {step === "input" && (
          <div style={{ ...cardStyle, animation: "fadeUp 0.5s ease 0.1s both" }}>
            {/* Mode Tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <TabBtn active={inputMode === "type"} icon="✏️" label="打字" onClick={() => setInputMode("type")} />
              <TabBtn active={inputMode === "voice"} icon="🎙️" label="语音" onClick={() => setInputMode("voice")} />
              <TabBtn active={inputMode === "file"} icon="📁" label="上传文件" onClick={() => setInputMode("file")} />
            </div>

            {/* ── Type Mode ── */}
            {inputMode === "type" && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>直接粘贴或输入你的日记内容</span>
                  <button onClick={() => setJournalText(exampleText)} style={{ ...btnSecondary, padding: "4px 12px", fontSize: 11, color: "rgba(200,170,255,0.4)", borderColor: "rgba(200,170,255,0.08)" }}>
                    试试示例
                  </button>
                </div>
                <textarea
                  ref={textareaRef}
                  value={journalText}
                  onChange={(e) => setJournalText(e.target.value)}
                  placeholder={"把你最近的记录粘贴在这里...\n\n可以是微信聊天记录、备忘录、日记 app 的内容，\n任何形式都可以，不需要整理格式。"}
                  style={{
                    width: "100%", minHeight: 200, background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12,
                    padding: 20, color: "rgba(255,255,255,0.85)", fontSize: 15,
                    lineHeight: 1.8, resize: "vertical", fontFamily: "'DM Sans', sans-serif",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => e.target.style.borderColor = "rgba(180,140,255,0.3)"}
                  onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.06)"}
                />
              </>
            )}

            {/* ── Voice Mode ── */}
            {inputMode === "voice" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "20px 0" }}>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, textAlign: "center", lineHeight: 1.7 }}>
                  {isRecording ? "正在听你说... 说完点击停止" : "点击开始录音，用中文说出你的日记内容"}
                </div>

                <div style={{ position: "relative" }}>
                  {isRecording && (
                    <div style={{
                      position: "absolute", inset: -12, borderRadius: "50%",
                      border: "2px solid rgba(255,100,100,0.3)",
                      animation: "pulseRing 1.5s ease infinite",
                    }} />
                  )}
                  <button onClick={toggleRecording} style={{
                    width: 80, height: 80, borderRadius: "50%",
                    background: isRecording
                      ? "linear-gradient(135deg, rgba(255,100,100,0.9), rgba(220,60,60,0.9))"
                      : "linear-gradient(135deg, rgba(180,140,255,0.9), rgba(140,100,220,0.9))",
                    border: "none", cursor: "pointer", fontSize: 32,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.3s ease",
                    boxShadow: isRecording ? "0 0 30px rgba(255,100,100,0.3)" : "0 0 20px rgba(180,140,255,0.2)",
                  }}>
                    {isRecording ? "⏹" : "🎙️"}
                  </button>
                </div>

                {journalText && (
                  <div style={{
                    width: "100%", maxHeight: 180, overflowY: "auto",
                    background: "rgba(0,0,0,0.25)", borderRadius: 12, padding: 16,
                    color: "rgba(255,255,255,0.75)", fontSize: 14, lineHeight: 1.8,
                    border: "1px solid rgba(255,255,255,0.04)",
                  }}>
                    {journalText}
                  </div>
                )}
                <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>
                  语音识别后的文字也可以在「打字」tab 里编辑
                </span>
              </div>
            )}

            {/* ── File Mode ── */}
            {inputMode === "file" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".txt,.md,.csv,.docx,.pdf,.png,.jpg,.jpeg,.webp"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "rgba(180,140,255,0.4)"; }}
                  onDragLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                    if (e.dataTransfer.files.length) {
                      handleFileUpload({ target: { files: e.dataTransfer.files } });
                    }
                  }}
                  style={{
                    border: "2px dashed rgba(255,255,255,0.08)", borderRadius: 14,
                    padding: "36px 20px", textAlign: "center", cursor: "pointer",
                    transition: "all 0.2s ease", background: "rgba(0,0,0,0.15)",
                  }}
                >
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📂</div>
                  <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
                    点击或拖拽上传文件
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, lineHeight: 1.6 }}>
                    支持 txt · md · docx · pdf · 图片（截图/照片）
                    <br />上传截图会自动 OCR 识别文字
                  </div>
                </div>

                {files.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {files.map((f, i) => (
                      <FileChip key={i} name={f.name} onRemove={() => removeFile(i)} />
                    ))}
                  </div>
                )}

                {files.length > 0 && (
                  <div style={{
                    maxHeight: 160, overflowY: "auto", background: "rgba(0,0,0,0.2)",
                    borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 1.7,
                    color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.04)",
                  }}>
                    {files.map((f, i) => (
                      <div key={i} style={{ marginBottom: i < files.length - 1 ? 12 : 0 }}>
                        <span style={{ color: "rgba(200,170,255,0.5)", fontSize: 11 }}>📄 {f.name}</span>
                        <div style={{ marginTop: 4 }}>{f.text.slice(0, 200)}{f.text.length > 200 ? "..." : ""}</div>
                      </div>
                    ))}
                  </div>
                )}

                <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, textAlign: "center" }}>
                  也可以同时在「打字」tab 添加更多内容，所有输入会合并处理
                </span>
              </div>
            )}

            {/* ── Content summary & Submit ── */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, flexWrap: "wrap", gap: 12 }}>
              <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
                {journalText.trim() ? `${journalText.length} 字` : ""}
                {journalText.trim() && files.length > 0 ? " + " : ""}
                {files.length > 0 ? `${files.length} 个文件` : ""}
              </div>
              <button onClick={handleSubmit} style={{
                ...btnPrimary,
                opacity: hasContent ? 1 : 0.4,
                pointerEvents: hasContent ? "auto" : "none",
              }}>
                提取高光时刻 ✦
              </button>
            </div>

            {error && (
              <div style={{ color: "rgba(255,120,120,0.8)", fontSize: 13, marginTop: 12 }}>{error}</div>
            )}
          </div>
        )}

        {/* ═══ PROCESSING ═══ */}
        {step === "processing" && (
          <div style={{ ...cardStyle, animation: "pulseGlow 2s ease infinite, fadeUp 0.5s ease both", display: "flex", justifyContent: "center", alignItems: "center", minHeight: 200 }}>
            <Spinner text={processingMsg} />
          </div>
        )}

        {/* ═══ HIGHLIGHTS ═══ */}
        {step === "highlights" && highlights && (
          <div style={{ width: "100%", maxWidth: 640, animation: "fadeUp 0.5s ease both" }}>
            <div style={{ color: "rgba(200,170,255,0.5)", fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 16, fontWeight: 500 }}>
              ✦ 你的高光时刻
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
              {highlights.map((h, i) => (
                <div key={i} style={{ ...cardStyle, padding: "20px 24px", animation: `fadeUp 0.4s ease ${0.1 * (i + 1)}s both`, display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 28, lineHeight: 1 }}>{h.emoji}</span>
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.88)", fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{h.title}</div>
                    <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, lineHeight: 1.6 }}>{h.detail}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button onClick={() => { setStep("input"); setHighlights(null); }} style={btnSecondary}>← 重新来</button>
              <button onClick={generateQuestions} style={btnPrimary}>生成访谈问题 ✦</button>
            </div>
            {error && <div style={{ color: "rgba(255,120,120,0.8)", fontSize: 13, marginTop: 12, textAlign: "center" }}>{error}</div>}
          </div>
        )}

        {/* ═══ INTERVIEW ═══ */}
        {step === "interview" && interviewQs && (
          <div style={{ width: "100%", maxWidth: 640, animation: "fadeUp 0.5s ease both" }}>
            <div style={{ color: "rgba(200,170,255,0.5)", fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8, fontWeight: 500 }}>
              ✦ 你的专属访谈
            </div>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginBottom: 28, lineHeight: 1.6 }}>
              慢慢回答，没有对错。写下的过程本身就是反思。
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {interviewQs.map((q, i) => (
                <div key={q.id} style={{ ...cardStyle, padding: "24px 28px", animation: `fadeUp 0.4s ease ${0.08 * (i + 1)}s both` }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 4 }}>
                    <span style={{ color: "rgba(180,140,255,0.6)", fontSize: 13, fontWeight: 700, minWidth: 28, fontFamily: "'Noto Serif SC', serif" }}>Q{q.id}</span>
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.88)", fontSize: 15, fontWeight: 500, lineHeight: 1.7, marginBottom: 6 }}>{q.question}</div>
                      <div style={{ color: "rgba(200,170,255,0.3)", fontSize: 12, fontStyle: "italic" }}>{q.intent}</div>
                    </div>
                  </div>
                  <textarea
                    value={answers[q.id] || ""}
                    onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="写下你的回答..."
                    style={{
                      width: "100%", minHeight: 80, marginTop: 16, background: "rgba(0,0,0,0.25)",
                      border: "1px solid rgba(255,255,255,0.04)", borderRadius: 10,
                      padding: 16, color: "rgba(255,255,255,0.8)", fontSize: 14,
                      lineHeight: 1.8, resize: "vertical", fontFamily: "'DM Sans', sans-serif",
                      transition: "border-color 0.2s",
                    }}
                    onFocus={(e) => e.target.style.borderColor = "rgba(180,140,255,0.2)"}
                    onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.04)"}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 36, marginBottom: 60 }}>
              <button onClick={resetAll} style={btnSecondary}>开始新的一轮</button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: "auto", paddingTop: 60, textAlign: "center", color: "rgba(255,255,255,0.15)", fontSize: 11, letterSpacing: "0.1em" }}>
          ECHO · 用 AI 倾听自己
        </div>
      </div>
    </>
  );
}

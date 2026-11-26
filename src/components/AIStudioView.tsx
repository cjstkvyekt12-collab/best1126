import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  MapPin,
  MessageSquare,
  Music,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { GroundingMapSource } from '../types/youthMap';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  modelUsed?: string;
  sources?: GroundingMapSource[];
}

interface AIStudioViewProps {
  userLocation: google.maps.LatLngLiteral | null;
}

const CHAT_STARTER_PROMPTS = [
  '금산읍 중학생이 주말에 친구들과 갈 만한 문화·체육 활동 코스를 추천해줘',
  '금산군에서 조용히 공부하거나 독서할 수 있는 도서관과 이용 팁 알려줘',
  '고등학생 진로·봉사 활동을 금산 지역 공간과 연계해서 기획하는 방법 알려줘',
];

const IMAGE_PRESET_PROMPTS = [
  '금산군 청소년 밴드·댄스 페스티벌 포스터 일러스트, 산뜻한 청록색과 따뜻한 노을빛, 깔끔한 현대 그래픽 디자인',
  '금산 생태숲 청소년 자연 탐방 동아리 활동 배지 로고, 미니멀 플랫 벡터 스타일, 소나무와 나침반 모티프',
  '밝고 쾌적한 금산 청소년 독서 토론 모임 홍보 카드 배경, 따뜻한 햇살과 책상 위 노트, 감성 에디토리얼 스타일',
];

const MUSIC_PRESET_PROMPTS = [
  'Upbeat indie acoustic guitar and bright synth-pop track for a South Korean youth cultural festival in Geumsan valley, energetic and hopeful mood, 118 BPM',
  'Calm lo-fi chillhop study beat with warm Rhodes piano, soft vinyl crackle, and gentle flute inspired by a quiet library surrounded by pine mountains',
  'Energetic brass and percussive sports day cheering anthem for high school students, uplifting rhythm and celebratory chorus',
];

function readFileAsBase64(
  file: File
): Promise<{ base64: string; mimeType: string; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      if (commaIdx === -1) {
        reject(new Error('파일을 읽지 못했습니다.'));
        return;
      }
      resolve({
        base64: result.slice(commaIdx + 1),
        mimeType: file.type || 'image/png',
        previewUrl: result,
      });
    };
    reader.onerror = () => reject(new Error('이미지 파일을 읽는 중 오류가 발생했습니다.'));
    reader.readAsDataURL(file);
  });
}

export function AIStudioView({ userLocation }: AIStudioViewProps) {
  const [studioTab, setStudioTab] = useState<'chat' | 'image' | 'music'>('chat');

  // --- 1. Multi-turn Gemini Chatbot State ---
  const [chatModel, setChatModel] = useState<
    'gemini-4-hydrogen' | 'gemini-3.1-flash-lite' | 'gemini-4-neon' | 'gemini-4-carbon'
  >('gemini-4-hydrogen');
  const [useMapsGrounding, setUseMapsGrounding] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      role: 'model',
      text: '안녕하세요! 금산 청소년 활동 AI 멘토입니다.\n관심 분야, 나이, 방과 후 또는 주말 일정에 맞는 금산군 활동 공간과 프로그램 아이디어를 물어보세요. Google 지도 연동을 켜두면 최신 장소 정보와 지도 링크를 함께 안내해 드립니다.',
      modelUsed: 'gemini-4-hydrogen',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  const sendChatMessage = async (textOverride?: string) => {
    const content = (textOverride ?? chatInput).trim();
    if (!content || chatLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: content,
    };

    const historyPayload = messages
      .filter((m) => m.id !== 'welcome-msg')
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setChatError(null);
    setChatLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          history: historyPayload,
          model: chatModel,
          useMapsGrounding,
          latLng: userLocation,
        }),
      });
      const data = (await res.json()) as {
        text?: string;
        modelUsed?: string;
        sources?: GroundingMapSource[];
        error?: string;
      };

      if (!res.ok) {
        setChatError(data.error || '챗봇 응답을 가져오지 못했습니다.');
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `model-${Date.now()}`,
          role: 'model',
          text: data.text || '',
          modelUsed: data.modelUsed,
          sources: data.sources ?? [],
        },
      ]);
    } catch {
      setChatError('네트워크 오류로 AI 멘토와 연결하지 못했습니다.');
    } finally {
      setChatLoading(false);
    }
  };

  // --- 2. Image Create & Edit State (gemini-nano-banana-2.1) ---
  const [imgPrompt, setImgPrompt] = useState('');
  const [imgAspectRatio, setImgAspectRatio] = useState<'1:1' | '16:9' | '4:3' | '3:4'>('4:3');
  const [imgSize, setImgSize] = useState<'1K' | '2K'>('1K');
  const [sourceImg, setSourceImg] = useState<{
    base64: string;
    mimeType: string;
    previewUrl: string;
    name: string;
  } | null>(null);
  const [generatedImgUrl, setGeneratedImgUrl] = useState<string | null>(null);
  const [generatedCaption, setGeneratedCaption] = useState<string>('');
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);

  const handleImageFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      setImgError('이미지는 6MB 이하의 PNG/JPEG/WebP 파일만 업로드할 수 있습니다.');
      return;
    }
    try {
      const parsed = await readFileAsBase64(file);
      setSourceImg({ ...parsed, name: file.name });
      setImgError(null);
    } catch (err) {
      setImgError(err instanceof Error ? err.message : '이미지 업로드 실패');
    }
  };

  const handleGenerateImage = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = imgPrompt.trim();
    if (!trimmed || imgLoading) return;

    setImgLoading(true);
    setImgError(null);

    try {
      const res = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmed,
          aspectRatio: imgAspectRatio,
          imageSize: imgSize,
          sourceImageBase64: sourceImg?.base64,
          sourceImageMimeType: sourceImg?.mimeType,
        }),
      });
      const data = (await res.json()) as {
        imageDataUrl?: string;
        caption?: string;
        error?: string;
      };

      if (!res.ok) {
        setImgError(data.error || '이미지 생성에 실패했습니다.');
        return;
      }

      setGeneratedImgUrl(data.imageDataUrl ?? null);
      setGeneratedCaption(data.caption ?? '');
    } catch {
      setImgError('네트워크 오류로 이미지 생성에 실패했습니다.');
    } finally {
      setImgLoading(false);
    }
  };

  const handleUseGeneratedAsEditSource = () => {
    if (!generatedImgUrl) return;
    const match = generatedImgUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return;
    setSourceImg({
      mimeType: match[1],
      base64: match[2],
      previewUrl: generatedImgUrl,
      name: '생성된 이미지 (편집 대상)',
    });
  };

  // --- 3. Music Studio State (lyria-3-clip-preview / lyria-3-pro-preview) ---
  const [musicPrompt, setMusicPrompt] = useState('');
  const [musicMode, setMusicMode] = useState<'clip' | 'pro'>('clip');
  const [musicRefImg, setMusicRefImg] = useState<{
    base64: string;
    mimeType: string;
    previewUrl: string;
    name: string;
  } | null>(null);
  const [musicAudioUrl, setMusicAudioUrl] = useState<string | null>(null);
  const [musicLyrics, setMusicLyrics] = useState<string>('');
  const [musicModelUsed, setMusicModelUsed] = useState<string>('');
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicError, setMusicError] = useState<string | null>(null);

  const handleMusicRefUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      setMusicError('이미지는 6MB 이하만 업로드할 수 있습니다.');
      return;
    }
    try {
      const parsed = await readFileAsBase64(file);
      setMusicRefImg({ ...parsed, name: file.name });
      setMusicError(null);
    } catch (err) {
      setMusicError(err instanceof Error ? err.message : '이미지 업로드 실패');
    }
  };

  const handleGenerateMusic = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = musicPrompt.trim();
    if (!trimmed || musicLoading) return;

    setMusicLoading(true);
    setMusicError(null);

    try {
      const res = await fetch('/api/music/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmed,
          mode: musicMode,
          sourceImageBase64: musicRefImg?.base64,
          sourceImageMimeType: musicRefImg?.mimeType,
        }),
      });
      const data = (await res.json()) as {
        audioDataUrl?: string;
        lyrics?: string;
        modelUsed?: string;
        error?: string;
      };

      if (!res.ok) {
        setMusicError(data.error || '음악 생성에 실패했습니다.');
        return;
      }

      setMusicAudioUrl(data.audioDataUrl ?? null);
      setMusicLyrics(data.lyrics ?? '');
      setMusicModelUsed(data.modelUsed ?? '');
    } catch {
      setMusicError('네트워크 오류로 음악 생성에 실패했습니다.');
    } finally {
      setMusicLoading(false);
    }
  };

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50 p-5 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Studio Header & Segmented Tabs */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              금산 청소년 활동 AI 스튜디오
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              실시간 지도 연동 AI 멘토 상담부터 동아리 포스터 이미지 제작·편집,
              활동 BGM 작곡까지 한곳에서 지원합니다.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="AI 스튜디오 도구 선택"
            className="inline-flex p-1 bg-slate-200/70 rounded-lg self-start md:self-auto"
          >
            {(
              [
                { id: 'chat', label: 'AI 멘토 챗봇', icon: MessageSquare },
                { id: 'image', label: '이미지 제작·편집', icon: ImageIcon },
                { id: 'music', label: '동아리 BGM 작곡', icon: Music },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = studioTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStudioTab(tab.id)}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-white text-teal-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* TAB 1: Multi-turn Gemini Chatbot */}
        {studioTab === 'chat' && (
          <section className="bg-white border border-slate-200 rounded-xl flex flex-col h-[680px] max-h-[calc(100vh-220px)] overflow-hidden">
            {/* Chat Config Bar */}
            <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 shrink-0">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                  <span>응답 모델</span>
                  <select
                    value={useMapsGrounding ? 'gemini-4-hydrogen' : chatModel}
                    disabled={useMapsGrounding}
                    onChange={(e) =>
                      setChatModel(
                        e.target.value as
                          | 'gemini-4-hydrogen'
                          | 'gemini-3.1-flash-lite'
                          | 'gemini-4-neon'
                          | 'gemini-4-carbon'
                      )
                    }
                    className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-teal-700 disabled:opacity-60"
                  >
                    <option value="gemini-4-hydrogen">
                      일반 상담 (gemini-4-hydrogen)
                    </option>
                    <option value="gemini-3.1-flash-lite">
                      빠른 답변 (gemini-3.1-flash-lite)
                    </option>
                    <option value="gemini-4-neon">
                      심화 기획 (gemini-4-neon · 유료 키)
                    </option>
                    <option value="gemini-4-carbon">
                      깊은 추론 (gemini-4-carbon · 유료 키)
                    </option>
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => setUseMapsGrounding((prev) => !prev)}
                  aria-pressed={useMapsGrounding}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                    useMapsGrounding
                      ? 'bg-teal-50 border-teal-300 text-teal-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  Google 지도 데이터 연동 {useMapsGrounding ? '켜짐' : '꺼짐'}
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMessages((prev) => [prev[0]]);
                  setChatError(null);
                }}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                대화 초기화
              </button>
            </div>

            {/* Scrollable Message Thread */}
            <div className="flex-1 overflow-y-auto panel-scroll p-5 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-100 text-slate-800 border border-slate-200/70'
                    }`}
                  >
                    {msg.text}

                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5">
                        <div className="text-[11px] font-semibold text-slate-500">
                          Google 지도 참조 링크
                        </div>
                        {msg.sources.map((src, idx) => (
                          <div key={`${src.uri}-${idx}`} className="text-xs">
                            <a
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-teal-800 font-semibold hover:underline inline-flex items-center gap-1"
                            >
                              <MapPin className="w-3 h-3 shrink-0" />
                              {src.title}
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                            {src.reviewSnippets.length > 0 && (
                              <p className="text-[11px] text-slate-600 pl-4 mt-0.5">
                                &ldquo;{src.reviewSnippets[0]}&rdquo;
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {msg.role === 'model' && msg.modelUsed && (
                    <span className="text-[11px] text-slate-400 mt-1 px-1 font-mono">
                      {msg.modelUsed}
                    </span>
                  )}
                </div>
              ))}

              {chatLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
                  금산 활동 정보를 확인하며 답변을 작성 중입니다...
                </div>
              )}

              {chatError && (
                <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span>{chatError}</span>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Starter Prompts */}
            {messages.length <= 1 && (
              <div className="px-5 pb-2 flex flex-wrap gap-2">
                {CHAT_STARTER_PROMPTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void sendChatMessage(q)}
                    className="text-left text-xs text-slate-700 bg-slate-50 hover:bg-teal-50 border border-slate-200 hover:border-teal-200 rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Chat Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendChatMessage();
              }}
              className="p-4 border-t border-slate-200 flex items-center gap-2 bg-white shrink-0"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="금산 청소년 시설, 프로그램, 방과 후 코스 등을 물어보세요..."
                aria-label="AI 멘토에게 질문 입력"
                className="flex-1 px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-teal-700"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="px-4 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Send className="w-4 h-4" />
                전송
              </button>
            </form>
          </section>
        )}

        {/* TAB 2: Image Generation & Editing (gemini-nano-banana-2.1) */}
        {studioTab === 'image' && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <form
              onSubmit={handleGenerateImage}
              className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
            >
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  활동 포스터·카드 이미지 제작 및 편집
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  텍스트로 새 이미지를 만들거나 기존 사진을 올려 편집할 수
                  있습니다. (모델: gemini-nano-banana-2.1)
                </p>
              </div>

              {/* Optional Source Image for Editing */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-700 block">
                  편집할 원본 이미지 (선택 사항)
                </span>
                {sourceImg ? (
                  <div className="relative rounded-lg border border-slate-200 overflow-hidden bg-slate-50 p-2 flex items-center gap-3">
                    <img
                      src={sourceImg.previewUrl}
                      alt="업로드된 편집 원본"
                      className="w-16 h-16 rounded object-cover shrink-0"
                    />
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="font-medium text-slate-800 truncate">
                        {sourceImg.name}
                      </div>
                      <div className="text-slate-500">
                        프롬프트 내용대로 이 이미지를 편집합니다
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSourceImg(null)}
                      aria-label="원본 이미지 제거"
                      className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-slate-300 rounded-lg text-xs text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors">
                    <Upload className="w-4 h-4 text-slate-400" />
                    <span>이미지 파일 업로드하여 편집하기 (PNG/JPG/WebP)</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => void handleImageFileUpload(e)}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Prompt */}
              <div className="space-y-1.5">
                <label
                  htmlFor="image-prompt-input"
                  className="text-xs font-semibold text-slate-700 block"
                >
                  {sourceImg ? '편집 지시 프롬프트' : '이미지 생성 프롬프트'}
                </label>
                <textarea
                  id="image-prompt-input"
                  rows={4}
                  value={imgPrompt}
                  onChange={(e) => setImgPrompt(e.target.value)}
                  placeholder="예: 금산군 청소년 문화축제 포스터, 푸른 산과 별빛 아래 공연하는 밴드 일러스트..."
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-teal-700"
                />
              </div>

              {/* Preset Prompts */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-medium text-slate-500 block">
                  추천 프롬프트 예시
                </span>
                <div className="flex flex-col gap-1.5">
                  {IMAGE_PRESET_PROMPTS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setImgPrompt(preset)}
                      className="text-left text-xs text-slate-600 hover:text-teal-800 bg-slate-50 hover:bg-teal-50/70 border border-slate-200 rounded-md px-2.5 py-1.5 transition-colors cursor-pointer line-clamp-2"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect Ratio & Size */}
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600 block">
                    화면 비율
                  </span>
                  <select
                    value={imgAspectRatio}
                    onChange={(e) =>
                      setImgAspectRatio(
                        e.target.value as '1:1' | '16:9' | '4:3' | '3:4'
                      )
                    }
                    className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="1:1">1:1 (정사각형 카드)</option>
                    <option value="4:3">4:3 (활동 소개)</option>
                    <option value="16:9">16:9 (와이드 배너)</option>
                    <option value="3:4">3:4 (세로 포스터)</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600 block">
                    해상도
                  </span>
                  <select
                    value={imgSize}
                    onChange={(e) => setImgSize(e.target.value as '1K' | '2K')}
                    className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="1K">1K (표준)</option>
                    <option value="2K">2K (고해상도)</option>
                  </select>
                </label>
              </div>

              <button
                type="submit"
                disabled={imgLoading || !imgPrompt.trim()}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {imgLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    이미지 생성 중...
                  </>
                ) : sourceImg ? (
                  '이미지 편집 실행'
                ) : (
                  '이미지 생성하기'
                )}
              </button>
            </form>

            {/* Output Preview */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 min-h-[420px] flex flex-col justify-between gap-4">
              {imgError && (
                <div className="flex items-start gap-2 p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 leading-relaxed">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                  <span>{imgError}</span>
                </div>
              )}

              {generatedImgUrl ? (
                <div className="space-y-4">
                  <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                    <img
                      src={generatedImgUrl}
                      alt="AI로 생성된 금산 청소년 활동 이미지"
                      className="w-full h-auto max-h-[460px] object-contain mx-auto"
                    />
                  </div>
                  {generatedCaption && (
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {generatedCaption}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={generatedImgUrl}
                      download="geumsan-youth-activity.png"
                      className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg inline-flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      PNG 다운로드
                    </a>
                    <button
                      type="button"
                      onClick={handleUseGeneratedAsEditSource}
                      className="px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                    >
                      이 결과물을 이어서 편집하기
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-12 space-y-2">
                  <ImageIcon className="w-10 h-10 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-700">
                    생성된 활동 이미지가 이곳에 표시됩니다
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                    동아리 홍보 포스터, 봉사단 배지, 체험 활동 카드뉴스 배경을
                    만들거나 직접 찍은 사진을 편집해 보세요.
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB 3: Music Generation Studio (Lyria 3) */}
        {studioTab === 'music' && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <form
              onSubmit={handleGenerateMusic}
              className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
            >
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  동아리·행사 BGM 음악 작곡
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  활동 분위기 설명만으로 30초 숏클립 또는 풀 트랙 MP3를 생성합니다.
                </p>
              </div>

              {/* Lyria Model Mode */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setMusicMode('clip')}
                  className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    musicMode === 'clip'
                      ? 'bg-white text-teal-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  30초 숏클립 (Lyria Clip)
                </button>
                <button
                  type="button"
                  onClick={() => setMusicMode('pro')}
                  className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    musicMode === 'pro'
                      ? 'bg-white text-teal-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  풀 트랙 (Lyria Pro)
                </button>
              </div>

              {/* Music Prompt */}
              <div className="space-y-1.5">
                <label
                  htmlFor="music-prompt-input"
                  className="text-xs font-semibold text-slate-700 block"
                >
                  음악 분위기·장르·악기 프롬프트
                </label>
                <textarea
                  id="music-prompt-input"
                  rows={4}
                  value={musicPrompt}
                  onChange={(e) => setMusicPrompt(e.target.value)}
                  placeholder="예: 경쾌한 어쿠스틱 기타와 신디사이저가 어우러진 청소년 문화축제 오프닝 BGM, 118 BPM..."
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-teal-700"
                />
              </div>

              {/* Presets */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-medium text-slate-500 block">
                  활동별 추천 BGM 프롬프트
                </span>
                <div className="flex flex-col gap-1.5">
                  {MUSIC_PRESET_PROMPTS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setMusicPrompt(preset)}
                      className="text-left text-xs text-slate-600 hover:text-teal-800 bg-slate-50 hover:bg-teal-50/70 border border-slate-200 rounded-md px-2.5 py-1.5 transition-colors cursor-pointer line-clamp-2"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Reference Image */}
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-slate-600 block">
                  영감 이미지 첨부 (선택 사항)
                </span>
                {musicRefImg ? (
                  <div className="rounded-lg border border-slate-200 p-2 flex items-center gap-2.5 bg-slate-50">
                    <img
                      src={musicRefImg.previewUrl}
                      alt="음악 생성 참고 이미지"
                      className="w-12 h-12 rounded object-cover shrink-0"
                    />
                    <span className="text-xs text-slate-700 truncate flex-1">
                      {musicRefImg.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMusicRefImg(null)}
                      aria-label="이미지 제거"
                      className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 px-3 py-2.5 border border-dashed border-slate-300 rounded-lg text-xs text-slate-600 hover:bg-slate-50 cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-slate-400" />
                    <span>활동 사진 분위기에 맞춰 작곡하기</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => void handleMusicRefUpload(e)}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              <button
                type="submit"
                disabled={musicLoading || !musicPrompt.trim()}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {musicLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    음악 트랙 생성 중...
                  </>
                ) : (
                  'BGM 트랙 생성하기'
                )}
              </button>
            </form>

            {/* Audio Output */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 min-h-[380px] flex flex-col justify-between gap-4">
              {musicError && (
                <div className="flex items-start gap-2 p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 leading-relaxed">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                  <span>{musicError}</span>
                </div>
              )}

              {musicAudioUrl ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="text-sm font-bold text-slate-900">
                      생성 완료된 활동 BGM
                    </div>
                    {musicModelUsed && (
                      <span className="text-xs font-mono text-slate-500">
                        {musicModelUsed}
                      </span>
                    )}
                  </div>

                  <audio
                    controls
                    src={musicAudioUrl}
                    className="w-full"
                  />

                  <div className="flex items-center gap-2">
                    <a
                      href={musicAudioUrl}
                      download="geumsan-youth-bgm.mp3"
                      className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg inline-flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      MP3 다운로드
                    </a>
                  </div>

                  {musicLyrics && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1.5">
                      <div className="text-xs font-semibold text-slate-700">
                        트랙 가사 및 구성 노트
                      </div>
                      <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans leading-relaxed">
                        {musicLyrics}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-12 space-y-2">
                  <Music className="w-10 h-10 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-700">
                    생성된 오디오 플레이어가 이곳에 표시됩니다
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                    축제 오프닝, 독서·학습 집중 로파이, 체육대회 응원가 등
                    원하는 활동 BGM을 Lyria 모델로 바로 만들어 재생하세요.
                  </p>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

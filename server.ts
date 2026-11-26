import 'dotenv/config';
import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, type Content, type Part } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const ALLOWED_CHAT_MODELS = new Set([
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
  'gemini-4-neon',
  'gemini-4-carbon',
]);

const ALLOWED_ASPECT_RATIOS = new Set(['1:1', '16:9', '4:3', '3:4', '9:16']);
const ALLOWED_IMAGE_SIZES = new Set(['1K', '2K']);
const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ALLOWED_TRAVEL_MODES = new Set(['TRANSIT', 'DRIVING', 'WALKING']);
const PLACE_ID_REGEX = /^[A-Za-z0-9_-]{1,200}$/;
const SHORT_CODE_REGEX = /^[A-Za-z0-9_-]{6,16}$/;
const MAX_SHARED_COURSES = 2000;
const COURSE_SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface SharedCourseStopPayload {
  placeId?: string;
  lat?: number;
  lng?: number;
  label?: string;
  isCurrentLocation?: boolean;
}

interface SharedCourseRecord {
  code: string;
  travelMode: 'TRANSIT' | 'DRIVING' | 'WALKING';
  stops: SharedCourseStopPayload[];
  createdAt: number;
  expiresAt: number;
}

const sharedCourseByCode = new Map<string, SharedCourseRecord>();
const sharedCodeByDigest = new Map<string, string>();

function pruneExpiredCourses(now: number) {
  for (const [code, rec] of sharedCourseByCode.entries()) {
    if (rec.expiresAt <= now) {
      sharedCourseByCode.delete(code);
    }
  }
  for (const [digest, code] of sharedCodeByDigest.entries()) {
    if (!sharedCourseByCode.has(code)) {
      sharedCodeByDigest.delete(digest);
    }
  }
}

function generateShortCode(): string {
  for (let i = 0; i < 8; i++) {
    const candidate = crypto.randomBytes(6).toString('base64url').slice(0, 8);
    if (!sharedCourseByCode.has(candidate)) {
      return candidate;
    }
  }
  return crypto.randomBytes(8).toString('base64url').slice(0, 10);
}

const GEUMSAN_DEFAULT_COORDS = {
  latitude: 36.1086,
  longitude: 127.4882,
};

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface ExtractedMapSource {
  title: string;
  uri: string;
  reviewSnippets: string[];
}

function isSafeHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function extractMapsGroundingSources(response: unknown): ExtractedMapSource[] {
  const sources: ExtractedMapSource[] = [];
  const seen = new Set<string>();

  const candidates = (
    response as {
      candidates?: Array<{
        groundingMetadata?: {
          groundingChunks?: Array<{
            maps?: {
              uri?: string;
              title?: string;
              placeAnswerSources?: {
                reviewSnippets?: Array<{
                  content?: string;
                  text?: string;
                  reviewUri?: string;
                }>;
              };
            };
            web?: {
              uri?: string;
              title?: string;
            };
          }>;
        };
      }>;
    }
  )?.candidates;

  const chunks = candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  for (const chunk of chunks) {
    if (chunk.maps?.uri && isSafeHttpUrl(chunk.maps.uri)) {
      const uri = chunk.maps.uri;
      if (seen.has(uri)) continue;
      seen.add(uri);

      const snippets = (
        chunk.maps.placeAnswerSources?.reviewSnippets ?? []
      )
        .map((s) => s.content || s.text || '')
        .filter((s) => s.trim().length > 0)
        .slice(0, 2);

      sources.push({
        title: chunk.maps.title || 'Google 지도 장소 정보',
        uri,
        reviewSnippets: snippets,
      });
    } else if (chunk.web?.uri && isSafeHttpUrl(chunk.web.uri)) {
      const uri = chunk.web.uri;
      if (seen.has(uri)) continue;
      seen.add(uri);
      sources.push({
        title: chunk.web.title || '관련 웹 출처',
        uri,
        reviewSnippets: [],
      });
    }
  }
  return sources;
}

function formatApiError(err: unknown, paidModelHint = false): {
  status: number;
  message: string;
} {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null
        ? JSON.stringify(err)
        : String(err ?? '');
  const upper = raw.toUpperCase();

  if (
    upper.includes('API_KEY_INVALID') ||
    upper.includes('PERMISSION_DENIED') ||
    upper.includes('403')
  ) {
    return {
      status: 403,
      message:
        'Gemini API 키 인증에 실패했습니다. Settings > Secrets 패널에서 유효한 API 키가 설정되어 있는지 확인해 주세요.',
    };
  }

  if (
    upper.includes('RESOURCE_EXHAUSTED') ||
    upper.includes('QUOTA') ||
    upper.includes('429') ||
    upper.includes('BILLING')
  ) {
    return {
      status: 429,
      message: paidModelHint
        ? '이 기능은 유료 결제(Billing)가 활성화된 Gemini API 키가 필요한 모델입니다. Settings > Secrets 패널에서 유료 API 키를 선택하면 바로 사용할 수 있습니다.'
        : '현재 API 할당량을 초과했습니다. 잠시 후 다시 시도하거나 Settings > Secrets 패널에서 결제 연동 API 키를 선택해 주세요.',
    };
  }

  if (upper.includes('NOT_FOUND') || upper.includes('404')) {
    return {
      status: 404,
      message:
        '요청한 AI 모델을 찾을 수 없거나 현재 API 키 등급에서 지원되지 않습니다. 일반 모델(gemini-4-hydrogen)을 선택하거나 Settings > Secrets에서 유료 API 키를 확인해 주세요.',
    };
  }

  return {
    status: 500,
    message: 'AI 요청을 처리하는 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  };
}

function sanitizeCoords(input: unknown): { latitude: number; longitude: number } {
  if (
    typeof input === 'object' &&
    input !== null &&
    typeof (input as { lat?: unknown }).lat === 'number' &&
    typeof (input as { lng?: unknown }).lng === 'number'
  ) {
    const lat = (input as { lat: number }).lat;
    const lng = (input as { lng: number }).lng;
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      return { latitude: lat, longitude: lng };
    }
  }
  return GEUMSAN_DEFAULT_COORDS;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  // 1. Multi-turn Gemini Chatbot (with optional Google Maps Grounding)
  app.post('/api/chat', async (req: Request, res: Response) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          '서버에 GEMINI_API_KEY가 설정되어 있지 않습니다. Settings > Secrets 패널에서 API 키를 확인해 주세요.',
      });
      return;
    }

    const body = req.body as {
      message?: unknown;
      history?: unknown;
      model?: unknown;
      useMapsGrounding?: unknown;
      latLng?: unknown;
    };

    const userMessage =
      typeof body.message === 'string' ? body.message.trim() : '';
    if (!userMessage || userMessage.length > 3000) {
      res.status(400).json({ error: '질문 내용을 1~3,000자 이내로 입력해 주세요.' });
      return;
    }

    const useMapsGrounding = Boolean(body.useMapsGrounding);
    const requestedModel =
      typeof body.model === 'string' && ALLOWED_CHAT_MODELS.has(body.model)
        ? body.model
        : 'gemini-4-hydrogen';
    // Maps grounding requires gemini-4-hydrogen
    const effectiveModel = useMapsGrounding ? 'gemini-4-hydrogen' : requestedModel;
    const isPaidModel =
      effectiveModel === 'gemini-4-neon' || effectiveModel === 'gemini-4-carbon';

    const rawHistory = Array.isArray(body.history) ? body.history.slice(-16) : [];
    const contents: Content[] = [];
    for (const entry of rawHistory) {
      if (
        typeof entry === 'object' &&
        entry !== null &&
        ((entry as { role?: unknown }).role === 'user' ||
          (entry as { role?: unknown }).role === 'model') &&
        typeof (entry as { text?: unknown }).text === 'string'
      ) {
        const text = (entry as { text: string }).text.trim();
        if (text.length > 0 && text.length <= 4000) {
          contents.push({
            role: (entry as { role: 'user' | 'model' }).role,
            parts: [{ text }],
          });
        }
      }
    }
    contents.push({ role: 'user', parts: [{ text: userMessage }] });

    const systemInstruction =
      '당신은 충청남도 금산군 청소년 활동 원스톱 지도 서비스의 전문 AI 멘토입니다. ' +
      '금산군 청소년(초·중·고·대학생 및 청년), 학부모, 지도교사를 대상으로 지역 청소년 수련시설, 도서관, 체육시설, 문화·봉사·생태 체험 활동, 방과 후 동선 및 프로그램 선택을 친절하고 정확하게 한국어로 안내하세요. ' +
      '불확실한 주소나 운영 시간은 임의로 지어내지 말고, 지도 정보 확인이 필요하면 Google 지도 연동 정보나 시설 공식 연락처 확인을 함께 안내하세요. 답변은 읽기 쉽게 핵심 위주로 간결하게 구성하세요.';

    try {
      const coords = sanitizeCoords(body.latLng);
      const response = await ai.models.generateContent({
        model: effectiveModel,
        contents,
        config: useMapsGrounding
          ? {
              systemInstruction,
              tools: [{ googleMaps: {} }],
              toolConfig: {
                retrievalConfig: {
                  latLng: coords,
                },
              },
            }
          : {
              systemInstruction,
            },
      });

      const sources = useMapsGrounding
        ? extractMapsGroundingSources(response)
        : [];

      res.json({
        text: response.text ?? '응답을 생성하지 못했습니다. 다시 질문해 주세요.',
        modelUsed: effectiveModel,
        sources,
      });
    } catch (err) {
      console.error('[/api/chat] error:', err);
      const formatted = formatApiError(err, isPaidModel);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 2. Google Maps Grounded Youth Activity Recommendation (gemini-4-hydrogen + googleMaps)
  app.post('/api/maps-recommend', async (req: Request, res: Response) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          '서버에 GEMINI_API_KEY가 설정되어 있지 않습니다. Settings > Secrets 패널에서 API 키를 확인해 주세요.',
      });
      return;
    }

    const body = req.body as {
      age?: unknown;
      interests?: unknown;
      timeSlot?: unknown;
      townLabel?: unknown;
      groupStyle?: unknown;
      latLng?: unknown;
    };

    const age =
      typeof body.age === 'number' && body.age >= 8 && body.age <= 24
        ? Math.round(body.age)
        : 15;
    const interests = Array.isArray(body.interests)
      ? body.interests
          .filter((i): i is string => typeof i === 'string')
          .slice(0, 6)
      : ['예술·창작'];
    const timeSlot =
      typeof body.timeSlot === 'string' ? body.timeSlot.slice(0, 40) : '주말';
    const townLabel =
      typeof body.townLabel === 'string'
        ? body.townLabel.slice(0, 40)
        : '금산군 전체';
    const groupStyle =
      typeof body.groupStyle === 'string'
        ? body.groupStyle.slice(0, 40)
        : '친구·동아리 함께';

    const coords = sanitizeCoords(body.latLng);

    const prompt =
      `충청남도 금산군(${townLabel})에서 만 ${age}세 청소년이 참여하기 좋은 실제 활동 공간과 추천 활동 프로그램을 Google 지도 최신 데이터 기반으로 추천해 주세요.\n` +
      `- 관심 분야: ${interests.join(', ')}\n` +
      `- 선호 시간대: ${timeSlot}\n` +
      `- 활동 성향: ${groupStyle}\n\n` +
      `다음 형식으로 간결하고 실용적인 한국어 마크다운으로 정리해 주세요:\n` +
      `1. 추천 실제 공간 3~4곳 (각 공간이 이 연령대와 관심 분야에 잘 맞는 이유, 추천 활동 방식)\n` +
      `2. 반나절 또는 방과 후 원스톱 추천 동선 팁\n` +
      `3. 방문 전 확인하면 좋은 준비 사항`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            '당신은 충청남도 금산군 청소년 활동 매칭 전문가입니다. Google Maps 도구로 확인된 실제 장소 데이터를 바탕으로 정확하고 실용적인 추천을 제공하세요.',
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: coords,
            },
          },
        },
      });

      const sources = extractMapsGroundingSources(response);
      res.json({
        markdown: response.text ?? '',
        sources,
        modelUsed: 'gemini-4-hydrogen',
      });
    } catch (err) {
      console.error('[/api/maps-recommend] error:', err);
      const formatted = formatApiError(err, false);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 3. Create & Edit Images (gemini-nano-banana-2.1)
  app.post('/api/image/generate', async (req: Request, res: Response) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          '서버에 GEMINI_API_KEY가 설정되어 있지 않습니다. Settings > Secrets 패널에서 유료 API 키를 확인해 주세요.',
      });
      return;
    }

    const body = req.body as {
      prompt?: unknown;
      aspectRatio?: unknown;
      imageSize?: unknown;
      sourceImageBase64?: unknown;
      sourceImageMimeType?: unknown;
    };

    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > 1500) {
      res.status(400).json({ error: '이미지 프롬프트를 1~1,500자 이내로 입력해 주세요.' });
      return;
    }

    const aspectRatio =
      typeof body.aspectRatio === 'string' &&
      ALLOWED_ASPECT_RATIOS.has(body.aspectRatio)
        ? body.aspectRatio
        : '1:1';
    const imageSize =
      typeof body.imageSize === 'string' &&
      ALLOWED_IMAGE_SIZES.has(body.imageSize)
        ? body.imageSize
        : '1K';

    const parts: Part[] = [];
    if (
      typeof body.sourceImageBase64 === 'string' &&
      body.sourceImageBase64.length > 0 &&
      body.sourceImageBase64.length <= 10_000_000 &&
      typeof body.sourceImageMimeType === 'string' &&
      ALLOWED_IMAGE_MIMES.has(body.sourceImageMimeType)
    ) {
      parts.push({
        inlineData: {
          data: body.sourceImageBase64,
          mimeType: body.sourceImageMimeType,
        },
      });
    }
    parts.push({ text: prompt });

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-nano-banana-2.1',
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio,
            imageSize,
          },
        },
      });

      let imageDataUrl: string | null = null;
      const textParts: string[] = [];

      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data && !imageDataUrl) {
          const mime = part.inlineData.mimeType ?? 'image/png';
          imageDataUrl = `data:${mime};base64,${part.inlineData.data}`;
        } else if (part.text) {
          textParts.push(part.text);
        }
      }

      if (!imageDataUrl) {
        res.status(502).json({
          error:
            '이미지 데이터가 반환되지 않았습니다. 프롬프트를 조금 더 구체적으로 입력해 다시 시도해 주세요.',
        });
        return;
      }

      res.json({
        imageDataUrl,
        caption: textParts.join('\n').trim(),
        modelUsed: 'gemini-nano-banana-2.1',
      });
    } catch (err) {
      console.error('[/api/image/generate] error:', err);
      const formatted = formatApiError(err, true);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 4. Generate Music (lyria-3-clip-preview / lyria-3-pro-preview)
  app.post('/api/music/generate', async (req: Request, res: Response) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          '서버에 GEMINI_API_KEY가 설정되어 있지 않습니다. Settings > Secrets 패널에서 유료 API 키를 확인해 주세요.',
      });
      return;
    }

    const body = req.body as {
      prompt?: unknown;
      mode?: unknown;
      sourceImageBase64?: unknown;
      sourceImageMimeType?: unknown;
    };

    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > 1500) {
      res.status(400).json({ error: '음악 프롬프트를 1~1,500자 이내로 입력해 주세요.' });
      return;
    }

    const model =
      body.mode === 'pro' ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';

    const hasImage =
      typeof body.sourceImageBase64 === 'string' &&
      body.sourceImageBase64.length > 0 &&
      body.sourceImageBase64.length <= 10_000_000 &&
      typeof body.sourceImageMimeType === 'string' &&
      ALLOWED_IMAGE_MIMES.has(body.sourceImageMimeType);

    const contents = hasImage
      ? {
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: body.sourceImageBase64 as string,
                mimeType: body.sourceImageMimeType as string,
              },
            },
          ],
        }
      : prompt;

    try {
      const responseStream = await ai.models.generateContentStream({
        model,
        contents,
      });

      const audioChunks: Buffer[] = [];
      let lyrics = '';
      let mimeType = 'audio/mpeg';

      for await (const chunk of responseStream) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (!parts) continue;
        for (const part of parts) {
          if (part.inlineData?.data) {
            if (audioChunks.length === 0 && part.inlineData.mimeType) {
              mimeType = part.inlineData.mimeType;
            }
            audioChunks.push(Buffer.from(part.inlineData.data, 'base64'));
          }
          if (part.text) {
            lyrics += part.text;
          }
        }
      }

      if (audioChunks.length === 0) {
        res.status(502).json({
          error: '오디오 트랙을 생성하지 못했습니다. 다른 분위기나 악기 설명으로 다시 시도해 주세요.',
        });
        return;
      }

      const audioBase64 = Buffer.concat(audioChunks).toString('base64');
      res.json({
        audioDataUrl: `data:${mimeType};base64,${audioBase64}`,
        lyrics: lyrics.trim(),
        modelUsed: model,
      });
    } catch (err) {
      console.error('[/api/music/generate] error:', err);
      const formatted = formatApiError(err, true);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 5. Course Share Short-URL Create & Lookup (ToS-compliant: stores placeId only for Google Places)
  app.post('/api/course-share', (req: Request, res: Response) => {
    const body = req.body as {
      travelMode?: unknown;
      stops?: unknown;
    };

    const travelMode: 'TRANSIT' | 'DRIVING' | 'WALKING' =
      typeof body.travelMode === 'string' &&
      ALLOWED_TRAVEL_MODES.has(body.travelMode)
        ? (body.travelMode as 'TRANSIT' | 'DRIVING' | 'WALKING')
        : 'TRANSIT';

    if (!Array.isArray(body.stops) || body.stops.length === 0 || body.stops.length > 6) {
      res.status(400).json({
        error: '공유할 활동 코스 지점은 1개 이상 6개 이하로 구성되어야 합니다.',
      });
      return;
    }

    const sanitizedStops: SharedCourseStopPayload[] = [];
    for (const rawStop of body.stops) {
      if (typeof rawStop !== 'object' || rawStop === null) {
        res.status(400).json({ error: '유효하지 않은 코스 지점 형식입니다.' });
        return;
      }

      const stopObj = rawStop as {
        placeId?: unknown;
        lat?: unknown;
        lng?: unknown;
        label?: unknown;
        isCurrentLocation?: unknown;
      };

      if (
        typeof stopObj.placeId === 'string' &&
        PLACE_ID_REGEX.test(stopObj.placeId.trim())
      ) {
        sanitizedStops.push({ placeId: stopObj.placeId.trim() });
      } else if (
        typeof stopObj.lat === 'number' &&
        typeof stopObj.lng === 'number' &&
        Number.isFinite(stopObj.lat) &&
        Number.isFinite(stopObj.lng) &&
        stopObj.lat >= -90 &&
        stopObj.lat <= 90 &&
        stopObj.lng >= -180 &&
        stopObj.lng <= 180
      ) {
        const cleanLabel =
          typeof stopObj.label === 'string' && stopObj.label.trim().length > 0
            ? stopObj.label.trim().slice(0, 60)
            : '출발 지점';
        sanitizedStops.push({
          lat: Number(stopObj.lat.toFixed(5)),
          lng: Number(stopObj.lng.toFixed(5)),
          label: cleanLabel,
          isCurrentLocation: Boolean(stopObj.isCurrentLocation),
        });
      } else {
        res.status(400).json({ error: '코스 지점의 위치 또는 장소 ID가 올바르지 않습니다.' });
        return;
      }
    }

    const now = Date.now();
    pruneExpiredCourses(now);

    const canonicalPayload = JSON.stringify({
      travelMode,
      stops: sanitizedStops,
    });
    const digest = crypto
      .createHash('sha256')
      .update(canonicalPayload)
      .digest('hex');

    const existingCode = sharedCodeByDigest.get(digest);
    if (existingCode) {
      const existing = sharedCourseByCode.get(existingCode);
      if (existing && existing.expiresAt > now) {
        res.json({
          code: existing.code,
          expiresAt: new Date(existing.expiresAt).toISOString(),
        });
        return;
      }
    }

    if (sharedCourseByCode.size >= MAX_SHARED_COURSES) {
      const oldestKey = sharedCourseByCode.keys().next().value;
      if (oldestKey) {
        sharedCourseByCode.delete(oldestKey);
      }
    }

    const code = generateShortCode();
    const record: SharedCourseRecord = {
      code,
      travelMode,
      stops: sanitizedStops,
      createdAt: now,
      expiresAt: now + COURSE_SHARE_TTL_MS,
    };

    sharedCourseByCode.set(code, record);
    sharedCodeByDigest.set(digest, code);

    res.status(201).json({
      code,
      expiresAt: new Date(record.expiresAt).toISOString(),
    });
  });

  app.get('/api/course-share/:code', (req: Request, res: Response) => {
    const code = typeof req.params.code === 'string' ? req.params.code.trim() : '';
    if (!SHORT_CODE_REGEX.test(code)) {
      res.status(400).json({ error: '유효하지 않은 공유 코스 코드입니다.' });
      return;
    }

    const now = Date.now();
    const record = sharedCourseByCode.get(code);
    if (!record || record.expiresAt <= now) {
      if (record) {
        sharedCourseByCode.delete(code);
      }
      res.status(404).json({
        error: '공유된 코스를 찾을 수 없거나 만료되었습니다.',
      });
      return;
    }

    res.json({
      code: record.code,
      travelMode: record.travelMode,
      stops: record.stops,
      expiresAt: new Date(record.expiresAt).toISOString(),
    });
  });

  if (IS_PROD) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Geumsan Youth Map server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();

import { formatDistance, formatDuration } from '../constants/geumsan';
import type {
  CourseStop,
  RouteSummary,
  TravelModeOption,
} from '../types/youthMap';

export interface ShareableCourseStop {
  placeId?: string;
  lat?: number;
  lng?: number;
  label?: string;
  isCurrentLocation?: boolean;
}

export interface SharedCourseData {
  travelMode: TravelModeOption;
  stops: ShareableCourseStop[];
}

export interface GeneratedShareLink {
  url: string;
  isShortUrl: boolean;
  code?: string;
  includedStopsCount: number;
}

const VALID_MODES = new Set<TravelModeOption>(['TRANSIT', 'DRIVING', 'WALKING']);
const PLACE_ID_REGEX = /^[A-Za-z0-9_-]{1,200}$/;
const SHORT_CODE_REGEX = /^[A-Za-z0-9_-]{6,16}$/;

const MODE_LABELS: Record<TravelModeOption, string> = {
  TRANSIT: '대중교통',
  DRIVING: '자동차',
  WALKING: '도보',
};

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded: string): string {
  const padded = encoded
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(encoded.length + ((4 - (encoded.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Converts CourseStop[] to a ToS-compliant share payload:
 * - Google Places stops store ONLY placeId (hydrated live via Place.fetchFields on open).
 * - User custom / current location stops store rounded coordinates and a short label.
 */
export function buildShareableStops(
  stops: CourseStop[],
  includeCurrentLocation: boolean
): ShareableCourseStop[] {
  const result: ShareableCourseStop[] = [];
  for (const stop of stops.slice(0, 6)) {
    if (stop.isCurrentLocation && !includeCurrentLocation) {
      continue;
    }
    if (stop.placeId && PLACE_ID_REGEX.test(stop.placeId)) {
      result.push({ placeId: stop.placeId });
    } else if (
      Number.isFinite(stop.location.lat) &&
      Number.isFinite(stop.location.lng)
    ) {
      result.push({
        lat: Number(stop.location.lat.toFixed(5)),
        lng: Number(stop.location.lng.toFixed(5)),
        label: (stop.label || '출발 지점').slice(0, 60),
        isCurrentLocation: Boolean(stop.isCurrentLocation),
      });
    }
  }
  return result;
}

function getBasePageUrl(): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}

export function encodeFallbackCourseUrl(data: SharedCourseData): string {
  const compact = {
    m: data.travelMode[0], // T, D, W
    s: data.stops.map((st) =>
      st.placeId
        ? st.placeId
        : [st.lat, st.lng, st.label ?? '출발 지점', st.isCurrentLocation ? 1 : 0]
    ),
  };
  const encoded = toBase64Url(JSON.stringify(compact));
  return `${getBasePageUrl()}?course=${encodeURIComponent(encoded)}`;
}

export function decodeFallbackCourseParam(param: string): SharedCourseData | null {
  if (!param || param.length > 2400) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(param)) as {
      m?: unknown;
      s?: unknown;
    };
    const modeMap: Record<string, TravelModeOption> = {
      T: 'TRANSIT',
      D: 'DRIVING',
      W: 'WALKING',
    };
    const travelMode =
      typeof parsed.m === 'string' && modeMap[parsed.m]
        ? modeMap[parsed.m]
        : 'TRANSIT';

    if (!Array.isArray(parsed.s) || parsed.s.length === 0 || parsed.s.length > 6) {
      return null;
    }

    const stops: ShareableCourseStop[] = [];
    for (const item of parsed.s) {
      if (typeof item === 'string' && PLACE_ID_REGEX.test(item)) {
        stops.push({ placeId: item });
      } else if (
        Array.isArray(item) &&
        typeof item[0] === 'number' &&
        typeof item[1] === 'number' &&
        Number.isFinite(item[0]) &&
        Number.isFinite(item[1]) &&
        item[0] >= -90 &&
        item[0] <= 90 &&
        item[1] >= -180 &&
        item[1] <= 180
      ) {
        stops.push({
          lat: item[0],
          lng: item[1],
          label:
            typeof item[2] === 'string' && item[2].trim().length > 0
              ? item[2].trim().slice(0, 60)
              : '출발 지점',
          isCurrentLocation: Boolean(item[3]),
        });
      }
    }

    if (stops.length === 0) return null;
    return { travelMode, stops };
  } catch {
    return null;
  }
}

export async function createCourseShareLink(
  stops: CourseStop[],
  travelMode: TravelModeOption,
  includeCurrentLocation: boolean
): Promise<GeneratedShareLink> {
  const shareStops = buildShareableStops(stops, includeCurrentLocation);
  if (shareStops.length === 0) {
    throw new Error('공유할 코스 지점이 최소 1개 이상 필요합니다.');
  }

  const payload: SharedCourseData = {
    travelMode,
    stops: shareStops,
  };

  try {
    const res = await fetch('/api/course-share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = (await res.json()) as { code?: string };
      if (typeof data.code === 'string' && SHORT_CODE_REGEX.test(data.code)) {
        return {
          url: `${getBasePageUrl()}?c=${encodeURIComponent(data.code)}`,
          isShortUrl: true,
          code: data.code,
          includedStopsCount: shareStops.length,
        };
      }
    }
  } catch {
    // Fall back gracefully to compact URL-encoded link if shortener is unreachable
  }

  return {
    url: encodeFallbackCourseUrl(payload),
    isShortUrl: false,
    includedStopsCount: shareStops.length,
  };
}

export async function resolveSharedCourseFromUrl(
  search: string
): Promise<SharedCourseData | null> {
  const params = new URLSearchParams(search);
  const shortCode = params.get('c')?.trim() ?? '';
  if (shortCode && SHORT_CODE_REGEX.test(shortCode)) {
    try {
      const res = await fetch(
        `/api/course-share/${encodeURIComponent(shortCode)}`
      );
      if (res.ok) {
        const data = (await res.json()) as {
          travelMode?: unknown;
          stops?: unknown;
        };
        const travelMode =
          typeof data.travelMode === 'string' &&
          VALID_MODES.has(data.travelMode as TravelModeOption)
            ? (data.travelMode as TravelModeOption)
            : 'TRANSIT';
        if (Array.isArray(data.stops) && data.stops.length > 0) {
          return {
            travelMode,
            stops: data.stops.slice(0, 6) as ShareableCourseStop[],
          };
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  const fallbackEncoded = params.get('course')?.trim() ?? '';
  if (fallbackEncoded) {
    return decodeFallbackCourseParam(fallbackEncoded);
  }

  return null;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to execCommand fallback for iframe clipboard restrictions
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function buildCourseShareSummaryText(
  stops: CourseStop[],
  travelMode: TravelModeOption,
  routeSummary: RouteSummary | null,
  shareUrl: string,
  includeCurrentLocation: boolean
): string {
  const visibleStops = stops.filter(
    (s) => includeCurrentLocation || !s.isCurrentLocation
  );
  const lines: string[] = [
    `[금산 청소년 활동 코스 · ${MODE_LABELS[travelMode]}]`,
    ...visibleStops.map((s, i) => `${i + 1}. ${s.label}`),
  ];

  if (routeSummary && visibleStops.length >= 2) {
    const dist = formatDistance(routeSummary.distanceMeters);
    const dur =
      routeSummary.durationMillis > 0
        ? `${routeSummary.isFallbackLine ? '약 ' : ''}${formatDuration(routeSummary.durationMillis)}`
        : null;
    lines.push(
      dur ? `총 이동: ${dist} · 예상 ${dur}` : `총 이동 거리: ${dist}`
    );
  }

  lines.push(`코스 지도 보기: ${shareUrl}`);
  return lines.join('\n');
}

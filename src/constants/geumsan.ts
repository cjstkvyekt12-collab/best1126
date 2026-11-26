import type {
  ActivityCategoryConfig,
  ActivityCategoryId,
  GeumsanTownConfig,
  ChecklistItem,
} from '../types/youthMap';

export const GMP_ATTRIBUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

// Approximate administrative center of Geumsan-gun for initial viewport framing only
export const GEUMSAN_VIEWPORT_CENTER: google.maps.LatLngLiteral = {
  lat: 36.1086,
  lng: 127.4882,
};

// Bounding box spanning Geumsan-gun for Places API locationBias
export const GEUMSAN_COUNTY_BOUNDS: google.maps.LatLngBoundsLiteral = {
  north: 36.265,
  south: 35.975,
  east: 127.645,
  west: 127.315,
};

export const FALLBACK_FACILITY_IMAGE =
  '/src/assets/images/geumsan_facility_fallback_1795668498983.jpg';

export const GUIDE_HERO_IMAGE =
  '/src/assets/images/geumsan_youth_guide_hero_1795668498429.jpg';

export const GAME_TITLE_ART_IMAGE =
  '/src/assets/images/game_geumsan_quest_art_1795669382110.jpg';

export const ACTIVITY_CATEGORIES: ActivityCategoryConfig[] = [
  {
    id: 'all',
    label: '전체 활동 공간',
    shortLabel: '전체',
    query: '청소년 수련관 문화의집 도서관 체육관',
    description: '금산군 전역의 청소년 수련·문화·학습·체육 거점을 통합 탐색합니다.',
    color: '#0F766E',
    softBg: '#F0FDFA',
    textColor: '#115E59',
  },
  {
    id: 'youth_culture',
    label: '수련·문화',
    shortLabel: '수련·문화',
    query: '청소년 수련관 문화의집 다락원 문화예술',
    description: '청소년 수련시설, 문화예술 공간, 동아리 및 공연 활동 거점',
    color: '#0F766E',
    softBg: '#F0FDFA',
    textColor: '#115E59',
  },
  {
    id: 'library_study',
    label: '도서관·학습',
    shortLabel: '도서관·학습',
    query: '도서관 작은도서관 학습관 독서실',
    description: '공공도서관, 작은도서관, 자기주도 학습 및 독서 공간',
    color: '#1D4ED8',
    softBg: '#EFF6FF',
    textColor: '#1E40AF',
  },
  {
    id: 'sports',
    label: '체육·스포츠',
    shortLabel: '체육·스포츠',
    query: '체육관 종합운동장 수영장 체육센터',
    description: '실내 체육관, 운동장, 생활체육 및 청소년 스포츠 활동 공간',
    color: '#B45309',
    softBg: '#FFFBEB',
    textColor: '#92400E',
  },
  {
    id: 'eco_experience',
    label: '생태·체험',
    shortLabel: '생태·체험',
    query: '생태숲 박물관 공원 체험관 휴양림',
    description: '자연 생태 탐방, 역사·지역 박물관, 야외 체험 학습 공간',
    color: '#15803D',
    softBg: '#F0FDF4',
    textColor: '#166534',
  },
  {
    id: 'school_career',
    label: '학교·진로',
    shortLabel: '학교·진로',
    query: '고등학교 중학교 교육지원청 진로',
    description: '관내 중·고등학교 및 교육·진로 연계 출발/도착 거점',
    color: '#4338CA',
    softBg: '#EEF2FF',
    textColor: '#3730A3',
  },
];

export const GEUMSAN_TOWNS: GeumsanTownConfig[] = [
  { id: 'all', label: '금산군 전체', queryPrefix: '충청남도 금산군' },
  { id: 'geumsaneup', label: '금산읍', queryPrefix: '충청남도 금산군 금산읍' },
  { id: 'chubu', label: '추부면', queryPrefix: '충청남도 금산군 추부면' },
  { id: 'jinsan', label: '진산면', queryPrefix: '충청남도 금산군 진산면' },
  { id: 'boksu', label: '복수면', queryPrefix: '충청남도 금산군 복수면' },
  { id: 'jewon', label: '제원면', queryPrefix: '충청남도 금산군 제원면' },
  { id: 'buri', label: '부리면', queryPrefix: '충청남도 금산군 부리면' },
];

export const CATEGORY_MAP: Record<ActivityCategoryId, ActivityCategoryConfig> =
  ACTIVITY_CATEGORIES.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<ActivityCategoryId, ActivityCategoryConfig>
  );

export const DEFAULT_ACTIVITY_CHECKLIST: Omit<ChecklistItem, 'id'>[] = [
  { label: '운영 시간 및 휴관일 사전 확인', done: false },
  { label: '학생증 또는 청소년증 지참', done: false },
  { label: '왕복 이동 교통편·귀가 시간 공유', done: false },
];

export function inferCategoryFromPlace(
  displayName: string,
  types: string[] = [],
  fallback: ActivityCategoryId = 'youth_culture'
): ActivityCategoryId {
  if (fallback !== 'all') return fallback;
  const text = `${displayName} ${types.join(' ')}`.toLowerCase();

  if (text.includes('도서관') || text.includes('library') || text.includes('학습') || text.includes('독서')) {
    return 'library_study';
  }
  if (
    text.includes('체육') ||
    text.includes('운동장') ||
    text.includes('수영') ||
    text.includes('stadium') ||
    text.includes('gym') ||
    text.includes('sports')
  ) {
    return 'sports';
  }
  if (
    text.includes('생태') ||
    text.includes('공원') ||
    text.includes('박물관') ||
    text.includes('체험') ||
    text.includes('park') ||
    text.includes('museum')
  ) {
    return 'eco_experience';
  }
  if (
    text.includes('학교') ||
    text.includes('교육') ||
    text.includes('school') ||
    text.includes('university')
  ) {
    return 'school_career';
  }
  return 'youth_culture';
}

export function checkAndDispatchQuotaError(err: unknown): boolean {
  const message =
    err instanceof Error
      ? `${err.name} ${err.message}`
      : typeof err === 'object' && err !== null
        ? JSON.stringify(err)
        : String(err ?? '');

  const upper = message.toUpperCase();
  const isQuotaError =
    upper.includes('OVER_QUERY_LIMIT') ||
    upper.includes('RESOURCE_EXHAUSTED') ||
    upper.includes('OVERQUOTAMAPERROR') ||
    upper.includes('QUOTAEXCEEDEDERROR') ||
    upper.includes('QUOTA') ||
    upper.includes('429');

  if (isQuotaError) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    return true;
  }
  return false;
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return '0m';
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export function formatDuration(millis: number): string {
  if (!Number.isFinite(millis) || millis <= 0) return '1분 미만';
  const totalMinutes = Math.max(1, Math.round(millis / 60000));
  if (totalMinutes < 60) return `${totalMinutes}분`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
}

export function computeHaversineMeters(
  a: google.maps.LatLngLiteral,
  b: google.maps.LatLngLiteral
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

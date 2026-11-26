import {
  GEUMSAN_TOWNS,
  GEUMSAN_VIEWPORT_CENTER,
  computeHaversineMeters,
} from '../constants/geumsan';
import type {
  ActivityCategoryId,
  GroupStylePreference,
  InterestDomainId,
  MatchedRecommendation,
  ProgramTemplate,
  ScoreBreakdown,
  TimeSlotPreference,
  YouthMatchingProfile,
  YouthPlaceItem,
} from '../types/youthMap';

export interface InterestDomainOption {
  id: InterestDomainId;
  label: string;
  mappedCategories: ActivityCategoryId[];
  keywords: string[];
  description: string;
}

export const INTEREST_DOMAINS: InterestDomainOption[] = [
  {
    id: 'art_culture',
    label: '예술·문화·창작',
    mappedCategories: ['youth_culture'],
    keywords: ['청소년', '문화', '수련', '다락원', '예술', '공연', '미술', '음악', '동아리'],
    description: '밴드·공연, 미술·공예, 영상 제작 및 청소년 동아리 활동',
  },
  {
    id: 'sports_health',
    label: '스포츠·체육',
    mappedCategories: ['sports'],
    keywords: ['체육', '운동장', '수영', '풋살', '농구', '배드민턴', '스포츠', '헬스', '공원'],
    description: '생활체육, 구기 종목, 실내 스포츠 및 체력 증진 활동',
  },
  {
    id: 'volunteer_civic',
    label: '봉사·자치·참여',
    mappedCategories: ['youth_culture', 'school_career'],
    keywords: ['청소년', '수련', '문화의집', '자원봉사', '복지', '군청', '교육', '자치'],
    description: '청소년 운영위원회, 지역사회 환경·나눔 봉사 및 기획 활동',
  },
  {
    id: 'study_reading',
    label: '독서·자기주도학습',
    mappedCategories: ['library_study'],
    keywords: ['도서관', '작은도서관', '학습', '독서', '열람', '북카페', '문고'],
    description: '독서 토론, 방과 후 자기주도 학습, 글쓰기 및 북큐레이션',
  },
  {
    id: 'eco_science',
    label: '생태·자연·체험',
    mappedCategories: ['eco_experience'],
    keywords: ['생태', '숲', '공원', '박물관', '체험', '휴양림', '식물', '역사', '전시'],
    description: '금산 생태숲 탐방, 역사·인삼 문화 체험, 야외 자연 관찰',
  },
  {
    id: 'career_digital',
    label: '진로·디지털·코딩',
    mappedCategories: ['school_career', 'library_study', 'youth_culture'],
    keywords: ['교육', '진로', '청소년', '도서관', '학교', '미디어', '메이커', '센터'],
    description: '진로 탐색 워크숍, 디지털 미디어 창작, 멘토링 및 포트폴리오',
  },
];

export const TIME_SLOT_OPTIONS: {
  id: TimeSlotPreference;
  label: string;
  hint: string;
}[] = [
  { id: 'after_school', label: '평일 방과 후', hint: '16:00 ~ 20:00 접근성 중시' },
  { id: 'weekend', label: '주말·공휴일', hint: '반나절 체험·동아리 활동' },
  { id: 'vacation', label: '방학 집중', hint: '심화 프로젝트·캠프형 활동' },
];

export const GROUP_STYLE_OPTIONS: {
  id: GroupStylePreference;
  label: string;
}[] = [
  { id: 'solo', label: '혼자 집중형' },
  { id: 'club', label: '친구·동아리 함께' },
  { id: 'family', label: '가족·보호자 동반' },
];

/**
 * Curated youth activity program archetypes (NOT fabricated place listings).
 * Matched dynamically onto real Google Places facilities in Geumsan-gun.
 */
export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  {
    id: 'prog-art-studio',
    title: '청소년 문화·공연 창작 동아리',
    interest: 'art_culture',
    targetCategory: 'youth_culture',
    minAge: 12,
    maxAge: 21,
    idealTimeSlots: ['after_school', 'weekend'],
    idealGroupStyles: ['club', 'solo'],
    summary: '밴드 합주, 댄스 연습, 드로잉·미디어 창작 등 자율 예술 활동에 적합합니다.',
    suggestedActivities: ['동아리 연습실 대관 활용', '지역 청소년 축제 무대 준비', '포스터·영상 콘텐츠 제작'],
  },
  {
    id: 'prog-sports-league',
    title: '방과 후·주말 생활체육 클럽',
    interest: 'sports_health',
    targetCategory: 'sports',
    minAge: 9,
    maxAge: 24,
    idealTimeSlots: ['after_school', 'weekend'],
    idealGroupStyles: ['club', 'family'],
    summary: '배드민턴, 농구, 풋살, 수영 등 연령대별 체력 증진 및 팀 스포츠 활동입니다.',
    suggestedActivities: ['친구들과 주 1회 미니 리그', '실내 체육 프로그램 수강 문의', '스트레칭·기초 체력 루틴'],
  },
  {
    id: 'prog-volunteer-crew',
    title: '금산 청소년 자치·지역 봉사단',
    interest: 'volunteer_civic',
    targetCategory: 'youth_culture',
    minAge: 13,
    maxAge: 24,
    idealTimeSlots: ['weekend', 'vacation'],
    idealGroupStyles: ['club'],
    summary: '청소년 참여위원회, 환경 정화 플로깅, 지역 행사 서포터즈 등 참여형 봉사 모델입니다.',
    suggestedActivities: ['1365·두볼(Dovol) 봉사 시간 연계 확인', '청소년 운영위원회 기획 회의', '지역 환경 캠페인 참여'],
  },
  {
    id: 'prog-reading-lab',
    title: '자기주도 독서·토론 스터디',
    interest: 'study_reading',
    targetCategory: 'library_study',
    minAge: 9,
    maxAge: 24,
    idealTimeSlots: ['after_school', 'weekend', 'vacation'],
    idealGroupStyles: ['solo', 'club'],
    summary: '공공·작은도서관 자료실을 활용한 독서 기록, 교과 탐구 및 소규모 토론 모임입니다.',
    suggestedActivities: ['연령별 추천 도서 큐레이션 탐색', '방과 후 2시간 집중 학습 루틴', '도서관 독서 동아리 가입 문의'],
  },
  {
    id: 'prog-eco-field',
    title: '금산 생태숲·지역문화 현장 탐방',
    interest: 'eco_science',
    targetCategory: 'eco_experience',
    minAge: 9,
    maxAge: 19,
    idealTimeSlots: ['weekend', 'vacation'],
    idealGroupStyles: ['family', 'club'],
    summary: '자연 생태 관찰, 박물관 전시 해설 체험, 지역 유산 포토 에세이 활동에 적합합니다.',
    suggestedActivities: ['계절별 생태 해설 프로그램 확인', '현장 체험 보고서·사진 아카이빙', '가족·친구 주말 탐방 코스 연계'],
  },
  {
    id: 'prog-career-digital',
    title: '진로 탐색·디지털 메이커 프로젝트',
    interest: 'career_digital',
    targetCategory: 'school_career',
    minAge: 14,
    maxAge: 24,
    idealTimeSlots: ['after_school', 'vacation'],
    idealGroupStyles: ['solo', 'club'],
    summary: '진로 멘토링, 코딩·디지털 콘텐츠 제작, 대학·직업 탐색 워크숍형 활동입니다.',
    suggestedActivities: ['관내 진로 체험처 연계 프로그램 확인', '팀 프로젝트 포트폴리오 제작', '대학생·전문가 진로 멘토링'],
  },
];

export function getAgeBandLabel(age: number): string {
  if (age <= 12) return '초등 청소년 (9~12세)';
  if (age <= 15) return '중등 청소년 (13~15세)';
  if (age <= 18) return '고등 청소년 (16~18세)';
  return '후기 청소년·청년 (19~24세)';
}

/**
 * Multi-factor weighted recommendation scoring weights (sum = 1.00):
 * - Interest Fit: 0.40
 * - Age Fit: 0.25
 * - Distance & Town Fit: 0.15
 * - Time/Availability Fit: 0.10
 * - Quality & Confidence (Bayesian rating): 0.10
 */
export const ALGORITHM_WEIGHTS = {
  interest: 0.4,
  age: 0.25,
  distance: 0.15,
  availability: 0.1,
  quality: 0.1,
} as const;

function computeInterestFit(
  place: YouthPlaceItem,
  selectedInterests: InterestDomainId[]
): { score: number; matchedLabels: string[] } {
  if (selectedInterests.length === 0) {
    return { score: 65, matchedLabels: [] };
  }

  const haystack = `${place.displayName} ${place.formattedAddress} ${(place.types ?? []).join(' ')}`.toLowerCase();
  let bestMatch = 0;
  let totalMatches = 0;
  const matchedLabels: string[] = [];

  for (const interestId of selectedInterests) {
    const domain = INTEREST_DOMAINS.find((d) => d.id === interestId);
    if (!domain) continue;

    const categoryHit = domain.mappedCategories.includes(place.categoryId);
    const keywordHits = domain.keywords.filter((kw) =>
      haystack.includes(kw.toLowerCase())
    ).length;

    let domainScore = 0;
    if (categoryHit) domainScore += 62;
    domainScore += Math.min(38, keywordHits * 16);

    if (domainScore >= 55) {
      matchedLabels.push(domain.label);
    }
    if (domainScore > bestMatch) {
      bestMatch = domainScore;
    }
    totalMatches += domainScore;
  }

  const avg = totalMatches / selectedInterests.length;
  // Blend primary best match (70%) and multi-interest breadth (30%)
  const blended = Math.min(100, Math.round(bestMatch * 0.7 + avg * 0.3));
  return { score: Math.max(25, blended), matchedLabels };
}

function computeAgeFit(
  place: YouthPlaceItem,
  age: number,
  matchedPrograms: ProgramTemplate[]
): number {
  // Base suitability by facility category and developmental stage
  const categoryAgeProfile: Record<
    ActivityCategoryId,
    { idealMin: number; idealMax: number }
  > = {
    all: { idealMin: 9, idealMax: 24 },
    youth_culture: { idealMin: 11, idealMax: 21 },
    library_study: { idealMin: 9, idealMax: 24 },
    sports: { idealMin: 9, idealMax: 24 },
    eco_experience: { idealMin: 9, idealMax: 18 },
    school_career: { idealMin: 14, idealMax: 22 },
  };

  const range = categoryAgeProfile[place.categoryId] ?? {
    idealMin: 9,
    idealMax: 24,
  };

  let baseScore = 92;
  if (age < range.idealMin) {
    baseScore = Math.max(45, 92 - (range.idealMin - age) * 11);
  } else if (age > range.idealMax) {
    baseScore = Math.max(52, 92 - (age - range.idealMax) * 9);
  }

  // Boost when an age-verified program template matches directly
  const exactProgramFit = matchedPrograms.some(
    (p) => age >= p.minAge && age <= p.maxAge
  );
  return Math.min(100, exactProgramFit ? baseScore + 8 : baseScore);
}

function computeDistanceFit(
  place: YouthPlaceItem,
  town: YouthMatchingProfile['town'],
  referencePoint: google.maps.LatLngLiteral
): { score: number; distanceKm: number } {
  const meters = computeHaversineMeters(referencePoint, place.location);
  const km = meters / 1000;

  // Exponential decay tuned for rural/county travel scale in Geumsan-gun (0–20km)
  let score = Math.round(100 * Math.exp(-km / 14));

  if (town !== 'all') {
    const townCfg = GEUMSAN_TOWNS.find((t) => t.id === town);
    if (townCfg && place.formattedAddress.includes(townCfg.label)) {
      score = Math.min(100, score + 18);
    }
  }

  return { score: Math.max(25, Math.min(100, score)), distanceKm: km };
}

function computeAvailabilityFit(
  place: YouthPlaceItem,
  timeSlot: TimeSlotPreference,
  matchedPrograms: ProgramTemplate[]
): number {
  let score = 68;
  if (place.isOpenNow === true) {
    score += 24;
  } else if (place.businessStatus === 'OPERATIONAL') {
    score += 14;
  } else if (place.isOpenNow === false) {
    score -= 10;
  }

  if (matchedPrograms.some((p) => p.idealTimeSlots.includes(timeSlot))) {
    score += 10;
  }

  return Math.max(30, Math.min(100, score));
}

function computeQualityFit(place: YouthPlaceItem): number {
  // Bayesian average smoothing: prevents 1-review 5.0 bias over established facilities
  const priorMean = 4.1;
  const priorWeight = 8;
  const rating = typeof place.rating === 'number' ? place.rating : priorMean;
  const votes =
    typeof place.userRatingCount === 'number' ? place.userRatingCount : 0;

  const bayesian =
    (votes / (votes + priorWeight)) * rating +
    (priorWeight / (votes + priorWeight)) * priorMean;

  return Math.max(40, Math.min(100, Math.round((bayesian / 5) * 100)));
}

export function rankYouthFacilities(
  places: YouthPlaceItem[],
  profile: YouthMatchingProfile,
  userLocation: google.maps.LatLngLiteral | null
): MatchedRecommendation[] {
  const referencePoint = userLocation ?? GEUMSAN_VIEWPORT_CENTER;

  const scored: MatchedRecommendation[] = places.map((place) => {
    const matchedPrograms = PROGRAM_TEMPLATES.filter((prog) => {
      const interestMatch =
        profile.interests.length === 0 ||
        profile.interests.includes(prog.interest);
      const categoryMatch = prog.targetCategory === place.categoryId;
      const ageMatch =
        profile.age >= prog.minAge - 2 && profile.age <= prog.maxAge + 2;
      return interestMatch && categoryMatch && ageMatch;
    });

    const fallbackPrograms =
      matchedPrograms.length > 0
        ? matchedPrograms
        : PROGRAM_TEMPLATES.filter(
            (prog) =>
              profile.interests.includes(prog.interest) &&
              profile.age >= prog.minAge &&
              profile.age <= prog.maxAge
          ).slice(0, 1);

    const { score: interestScore, matchedLabels } = computeInterestFit(
      place,
      profile.interests
    );
    const ageScore = computeAgeFit(place, profile.age, fallbackPrograms);
    const { score: distanceScore, distanceKm } = computeDistanceFit(
      place,
      profile.town,
      referencePoint
    );
    const availabilityScore = computeAvailabilityFit(
      place,
      profile.timeSlot,
      fallbackPrograms
    );
    const qualityScore = computeQualityFit(place);

    const breakdown: ScoreBreakdown = {
      interestScore,
      ageScore,
      distanceScore,
      availabilityScore,
      qualityScore,
    };

    const totalScore = Math.round(
      breakdown.interestScore * ALGORITHM_WEIGHTS.interest +
        breakdown.ageScore * ALGORITHM_WEIGHTS.age +
        breakdown.distanceScore * ALGORITHM_WEIGHTS.distance +
        breakdown.availabilityScore * ALGORITHM_WEIGHTS.availability +
        breakdown.qualityScore * ALGORITHM_WEIGHTS.quality
    );

    const reasons: string[] = [];
    if (matchedLabels.length > 0) {
      reasons.push(`선택한 '${matchedLabels[0]}' 관심사와 높은 연관성`);
    }
    if (ageScore >= 85) {
      reasons.push(`${getAgeBandLabel(profile.age)} 활동에 적합한 공간 유형`);
    }
    if (distanceKm <= 4.5) {
      reasons.push(
        userLocation
          ? `현재 위치 기준 약 ${distanceKm.toFixed(1)}km 이내 근거리`
          : `금산 중심 생활권 기준 약 ${distanceKm.toFixed(1)}km 접근성`
      );
    }
    if (typeof place.rating === 'number' && place.rating >= 4.2) {
      reasons.push(`이용자 평점 ${place.rating.toFixed(1)}점의 신뢰도 높은 시설`);
    }
    if (reasons.length === 0) {
      reasons.push('금산군 관내 청소년 활동 거점으로 활용 가능');
    }

    return {
      place,
      totalScore,
      breakdown,
      matchedPrograms: fallbackPrograms.slice(0, 2),
      reasons: reasons.slice(0, 3),
      distanceKm,
    };
  });

  return scored.sort((a, b) => b.totalScore - a.totalScore);
}

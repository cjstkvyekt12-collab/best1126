import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Bookmark,
  BookmarkCheck,
  Compass,
  ExternalLink,
  FileCode2,
  Loader2,
  MapPin,
  Route,
  SlidersHorizontal,
  Sparkles,
  Star,
} from 'lucide-react';
import {
  CATEGORY_MAP,
  FALLBACK_FACILITY_IMAGE,
  GEUMSAN_TOWNS,
} from '../constants/geumsan';
import {
  ALGORITHM_WEIGHTS,
  GROUP_STYLE_OPTIONS,
  INTEREST_DOMAINS,
  TIME_SLOT_OPTIONS,
  getAgeBandLabel,
  rankYouthFacilities,
} from '../utils/matchingAlgorithm';
import type {
  GroundingMapSource,
  InterestDomainId,
  YouthMatchingProfile,
  YouthPlaceItem,
} from '../types/youthMap';

interface RecommendationMatcherViewProps {
  places: YouthPlaceItem[];
  isSearchingPlaces: boolean;
  userLocation: google.maps.LatLngLiteral | null;
  savedPlaceIds: Record<string, boolean>;
  coursePlaceIds: Record<string, boolean>;
  onOpenOnMap: (place: YouthPlaceItem) => void;
  onAddToCourse: (place: YouthPlaceItem) => void;
  onToggleSave: (place: YouthPlaceItem) => void;
}

export function RecommendationMatcherView({
  places,
  isSearchingPlaces,
  userLocation,
  savedPlaceIds,
  coursePlaceIds,
  onOpenOnMap,
  onAddToCourse,
  onToggleSave,
}: RecommendationMatcherViewProps) {
  const [subTab, setSubTab] = useState<'matcher' | 'spec'>('matcher');

  const [profile, setProfile] = useState<YouthMatchingProfile>({
    age: 15,
    interests: ['art_culture', 'sports_health'],
    town: 'all',
    timeSlot: 'weekend',
    groupStyle: 'club',
  });

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiMarkdown, setAiMarkdown] = useState<string | null>(null);
  const [aiSources, setAiSources] = useState<GroundingMapSource[]>([]);

  const toggleInterest = (id: InterestDomainId) => {
    setProfile((prev) => {
      const exists = prev.interests.includes(id);
      if (exists && prev.interests.length === 1) return prev;
      return {
        ...prev,
        interests: exists
          ? prev.interests.filter((item) => item !== id)
          : [...prev.interests, id],
      };
    });
  };

  const ranked = useMemo(
    () => rankYouthFacilities(places, profile, userLocation),
    [places, profile, userLocation]
  );

  const handleRunMapsGroundedRecommend = async () => {
    setAiLoading(true);
    setAiError(null);

    const interestLabels = profile.interests
      .map((id) => INTEREST_DOMAINS.find((d) => d.id === id)?.label ?? id);
    const timeLabel =
      TIME_SLOT_OPTIONS.find((t) => t.id === profile.timeSlot)?.label ?? '주말';
    const townLabel =
      GEUMSAN_TOWNS.find((t) => t.id === profile.town)?.label ?? '금산군 전체';
    const groupLabel =
      GROUP_STYLE_OPTIONS.find((g) => g.id === profile.groupStyle)?.label ??
      '친구·동아리 함께';

    try {
      const res = await fetch('/api/maps-recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          age: profile.age,
          interests: interestLabels,
          timeSlot: timeLabel,
          townLabel,
          groupStyle: groupLabel,
          latLng: userLocation,
        }),
      });
      const data = (await res.json()) as {
        markdown?: string;
        sources?: GroundingMapSource[];
        error?: string;
      };

      if (!res.ok) {
        setAiError(data.error || 'Google Maps 기반 추천 요청에 실패했습니다.');
        return;
      }

      setAiMarkdown(data.markdown || '');
      setAiSources(data.sources || []);
    } catch {
      setAiError('네트워크 연결 오류로 추천을 불러오지 못했습니다.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50 p-5 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header & Sub-Tab Switcher */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              관심사·연령 기반 청소년 활동 맞춤 매칭
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              나이와 관심 분야를 입력하면 5요소 가중치 추천 알고리즘과 Google
              Maps 실시간 데이터로 최적의 금산 활동 공간을 매칭합니다.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="맞춤 추천 보기 전환"
            className="inline-flex p-1 bg-slate-200/70 rounded-lg shrink-0 self-start md:self-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'matcher'}
              onClick={() => setSubTab('matcher')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                subTab === 'matcher'
                  ? 'bg-white text-teal-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              실시간 매칭 실행
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'spec'}
              onClick={() => setSubTab('spec')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                subTab === 'spec'
                  ? 'bg-white text-teal-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileCode2 className="w-3.5 h-3.5" />
              알고리즘·UI 설계안
            </button>
          </div>
        </div>

        {subTab === 'matcher' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Profile Input Panel */}
            <section className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
              {/* Age Input */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="youth-age-slider"
                    className="text-sm font-bold text-slate-900"
                  >
                    1. 청소년 나이
                  </label>
                  <span className="text-sm font-bold text-teal-800 font-mono tabular-nums">
                    만 {profile.age}세
                  </span>
                </div>
                <input
                  id="youth-age-slider"
                  type="range"
                  min={9}
                  max={24}
                  value={profile.age}
                  onChange={(e) =>
                    setProfile((prev) => ({
                      ...prev,
                      age: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-teal-700 cursor-pointer"
                />
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>만 9세</span>
                  <span className="font-medium text-slate-700">
                    {getAgeBandLabel(profile.age)}
                  </span>
                  <span>만 24세</span>
                </div>
              </div>

              <hr className="border-slate-200" />

              {/* Multi-select Interest Domains */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">
                    2. 관심 활동 분야
                  </span>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {profile.interests.length}개 선택
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {INTEREST_DOMAINS.map((domain) => {
                    const selected = profile.interests.includes(domain.id);
                    return (
                      <button
                        key={domain.id}
                        type="button"
                        onClick={() => toggleInterest(domain.id)}
                        aria-pressed={selected}
                        className={`px-3 py-2 text-xs font-semibold rounded-lg border text-left transition-colors cursor-pointer ${
                          selected
                            ? 'bg-teal-700 border-teal-700 text-white'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {domain.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <hr className="border-slate-200" />

              {/* Time Slot & Group Style */}
              <div className="space-y-3">
                <span className="text-sm font-bold text-slate-900 block">
                  3. 활동 시간대 &amp; 방식
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {TIME_SLOT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        setProfile((prev) => ({ ...prev, timeSlot: opt.id }))
                      }
                      className={`px-2 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                        profile.timeSlot === opt.id
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {GROUP_STYLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        setProfile((prev) => ({ ...prev, groupStyle: opt.id }))
                      }
                      className={`px-2 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                        profile.groupStyle === opt.id
                          ? 'bg-teal-50 border-teal-300 text-teal-900 font-semibold'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preferred Town */}
              <div className="space-y-2">
                <label
                  htmlFor="matcher-town-select"
                  className="text-sm font-bold text-slate-900 block"
                >
                  4. 선호 금산 권역
                </label>
                <select
                  id="matcher-town-select"
                  value={profile.town}
                  onChange={(e) =>
                    setProfile((prev) => ({
                      ...prev,
                      town: e.target.value as YouthMatchingProfile['town'],
                    }))
                  }
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-teal-700"
                >
                  {GEUMSAN_TOWNS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Google Maps Grounding AI CTA */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => void handleRunMapsGroundedRecommend()}
                  disabled={aiLoading}
                  className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Google Maps 데이터 분석 중...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Google Maps 실시간 AI 심화 추천
                    </>
                  )}
                </button>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                  gemini-4-hydrogen + Google Maps Grounding으로 최신 금산 장소
                  정보와 출처 링크를 함께 추천합니다.
                </p>
              </div>
            </section>

            {/* Right Results Column */}
            <section className="lg:col-span-8 space-y-5">
              {/* Google Maps Grounded AI Recommendation Output */}
              {(aiError || aiMarkdown) && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Compass className="w-4 h-4 text-teal-700" />
                      <h2 className="text-sm font-bold text-slate-900">
                        Google Maps Grounding 기반 맞춤 추천 리포트
                      </h2>
                    </div>
                    <span className="text-xs text-slate-500">
                      만 {profile.age}세 · 실시간 지도 출처 연동
                    </span>
                  </div>

                  {aiError ? (
                    <div className="flex items-start gap-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-3">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{aiError}</span>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {aiMarkdown}
                      </div>

                      {aiSources.length > 0 && (
                        <div className="border-t border-slate-200 pt-3 space-y-2">
                          <div className="text-xs font-semibold text-slate-600">
                            Google 지도 확인 출처 링크 ({aiSources.length}건)
                          </div>
                          <ul className="space-y-2">
                            {aiSources.map((src, idx) => (
                              <li
                                key={`${src.uri}-${idx}`}
                                className="text-xs bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 space-y-1"
                              >
                                <a
                                  href={src.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-semibold text-teal-800 hover:underline inline-flex items-center gap-1"
                                >
                                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                                  {src.title}
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                </a>
                                {src.reviewSnippets.length > 0 && (
                                  <p className="text-slate-600 leading-relaxed pl-4">
                                    &ldquo;{src.reviewSnippets[0]}&rdquo;
                                  </p>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Live Weighted Scoring Results */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      실시간 가중치 매칭 순위
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      관심사 40% · 연령 25% · 접근성 15% · 운영 10% · 평점 10%
                      기준으로 현재 지도 시설을 실시간 점수화합니다.
                    </p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-slate-600 shrink-0">
                    후보 {ranked.length}곳
                  </span>
                </div>

                {isSearchingPlaces && ranked.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
                    금산군 실시간 활동 공간 데이터를 불러오는 중입니다...
                  </div>
                ) : ranked.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    활동 지도에서 먼저 금산군 공간 데이터를 불러오면 이곳에
                    맞춤 점수가 자동 계산됩니다.
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-200">
                    {ranked.slice(0, 8).map((item, idx) => {
                      const catCfg =
                        CATEGORY_MAP[item.place.categoryId] ??
                        CATEGORY_MAP.youth_culture;
                      const isSaved = Boolean(savedPlaceIds[item.place.id]);
                      const isInCourse = Boolean(coursePlaceIds[item.place.id]);

                      return (
                        <li key={item.place.id} className="p-5 space-y-3.5">
                          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                            <img
                              src={
                                item.place.photoUrl || FALLBACK_FACILITY_IMAGE
                              }
                              alt={item.place.displayName}
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                const img = e.currentTarget;
                                if (img.src !== FALLBACK_FACILITY_IMAGE) {
                                  img.src = FALLBACK_FACILITY_IMAGE;
                                }
                              }}
                              className="w-full sm:w-24 h-36 sm:h-24 rounded-lg object-cover bg-slate-100 shrink-0 border border-slate-200/70"
                            />

                            <div className="flex-1 min-w-0 space-y-1.5">
                              {/* Unboxed metadata row */}
                              <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-500">
                                <span className="font-mono font-bold text-slate-900 tabular-nums">
                                  #{idx + 1}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span
                                  className="font-semibold"
                                  style={{ color: catCfg.textColor }}
                                >
                                  {catCfg.label}
                                </span>
                                {item.distanceKm !== null && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-mono tabular-nums">
                                      약 {item.distanceKm.toFixed(1)}km
                                    </span>
                                  </>
                                )}
                                {typeof item.place.rating === 'number' && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="inline-flex items-center gap-0.5 tabular-nums text-slate-700 font-medium">
                                      <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                                      {item.place.rating.toFixed(1)}
                                    </span>
                                  </>
                                )}
                              </div>

                              <div className="flex items-baseline justify-between gap-3">
                                <h3 className="text-base font-bold text-slate-900 truncate">
                                  {item.place.displayName}
                                </h3>
                                <div className="shrink-0 text-right">
                                  <span className="text-lg font-bold text-teal-800 font-mono tabular-nums">
                                    {item.totalScore}
                                  </span>
                                  <span className="text-xs text-slate-500 ml-0.5">
                                    / 100점
                                  </span>
                                </div>
                              </div>

                              <p className="text-xs text-slate-500 truncate">
                                {item.place.formattedAddress}
                              </p>

                              {/* Transparent Reasons */}
                              <div className="text-xs text-slate-700 pt-0.5">
                                {item.reasons.join(' · ')}
                              </div>

                              {/* 5-Factor Score Bars */}
                              <div className="grid grid-cols-5 gap-2 pt-2">
                                {(
                                  [
                                    ['관심', item.breakdown.interestScore],
                                    ['연령', item.breakdown.ageScore],
                                    ['거리', item.breakdown.distanceScore],
                                    ['운영', item.breakdown.availabilityScore],
                                    ['평점', item.breakdown.qualityScore],
                                  ] as [string, number][]
                                ).map(([label, val]) => (
                                  <div key={label} className="space-y-1">
                                    <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                                      <span>{label}</span>
                                      <span className="font-mono text-slate-700">
                                        {val}
                                      </span>
                                    </div>
                                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-teal-700 rounded-full"
                                        style={{ width: `${val}%` }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Suggested Program Templates */}
                              {item.matchedPrograms.length > 0 && (
                                <div className="pt-2.5 text-xs text-slate-600 space-y-1">
                                  {item.matchedPrograms.map((prog) => (
                                    <div
                                      key={prog.id}
                                      className="bg-slate-50 border border-slate-200/70 rounded-lg px-3 py-2"
                                    >
                                      <span className="font-semibold text-slate-900">
                                        추천 활동 유형: {prog.title}
                                      </span>
                                      <span className="text-slate-500 ml-1.5 tabular-nums">
                                        (권장 만 {prog.minAge}~{prog.maxAge}세)
                                      </span>
                                      <p className="text-slate-600 mt-0.5">
                                        {prog.suggestedActivities.join(' / ')}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Row Actions */}
                          <div className="flex flex-wrap items-center gap-2 pt-1 sm:pl-28">
                            <button
                              type="button"
                              onClick={() => onOpenOnMap(item.place)}
                              className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                            >
                              지도에서 위치 보기
                            </button>
                            <button
                              type="button"
                              onClick={() => onAddToCourse(item.place)}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                                isInCourse
                                  ? 'bg-teal-50 border-teal-300 text-teal-800'
                                  : 'bg-teal-700 border-teal-700 text-white hover:bg-teal-800'
                              }`}
                            >
                              <Route className="w-3.5 h-3.5" />
                              {isInCourse ? '코스에 포함됨' : '활동 코스 추가'}
                            </button>
                            <button
                              type="button"
                              onClick={() => onToggleSave(item.place)}
                              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                                isSaved
                                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {isSaved ? (
                                <>
                                  <BookmarkCheck className="w-3.5 h-3.5" />
                                  저장됨
                                </>
                              ) : (
                                <>
                                  <Bookmark className="w-3.5 h-3.5" />
                                  보관함 저장
                                </>
                              )}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </div>
        ) : (
          /* Tab 2: Algorithm & UI Architecture Specification */
          <div className="space-y-6">
            <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-bold text-slate-900">
                01. 다중 요소 가중치 추천 알고리즘 설계 (Hybrid Matching Pipeline)
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                금산군처럼 읍·면 간 이동 거리가 중요한 지역 특성을 반영해,{' '}
                <strong>1단계 규칙·가중치 점수화(즉시 반응, 설명 가능)</strong>
                와{' '}
                <strong>
                  2단계 Google Maps Grounding 기반 생성형 AI 심화 매칭(최신
                  시설·프로그램 맥락 보강)
                </strong>
                을 결합한 하이브리드 파이프라인으로 설계했습니다.
              </p>

              <div className="bg-slate-900 text-slate-100 rounded-lg p-4 font-mono text-xs md:text-sm overflow-x-auto tabular-nums">
                TotalScore = ({ALGORITHM_WEIGHTS.interest.toFixed(2)} × S_interest) +
                ({ALGORITHM_WEIGHTS.age.toFixed(2)} × S_age) + (
                {ALGORITHM_WEIGHTS.distance.toFixed(2)} × S_distance) + (
                {ALGORITHM_WEIGHTS.availability.toFixed(2)} × S_availability) + (
                {ALGORITHM_WEIGHTS.quality.toFixed(2)} × S_quality)
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs md:text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2.5 pr-4 font-semibold">평가 요소</th>
                      <th className="py-2.5 pr-4 font-semibold text-right">
                        가중치
                      </th>
                      <th className="py-2.5 pr-4 font-semibold">산출 방식</th>
                      <th className="py-2.5 font-semibold">설계 의도</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    <tr>
                      <td className="py-3 pr-4 font-semibold text-slate-900">
                        관심 분야 적합도 (S_interest)
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums">
                        40%
                      </td>
                      <td className="py-3 pr-4">
                        주 매칭 70% + 다중 관심사 평균 30% 블렌딩 (카테고리 +
                        시설 유형·명칭 키워드 매칭)
                      </td>
                      <td className="py-3">
                        복수 관심사(예: 예술+봉사)를 선택해도 핵심 1순위 시설이
                        희석되지 않도록 보정
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-semibold text-slate-900">
                        연령대 적합도 (S_age)
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums">
                        25%
                      </td>
                      <td className="py-3 pr-4">
                        발달 단계 구간(9~12 / 13~15 / 16~18 / 19~24세)별 거리
                        감점 + 권장 프로그램 연령 일치 가산
                      </td>
                      <td className="py-3">
                        초등~후기청소년 간 이용 가능 프로그램 및 안전 수준 차이
                        반영
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-semibold text-slate-900">
                        접근성·권역 거리 (S_distance)
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums">
                        15%
                      </td>
                      <td className="py-3 pr-4">
                        지수 감쇠 <code>100 × exp(-d / 14km)</code> + 선택 읍·면
                        주소 일치 시 +18점 가산
                      </td>
                      <td className="py-3">
                        금산군 읍·면 생활권 이동 부담을 현실적인 반경(14km
                        스케일)으로 반영
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-semibold text-slate-900">
                        시간·운영 적합도 (S_availability)
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums">
                        10%
                      </td>
                      <td className="py-3 pr-4">
                        Google Places 실시간 운영 상태 + 선호 시간대(방과 후 /
                        주말 / 방학) 일치 가산
                      </td>
                      <td className="py-3">
                        실제 방문 가능한 운영 중 시설을 우선 노출
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-semibold text-slate-900">
                        품질 신뢰도 (S_quality)
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular-nums">
                        10%
                      </td>
                      <td className="py-3 pr-4">
                        베이지안 평균 평점{' '}
                        <code>(v/(v+8))·R + (8/(v+8))·4.1</code>
                      </td>
                      <td className="py-3">
                        리뷰 수가 적은 신규 소규모 시설의 극단치 왜곡 방지
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-bold text-slate-900">
                02. 원스톱 서비스 UI 정보 구조 (IA &amp; 화면 흐름)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="border border-slate-200 rounded-lg p-4 space-y-2">
                  <div className="text-xs font-mono text-teal-800 font-semibold">
                    STEP 1 · 입력 패널 (좌측 4컬럼)
                  </div>
                  <h3 className="font-bold text-slate-900">
                    4단계 경량 프로파일링
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    복잡한 회원가입 없이 나이 슬라이더(9~24세), 관심 분야 다중
                    선택, 시간대·활동 성향, 금산 읍·면 권역을 10초 안에 설정하면
                    즉시 추천 점수가 재계산됩니다.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 space-y-2">
                  <div className="text-xs font-mono text-teal-800 font-semibold">
                    STEP 2 · 설명 가능한 결과 카드 (우측 8컬럼)
                  </div>
                  <h3 className="font-bold text-slate-900">
                    투명한 5요소 점수 &amp; AI 그라운딩
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    각 시설 카드에 100점 만점 점수와 5개 막대 그래프, 추천 사유,
                    권장 활동 프로그램 유형을 제시하며 상단 버튼으로 Google Maps
                    실시간 출처 기반 AI 리포트를 확장합니다.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 space-y-2">
                  <div className="text-xs font-mono text-teal-800 font-semibold">
                    STEP 3 · 지도·코스·보관함 원스톱 연계
                  </div>
                  <h3 className="font-bold text-slate-900">
                    탐색에서 실제 이동까지 연결
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    추천 결과에서 바로 &lsquo;지도에서 위치 보기&rsquo;,
                    &lsquo;활동 코스 추가&rsquo;(Routes API 경로 계산),
                    &lsquo;보관함 저장&rsquo;(체크리스트 관리)으로 이어져 이탈
                    없이 실행으로 연결됩니다.
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

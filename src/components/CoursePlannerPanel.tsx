import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Bus,
  Car,
  ExternalLink,
  Footprints,
  Loader2,
  LocateFixed,
  Navigation,
  Share2,
  Trash2,
} from 'lucide-react';
import { AutocompleteSearch } from './AutocompleteSearch';
import { formatDistance, formatDuration } from '../constants/geumsan';
import type {
  CourseStop,
  RouteSummary,
  TravelModeOption,
  YouthPlaceItem,
} from '../types/youthMap';

interface CoursePlannerPanelProps {
  stops: CourseStop[];
  travelMode: TravelModeOption;
  routeSummary: RouteSummary | null;
  routeError: string | null;
  isComputingRoute: boolean;
  hasUserLocation: boolean;
  selectedLegIndex: number | null;
  onSelectLeg: (legIndex: number | null) => void;
  onChangeTravelMode: (mode: TravelModeOption) => void;
  onAddPlaceStop: (place: YouthPlaceItem) => void;
  onUseCurrentLocationAsOrigin: () => void;
  onMoveStop: (index: number, direction: 'up' | 'down') => void;
  onRemoveStop: (id: string) => void;
  onClearStops: () => void;
  onRecomputeRoute: () => void;
  onShareCourse: () => void;
}

const TRAVEL_MODES: {
  id: TravelModeOption;
  label: string;
  icon: typeof Bus;
}[] = [
  { id: 'TRANSIT', label: '대중교통', icon: Bus },
  { id: 'DRIVING', label: '자동차', icon: Car },
  { id: 'WALKING', label: '도보', icon: Footprints },
];

function buildGoogleMapsDirectionsUrl(
  stops: CourseStop[],
  mode: TravelModeOption
): string {
  if (stops.length < 2) return 'https://www.google.com/maps';
  const origin = `${stops[0].location.lat},${stops[0].location.lng}`;
  const destination = `${stops[stops.length - 1].location.lat},${stops[stops.length - 1].location.lng}`;
  const travelmodeParam =
    mode === 'TRANSIT' ? 'transit' : mode === 'WALKING' ? 'walking' : 'driving';

  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: travelmodeParam,
  });

  if (stops.length > 2) {
    const waypoints = stops
      .slice(1, -1)
      .map((s) => `${s.location.lat},${s.location.lng}`)
      .join('|');
    params.set('waypoints', waypoints);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function CoursePlannerPanel({
  stops,
  travelMode,
  routeSummary,
  routeError,
  isComputingRoute,
  hasUserLocation,
  selectedLegIndex,
  onSelectLeg,
  onChangeTravelMode,
  onAddPlaceStop,
  onUseCurrentLocationAsOrigin,
  onMoveStop,
  onRemoveStop,
  onClearStops,
  onRecomputeRoute,
  onShareCourse,
}: CoursePlannerPanelProps) {
  const externalDirUrl = buildGoogleMapsDirectionsUrl(stops, travelMode);

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              원스톱 활동 코스 &amp; 길찾기
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              학교·집에서 금산 청소년 활동 공간까지 이동 동선을 한 번에 계획합니다.
            </p>
          </div>
          {stops.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onShareCourse}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                <Share2 className="w-3.5 h-3.5" />
                공유
              </button>
              <button
                type="button"
                onClick={onClearStops}
                className="text-xs font-medium text-slate-500 hover:text-rose-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                초기화
              </button>
            </div>
          )}
        </div>

        {/* Travel Mode Segmented Control */}
        <div
          role="group"
          aria-label="이동 수단 선택"
          className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg"
        >
          {TRAVEL_MODES.map((item) => {
            const Icon = item.icon;
            const active = travelMode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeTravelMode(item.id)}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-white text-teal-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Add Stop via Autocomplete or Current Location */}
        <div className="space-y-2">
          <AutocompleteSearch
            compact
            placeholder="출발지 또는 경유·도착지 추가 (예: 금산고, 금산터미널)"
            onSelectPlace={onAddPlaceStop}
          />
          <button
            type="button"
            onClick={onUseCurrentLocationAsOrigin}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium text-teal-800 bg-teal-50/70 hover:bg-teal-50 border border-teal-200/80 rounded-lg transition-colors cursor-pointer"
          >
            <LocateFixed className="w-3.5 h-3.5" />
            {hasUserLocation
              ? '현재 내 위치를 출발지로 설정'
              : '현재 내 위치 불러와 출발지로 설정'}
          </button>
        </div>
      </div>

      {/* Scrollable stops & route result */}
      <div className="flex-1 overflow-y-auto panel-scroll p-4 space-y-5">
        {stops.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <Navigation className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">
              아직 추가된 활동 코스가 없습니다
            </p>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
              위 검색창에서 출발지(학교, 터미널 등)를 추가하거나, 활동 지도에서
              원하는 시설의 &lsquo;활동 코스 추가&rsquo; 버튼을 눌러 동선을
              구성해 보세요.
            </p>
          </div>
        ) : (
          <>
            {/* Stops list */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span>코스 경유 순서 (최대 6개 지점)</span>
                <span className="tabular-nums font-medium text-slate-700">
                  {stops.length}개 지점
                </span>
              </div>

              <ol className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white overflow-hidden">
                {stops.map((stop, idx) => {
                  const roleLabel =
                    idx === 0
                      ? '출발'
                      : idx === stops.length - 1
                        ? '도착'
                        : `경유 ${idx}`;

                  return (
                    <li
                      key={stop.id}
                      className="px-3 py-2.5 flex items-center gap-2.5 hover:bg-slate-50/70"
                    >
                      <span
                        className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 tabular-nums ${
                          idx === 0
                            ? 'bg-teal-700 text-white'
                            : idx === stops.length - 1
                              ? 'bg-amber-600 text-white'
                              : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {idx + 1}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <span className="font-medium text-slate-500">
                            {roleLabel}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {stop.label}
                        </div>
                        {stop.address && (
                          <div className="text-xs text-slate-500 truncate">
                            {stop.address}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onMoveStop(idx, 'up')}
                          disabled={idx === 0}
                          aria-label="위로 이동"
                          className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveStop(idx, 'down')}
                          disabled={idx === stops.length - 1}
                          aria-label="아래로 이동"
                          className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveStop(stop.id)}
                          aria-label={`${stop.label} 삭제`}
                          className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            {stops.length === 1 && (
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
                도착지 또는 경유지를 1곳 이상 더 추가하면 경로와 예상 소요
                시간이 지도에 표시됩니다.
              </p>
            )}

            {/* Computing state */}
            {isComputingRoute && (
              <div className="flex items-center gap-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
                <Loader2 className="w-4 h-4 animate-spin text-teal-700 shrink-0" />
                최적 활동 경로를 계산하는 중입니다...
              </div>
            )}

            {/* Route warning / fallback explanation */}
            {!isComputingRoute && routeError && (
              <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 leading-relaxed">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p>{routeError}</p>
                  {travelMode !== 'TRANSIT' && (
                    <button
                      type="button"
                      onClick={() => onChangeTravelMode('TRANSIT')}
                      className="text-xs font-semibold text-teal-800 underline cursor-pointer"
                    >
                      대중교통 경로로 다시 계산하기
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Route Summary Metrics */}
            {!isComputingRoute && routeSummary && stops.length >= 2 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <div>
                    <div className="text-xs text-slate-500">
                      {routeSummary.isFallbackLine
                        ? '직선 기준 총 거리'
                        : '총 이동 거리'}
                    </div>
                    <div className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                      {formatDistance(routeSummary.distanceMeters)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">
                      {routeSummary.isFallbackLine
                        ? '참고 예상 시간'
                        : '예상 소요 시간'}
                    </div>
                    <div className="text-xl font-bold text-teal-800 font-mono tabular-nums mt-0.5">
                      {routeSummary.durationMillis > 0
                        ? `${routeSummary.isFallbackLine ? '약 ' : ''}${formatDuration(routeSummary.durationMillis)}`
                        : '지도 앱 확인'}
                    </div>
                  </div>
                </div>

                {/* Interactive Per-leg breakdown synced with map overlays */}
                {routeSummary.legs.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-medium">
                        구간별 거리·소요 시간 (클릭 시 지도 강조)
                      </span>
                      {selectedLegIndex !== null && (
                        <button
                          type="button"
                          onClick={() => onSelectLeg(null)}
                          className="text-teal-700 font-medium hover:underline cursor-pointer"
                        >
                          전체 보기
                        </button>
                      )}
                    </div>
                    <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden bg-white">
                      {routeSummary.legs.map((leg, idx) => {
                        const isActiveLeg = selectedLegIndex === idx;
                        return (
                          <li key={idx}>
                            <button
                              type="button"
                              onClick={() =>
                                onSelectLeg(isActiveLeg ? null : idx)
                              }
                              className={`w-full px-3 py-2.5 flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer ${
                                isActiveLeg
                                  ? 'bg-teal-50 text-teal-950'
                                  : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[11px] font-bold font-mono tabular-nums shrink-0 ${
                                    isActiveLeg
                                      ? 'bg-teal-700 text-white'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {idx + 1}→{idx + 2}
                                </span>
                                <span className="text-xs font-medium truncate">
                                  {leg.startLabel} → {leg.endLabel}
                                </span>
                              </div>
                              <span className="text-xs font-mono tabular-nums shrink-0 font-semibold text-slate-800">
                                {formatDistance(leg.distanceMeters)}
                                {leg.durationMillis > 0
                                  ? ` · ${leg.isEstimatedFallback ? '약 ' : ''}${formatDuration(leg.durationMillis)}`
                                  : ''}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* External navigation, share & recompute */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <a
                      href={externalDirUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Google 지도 길찾기 열기
                    </a>
                    <button
                      type="button"
                      onClick={onShareCourse}
                      className="px-3.5 py-2.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      코스 공유
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={onRecomputeRoute}
                    className="w-full py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    경로 다시 계산
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

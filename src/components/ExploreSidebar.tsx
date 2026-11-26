import {
  AlertCircle,
  Bookmark,
  BookmarkCheck,
  Clock,
  MapPin,
  Plus,
  Route,
  Star,
} from 'lucide-react';
import {
  ACTIVITY_CATEGORIES,
  CATEGORY_MAP,
  FALLBACK_FACILITY_IMAGE,
  GEUMSAN_TOWNS,
} from '../constants/geumsan';
import { AutocompleteSearch } from './AutocompleteSearch';
import type {
  ActivityCategoryId,
  GeumsanTownId,
  YouthPlaceItem,
} from '../types/youthMap';

interface ExploreSidebarProps {
  places: YouthPlaceItem[];
  isLoading: boolean;
  error: string | null;
  lastQueryLabel: string;
  category: ActivityCategoryId;
  town: GeumsanTownId;
  openNowOnly: boolean;
  selectedPlaceId: string | null;
  savedPlaceIds: Record<string, boolean>;
  coursePlaceIds: Record<string, boolean>;
  onSelectCategory: (category: ActivityCategoryId) => void;
  onSelectTown: (town: GeumsanTownId) => void;
  onToggleOpenNow: () => void;
  onSelectPlace: (place: YouthPlaceItem) => void;
  onAutocompletePlace: (place: YouthPlaceItem) => void;
  onSearchKeyword: (keyword: string) => void;
  onToggleSave: (place: YouthPlaceItem) => void;
  onAddToCourse: (place: YouthPlaceItem) => void;
  onResetFilters: () => void;
  onOpenGuide: () => void;
}

export function ExploreSidebar({
  places,
  isLoading,
  error,
  lastQueryLabel,
  category,
  town,
  openNowOnly,
  selectedPlaceId,
  savedPlaceIds,
  coursePlaceIds,
  onSelectCategory,
  onSelectTown,
  onToggleOpenNow,
  onSelectPlace,
  onAutocompletePlace,
  onSearchKeyword,
  onToggleSave,
  onAddToCourse,
  onResetFilters,
  onOpenGuide,
}: ExploreSidebarProps) {
  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* Search & Filter Controls */}
      <div className="p-4 border-b border-slate-200 space-y-3.5 shrink-0">
        <AutocompleteSearch
          onSelectPlace={onAutocompletePlace}
          onSubmitKeyword={onSearchKeyword}
        />

        {/* Category segmented buttons */}
        <div
          role="group"
          aria-label="청소년 활동 분야 필터"
          className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg"
        >
          {ACTIVITY_CATEGORIES.map((cat) => {
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectCategory(cat.id)}
                className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate cursor-pointer ${
                  active
                    ? 'bg-white text-teal-800 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat.shortLabel}
              </button>
            );
          })}
        </div>

        {/* Town quick-filter & Open-now toggle */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 overflow-x-auto panel-scroll pb-0.5">
            {GEUMSAN_TOWNS.map((t) => {
              const active = town === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTown(t.id)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {t.id === 'all' ? '전체 권역' : t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Status summary bar + open-now filter */}
        <div className="flex items-center justify-between gap-2 pt-0.5 text-xs">
          <div className="text-slate-500 truncate">
            <span>{lastQueryLabel || '금산군 활동 공간'}</span>
            {!isLoading && (
              <>
                <span aria-hidden="true" className="mx-1.5">
                  ·
                </span>
                <span className="font-semibold text-slate-800 tabular-nums">
                  {places.length}곳
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onToggleOpenNow}
            aria-pressed={openNowOnly}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              openNowOnly
                ? 'bg-teal-50 border-teal-300 text-teal-800'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Clock className="w-3 h-3" />
            운영 중만
          </button>
        </div>
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto panel-scroll">
        {isLoading ? (
          <div className="divide-y divide-slate-200" aria-busy="true">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="p-4 flex gap-3 animate-pulse">
                <div className="w-16 h-16 rounded-lg bg-slate-200 shrink-0" />
                <div className="flex-1 space-y-2 py-0.5">
                  <div className="h-3 bg-slate-200 rounded w-1/3" />
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-5/6" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-6 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
            <p className="text-sm font-medium text-slate-800">{error}</p>
            <button
              type="button"
              onClick={onResetFilters}
              className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
            >
              전체 권역으로 다시 검색
            </button>
          </div>
        ) : places.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <MapPin className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-800">
                조건에 맞는 활동 공간을 찾지 못했습니다
              </p>
              <p className="text-xs text-slate-500 leading-relaxed">
                권역 필터를 &lsquo;전체 권역&rsquo;으로 넓히거나 &lsquo;운영
                중만&rsquo; 필터를 해제해 보세요.
              </p>
            </div>
            <button
              type="button"
              onClick={onResetFilters}
              className="px-4 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
            >
              필터 초기화
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {places.map((place, index) => {
              const catCfg =
                CATEGORY_MAP[place.categoryId] ?? CATEGORY_MAP.youth_culture;
              const isSelected = selectedPlaceId === place.id;
              const isSaved = Boolean(savedPlaceIds[place.id]);
              const isInCourse = Boolean(coursePlaceIds[place.id]);

              return (
                <li
                  key={place.id}
                  className={`transition-colors ${
                    isSelected ? 'bg-teal-50/55' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="p-4 flex items-start gap-3">
                    {/* Clickable Main Content */}
                    <button
                      type="button"
                      onClick={() => onSelectPlace(place)}
                      className="flex items-start gap-3 flex-1 min-w-0 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-teal-700 rounded"
                    >
                      <div className="relative w-16 h-16 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200/70">
                        <img
                          src={place.photoUrl || FALLBACK_FACILITY_IMAGE}
                          alt={place.displayName}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (target.src !== FALLBACK_FACILITY_IMAGE) {
                              target.src = FALLBACK_FACILITY_IMAGE;
                            }
                          }}
                          className="w-full h-full object-cover"
                        />
                        <span
                          className="absolute top-1 left-1 min-w-5 h-5 px-1 rounded text-[10px] font-bold text-white flex items-center justify-center tabular-nums shadow-xs"
                          style={{ backgroundColor: catCfg.color }}
                        >
                          {index + 1}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        {/* Unboxed metadata row */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <span
                            className="font-semibold truncate"
                            style={{ color: catCfg.textColor }}
                          >
                            {catCfg.shortLabel}
                          </span>
                          {typeof place.rating === 'number' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-0.5 text-slate-700 font-medium tabular-nums shrink-0">
                                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                                {place.rating.toFixed(1)}
                                {typeof place.userRatingCount === 'number' && (
                                  <span className="text-slate-400 font-normal">
                                    ({place.userRatingCount})
                                  </span>
                                )}
                              </span>
                            </>
                          )}
                        </div>

                        <h3 className="text-sm font-bold text-slate-900 truncate mt-0.5">
                          {place.displayName}
                        </h3>

                        <p className="text-xs text-slate-500 truncate mt-1">
                          {place.formattedAddress}
                        </p>
                      </div>
                    </button>

                    {/* Compact Quick Actions */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleSave(place)}
                        aria-label={isSaved ? '보관함에서 제거' : '보관함에 저장'}
                        title={isSaved ? '보관함 저장됨' : '보관함에 저장'}
                        className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                          isSaved
                            ? 'bg-amber-50 border-amber-200 text-amber-700'
                            : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700'
                        }`}
                      >
                        {isSaved ? (
                          <BookmarkCheck className="w-3.5 h-3.5" />
                        ) : (
                          <Bookmark className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => onAddToCourse(place)}
                        aria-label={
                          isInCourse ? '활동 코스에 포함됨' : '활동 코스에 추가'
                        }
                        title={
                          isInCourse ? '활동 코스에 포함됨' : '활동 코스에 추가'
                        }
                        className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                          isInCourse
                            ? 'bg-teal-50 border-teal-300 text-teal-800'
                            : 'bg-white border-slate-200 text-slate-500 hover:text-teal-700 hover:border-teal-300'
                        }`}
                      >
                        {isInCourse ? (
                          <Route className="w-3.5 h-3.5" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Subtle Utility Footer */}
      <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between text-xs text-slate-500 shrink-0">
        <span>충남 금산군 청소년 활동 안내</span>
        <button
          type="button"
          onClick={onOpenGuide}
          className="font-medium text-teal-800 hover:underline cursor-pointer"
        >
          이용 안내
        </button>
      </div>
    </div>
  );
}

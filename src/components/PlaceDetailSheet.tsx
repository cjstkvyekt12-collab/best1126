import { useState } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  Plus,
  Route,
  Star,
  X,
} from 'lucide-react';
import { CATEGORY_MAP, FALLBACK_FACILITY_IMAGE } from '../constants/geumsan';
import type { YouthPlaceItem } from '../types/youthMap';

interface PlaceDetailSheetProps {
  place: YouthPlaceItem;
  isLoadingDetails: boolean;
  isSaved: boolean;
  isInCourse: boolean;
  onClose: () => void;
  onToggleSave: (place: YouthPlaceItem) => void;
  onAddToCourse: (place: YouthPlaceItem) => void;
  onQuickDirections: (place: YouthPlaceItem) => void;
}

export function PlaceDetailSheet({
  place,
  isLoadingDetails,
  isSaved,
  isInCourse,
  onClose,
  onToggleSave,
  onAddToCourse,
  onQuickDirections,
}: PlaceDetailSheetProps) {
  const [imgError, setImgError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHours, setShowHours] = useState(false);

  const categoryCfg = CATEGORY_MAP[place.categoryId] ?? CATEGORY_MAP.youth_culture;
  const imageSrc = !imgError && place.photoUrl ? place.photoUrl : FALLBACK_FACILITY_IMAGE;

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(place.formattedAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const openStatusText =
    place.isOpenNow === true
      ? '현재 운영 중'
      : place.isOpenNow === false
        ? '운영 종료'
        : place.businessStatus === 'OPERATIONAL'
          ? '정상 운영 시설'
          : null;

  return (
    <aside
      aria-label="선택된 활동 공간 상세 정보"
      className="h-full flex flex-col bg-white overflow-hidden"
    >
      {/* Top sticky utility row inside panel */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer whitespace-nowrap"
        >
          ← 목록으로 돌아가기
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="상세 정보 닫기"
          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto panel-scroll">
        {/* Photo banner with clean fallback */}
        <div className="relative w-full aspect-[16/10] bg-slate-100 overflow-hidden">
          <img
            src={imageSrc}
            alt={`${place.displayName} 전경`}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
          {!place.photoUrl || imgError ? (
            <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-slate-900/65 text-[11px] text-white rounded">
              금산 청소년 활동 공간 예시 이미지
            </div>
          ) : null}
        </div>

        <div className="p-5 space-y-5">
          {/* Title & Clean Unboxed Metadata */}
          <div>
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500 mb-1.5">
              <span
                className="font-semibold"
                style={{ color: categoryCfg.textColor }}
              >
                {categoryCfg.label}
              </span>
              {typeof place.rating === 'number' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 text-slate-700 font-medium tabular-nums">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    {place.rating.toFixed(1)}
                    {typeof place.userRatingCount === 'number' && (
                      <span className="text-slate-400 font-normal">
                        ({place.userRatingCount})
                      </span>
                    )}
                  </span>
                </>
              )}
              {openStatusText && (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      place.isOpenNow === true
                        ? 'text-emerald-700 font-medium'
                        : place.isOpenNow === false
                          ? 'text-rose-700 font-medium'
                          : 'text-slate-600'
                    }
                  >
                    {openStatusText}
                  </span>
                </>
              )}
            </div>

            <h2 className="text-xl font-bold text-slate-900 leading-snug">
              {place.displayName}
            </h2>

            {place.editorialSummary && (
              <p className="text-sm text-slate-600 leading-relaxed mt-2">
                {place.editorialSummary}
              </p>
            )}
          </div>

          {/* Primary one-stop actions */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onQuickDirections(place)}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Navigation className="w-4 h-4 shrink-0" />
              도착지 길찾기
            </button>
            <button
              type="button"
              onClick={() => onAddToCourse(place)}
              className={`flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                isInCourse
                  ? 'bg-teal-50 border-teal-200 text-teal-800 hover:bg-teal-100'
                  : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
              }`}
            >
              {isInCourse ? (
                <>
                  <Route className="w-4 h-4 shrink-0" />
                  코스에 포함됨
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 shrink-0" />
                  활동 코스 추가
                </>
              )}
            </button>
          </div>

          {/* Secondary utility actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => onToggleSave(place)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                isSaved
                  ? 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {isSaved ? (
                <>
                  <BookmarkCheck className="w-3.5 h-3.5" />
                  내 보관함 저장됨
                </>
              ) : (
                <>
                  <Bookmark className="w-3.5 h-3.5" />
                  내 보관함에 저장
                </>
              )}
            </button>

            {place.googleMapsURI && (
              <a
                href={place.googleMapsURI}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Google 지도
              </a>
            )}
          </div>

          <hr className="border-slate-200" />

          {/* Detailed Facility Info */}
          <div className="space-y-3.5 text-sm">
            {isLoadingDetails && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-700" />
                최신 운영 시간 및 연락처 확인 중...
              </div>
            )}

            {/* Address */}
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-slate-800 leading-snug">
                  {place.formattedAddress}
                </p>
                <button
                  type="button"
                  onClick={() => void handleCopyAddress()}
                  className="inline-flex items-center gap-1 text-xs text-teal-700 hover:text-teal-800 font-medium mt-1 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3" />
                      주소가 복사되었습니다
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      주소 복사
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Phone */}
            {place.nationalPhoneNumber && (
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                <a
                  href={`tel:${place.nationalPhoneNumber}`}
                  className="text-slate-800 hover:text-teal-700 font-mono text-xs md:text-sm tabular-nums"
                >
                  {place.nationalPhoneNumber}
                </a>
              </div>
            )}

            {/* Website */}
            {place.websiteURI && (
              <div className="flex items-center gap-3">
                <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                <a
                  href={place.websiteURI}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-700 hover:underline truncate text-sm"
                >
                  {place.websiteURI.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}

            {/* Opening Hours */}
            {place.weekdayDescriptions && place.weekdayDescriptions.length > 0 && (
              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <button
                    type="button"
                    onClick={() => setShowHours((prev) => !prev)}
                    className="text-sm font-medium text-slate-800 hover:text-teal-700 cursor-pointer flex items-center gap-1.5"
                  >
                    <span>요일별 운영 시간</span>
                    <span className="text-xs text-slate-400">
                      {showHours ? '접기' : '펼치기'}
                    </span>
                  </button>
                  {showHours && (
                    <ul className="mt-2 space-y-1 text-xs text-slate-600 tabular-nums">
                      {place.weekdayDescriptions.map((line, i) => (
                        <li key={i} className="leading-relaxed">
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>

          <hr className="border-slate-200" />

          {/* Coordinates reference for educators / safety planning */}
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>위치 좌표 (WGS84)</span>
            <span className="font-mono tabular-nums text-slate-600">
              {place.location.lat.toFixed(5)}, {place.location.lng.toFixed(5)}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

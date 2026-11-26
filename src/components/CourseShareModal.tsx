import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  FileText,
  Link2,
  Loader2,
  Share2,
  X,
} from 'lucide-react';
import { formatDistance, formatDuration } from '../constants/geumsan';
import {
  buildCourseShareSummaryText,
  copyTextToClipboard,
  createCourseShareLink,
  type GeneratedShareLink,
} from '../utils/courseShare';
import type {
  CourseStop,
  RouteSummary,
  TravelModeOption,
} from '../types/youthMap';

interface CourseShareModalProps {
  isOpen: boolean;
  stops: CourseStop[];
  travelMode: TravelModeOption;
  routeSummary: RouteSummary | null;
  onClose: () => void;
  onNotify: (message: string) => void;
}

const MODE_LABELS: Record<TravelModeOption, string> = {
  TRANSIT: '대중교통',
  DRIVING: '자동차',
  WALKING: '도보',
};

export function CourseShareModal({
  isOpen,
  stops,
  travelMode,
  routeSummary,
  onClose,
  onNotify,
}: CourseShareModalProps) {
  const hasCurrentLocation = useMemo(
    () => stops.some((s) => s.isCurrentLocation),
    [stops]
  );

  const [includeCurrentLocation, setIncludeCurrentLocation] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareLink, setShareLink] = useState<GeneratedShareLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedMode, setCopiedMode] = useState<'url' | 'summary' | null>(null);

  const effectiveStops = useMemo(
    () => stops.filter((s) => includeCurrentLocation || !s.isCurrentLocation),
    [stops, includeCurrentLocation]
  );

  useEffect(() => {
    if (!isOpen) return;
    setCopiedMode(null);

    if (effectiveStops.length === 0) {
      setShareLink(null);
      setError('공유할 코스 지점이 최소 1개 이상 필요합니다.');
      return;
    }

    let cancelled = false;
    setIsGenerating(true);
    setError(null);

    createCourseShareLink(stops, travelMode, includeCurrentLocation)
      .then((result) => {
        if (cancelled) return;
        setShareLink(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : '공유 링크를 생성하지 못했습니다. 다시 시도해 주세요.'
        );
      })
      .finally(() => {
        if (!cancelled) setIsGenerating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, stops, travelMode, includeCurrentLocation, effectiveStops.length]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleCopyUrl = async () => {
    if (!shareLink) return;
    const ok = await copyTextToClipboard(shareLink.url);
    if (ok) {
      setCopiedMode('url');
      onNotify('짧은 코스 공유 링크를 클립보드에 복사했습니다.');
      window.setTimeout(() => {
        setCopiedMode((curr) => (curr === 'url' ? null : curr));
      }, 2200);
    } else {
      onNotify('자동 복사가 제한되었습니다. 주소창의 링크를 직접 선택해 복사해 주세요.');
    }
  };

  const handleCopySummary = async () => {
    if (!shareLink) return;
    const text = buildCourseShareSummaryText(
      stops,
      travelMode,
      routeSummary,
      shareLink.url,
      includeCurrentLocation
    );
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedMode('summary');
      onNotify('코스 일정 요약과 공유 링크를 클립보드에 복사했습니다.');
      window.setTimeout(() => {
        setCopiedMode((curr) => (curr === 'summary' ? null : curr));
      }, 2200);
    } else {
      onNotify('클립보드 복사에 실패했습니다.');
    }
  };

  const handleNativeShare = async () => {
    if (!shareLink || !canNativeShare) return;
    const text = buildCourseShareSummaryText(
      stops,
      travelMode,
      routeSummary,
      shareLink.url,
      includeCurrentLocation
    );
    try {
      await navigator.share({
        title: '금산 청소년 활동 코스',
        text,
        url: shareLink.url,
      });
    } catch {
      // User dismissed native share sheet
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="course-share-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-teal-700 shrink-0" />
            <h2
              id="course-share-title"
              className="text-base font-bold text-slate-900"
            >
              활동 코스 공유하기
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="공유 창 닫기"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Course preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                {MODE_LABELS[travelMode]}
                <span aria-hidden="true" className="mx-1.5">
                  ·
                </span>
                <span className="tabular-nums font-medium text-slate-700">
                  {effectiveStops.length}개 지점
                </span>
              </span>
              {routeSummary && effectiveStops.length >= 2 && (
                <span className="font-mono tabular-nums text-slate-700 font-medium">
                  {formatDistance(routeSummary.distanceMeters)}
                  {routeSummary.durationMillis > 0
                    ? ` · ${routeSummary.isFallbackLine ? '약 ' : ''}${formatDuration(routeSummary.durationMillis)}`
                    : ''}
                </span>
              )}
            </div>

            <ol className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-slate-50/70 max-h-40 overflow-y-auto panel-scroll">
              {effectiveStops.map((stop, idx) => (
                <li
                  key={stop.id}
                  className="px-3 py-2 flex items-center gap-2.5 text-xs"
                >
                  <span className="w-5 h-5 rounded-full bg-teal-700 text-white text-[11px] font-bold flex items-center justify-center shrink-0 tabular-nums">
                    {idx + 1}
                  </span>
                  <span className="text-slate-800 font-medium truncate">
                    {stop.label}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* Privacy toggle if current location is included */}
          {hasCurrentLocation && (
            <label className="flex items-start gap-2.5 p-3 bg-amber-50/70 border border-amber-200/80 rounded-lg text-xs text-amber-950 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCurrentLocation}
                onChange={(e) => setIncludeCurrentLocation(e.target.checked)}
                className="mt-0.5 accent-teal-700 cursor-pointer"
              />
              <span className="leading-relaxed">
                <strong>내 현재 위치 출발 좌표 포함</strong> (해제하면 내 위치는
                제외하고 시설 코스만 공유합니다)
              </span>
            </label>
          )}

          {/* Short URL Display & Copy */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-teal-700" />
                {shareLink?.isShortUrl ? '생성된 짧은 공유 링크' : '코스 공유 링크'}
              </span>
              {shareLink?.isShortUrl && (
                <span className="text-[11px] text-slate-500">
                  링크 클릭 시 코스·경로 자동 복원
                </span>
              )}
            </div>

            {isGenerating ? (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                <Loader2 className="w-4 h-4 animate-spin text-teal-700 shrink-0" />
                짧은 공유 URL을 생성하는 중입니다...
              </div>
            ) : error ? (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            ) : shareLink ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareLink.url}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="공유 링크 URL"
                  className="flex-1 min-w-0 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-teal-600"
                />
                <button
                  type="button"
                  onClick={() => void handleCopyUrl()}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
                    copiedMode === 'url'
                      ? 'bg-emerald-700 text-white'
                      : 'bg-teal-700 hover:bg-teal-800 text-white'
                  }`}
                >
                  {copiedMode === 'url' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      복사됨
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      링크 복사
                    </>
                  )}
                </button>
              </div>
            ) : null}
          </div>

          {/* Secondary Copy / Native Share Actions */}
          {shareLink && !isGenerating && (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => void handleCopySummary()}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                {copiedMode === 'summary' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                    요약 텍스트 복사됨
                  </>
                ) : (
                  <>
                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                    코스 요약 + 링크 복사
                  </>
                )}
              </button>

              {canNativeShare && (
                <button
                  type="button"
                  onClick={() => void handleNativeShare()}
                  className="px-3.5 py-2.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  기기 공유
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

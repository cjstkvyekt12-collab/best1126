import type { ActiveView } from '../types/youthMap';

interface HeaderProps {
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  courseStopCount: number;
  savedCount: number;
}

const NAV_ITEMS: { id: ActiveView; label: string }[] = [
  { id: 'map', label: '활동 지도' },
  { id: 'recommend', label: '맞춤 추천' },
  { id: 'studio', label: 'AI 스튜디오' },
  { id: 'game', label: '활동 게임' },
  { id: 'saved', label: '내 보관함' },
];

export function Header({
  activeView,
  onSelectView,
  courseStopCount,
  savedCount,
}: HeaderProps) {
  return (
    <header className="h-14 shrink-0 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between gap-8 z-30">
      {/* Zone 1: Single-element Brand Wordmark */}
      <button
        type="button"
        onClick={() => onSelectView('map')}
        className="text-base md:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 cursor-pointer"
      >
        금산 청소년 활동 지도
      </button>

      {/* Zone 2: Clean single-line text navigation links */}
      <nav
        aria-label="주요 메뉴"
        className="hidden md:flex items-center gap-7 text-sm font-medium"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          const countSuffix =
            item.id === 'saved' && savedCount > 0 ? ` (${savedCount})` : '';

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              className={`relative py-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                isActive
                  ? 'text-teal-800 font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>
                {item.label}
                {countSuffix && (
                  <span className="tabular-nums text-xs text-slate-500 ml-0.5">
                    {countSuffix}
                  </span>
                )}
              </span>
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-teal-700"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Single primary CTA */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={() => onSelectView('course')}
          className={`px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
            activeView === 'course'
              ? 'bg-teal-900 text-white'
              : 'bg-teal-700 hover:bg-teal-800 text-white'
          }`}
        >
          코스 길찾기
          {courseStopCount > 0 && (
            <span className="tabular-nums ml-1 text-teal-100">
              ({courseStopCount})
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

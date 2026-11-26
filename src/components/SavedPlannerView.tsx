import { useEffect, useState } from 'react';
import {
  Bookmark,
  Calendar,
  CheckSquare,
  Loader2,
  MapPin,
  Plus,
  Route,
  Square,
  Trash2,
} from 'lucide-react';
import { CATEGORY_MAP } from '../constants/geumsan';
import type { SavedPlaceRecord, YouthPlaceItem } from '../types/youthMap';

interface SavedPlannerViewProps {
  savedRecords: SavedPlaceRecord[];
  hydratedPlaces: Record<string, YouthPlaceItem>;
  onHydratePlace: (
    placeId: string,
    categoryId: SavedPlaceRecord['categoryId']
  ) => Promise<YouthPlaceItem | null>;
  onUpdateRecord: (
    placeId: string,
    patch: Partial<Pick<SavedPlaceRecord, 'memo' | 'plannedDate' | 'checklist'>>
  ) => void;
  onRemoveSaved: (placeId: string) => void;
  onOpenOnMap: (place: YouthPlaceItem) => void;
  onAddToCourse: (place: YouthPlaceItem) => void;
  onGoToMap: () => void;
}

export function SavedPlannerView({
  savedRecords,
  hydratedPlaces,
  onHydratePlace,
  onUpdateRecord,
  onRemoveSaved,
  onOpenOnMap,
  onAddToCourse,
  onGoToMap,
}: SavedPlannerViewProps) {
  const [loadingIds, setLoadingIds] = useState<Record<string, boolean>>({});
  const [newTaskDrafts, setNewTaskDrafts] = useState<Record<string, string>>({});

  // Hydrate live Google Place details on demand for saved placeIds
  useEffect(() => {
    savedRecords.forEach((rec) => {
      if (!hydratedPlaces[rec.placeId] && !loadingIds[rec.placeId]) {
        setLoadingIds((prev) => ({ ...prev, [rec.placeId]: true }));
        void onHydratePlace(rec.placeId, rec.categoryId).finally(() => {
          setLoadingIds((prev) => ({ ...prev, [rec.placeId]: false }));
        });
      }
    });
  }, [savedRecords, hydratedPlaces, loadingIds, onHydratePlace]);

  const handleToggleChecklistItem = (
    rec: SavedPlaceRecord,
    itemId: string
  ) => {
    const updated = rec.checklist.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    onUpdateRecord(rec.placeId, { checklist: updated });
  };

  const handleAddChecklistItem = (rec: SavedPlaceRecord) => {
    const text = (newTaskDrafts[rec.placeId] ?? '').trim();
    if (!text) return;
    const updated = [
      ...rec.checklist,
      { id: `chk-${Date.now()}`, label: text, done: false },
    ];
    onUpdateRecord(rec.placeId, { checklist: updated });
    setNewTaskDrafts((prev) => ({ ...prev, [rec.placeId]: '' }));
  };

  const handleDeleteChecklistItem = (rec: SavedPlaceRecord, itemId: string) => {
    const updated = rec.checklist.filter((item) => item.id !== itemId);
    onUpdateRecord(rec.placeId, { checklist: updated });
  };

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50 p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              내 활동 보관함 &amp; 준비 체크리스트
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              관심 있는 금산 청소년 활동 공간을 저장하고 방문 일정, 동아리 메모,
              준비물을 직접 관리하세요.
            </p>
          </div>
          <div className="text-xs text-slate-500 tabular-nums shrink-0">
            저장된 활동 공간 {savedRecords.length}곳
          </div>
        </div>

        {savedRecords.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-4">
            <Bookmark className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="space-y-1.5">
              <h2 className="text-base font-bold text-slate-900">
                보관함에 저장된 활동 공간이 아직 없습니다
              </h2>
              <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                활동 지도에서 도서관, 청소년 수련관, 체육관 등을 선택해
                &lsquo;내 보관함에 저장&rsquo;을 누르면 이곳에서 일정과 준비물을
                체계적으로 관리할 수 있습니다.
              </p>
            </div>
            <button
              type="button"
              onClick={onGoToMap}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
            >
              활동 지도에서 공간 탐색하기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {savedRecords.map((rec) => {
              const livePlace = hydratedPlaces[rec.placeId];
              const isLoading = loadingIds[rec.placeId];
              const categoryCfg =
                CATEGORY_MAP[livePlace?.categoryId ?? rec.categoryId] ??
                CATEGORY_MAP.youth_culture;
              const completedCount = rec.checklist.filter((c) => c.done).length;

              return (
                <article
                  key={rec.placeId}
                  className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4"
                >
                  {/* Top metadata & title */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                        <span
                          className="font-semibold"
                          style={{ color: categoryCfg.textColor }}
                        >
                          {categoryCfg.label}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          체크리스트 {completedCount}/{rec.checklist.length}
                        </span>
                      </div>

                      {isLoading && !livePlace ? (
                        <div className="flex items-center gap-2 text-sm text-slate-500 py-1">
                          <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
                          실시간 시설 정보를 불러오는 중...
                        </div>
                      ) : (
                        <>
                          <h2 className="text-lg font-bold text-slate-900 truncate">
                            {livePlace?.displayName ?? '금산 활동 공간'}
                          </h2>
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 truncate">
                            <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                            {livePlace?.formattedAddress ??
                              '지도에서 최신 주소를 확인합니다'}
                          </p>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemoveSaved(rec.placeId)}
                      aria-label="보관함에서 삭제"
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-50 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Planned date & personal memo */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        방문 예정일
                      </span>
                      <input
                        type="date"
                        value={rec.plannedDate}
                        onChange={(e) =>
                          onUpdateRecord(rec.placeId, {
                            plannedDate: e.target.value,
                          })
                        }
                        className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-700"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-600">
                        활동 메모 (동아리·모임 등)
                      </span>
                      <input
                        type="text"
                        value={rec.memo}
                        onChange={(e) =>
                          onUpdateRecord(rec.placeId, { memo: e.target.value })
                        }
                        placeholder="예: 토요일 오후 2시 친구들과 방문"
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-700"
                      />
                    </label>
                  </div>

                  {/* Preparation checklist */}
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <div className="text-xs font-semibold text-slate-700">
                      방문 전 준비 체크리스트
                    </div>
                    <ul className="space-y-1.5">
                      {rec.checklist.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleChecklistItem(rec, item.id)
                            }
                            className="flex items-center gap-2 text-left flex-1 min-w-0 cursor-pointer"
                          >
                            {item.done ? (
                              <CheckSquare className="w-4 h-4 text-teal-700 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-300 shrink-0" />
                            )}
                            <span
                              className={`truncate ${
                                item.done
                                  ? 'line-through text-slate-400'
                                  : 'text-slate-700'
                              }`}
                            >
                              {item.label}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteChecklistItem(rec, item.id)
                            }
                            aria-label="항목 삭제"
                            className="text-slate-300 hover:text-rose-500 p-0.5 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </li>
                      ))}
                    </ul>

                    <div className="flex items-center gap-1.5 pt-1">
                      <input
                        type="text"
                        value={newTaskDrafts[rec.placeId] ?? ''}
                        onChange={(e) =>
                          setNewTaskDrafts((prev) => ({
                            ...prev,
                            [rec.placeId]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddChecklistItem(rec);
                          }
                        }}
                        placeholder="준비물 또는 확인 사항 추가..."
                        className="flex-1 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-teal-700"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddChecklistItem(rec)}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        추가
                      </button>
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  {livePlace && (
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => onOpenOnMap(livePlace)}
                        className="flex-1 py-2 px-3 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                      >
                        지도에서 보기
                      </button>
                      <button
                        type="button"
                        onClick={() => onAddToCourse(livePlace)}
                        className="flex-1 py-2 px-3 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <Route className="w-3.5 h-3.5" />
                        활동 코스 추가
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

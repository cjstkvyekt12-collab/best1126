import { MapPin, ShieldCheck, X } from 'lucide-react';

interface LocationConsentModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function LocationConsentModal({
  isOpen,
  onConfirm,
  onCancel,
}: LocationConsentModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-consent-title"
      className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] flex items-center justify-center p-4"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <h2
              id="location-consent-title"
              className="text-base font-bold text-slate-900"
            >
              현재 위치 사용 동의
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="닫기"
            className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          가까운 금산군 청소년 활동 공간을 찾고 출발지 기준 길찾기 경로를
          계산하기 위해 브라우저의 현재 위치 정보를 일시적으로 사용합니다.
        </p>

        <div className="flex items-start gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 leading-relaxed mb-5">
          <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
          <span>
            위치 정보는 서버에 저장되지 않으며, 원할 때 언제든지 위치 사용을
            해제할 수 있습니다.
          </span>
        </div>

        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
          >
            위치 사용 허용
          </button>
        </div>
      </div>
    </div>
  );
}

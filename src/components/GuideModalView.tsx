import {
  Compass,
  ExternalLink,
  MapPin,
  PhoneCall,
  Route,
  ShieldCheck,
} from 'lucide-react';
import { GUIDE_HERO_IMAGE } from '../constants/geumsan';

interface GuideModalViewProps {
  onStartExploring: () => void;
  onStartCoursePlanner: () => void;
}

export function GuideModalView({
  onStartExploring,
  onStartCoursePlanner,
}: GuideModalViewProps) {
  return (
    <main className="flex-1 overflow-y-auto bg-slate-50 p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-10">
        {/* Editorial 2-column hero split */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="lg:col-span-6 p-7 md:p-9 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="text-xs font-semibold text-teal-800">
                충청남도 금산군 청소년·학부모·지도교사 원스톱 안내
              </div>
              <h1
                className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight"
                style={{ textWrap: 'balance' }}
              >
                금산군 전역의 청소년 활동 공간을 한눈에 찾고 동선까지 계획하세요
              </h1>
              <p className="text-sm md:text-base text-slate-600 leading-relaxed">
                금산읍부터 추부·진산·복수·제원·부리면까지, 수련·문화 시설,
                공공도서관, 체육관, 생태 체험 공간을 실시간 지도 데이터로
                탐색하고 방과 후·주말 활동 코스를 직접 설계할 수 있습니다.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onStartExploring}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                활동 지도 탐색하기
              </button>
              <button
                type="button"
                onClick={onStartCoursePlanner}
                className="px-5 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                활동 코스 설계하기
              </button>
            </div>
          </div>

          <div className="lg:col-span-6 min-h-[240px] bg-slate-100">
            <img
              src={GUIDE_HERO_IMAGE}
              alt="금산의 푸른 산세와 어우러진 현대적인 청소년 문화센터 및 공공도서관 전경"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        </section>

        {/* 3-Step Workflow */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900">
            원스톱 이용 방법
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2.5">
              <Compass className="w-5 h-5 text-teal-700" />
              <h3 className="text-base font-bold text-slate-900">
                01. 권역·분야별 실시간 탐색
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                수련·문화, 도서관·학습, 체육·스포츠, 생태·체험, 학교·진로 분야와
                금산군 읍·면 권역을 선택해 실시간 운영 정보와 연락처를 바로
                확인합니다.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2.5">
              <Route className="w-5 h-5 text-teal-700" />
              <h3 className="text-base font-bold text-slate-900">
                02. 방과 후·주말 활동 코스 설계
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                학교나 현재 위치를 출발지로 지정하고 여러 활동 공간을 순서대로
                추가하면 총 이동 거리와 예상 소요 시간을 지도 경로로 확인할 수
                있습니다.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2.5">
              <MapPin className="w-5 h-5 text-teal-700" />
              <h3 className="text-base font-bold text-slate-900">
                03. 보관함 메모 및 준비물 관리
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                자주 방문하거나 체험 학습을 계획 중인 공간을 보관함에 저장하고,
                방문 예정일·동아리 메모·준비 체크리스트를 한곳에서 점검하세요.
              </p>
            </div>
          </div>
        </section>

        {/* Youth Safety & Support Resources */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
              <PhoneCall className="w-4 h-4 text-teal-700" />
              청소년 안전·상담 공공 안내
            </div>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span>청소년전화 (24시간 무료 상담)</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  국번없이 1388
                </span>
              </li>
              <li className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span>안전 귀가 및 긴급 신고</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  112 / 119
                </span>
              </li>
              <li className="text-xs text-slate-500 pt-1 leading-relaxed">
                방문 전 공휴일·정기 휴관일 및 프로그램 사전 예약 여부를 각 시설
                대표 전화나 공식 웹사이트에서 한 번 더 확인해 주세요.
              </li>
            </ul>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
              <ShieldCheck className="w-4 h-4 text-teal-700" />
              지도 데이터 및 이용 약관 안내
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              본 서비스는 실시간 장소 정보, 검색 자동완성, 경로 탐색을 위해
              Google Maps Platform 기능을 연동합니다. 현재 위치 기능은 사용자의
              명시적 동의 시에만 일시적으로 사용되며 서버에 저장되지 않습니다.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
              <a
                href="https://maps.google.com/help/terms_maps/?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-teal-700 hover:underline font-medium"
              >
                Google 지도 추가 서비스 약관
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href="https://policies.google.com/privacy?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-teal-700 hover:underline font-medium"
              >
                Google 개인정보처리방침
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

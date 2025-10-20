// src/components/modals/HelpModal.tsx
import React from "react";

interface HelpModalProps {
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-white w-full max-w-lg mx-4 rounded-2xl shadow-xl border border-gray-200 p-8 transform transition-all animate-in zoom-in-95 fade-in-0">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-indigo-600">
            게임 가이드라인
          </h2>
          <p className="text-gray-500 mt-2">
            AI와 함께 당신만의 이야기를 만들어보세요!
          </p>
        </div>

        <div className="space-y-4">
          {/* 카드 1: 새로운 상황 생성 */}
          <div className="flex items-start gap-4 p-4 bg-violet-50 border border-violet-200 rounded-lg">
            <span className="text-3xl mt-1">✨</span>
            <div>
              <h3 className="font-bold text-violet-800 text-lg">
                새로운 상황 생성
              </h3>
              <p className="text-gray-600 text-sm">
                게임을 시작하려면 '새로운 상황 생성' 버튼을 누르세요. AI가
                당신을 위한 독특한 생존 시나리오를 제시합니다.
              </p>
            </div>
          </div>

          {/* 🔽 누락된 도움말 카드 2, 3, 4, 5 🔽 */}

          {/* 카드 2: 행동 입력 */}
          <div className="flex items-start gap-4 p-4 bg-sky-50 border border-sky-200 rounded-lg">
            <span className="text-3xl mt-1">⌨️</span>
            <div>
              <h3 className="font-bold text-sky-800 text-lg">
                행동 입력 및 선택
              </h3>
              <p className="text-gray-600 text-sm">
                제시된 상황에 맞춰 당신의 행동을 자유롭게 입력하거나, AI가
                제안하는 '추천 행동' 버튼을 눌러 이야기를 진행할 수
                있습니다.
              </p>
            </div>
          </div>

          {/* 카드 3: 스탯 관리 */}
          <div className="flex items-start gap-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <span className="text-3xl mt-1">❤️‍🩹</span>
            <div>
              <h3 className="font-bold text-amber-800 text-lg">
                스탯 관리
              </h3>
              <p className="text-gray-600 text-sm">
                당신의 행동은 체력(HP), 공격력(ATK), 마력(MP)에 영향을
                줍니다. HP가 0이 되면 게임이 종료되니 신중하게 관리하세요.
              </p>
            </div>
          </div>

          {/* 카드 4: 아이템 활용 */}
          <div className="flex items-start gap-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
            <span className="text-3xl mt-1">🎒</span>
            <div>
              <h3 className="font-bold text-emerald-800 text-lg">
                아이템 활용
              </h3>
              <p className="text-gray-600 text-sm">
                모험 중 얻는 아이템을 '사용'하거나 '장착'하여 위기를
                극복하세요. 소지품 창에서 아이템을 관리할 수 있습니다.
              </p>
            </div>
          </div>

          {/* 카드 5: 설정 변경 */}
          <div className="flex items-start gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <span className="text-3xl mt-1">⚙️</span>
            <div>
              <h3 className="font-bold text-gray-800 text-lg">
                자신만의 게임 설정
              </h3>
              <p className="text-gray-600 text-sm">
                '설정' 버튼에서 초기 스탯, 게임 장르, 최대 턴 등을 조절하여
                자신만의 스타일로 게임을 즐길 수 있습니다.
              </p>
            </div>
          </div>
          {/* [!code focus end] */}
        </div>

        <div className="mt-8 flex justify-center">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-lg transition-transform transform hover:scale-105"
          >
            확인했습니다!
          </button>
        </div>
      </div>
    </div>
  );
};
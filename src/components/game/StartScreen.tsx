// src/components/game/StartScreen.tsx
import React from "react";
import { GameState } from "../../types";
import { Spinner } from "../ui/Spinner";
import { DeltaBadge } from "../ui/DeltaBadge";

interface StartScreenProps {
  gameState: GameState;
  getAdjustedAtk: () => number;
  onGenerateScenario: () => void;
  onShowHelp: () => void;
  onShowOptions: () => void;
  withImage: boolean;
}

export const StartScreen: React.FC<StartScreenProps> = ({
  gameState,
  getAdjustedAtk,
  onGenerateScenario,
  onShowHelp,
  onShowOptions,
  withImage,
}) => {
  return (
    <div className="bg-white shadow-2xl rounded-2xl w-full max-w-4xl p-8 space-y-6 border border-gray-200">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-extrabold text-primary">랜덤 스토리</h1>
        <div className="flex items-center gap-3">
          {/* 도움말 버튼 */}
          <button
            onClick={onShowHelp}
            className="btn btn-outline btn-primary btn-circle"
            aria-label="게임 방법"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>
          {/* 설정 버튼 */}
          <button
            onClick={onShowOptions}
            className="btn btn-outline btn-primary btn-md"
          >
            설정
          </button>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {/* 스탯 영역 */}
        <div className="bg-gray-50 border border-gray-200 text-gray-700 rounded-xl p-4">
          <h2 className="font-bold mb-3">현재 상태</h2>
          <div
            className={`flex justify-between p-1 rounded-md transition-colors duration-500 border-b border-gray-200 pb-2 mb-2 ${
              gameState.lastDelta.hp !== 0 ? "bg-red-100" : ""
            }`}
          >
            <span>체력(HP)</span>
            <span className="font-semibold flex items-center justify-end w-20">
              {gameState.hp}
              <DeltaBadge value={gameState.lastDelta.hp} />
            </span>
          </div>
          <div
            className={`flex justify-between p-1 rounded-md transition-colors duration-500 border-b border-gray-200 pb-2 mb-2 ${
              gameState.lastDelta.atk !== 0 ? "bg-orange-100" : ""
            }`}
          >
            <span>공격력(ATK)</span>
            <span className="font-semibold flex items-center justify-end w-20">
              {getAdjustedAtk()}
              <DeltaBadge value={gameState.lastDelta.atk} />
            </span>
          </div>
          <div
            className={`flex justify-between p-1 rounded-md transition-colors duration-500 border-b border-gray-200 pb-2 mb-2 ${
              gameState.lastDelta.mp !== 0 ? "bg-blue-100" : ""
            }`}
          >
            <span>마력(MP)</span>
            <span className="font-semibold flex items-center justify-end w-20">
              {gameState.mp}
              <DeltaBadge value={gameState.lastDelta.mp} />
            </span>
          </div>
          <div
            className={`flex justify-between p-1 rounded-md transition-colors duration-500 border-b border-gray-200 pb-2 mb-2 ${
              gameState.lastSurvivalTurn ? "bg-purple-100" : ""
            }`}
          >
            <span>생존 턴</span>
            <span className="font-semibold">{gameState.survivalTurns}</span>
          </div>
          {!!gameState.hudNotes.length && (
            <div className="mt-3">
              <div className="text-sm font-semibold text-base-content mb-1">
                최근 변화
              </div>
              <ul className="list-disc list-inside text-sm text-gray-700 space-y-0.5">
                {gameState.hudNotes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {/* 이미지 영역 */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col">
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-gray-200 flex items-center justify-center border border-gray-300 relative">
            {gameState.sceneImageUrl ? (
              <img
                src={gameState.sceneImageUrl}
                alt="scene"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-gray-500 text-sm">
                {withImage
                  ? "아직 생성된 그림이 없습니다."
                  : "이미지 생성을 꺼 두었습니다. (옵션에서 변경)"}
              </span>
            )}
            {gameState.isImgLoading && (
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                <Spinner label="이미지 생성 중…" />
              </div>
            )}
          </div>
          {gameState.imgError && (
            <div className="text-sm text-red-600 mt-2">
              {gameState.imgError}
            </div>
          )}
        </div>
      </div>
      {/* 새로운 상황 생성 버튼 */}
      <div className="flex justify-center gap-4">
        <button
          onClick={onGenerateScenario}
          disabled={gameState.isTextLoading || gameState.isGameOver}
          className="btn btn-outline btn-primary btn-md"
        >
          {gameState.isTextLoading ? "로딩 중..." : "새로운 상황 생성"}
        </button>
      </div>
    </div>
  );
};
// src/components/game/GameUI.tsx
import React, { useEffect, useRef, useState } from "react";
import { GameState, Item } from "../../types";
import { Spinner } from "../ui/Spinner";
import { DeltaBadge } from "../ui/DeltaBadge";

interface GameUIProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  getAdjustedAtk: () => number;
  handlers: {
    handleUseItem: (item: Item) => void;
    handleEquipItem: (item: Item) => void;
    handleUnequipItem: (item: Item) => void;
    submitAction: () => void;
    goHome: () => void;
  };
  onShowOptions: () => void;
  withImage: boolean;
}

export const GameUI: React.FC<GameUIProps> = ({
  gameState,
  setGameState,
  getAdjustedAtk,
  handlers,
  onShowOptions,
  withImage,
}) => {
  const storyRef = useRef<HTMLDivElement | null>(null);
  const [isStatusVisible, setIsStatusVisible] = useState<boolean>(false);

  // 스토리 스크롤
  useEffect(() => {
    if (storyRef.current) {
      storyRef.current.scrollTop = storyRef.current.scrollHeight;
    }
  }, [gameState.typingStory]);

  return (
    <div className="w-full max-w-7xl flex flex-col md:flex-row md:justify-center md:items-start md:gap-x-10">
      {/* 💡 왼쪽 패널: 이미지와 텍스트 */}
      <div className="bg-white shadow-2xl rounded-2xl p-8 border border-gray-200 w-full md:w-1/2 md:max-w-2xl flex-grow flex flex-col space-y-4">
        <h2 className="text-2xl font-bold text-base-content bg-base-200 px-4 py-2 rounded-lg">
          스토리
        </h2>
        {gameState.isTextLoading && <Spinner label="응답 생성 중…" />}

        {/* 💡 이미지 부분 */}
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

        {/* 💡 스토리 텍스트 */}
        <div
          ref={storyRef}
          className="bg-gray-100 border border-gray-300 rounded-xl p-4 text-lg text-gray-700 whitespace-pre-wrap shadow-inner overflow-y-auto max-h-[40vh] flex-grow font-display {
							story"
        >
          {gameState.typingStory}
        </div>

        {/* 💡 입력 폼 */}
        {!gameState.isGameOver && !gameState.isRunComplete && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handlers.submitAction();
            }}
            className="flex flex-col space-y-3"
          >
            <input
              type="text"
              value={gameState.userAction}
              onChange={(e) =>
                setGameState((prev) => ({
                  ...prev,
                  userAction: e.target.value,
                }))
              }
              placeholder="당신의 행동을 입력하세요..."
              disabled={
                !gameState.isTypingFinished || gameState.isTextLoading
              }
              className="p-3 border border-gray-300 text-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <div className="flex flex-col gap-2">
              {gameState.recommendedAction && gameState.isTypingFinished && (
                <button
                  type="button"
                  onClick={() => {
                    // 🔽 추천 행동 클릭 시 userAction을 설정하고 바로 submit
                    setGameState((prev) => ({
                      ...prev,
                      userAction: prev.recommendedAction,
                    }));
                    // setGameState는 비동기이므로, 
                    // submitAction이 바로 최신 userAction을 참조하지 못할 수 있음.
                    // useGame 훅의 submitAction이 gameState.userAction을 직접 참조하므로,
                    // 이 클릭 핸들러가 userAction을 *먼저* 설정하고
                    // 그 *다음* submitAction을 호출하는 것은 문제가 될 수 있음.
                    
                    // ❗ 중요: 이 문제를 해결하려면 useGame의 submitAction을 수정해야 합니다.
                    // (예: submitAction(actionText?: string))
                    // 여기서는 원본 로직을 따르되, 
                    // userAction이 설정된 직후 submit이 호출되도록 합니다.
                    // React 18의 자동 배치를 믿거나, 
                    // 혹은 useEffect를 사용해 userAction 변경 시 submit을 트리거해야 하나,
                    // 원본 App.tsx에서도 이 방식(setGameState 후 바로 submit)을 사용했으므로
                    // 일단 그대로 둡니다.
                    
                    // 원본 코드의 로직을 그대로 따름
                    setGameState((prev) => {
                      // userAction을 설정하고
                      const newState = { ...prev, userAction: prev.recommendedAction };
                      // submitAction을 즉시 호출 (이 때 submitAction은 아직 이전 userAction을 볼 수 있음)
                      // --> 💥 원본 코드의 버그일 수 있음!
                      
                      // 💡 원본 코드의 의도를 살리면서 수정:
                      // submitAction이 다음 틱에서 실행되도록 함
                      setTimeout(() => handlers.submitAction(), 0); 
                      return newState;
                    });

                    // 💡 원본 코드(App.tsx)에 있던 방식 (버그 가능성 있음)
                    // setGameState((prev) => ({
                    //   ...prev,
                    //   userAction: prev.recommendedAction,
                    // }));
                    // handlers.submitAction(); 
                  }}
                  className="bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-5 rounded-xl transition duration-300 disabled:opacity-50"
                >
                  {gameState.recommendedAction} (추천 행동)
                </button>
              )}
              <button
                type="submit"
                disabled={
                  !gameState.isTypingFinished ||
                  gameState.isTextLoading ||
                  !gameState.userAction
                }
                className="btn btn-outline btn-primary disabled:border-gray-700 disabled:text-gray-500"
              >
                {gameState.isTextLoading
                  ? "로딩 중..."
                  : "다음 이야기 진행"}
              </button>
            </div>
          </form>
        )}

        {/* 💡 엔딩/게임오버 UI */}
        {gameState.isRunComplete && !gameState.isGameOver && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h3 className="text-xl font-bold text-amber-800 mb-2">
              🎉 최대 턴 달성! 엔딩
            </h3>
            {gameState.achievements.length > 0 && (
              <>
                <div className="font-semibold text-amber-700 mb-1">
                  획득 업적
                </div>
                <ul className="list-disc list-inside text-amber-900 mb-3">
                  {gameState.achievements.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </>
            )}
            {gameState.ending && (
              <div className="whitespace-pre-wrap text-amber-900">
                {gameState.ending}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={handlers.goHome}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-xl transition"
              >
                홈으로 가기
              </button>
            </div>
          </div>
        )}

        {gameState.isGameOver && (
          <div className="flex flex-col items-center gap-3">
            <div className="text-red-600 font-bold">
              체력이 0이 되어 게임 오버!
            </div>
            <button
              onClick={handlers.goHome}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-xl transition"
            >
              홈으로 가기
            </button>
          </div>
        )}
      </div>

      {/* 💡 오른쪽 패널: 스탯, 설정, 소지품 */}
      <div className="bg-white shadow-2xl rounded-2xl p-8 border border-gray-200 w-full md:w-2/5 md:min-w-[300px] flex-shrink-0 flex flex-col space-y-6">
        <div className="flex justify-between items-center">
          <h2 
            className="text-2xl font-bold text-base-content bg-base-200 px-4 py-2 rounded-lg"
          >
            {isStatusVisible ? "상태창" : "인벤토리"}
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setIsStatusVisible(!isStatusVisible)}
              className="btn btn-outline btn-primary"
            >
              {isStatusVisible ? "인벤토리 보기" : "상태 보기"}
            </button>
            <button
              onClick={handlers.goHome}
              className="btn btn-outline btn-primary"
            >
              처음으로
            </button>
            <button
              onClick={onShowOptions}
              className="btn btn-outline btn-primary"
            >
              옵션
            </button>
          </div>
        </div>

        <div className="min-h-[700px]">
          {isStatusVisible ? (
            /* ===== 상태창 UI ===== */
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <h3 className="font-bold text-gray-700 mb-3">현재 스탯</h3>
              <div
                className={`flex justify-between p-1 text-gray-700 rounded-md transition-colors duration-500 border-b border-gray-200 pb-2 mb-2 ${
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
                className={`flex justify-between p-1 text-gray-700 rounded-md transition-colors duration-500 border-b border-gray-200 pb-2 mb-2 ${
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
                className={`flex justify-between p-1 rounded-md text-gray-700 transition-colors duration-500 border-b border-gray-200 pb-2 mb-2 ${
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
                className={`flex justify-between p-1 rounded-md text-gray-700 transition-colors duration-500 border-b border-gray-200 pb-2 mb-2 ${
                  gameState.lastSurvivalTurn ? "bg-purple-100" : ""
                }`}
              >
                <span>생존 턴</span>
                <span className="font-semibold">
                  {gameState.survivalTurns}
                </span>
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
          ) : (
            /* ===== 소지품 UI ===== */
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="mb-4">
                <h4 className="text-lg font-bold text-gray-700 mb-1">
                  장착 중인 아이템 ⚔️🛡️
                </h4>
                <div className="flex flex-wrap gap-2 items-center">
                  {gameState.equippedWeapon && (
                    <div className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-purple-200 text-purple-800 border border-purple-300">
                      <span className="whitespace-nowrap">
                        {gameState.equippedWeapon.name} (+
                        {gameState.equippedWeapon.atkBonus} ATK)
                      </span>
                      <button
                        onClick={() =>
                          handlers.handleUnequipItem(gameState.equippedWeapon!)
                        }
                        className="ml-1 text-xs bg-purple-600 hover:bg-purple-700 text-white py-1 px-2 rounded-md transition-colors"
                      >
                        해제
                      </button>
                    </div>
                  )}
                  {gameState.equippedArmor && (
                    <div className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-indigo-200 text-indigo-800 border border-indigo-300">
                      <span className="whitespace-nowrap">
                        {gameState.equippedArmor.name}
                      </span>
                      <button
                        onClick={() =>
                          handlers.handleUnequipItem(gameState.equippedArmor!)
                        }
                        className="ml-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white py-1 px-2 rounded-md transition-colors"
                      >
                        해제
                      </button>
                    </div>
                  )}
                  {!gameState.equippedWeapon && !gameState.equippedArmor && (
                    <span className="text-gray-500">없음</span>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <h4 className="text-lg font-bold text-gray-700 mb-1">
                  무기 ⚔️
                </h4>
                <div className="flex flex-wrap gap-2">
                  {gameState.items.filter((item) => item.type === "weapon")
                    .length > 0 ? (
                    gameState.items
                      .filter((item) => item.type === "weapon")
                      .map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-purple-100 text-purple-700 border border-purple-200"
                        >
                          <span className="whitespace-nowrap">
                            {item.name}{" "}
                            {item.quantity > 1 ? `x${item.quantity}` : ""}{" "}
                            {item.atkBonus ? `(+${item.atkBonus} ATK)` : ""}
                          </span>
                          <button
                            onClick={() => handlers.handleEquipItem(item)}
                            className="ml-1 text-xs bg-purple-600 hover:bg-purple-700 text-white py-1 px-2 rounded-md transition-colors"
                          >
                            장착
                          </button>
                        </div>
                      ))
                  ) : (
                    <span className="text-gray-500">없음</span>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <h4 className="text-lg font-bold text-gray-700 mb-1">
                  방어구 🛡️
                </h4>
                <div className="flex flex-wrap gap-2">
                  {gameState.items.filter((item) => item.type === "armor")
                    .length > 0 ? (
                    gameState.items
                      .filter((item) => item.type === "armor")
                      .map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-indigo-100 text-indigo-700 border border-indigo-200"
                        >
                          <span>
                            {item.name}{" "}
                            {item.quantity > 1 ? `x${item.quantity}` : ""}
                          </span>
                          <button
                            onClick={() => handlers.handleEquipItem(item)}
                            className="ml-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white py-1 px-2 rounded-md transition-colors"
                          >
                            장착
                          </button>
                        </div>
                      ))
                  ) : (
                    <span className="text-gray-500">없음</span>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <h4 className="text-lg font-bold text-gray-700 mb-1">
                  음식 🍎
                </h4>
                <div className="flex flex-wrap gap-2 items-center">
                  {gameState.items.filter((item) => item.type === "food")
                    .length > 0 ? (
                    gameState.items
                      .filter((item) => item.type === "food")
                      .map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-green-100 text-green-700 border border-green-200"
                        >
                          <span className="whitespace-nowrap">
                            {item.name}{" "}
                            {item.quantity > 1 ? `x${item.quantity}` : ""}
                          </span>
                          <button
                            onClick={() => handlers.handleUseItem(item)}
                            className="ml-1 text-xs bg-green-600 hover:bg-green-700 text-white py-1 px-2 rounded-md transition-colors"
                          >
                            사용
                          </button>
                        </div>
                      ))
                  ) : (
                    <span className="text-gray-500">없음</span>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <h4 className="text-lg font-bold text-gray-700 mb-1">
                  포션 🧪
                </h4>
                <div className="flex flex-wrap gap-2 items-center">
                  {gameState.items.filter((item) => item.type === "potion")
                    .length > 0 ? (
                    gameState.items
                      .filter((item) => item.type === "potion")
                      .map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-red-100 text-red-700 border border-red-200"
                        >
                          <span className="whitespace-nowrap">
                            {item.name}{" "}
                            {item.quantity > 1 ? `x${item.quantity}` : ""}
                          </span>
                          <button
                            onClick={() => handlers.handleUseItem(item)}
                            className="ml-1 text-xs bg-red-600 hover:bg-red-700 text-white py-1 px-2 rounded-md transition-colors"
                          >
                            사용
                          </button>
                        </div>
                      ))
                  ) : (
                    <span className="text-gray-500">없음</span>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <h4 className="text-lg font-bold text-gray-700 mb-1">
                  열쇠 🔑
                </h4>
                <div className="flex flex-wrap gap-2">
                  {gameState.items.filter((item) => item.type === "key")
                    .length > 0 ? (
                    gameState.items
                      .filter((item) => item.type === "key")
                      .map((item, i) => (
                        <span
                          key={i}
                          className="px-3 py-1.5 text-sm rounded-lg bg-yellow-100 text-yellow-700 border border-yellow-200"
                        >
                          {item.name}{" "}
                          {item.quantity > 1 ? `x${item.quantity}` : ""}
                        </span>
                      ))
                  ) : (
                    <span className="text-gray-500">없음</span>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <h4 className="text-lg font-bold text-gray-700 mb-1">
                  책 📖
                </h4>
                <div className="flex flex-wrap gap-2">
                  {gameState.items.filter((item) => item.type === "book")
                    .length > 0 ? (
                    gameState.items
                      .filter((item) => item.type === "book")
                      .map((item, i) => (
                        <span
                          key={i}
                          className="px-3 py-1.5 text-sm rounded-lg bg-cyan-100 text-cyan-700 border border-cyan-200"
                        >
                          {item.name}{" "}
                          {item.quantity > 1 ? `x${item.quantity}` : ""}
                        </span>
                      ))
                  ) : (
                    <span className="text-gray-500">없음</span>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-lg font-bold text-gray-700 mb-1">
                  기타 📦
                </h4>
                <div className="flex flex-wrap gap-2">
                  {gameState.items.filter((item) => item.type === "misc")
                    .length > 0 ? (
                    gameState.items
                      .filter((item) => item.type === "misc")
                      .map((item, i) => (
                        <span
                          key={i}
                          className="px-3 py-1.5 text-sm rounded-lg bg-gray-200 text-gray-800 border border-gray-300"
                        >
                          {item.name}{" "}
                          {item.quantity > 1 ? `x${item.quantity}` : ""}
                        </span>
                      ))
                  ) : (
                    <span className="text-gray-500">없음</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
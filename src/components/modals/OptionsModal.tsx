// src/components/modals/OptionsModal.tsx
import React, { useState, useEffect } from "react";
import { GameState, GenreMode, SaveSlot, LoadedSave, HighlightMap } from "../../types";
import { GENRES, DEFAULT_INITIAL_STATE } from "../../gameConfig";

interface OptionsModalProps {
  onClose: () => void;
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  initialStats: { hp: number; atk: number; mp: number };
  setInitialStats: React.Dispatch<
    React.SetStateAction<{ hp: number; atk: number; mp: number }>
  >;
  withImage: boolean;
  setWithImage: (value: boolean) => void;
}

export const OptionsModal: React.FC<OptionsModalProps> = ({
  onClose,
  gameState,
  setGameState,
  initialStats,
  setInitialStats,
  withImage,
  setWithImage,
}) => {
  // 모달 전용 UI 상태
  const [genreModeUI, setGenreModeUI] = useState<GenreMode>(
    gameState.genreMode
  );
  const [selectedGenreIdUI, setSelectedGenreIdUI] = useState<string | null>(
    gameState.selectedGenreId ?? null
  );
  const [maxTurnsUI, setMaxTurnsUI] = useState<number>(gameState.maxTurns);

  // 저장/불러오기 관련 상태
  const [currentSlot, setCurrentSlot] = useState<number>(1);
  const [slots, setSlots] = useState<SaveSlot[]>([]);
  const [saveName, setSaveName] = useState<string>("");

  // 슬롯 정보 로드
  useEffect(() => {
    const slotsData: SaveSlot[] = [];
    for (let i = 1; i <= 3; i++) {
      const key = `ai_game_save_${i}`;
      const savedData = localStorage.getItem(key);
      if (savedData) {
        const data = JSON.parse(savedData) as {
          name?: string;
          savedAt?: string;
        };
        slotsData.push({
          id: i,
          saved: true,
          name: data.name,
          savedAt: data.savedAt,
        });
      } else {
        slotsData.push({ id: i, saved: false });
      }
    }
    setSlots(slotsData);
  }, []);

  // ===== 저장/불러오기/삭제 로직 (App.tsx에서 이동) =====
  const saveGame = (slotNumber: number, name?: string) => {
    const {
      story,
      hp,
      atk,
      mp,
      items,
      equippedWeapon,
      equippedArmor,
      survivalTurns,
      sceneImageUrl,
      maxTurns,
      isRunComplete,
      achievements,
      ending,
      currentBgm,
      selectedGenreId, 
      genreMode,
      turnInRun,
      recommendedAction,
      isGameOver,
      highlights,
      lastDelta, // 🔽 lastDelta 등은 저장 안 함 (로드 시 초기화)
    } = gameState;
    const saveState: LoadedSave = { // 🔽 타입을 LoadedSave로 명시
      story,
      hp,
      atk,
      mp,
      items,
      equippedWeapon,
      equippedArmor,
      survivalTurns,
      sceneImageUrl,
      maxTurns,
      isRunComplete,
      achievements,
      ending,
      currentBgm,
      selectedGenreId, // 🔽 저장
      genreMode, // 🔽 저장
      turnInRun, // 🔽 저장
      recommendedAction, // 🔽 저장
      isGameOver, // 🔽 저장
      name: name || `저장 #${slotNumber}`,
      savedAt: new Date().toLocaleString(),
      highlights,
    };
    try {
      localStorage.setItem(
        `ai_game_save_${slotNumber}`,
        JSON.stringify(saveState)
      );
      setSlots((prevSlots) =>
        prevSlots.map((slot) =>
          slot.id === slotNumber
            ? {
                ...slot,
                saved: true,
                name: saveState.name,
                savedAt: saveState.savedAt,
              }
            : slot
        )
      );
      alert(
        `게임이 ${slotNumber}번에 '${saveState.name}'(으)로 성공적으로 저장되었습니다!`
      );
    } catch (e) {
      console.error("Failed to save game:", e);
      alert("게임 저장에 실패했습니다.");
    }
  };

  const loadGame = (slotNumber: number) => {
    try {
      const savedState = localStorage.getItem(`ai_game_save_${slotNumber}`);
      if (!savedState) {
        alert(`${slotNumber}번에 저장된 게임이 없습니다.`);
        return;
      }
      const loaded = JSON.parse(savedState) as LoadedSave;

      setGameState((prev) => ({
        ...prev,
        story: loaded.story ?? "",
        typingStory: "", // 🔽 로드 시 타이핑 초기화
        isTypingFinished: true, // 🔽 로드 시 타이핑 완료 처리
        hp: loaded.hp ?? prev.hp,
        atk: loaded.atk ?? prev.atk,
        mp: loaded.mp ?? prev.mp,
        items: Array.isArray(loaded.items) ? loaded.items : prev.items,
        equippedWeapon: loaded.equippedWeapon ?? null,
        equippedArmor: loaded.equippedArmor ?? null,
        survivalTurns: loaded.survivalTurns ?? 0,
        turnInRun: loaded.turnInRun ?? 0,
        sceneImageUrl: loaded.sceneImageUrl ?? "",
        isImgLoading: false,
        imgError: "",
        maxTurns: loaded.maxTurns ?? prev.maxTurns ?? 5,
        isRunComplete: loaded.isRunComplete ?? false,
        achievements: loaded.achievements ?? [],
        ending: loaded.ending ?? "",
        isGameOver: loaded.isGameOver ?? false,
        recommendedAction: loaded.recommendedAction ?? "",
        userAction: "",
        lastDelta: { hp: 0, atk: 0, mp: 0 },
        lastSurvivalTurn: "",
        selectedGenreId: loaded.selectedGenreId ?? prev.selectedGenreId ?? null,
        genreMode:
          (loaded.genreMode as GenreMode) ?? prev.genreMode ?? "random-run",
        currentBgm: loaded.currentBgm ?? null,
        highlights: loaded.highlights ?? prev.highlights ?? {},
      }));
      
      // 🔽 로드한 스탯을 initialStats에도 반영 (옵션 창 동기화)
      setInitialStats({
        hp: loaded.hp ?? DEFAULT_INITIAL_STATE.hp,
        atk: loaded.atk ?? DEFAULT_INITIAL_STATE.atk,
        mp: loaded.mp ?? DEFAULT_INITIAL_STATE.mp,
      });

      setSaveName(loaded.name || "");
      alert(`${slotNumber}번의 게임을 불러왔습니다!`);
    } catch (e) {
      console.error("Failed to load game:", e);
      alert("게임 불러오기에 실패했습니다.");
    }
  };

  const deleteGame = (slotNumber: number) => {
    try {
      localStorage.removeItem(`ai_game_save_${slotNumber}`);
      setSlots((prevSlots) =>
        prevSlots.map((slot) =>
          slot.id === slotNumber ? { id: slot.id, saved: false } : slot // 🔽 초기화 수정
        )
      );
      if (currentSlot === slotNumber) { // 🔽 삭제한 슬롯이 현재 슬롯이면 이름 초기화
         setSaveName("");
      }
      alert(`${slotNumber}번의 게임이 삭제되었습니다.`);
    } catch (e) {
      console.error("Failed to delete game from localStorage:", e);
      alert("게임 삭제에 실패했습니다.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-white w-full max-w-md mx-4 rounded-2xl shadow-xl border border-gray-200 p-8 max-h-[90vh] overflow-y-auto"> {/* 🔽 max-h 수정 */}
        <h2 className="text-3xl font-extrabold text-purple-700 text-center mb-6">
          게임 설정
        </h2>

        {/* ===== 장르 설정 ===== */}
        <div className="bg-gray-50 border text-gray-700 border-gray-200 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-gray-700 mb-3">장르 설정</h3>
          <div className="flex flex-wrap gap-3 mb-3 text-sm"> {/* 🔽 flex-wrap 추가 */}
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={genreModeUI === "fixed"}
                onChange={() => setGenreModeUI("fixed")}
              />
              <span>고정</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={genreModeUI === "random-run"}
                onChange={() => setGenreModeUI("random-run")}
              />
              <span>한 판 시작 시 랜덤</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={genreModeUI === "rotate-turn"}
                onChange={() => setGenreModeUI("rotate-turn")}
              />
              <span>턴마다 순환</span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((g) => {
              const active = selectedGenreIdUI === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedGenreIdUI(g.id)}
                  className={`px-3 py-1.5 rounded-full border text-sm
                    ${
                      active
                        ? "bg-purple-600 text-white border-purple-700"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
                    }`}
                  title={`${g.label} · ${g.systemStyle}`}
                >
                  {g.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setSelectedGenreIdUI(null)}
              className={`px-3 py-1.5 rounded-full border text-sm
                  ${
                    selectedGenreIdUI == null
                      ? "bg-indigo-600 text-white border-indigo-700"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
                  }`}
              title="아무 장르 고정하지 않음"
            >
              (제한 없음)
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            • 고정: 선택한 장르로만 진행 · 한 판 랜덤: 시작 시 임의 장르
            선택 · 순환: 각 턴마다 다음 장르로 넘어감
          </p>
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => {
                setGameState((prev) => ({
                  ...prev,
                  genreMode: genreModeUI,
                  selectedGenreId: selectedGenreIdUI,
                }));
                localStorage.setItem("ai_game_pref_genreMode", genreModeUI);
                localStorage.setItem(
                  "ai_game_pref_selectedGenreId",
                  selectedGenreIdUI ?? ""
                );
                onClose();
              }}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition"
            >
              장르 설정 적용
            </button>
          </div>
        </div>

        {/* ===== 스토리 생성 설정 ===== */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-gray-700 mb-3">스토리 생성 설정</h3>
          <label className="flex items-center gap-3 select-none">
            <input
              type="checkbox"
              className="mt-1 w-4 h-4 text-purple-600 focus:ring-purple-500"
              checked={withImage}
              onChange={(e) => setWithImage(e.target.checked)}
            />
            <span className="text-gray-600">
              <span className="font-semibold block">
                스토리와 함께 이미지도 생성
              </span>
              <span className="block text-sm text-gray-500">
                (Imagen 3) 이미지 생성 비용이 발생할 수 있습니다.
              </span>
            </span>
          </label>
        </div>

        {/* {스탯 설정 슬라이더} */}
        <div className="bg-gray-50 border text-gray-600 border-gray-200 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-gray-700 mb-3">초기 스탯 설정</h3>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="hp-slider"
                className="block text-sm font-semibold mb-1"
              >
                체력 (HP): (1~500) {initialStats.hp}
              </label>
              <input
                id="hp-slider"
                type="range"
                min="1"
                max="500"
                value={initialStats.hp}
                onChange={(e) =>
                  setInitialStats({
                    ...initialStats,
                    hp: Number(e.target.value),
                  })
                }
                className="w-full h-2 rounded-lg appearance-none bg-purple-200 cursor-pointer" // 🔽 cursor-pointer 추가
                disabled={gameState.survivalTurns > 0}
              />
            </div>
            <div>
              <label
                htmlFor="atk-slider"
                className="block text-sm font-semibold mb-1"
              >
                공격력 (ATK): (1~200) {initialStats.atk}
              </label>
              <input
                id="atk-slider"
                type="range"
                min="1"
                max="200"
                value={initialStats.atk}
                onChange={(e) =>
                  setInitialStats({
                    ...initialStats,
                    atk: Number(e.target.value),
                  })
                }
                className="w-full h-2 rounded-lg appearance-none bg-purple-200 cursor-pointer"
                disabled={gameState.survivalTurns > 0}
              />
            </div>
            <div>
              <label
                htmlFor="mp-slider"
                className="block text-sm font-semibold mb-1"
              >
                마력 (MP): (1~200) {initialStats.mp}
              </label>
              <input
                id="mp-slider"
                type="range"
                min="1"
                max="200"
                value={initialStats.mp}
                onChange={(e) =>
                  setInitialStats({
                    ...initialStats,
                    mp: Number(e.target.value),
                  })
                }
                className="w-full h-2 rounded-lg appearance-none bg-purple-200 cursor-pointer"
                disabled={gameState.survivalTurns > 0}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => {
                // 🔽 게임이 시작되지 않았을 때만 스탯 적용
                if (gameState.survivalTurns === 0) {
                  setGameState((prev) => ({
                    ...prev,
                    hp: initialStats.hp,
                    atk: initialStats.atk,
                    mp: initialStats.mp,
                  }));
                }
                onClose();
              }}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition"
            >
              {/* 🔽 버튼 텍스트 수정 */}
              {gameState.survivalTurns > 0 ? "닫기" : "스탯 적용"}
            </button>
          </div>
        </div>

        {/* 최대 턴 설정 */}
        <div className="bg-gray-50 border text-gray-700 border-gray-200 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-gray-700 mb-3">최대 턴 설정</h3>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={50}
              value={maxTurnsUI}
              onChange={(e) =>
                setMaxTurnsUI(
                  Math.max(1, Math.min(50, Number(e.target.value) || 1))
                )
              }
              className="w-28 p-2 border border-gray-300 rounded-lg"
            />
            <span className="text-sm text-gray-600">
              (1~50 턴)
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            설정한 턴에 도달하면 엔딩이 표시됩니다.
          </p>
          <div className="mt-3">
            <button
              onClick={() => {
                setGameState((prev) => ({ ...prev, maxTurns: maxTurnsUI }));
                localStorage.setItem(
                  "ai_game_pref_maxTurns",
                  String(maxTurnsUI)
                );
                onClose();
              }}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition"
            >
              최대 턴 적용
            </button>
          </div>
        </div>

        {/* 게임 저장/불러오기 */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="font-bold text-gray-700 mb-3">
            게임 저장/불러오기
          </h3>

          <div className="mb-4">
            <p className="font-semibold text-sm text-gray-600 mb-2">
              저장 슬롯 선택:
            </p>
            <div className="grid grid-cols-3 gap-2">
              {slots.map((slot) => {
                const displayName =
                  slot.saved && slot.name
                    ? slot.name.length > 10
                      ? slot.name.substring(0, 10) + "..."
                      : slot.name
                    : "비어있음 ❌";

                return (
                  <button
                    key={slot.id}
                    onClick={() => {
                      setCurrentSlot(slot.id);
                      setSaveName(slot.name || "");
                    }}
                    className={`w-full px-2 py-3 rounded-lg font-semibold transition ${
                      currentSlot === slot.id
                        ? "bg-purple-600 text-white shadow-md"
                        : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                    }`}
                  >
                    {slot.id}번
                    <br />
                    <span className="text-xs font-bold block mt-1">
                      {displayName}
                    </span>
                    {slot.saved && slot.savedAt && ( // 🔽 savedAt 체크 추가
                      <span className="text-xs font-normal block opacity-70 mt-1">
                        {slot.savedAt.split(' ')[0]} {/* 🔽 날짜만 표시 (간결하게) */}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-4">
            <label
              htmlFor="saveName"
              className="font-semibold text-sm text-gray-600 mb-2 block"
            >
              저장 이름 (선택 사항):
            </label>
            <input
              id="saveName"
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="이름이나 설명을 입력하세요"
              className="w-full p-2 border border-gray-300 rounded-lg text-sm text-gray-600"
            />
          </div>

          <div className="flex justify-between gap-2">
            <button
              onClick={() => {
                const isSlotSaved = slots.find(
                  (s) => s.id === currentSlot
                )?.saved;
                if (
                  isSlotSaved &&
                  !window.confirm(
                    `${currentSlot}번에 이미 저장된 게임이 있습니다. 덮어쓰시겠습니까?`
                  )
                )
                  return;
                saveGame(currentSlot, saveName);
                onClose();
              }}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition"
            >
              저장
            </button>
            <button
              onClick={() => {
                loadGame(currentSlot);
                onClose();
              }}
              disabled={!slots.find((s) => s.id === currentSlot)?.saved}
              className="flex-1 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold transition disabled:opacity-50"
            >
              불러오기
            </button>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    `${currentSlot}번의 게임을 정말 삭제하시겠습니까?`
                  )
                ) {
                  deleteGame(currentSlot);
                }
              }}
              disabled={!slots.find((s) => s.id === currentSlot)?.saved}
              className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition disabled:opacity-50"
            >
              삭제
            </button>
          </div>
        </div>

        <div className="mt-6 flex justify-center bottom-0 mb-6">
          <button
            onClick={onClose}
            className="bottom-0 mb-0 left-0 w-full py-2 rounded-lg bg-gray-200 hover:bg-gray-400 text-gray-800 font-semibold"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
// src/App.tsx
import { useState, useEffect } from "react";

// 레이아웃 및 BGM
import SideBar from "./Layout/SideBar";
import BgmPlayer from "./MusicPlayer/BgmPlayer";

// 커스텀 훅
import { useGame } from "./hooks/useGame";

// 분리된 컴포넌트
import { HelpModal } from "./components/modals/HelpModal";
import { OptionsModal } from "./components/modals/OptionsModal";
import { StartScreen } from "./components/game/StartScreen";
import { GameUI } from "./components/game/GameUI";

function App() {
  // ===== UI 상태 관리 =====
  const [showOptions, setShowOptions] = useState<boolean>(false);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [withImage, setWithImage] = useState<boolean>(() => {
    const saved = localStorage.getItem("withImage");
    return saved !== null ? saved === "true" : false;
  });

  // withImage 상태 로컬스토리지에 저장
  useEffect(() => {
    localStorage.setItem("withImage", String(withImage));
  }, [withImage]);

  // ===== 핵심 게임 로직 (훅) =====
  // withImage 상태를 훅에 전달
  const {
    gameState,
    setGameState,
    initialStats,
    setInitialStats,
    getAdjustedAtk,
    handlers,
  } = useGame(withImage);

  return (
    <div className="min-h-screen bg-base-200 p-6 flex flex-col items-center justify-center">
      {/* 🎵 BGM 플레이어 */}
      <BgmPlayer src={gameState.currentBgm} />

      {/* 🎨 사이드바 토글 버튼 */}
      <button
        onClick={() => setIsSidebarOpen(true)}
        className="fixed top-6 left-6 z-50 bg-base-100 p-4 rounded-full shadow-lg hover:bg-base-200 transition-colors"
        aria-label="Open sidebar"
      >
        <svg
					xmlns="http://www.w3.org/2000/svg"
					className="h-6 w-6"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M4 6h16M4 12h16M4 18h16"
					/>
  			</svg>
      </button>

      {/* 🎨 사이드바 패널 및 오버레이 */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity ${
          isSidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsSidebarOpen(false)}
        aria-hidden="true"
      />
      <div
        className={`fixed top-0 left-0 h-full bg-base-100 shadow-xl z-50 w-64 p-4 transform transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <h2 className="text-2xl font-bold text-center mb-1 mt-4">테마 설정</h2>
        <SideBar />
      </div>

      {/* ===== 🎮 게임 콘텐츠 (시작 화면 또는 진행 화면) ===== */}
      {!gameState.story ? (
        <StartScreen
          gameState={gameState}
          getAdjustedAtk={getAdjustedAtk}
          onGenerateScenario={handlers.generateScenario}
          onShowHelp={() => setShowHelp(true)}
          onShowOptions={() => setShowOptions(true)}
          withImage={withImage}
        />
      ) : (
        <GameUI
          gameState={gameState}
          setGameState={setGameState}
          getAdjustedAtk={getAdjustedAtk}
          handlers={handlers}
          onShowOptions={() => setShowOptions(true)}
          withImage={withImage}
        />
      )}

      {/* ===== ⚙️ 모달창 ===== */}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      {showOptions && (
        <OptionsModal
          onClose={() => setShowOptions(false)}
          gameState={gameState}
          setGameState={setGameState}
          initialStats={initialStats}
          setInitialStats={setInitialStats}
          withImage={withImage}
          setWithImage={setWithImage}
        />
      )}
    </div>
  );
}

export default App;
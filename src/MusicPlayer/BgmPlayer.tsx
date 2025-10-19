import { useState, useEffect, useRef } from "react";
import { VolumeX, Volume2 } from "lucide-react";

interface BgmPlayerProps {
  /** 현재 재생해야 할 BGM 트랙의 URL (예: /music/battle.mp3) */
  src: string | null;
}

/**
 * BGM 재생을 담당하는 전용 컴포넌트
 * - App.tsx에서 전달받은 src (BGM URL)가 변경되면 음악을 교체합니다.
 * - 자체적으로 '음소거' 상태를 관리합니다.
 */
const BgmPlayer: React.FC<BgmPlayerProps> = ({ src }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  
  // ⚠️ 브라우저 정책상 자동재생을 위해 기본값을 true(음소거)로 합니다.
  // 사용자가 음소거 해제 버튼을 눌러야 소리가 나기 시작합니다.
  const [isMuted, setIsMuted] = useState<boolean>(true);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // 1. 음소거 상태면 무조건 정지
    if (isMuted) {
      audio.pause();
      return;
    }

    // 2. 새 BGM 소스(src)가 있고, 현재 재생 중인 소스와 다를 때
    // (URL()을 사용해 상대경로를 절대경로로 변환하여 정확하게 비교)
    if (src && audio.src !== new URL(src, window.location.origin).href) {
      console.log("BGM 변경:", src);
      audio.src = src;
      audio.loop = true; // BGM은 항상 반복재생
      audio.volume = 0.3; // 기본 볼륨 30%

      const playPromise = audio.play();
      
      // 자동 재생 오류 처리 (사용자가 페이지와 상호작용하기 전)
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.warn("BGM 자동 재생 실패 (사용자 상호작용 필요):", error);
          // 자동 재생이 막히면, 다시 음소거 상태로 돌려서 아이콘을 업데이트
          setIsMuted(true);
        });
      }
    } else if (!src) {
      // 3. BGM 소스가 없으면 (null) 정지
      audio.pause();
      audio.currentTime = 0;
    }
    
    // isMuted 상태가 변경될 때 (사용자가 끄거나 켤 때) 이 effect가 다시 실행됨
  }, [src, isMuted]); // src 또는 isMuted가 바뀔 때마다 이 로직 실행

  /** 음소거 상태를 토글하는 함수 */
  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;

    const newMutedState = !isMuted;
    setIsMuted(newMutedState);

    // 💡 음소거를 해제할 때 (isMuted가 true였을 때)
    // 만약 음악이 재생 중이 아니었다면, 재생을 시도
    if (!newMutedState && audio.paused && src) {
      audio.play().catch(e => console.warn("Mute toggle play failed", e));
    }
  };

  return (
    <>
      {/* 실제 오디오 태그 (UI에 보이지 않음) */}
      <audio ref={audioRef} loop />

      {/* 음소거 토글 버튼 (UI에 표시) */}
      <button
        onClick={toggleMute}
        className="fixed top-6 right-6 z-50 bg-base-100 p-4 rounded-full shadow-lg hover:bg-base-200 transition-colors"
        aria-label={isMuted ? "소리 켜기" : "소리 끄기"}
      >
        {isMuted ? (
          <VolumeX className="h-6 w-6" /> // 🎵 Lucide 아이콘
        ) : (
          <Volume2 className="h-6 w-6" /> // 🎵 Lucide 아이콘
        )}
      </button>
    </>
  );
};

export default BgmPlayer;
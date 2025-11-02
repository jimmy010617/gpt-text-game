import { useState, useEffect, useRef } from "react";
import { VolumeX, Volume2, Volume1 } from "lucide-react";

interface BgmPlayerProps {
  /** 현재 재생해야 할 BGM 트랙의 URL (예: /music/battle.mp3) */
  src: string | null;
}

/**
 * BGM 재생을 담당하는 전용 컴포넌트
 * - App.tsx에서 전달받은 src (BGM URL)가 변경되면 음악을 교체합니다.
 * - 자체적으로 '음소거'와 '볼륨' 상태를 관리합니다.
 */
const BgmPlayer: React.FC<BgmPlayerProps> = ({ src }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  
  const [isMuted, setIsMuted] = useState<boolean>(true);

  const [volume, setVolume] = useState<number>(() => {
    if (typeof window === 'undefined') return 0.3;
    const savedVolume = localStorage.getItem("bgmVolume");
    const initialVolume = savedVolume !== null ? parseFloat(savedVolume) : 0.3;
    return initialVolume;
  });

  useEffect(() => {
    localStorage.setItem("bgmVolume", String(volume));
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = volume;
    audio.muted = isMuted;

    if (isMuted) {
      audio.pause();
      return;
    }

    if (src && audio.src !== new URL(src, window.location.origin).href) {
      console.log("BGM 변경:", src);
      audio.src = src;
      audio.loop = true;

      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.warn("BGM 자동 재생 실패 (사용자 상호작용 필요):", error);
          setIsMuted(true);
        });
      }
    } else if (!src) {
      audio.pause();
      audio.currentTime = 0;
    } else if (src && audio.paused) {
      audio.play().catch(e => console.warn("BGM resume failed", e));
    }
    
  }, [src, isMuted, volume]);

  const toggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);

    if (!newMutedState && volume === 0) {
      setVolume(0.3);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);

    if (newVolume === 0) {
      setIsMuted(true);
    } else if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const VolumeIcon = () => {
    if (isMuted || volume === 0) {
      return <VolumeX className="h-6 w-6" />;
    }
    if (volume < 0.5) {
      return <Volume1 className="h-6 w-6" />;
    }
    return <Volume2 className="h-6 w-6" />;
  };

  return (
    <>
      {/* 실제 오디오 태그 (UI에 보이지 않음) */}
      <audio ref={audioRef} loop />

      {/* 🔊 UI 컨트롤 (버튼 + 호버 슬라이더) */}
      <div
        className="fixed top-6 right-6 z-50 bg-base-100 p-2.5 rounded-full shadow-lg 
                   flex items-center transition-all group"
        aria-label="BGM 컨트롤러"
      >
        <button
          onClick={toggleMute}
          className="p-1.5 rounded-full hover:bg-base-200 transition-colors"
          aria-label={isMuted ? "소리 켜기" : "소리 끄기"}
        >
          <VolumeIcon />
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          className="
            range range-primary range-xs cursor-pointer
            w-0 opacity-0 group-hover:w-24 group-hover:opacity-100 group-hover:ml-2 group-hover:mr-2
            transition-all duration-300 ease-in-out
          "
          aria-label="볼륨 조절"
        />
      </div>
    </>
  );
};

export default BgmPlayer;
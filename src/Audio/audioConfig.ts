/**
 * 🎵 BGM 맵 ( public/music/ 폴더에 파일이 있다고 가정)
 * ----------------------------------------------------
 * ⚠️ 참고: public/music/ 경로에 실제 MP3 파일이 있어야 합니다.
 * (예: public/music/ambient-main.mp3, public/music/explore-calm.mp3 등)
 */
export const BGM_MAP: { [key: string]: string } = {
  wakeup: "/Audio/bgm/default.mp3", // 기본 브금
  move: "/Audio/bgm/move.mp3", // 탐험, 안정
  run: "/Audio/bgm/run.mp3", // 긴장, 추격
  battle: "/Audio/bgm/battle.mp3", // 전투
  avoid: "/Audio/bgm/avoid.mp3", // 공포, 폐쇄
  eat: "/Audio/bgm/eat.mp3", // 발견, 신비
  defeat: "/Audio/bgm/defeat.mp3", // 슬픔, 상실
  victory: "/Audio/bgm/victory.mp3", // 승리, 축하
  statUp: "/Audio/bgm/statUp.mp3", // 스탯 상승, 강해짐
  explore: "/Audio/bgm/explore.mp3", // 탐험, 신비
};

/**
 * 🎵 AI가 반환할 수 있는 BGM 무드 목록
 */
export const BGM = ["wakeup","calm","move","run", "battle", "eat", "defeat", "victory", "statUp", "explore","avoid"];

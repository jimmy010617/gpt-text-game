/**
 * 🎵 BGM 맵 ( public/music/ 폴더에 파일이 있다고 가정)
 * ----------------------------------------------------
 * ⚠️ 참고: public/music/ 경로에 실제 MP3 파일이 있어야 합니다.
 * (예: public/music/ambient-main.mp3, public/music/explore-calm.mp3 등)
 */
export const BGM_MAP: { [key: string]: string } = {
  default: "/Audio/bgm/default1.mp3", // 기본 브금
  calm: "/Audio/bgm/calm1.mp3", // 탐험, 안정
  tense: "/Audio/bgm/tense1.mp3", // 긴장, 추격
  combat: "/Audio/bgm/combat1.mp3", // 전투
  horror: "/Audio/bgm/horror1.mp3", // 공포, 폐쇄
  discovery: "/Audio/bgm/discovery1.mp3", // 발견, 신비
  sad: "/Audio/bgm/sad1.mp3", // 슬픔, 상실
};

/**
 * 🎵 AI가 반환할 수 있는 BGM 무드 목록
 */
export const BGM_MOODS = ["calm", "tense", "combat", "horror", "discovery", "sad"];
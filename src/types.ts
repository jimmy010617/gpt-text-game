// src/types.ts

// ===== 타입 정의 =====
export type StatKey = "hp" | "atk" | "mp";
export type ItemType =
  | "weapon"
  | "food"
  | "misc"
  | "armor"
  | "potion"
  | "key"
  | "book";

export type Delta = {
  stat: StatKey;
  delta: number;
  reason?: string;
};

export type Subject = {
  ko?: string;
  en?: string;
};

export type LastDelta = {
  hp: number;
  atk: number;
  mp: number;
};

export type Item = {
  name: string;
  quantity: number;
  type: ItemType;
  atkBonus?: number; // 무기 공격력 보너스
  defBonus?: number; // 방어구 방어력 보너스 (현재 미사용, 향후 확장용)
};

// ===== 장르 타입 & 목록 =====
export type GenreMode = "fixed" | "random-run" | "rotate-turn";
export type Genre = {
  id: string;
  label: string; // UI 표시명 (ko)
  systemStyle: string; // 서술 톤/분위기 지시
  promptSeed: string; // 장르 키워드/상황 시드
};

// 🔽 하이라이트 타입을 정의합니다.
export type HighlightCategory =
  | "item"
  | "location"
  | "npc"
  | "misc";

export type HighlightMap = {
  [key in HighlightCategory]?: string[];
};

export type GameState = {
  story: string;
  typingStory: string;
  userAction: string;
  isTextLoading: boolean;
  isImgLoading: boolean;
  isGameOver: boolean;
  hp: number;
  atk: number;
  mp: number;
  equippedWeapon: Item | null;
  equippedArmor: Item | null;
  items: Item[];
  survivalTurns: number;
  sceneImageUrl: string;
  imgError: string;
  lastDelta: LastDelta;
  lastSurvivalTurn: string;
  hudNotes: string[];
  recommendedAction: string;
  isTypingFinished: boolean;
  selectedGenreId?: string | null;
  genreMode: GenreMode;
  turnInRun: number;
  maxTurns: number;
  isRunComplete: boolean;
  achievements: string[];
  ending: string;
  currentBgm: string | null;
  highlights?: HighlightMap;
};

export type AskResult = {
  nextStory: string;
  subject: Subject | null;
  deltas: Delta[];
  itemsAdd: string[];
  itemsRemove: string[];
  notes: string[];
  recommendedAction: string;
  bgm: string | null;
  highlights?: HighlightMap;
};

// 저장 슬롯 타입
export type SaveSlot = {
  id: number;
  saved: boolean;
  name?: string;
  savedAt?: string;
};

// 저장 데이터 타입
export type LoadedSave = {
  story: string;
  hp: number;
  atk: number;
  mp: number;
  items: Item[];
  equippedWeapon: Item | null;
  equippedArmor: Item | null;
  survivalTurns: number;
  sceneImageUrl: string;
  name?: string;
  savedAt?: string;
  maxTurns?: number;
  isRunComplete?: boolean;
  achievements?: string[];
  ending?: string;
  selectedGenreId?: string | null;
  genreMode?: GenreMode;
  turnInRun?: number;
  recommendedAction?: string;
  isGameOver?: boolean;
  currentBgm?: string | null;
  highlights?: HighlightMap;
};
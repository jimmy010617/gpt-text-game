// src/gameConfig.ts
import { Genre, GameState } from "./types";

// 🔑 ENV
export const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as
  | string
  | undefined;

// 📦 모델
export const TEXT_MODEL = "gemini-2.5-flash-lite";
export const IMAGE_MODEL = "imagen-3.0-generate-002";

// ⚠️ 장르는 언제든 추가/수정 가능
export const GENRES: Genre[] = [
  {
    id: "modern-disaster",
    label: "현대 재난 생존",
    systemStyle: "긴박하고 현실적인 톤, 실제 시민 생존 감정선 강조",
    promptSeed: "도심 정전, 지하철 고립, 제한된 식수와 전력",
  },
  {
    id: "apocalypse",
    label: "포스트 아포칼립스",
    systemStyle: "황량하고 거친 톤, 자원 희소/도덕적 딜레마",
    promptSeed: "폐허 도시, 약탈자, 방사능 구역, 자작 무기",
  },
  {
    id: "zombie",
    label: "좀비 아웃브레이크",
    systemStyle: "긴장/스텔스, 소음 관리, 감염 공포",
    promptSeed: "소리 유인, 안전가옥, 방호복, 해독제 소문",
  },
  {
    id: "desert",
    label: "사막 횡단 생존",
    systemStyle: "건조/극한 환경, 체력/수분 관리 강조",
    promptSeed: "오아시스 수색, 모래폭풍, 별자리로 방향 잡기",
  },
  {
    id: "island",
    label: "무인도 생존",
    systemStyle: "자급자족, 제작/사냥/채집 루프",
    promptSeed: "익사된 난파선, 구조 신호, 코코넛/어류/장작",
  },
  {
    id: "snow",
    label: "설원/빙하지대",
    systemStyle: "저체온/바람/시야 제한, 화기/텐트 관리",
    promptSeed: "눈보라, 얼음 크레바스, 흰out, 발자국 추적",
  },
  {
    id: "cave",
    label: "동굴 탐험 생존",
    systemStyle: "폐쇄공포/탐사, 로프/랜턴/산소 관리",
    promptSeed: "지하 강, 좁은 크랙, 표식 남기기, 박쥐",
  },
  {
    id: "sea-drift",
    label: "해양 표류",
    systemStyle: "염분/탈수/햇빛, 즉흥적인 담수화/낚시",
    promptSeed: "구명보트, 비상식량, 비 올때 수집, 상어",
  },
  {
    id: "space-station",
    label: "우주정거장 생존",
    systemStyle: "하드SF, 산소/전력/모듈 수리, 무중력",
    promptSeed: "누설 위치 탐색, 태양 플레어, 외벽 EVA",
  },
  {
    id: "cyberpunk",
    label: "사이버펑크 슬럼",
    systemStyle: "디스토피아/해킹/암시장, 네온 느와르",
    promptSeed: "의체 과부하, 데이터칩, 갱단 체인소우",
  },
  {
    id: "stealth",
    label: "스텔스 생존",
    systemStyle: "은신/도주 중심, 소리/시야/경로 설계",
    promptSeed: "수색대, 드론 회피, 통신 교란, 배수로",
  },
  {
    id: "space-sf",
    label: "우주SF 탐사 생존",
    systemStyle: "이국적 바이옴, 과학적 해결, 도구 제작",
    promptSeed: "외계 식물 샘플, 방사선 폭풍, 탐사 로버",
  },
];

// ===== 유틸: 초기 상태 정의 =====
export const DEFAULT_INITIAL_STATE: GameState = {
  story: "",
  typingStory: "",
  userAction: "",
  isTextLoading: false,
  isImgLoading: false,
  isGameOver: false,
  hp: 100,
  atk: 10,
  mp: 10,
  equippedWeapon: null,
  equippedArmor: null,
  items: [
    { name: "허름한 검", quantity: 1, type: "weapon", atkBonus: 5 },
    { name: "빵 한 조각", quantity: 1, type: "food" },
  ],
  survivalTurns: 0,
  sceneImageUrl: "",
  imgError: "",
  lastDelta: { hp: 0, atk: 0, mp: 0 },
  lastSurvivalTurn: "",
  hudNotes: [],
  recommendedAction: "",
  isTypingFinished: false,
  selectedGenreId: null,
  genreMode: "random-run",
  turnInRun: 0,
  maxTurns: 5,
  isRunComplete: false,
  achievements: [],
  ending: "",
  currentBgm: null,
};
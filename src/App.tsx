// src/App.tsx
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { GoogleGenAI } from "@google/genai";

import SideBar from "./Layout/SideBar";

// 🔑 ENV
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as
  | string
  | undefined;

// 📦 모델
const TEXT_MODEL = "gemini-2.5-flash-lite"; // 스토리 + 메인오브젝트 + 스탯증감 동시 추출 (스탯 기반 분기 포함)
const IMAGE_MODEL = "imagen-3.0-generate-002"; // Imagen 3 (과금 필요)

// ===== 타입 정의 =====
type StatKey = "hp" | "atk" | "mp";
type ItemType =
  | "weapon"
  | "food"
  | "misc"
  | "armor"
  | "potion"
  | "key"
  | "book";

type Delta = {
  stat: StatKey;
  delta: number;
  reason?: string;
};

type Subject = {
  ko?: string;
  en?: string;
};

type LastDelta = {
  hp: number;
  atk: number;
  mp: number;
};

type Item = {
  name: string;
  quantity: number;
  type: ItemType;
  atkBonus?: number; // 무기 공격력 보너스
  defBonus?: number; // 방어구 방어력 보너스 (현재 미사용, 향후 확장용)
};

// ===== 장르 타입 & 목록 =====
type GenreMode = "fixed" | "random-run" | "rotate-turn";
type Genre = {
  id: string;
  label: string; // UI 표시명 (ko)
  systemStyle: string; // 서술 톤/분위기 지시
  promptSeed: string; // 장르 키워드/상황 시드
};

// ⚠️ 장르는 언제든 추가/수정 가능
const GENRES: Genre[] = [
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

// 헬퍼
const getGenreById = (id?: string | null) =>
  GENRES.find((g) => g.id === id) || null;
const pickRandomGenre = () => GENRES[Math.floor(Math.random() * GENRES.length)];

function buildGenreDirectivesForPrompt(
  mode: GenreMode,
  selectedId: string | null | undefined,
  turnInRun: number
): { activeGenre: Genre | null; genreText: string } {
  // 모드별 현재 턴에 쓸 장르 결정
  let active: Genre | null = null;

  if (mode === "fixed") {
    active = getGenreById(selectedId) || null;
  } else if (mode === "random-run") {
    // 한 판 시작 시 고정되도록: selectedId 가 null이라면 시작 시에만 랜덤으로 확정
    active = getGenreById(selectedId) || null;
  } else if (mode === "rotate-turn") {
    // 기준 시작 장르가 있다면 그 다음부터 순환. 없으면 0부터
    const baseIdx = selectedId
      ? Math.max(
          0,
          GENRES.findIndex((g) => g.id === selectedId)
        )
      : 0;
    const idx = (baseIdx + Math.max(0, turnInRun)) % GENRES.length;
    active = GENRES[idx];
  }

  // 장르 지시 텍스트
  const genreText = active
    ? `장르 지시: '${active.label}' 느낌을 중심으로 전개하되, 클리셰를 피하고 ${active.systemStyle}.\n` +
      `장르 키워드: ${active.promptSeed}\n`
    : // 선택 장르 없음 → 어떤 장르든 가능하게, 한쪽으로 쏠리지 않도록 지시
      `장르 지시: 특정 장르에 고정하지 말고(현실/판타지/SF/근미래/재난/스텔스 등) 매 턴 신선한 생존 상황을 설계. ` +
      `이전 턴과 분위기가 너무 반복되지 않도록 변주를 주고, 스탯에 따라 해결 방식이 다르게 전개.`;

  return { activeGenre: active, genreText };
}

type GameState = {
  story: string;
  typingStory: string;
  userAction: string;
  isTextLoading: boolean;
  isImgLoading: boolean;
  isGameOver: boolean;
  hp: number;
  atk: number;
  mp: number;
  equippedWeapon: Item | null; // 💡 장착된 무기 추가
  equippedArmor: Item | null; // 💡 장착된 방어구 추가
  items: Item[];
  survivalTurns: number;
  sceneImageUrl: string;
  imgError: string;
  lastDelta: LastDelta;
  lastSurvivalTurn: string;
  hudNotes: string[];
  recommendedAction: string;
  isTypingFinished: boolean;

  selectedGenreId?: string | null; // 사용자가 고른 장르 (없으면 null)
  genreMode: GenreMode; // "fixed" | "random-run" | "rotate-turn"
  turnInRun: number;
  // 🔸 최대 턴 & 엔딩
  maxTurns: number; // 사용자가 정하는 최대 턴수
  isRunComplete: boolean; // 최대 턴 도달로 러닝 종료
  achievements: string[]; // 업적 목록
  ending: string; // 엔딩 서사(문단)
};

type AskResult = {
  nextStory: string;
  subject: Subject | null;
  deltas: Delta[];
  itemsAdd: string[];
  itemsRemove: string[];
  notes: string[];
  recommendedAction: string;
};

// ===== 유틸: 아이템 종류 분류 (하드코딩된 목록) =====
const categorizeItem = (name: string): ItemType => {
  const normalizedName = name.trim().toLowerCase();
  if (
    normalizedName.includes("검") ||
    normalizedName.includes("도끼") ||
    normalizedName.includes("활") ||
    normalizedName.includes("지팡이")
  ) {
    return "weapon";
  }
  if (
    normalizedName.includes("빵") ||
    normalizedName.includes("고기") ||
    normalizedName.includes("약초") ||
    normalizedName.includes("사과")
  ) {
    return "food";
  }
  if (
    normalizedName.includes("갑옷") ||
    normalizedName.includes("방패") ||
    normalizedName.includes("투구") ||
    normalizedName.includes("갑주")
  ) {
    return "armor";
  }
  if (
    normalizedName.includes("포션") ||
    normalizedName.includes("물약") ||
    normalizedName.includes("회복제")
  ) {
    return "potion";
  }
  if (normalizedName.includes("열쇠")) {
    return "key";
  }
  if (
    normalizedName.includes("책") ||
    normalizedName.includes("스크롤") ||
    normalizedName.includes("두루마리")
  ) {
    return "book";
  }
  return "misc";
};

// ===== 유틸: 초기 상태 정의 =====
const DEFAULT_INITIAL_STATE: GameState = {
  story: "",
  typingStory: "",
  userAction: "",
  isTextLoading: false,
  isImgLoading: false,
  isGameOver: false,
  hp: 100,
  atk: 10,
  mp: 10,
  equippedWeapon: null, // 💡 초기 상태에 장착된 무기/방어구 추가
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
  // 🔸 추가
  maxTurns: 5,
  isRunComplete: false,
  achievements: [],
  ending: "",
};

// ===== 유틸: 초기 상태 불러오기 =====
const loadInitialState = (): GameState => {
  try {
    const autoSavedState = localStorage.getItem("ai_game_auto_save");
    if (autoSavedState) {
      const loadedState = JSON.parse(autoSavedState) as Partial<GameState>;
      alert("자동 저장된 게임을 불러왔습니다!");
      return {
        story: loadedState.story ?? "",
        typingStory: "", // 타이핑 효과를 위해 초기화
        userAction: "",
        isTextLoading: false,
        isImgLoading: false,
        isGameOver: loadedState.isGameOver ?? false,
        hp: loadedState.hp ?? DEFAULT_INITIAL_STATE.hp,
        atk: loadedState.atk ?? DEFAULT_INITIAL_STATE.atk,
        mp: loadedState.mp ?? DEFAULT_INITIAL_STATE.mp,
        equippedWeapon: loadedState.equippedWeapon ?? null, // 💡 장착된 아이템 불러오기
        equippedArmor: loadedState.equippedArmor ?? null,
        items: (loadedState.items ?? []).map((item: any) => ({
          name: item.name ?? item,
          quantity: item.quantity ?? 1,
          type: categorizeItem(item.name ?? item),
          atkBonus: item.atkBonus,
          defBonus: item.defBonus,
        })),
        survivalTurns: loadedState.survivalTurns ?? 0,
        sceneImageUrl: loadedState.sceneImageUrl ?? "",
        imgError: "",
        lastDelta: loadedState.lastDelta ?? { hp: 0, atk: 0, mp: 0 },
        lastSurvivalTurn: "",
        hudNotes: loadedState.hudNotes ?? [],
        recommendedAction: loadedState.recommendedAction ?? "", // 💡 recommendedAction 상태 불러오기
        isTypingFinished: true, // 💡 저장된 스토리가 있으면 타이핑이 끝난 상태로 시작
        selectedGenreId: loadedState.selectedGenreId ?? null,
        genreMode: (loadedState.genreMode as GenreMode) ?? "fixed",
        turnInRun: loadedState.turnInRun ?? 0,
        maxTurns: loadedState.maxTurns ?? 5,
        isRunComplete: loadedState.isRunComplete ?? false,
        achievements: loadedState.achievements ?? [],
        ending: loadedState.ending ?? "",
      };
    }
  } catch (e) {
    console.error("자동 저장된 게임 불러오기 실패:", e);
  }

  // 저장된 게임이 없으면 기본 초기 상태
  return DEFAULT_INITIAL_STATE;
};

function App() {
  const [gameState, setGameState] = useState<GameState>(loadInitialState);
  const storyRef = useRef<HTMLDivElement | null>(null);
  const [showOptions, setShowOptions] = useState<boolean>(false);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [withImage, setWithImage] = useState<boolean>(false);
  const [initialStats, setInitialStats] = useState({
    hp: gameState.hp,
    atk: gameState.atk,
    mp: gameState.mp,
  });
  // 사이드바 표시 여부 관리 상태 추가
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  const [isStatusVisible, setIsStatusVisible] = useState<boolean>(false);
  const [currentSlot, setCurrentSlot] = useState<number>(1);
  const [slots, setSlots] = useState<
    Array<{ id: number; saved: boolean; name?: string; savedAt?: string }>
  >([]);
  const [saveName, setSaveName] = useState<string>("");
  const [newItemName, setNewItemName] = useState<string>("");
  // 장르 설정 상태
  const [genreModeUI, setGenreModeUI] = useState<GenreMode>(
    gameState.genreMode
  );
  const [selectedGenreIdUI, setSelectedGenreIdUI] = useState<string | null>(
    gameState.selectedGenreId ?? null
  );

  // 옵션 모달 열릴 때 UI상태를 현재값으로 동기화
  useEffect(() => {
    if (showOptions) {
      setGenreModeUI(gameState.genreMode);
      setSelectedGenreIdUI(gameState.selectedGenreId ?? null);
    }
  }, [showOptions]);

  // 💡 장착된 무기에 따라 ATK 계산하는 유틸 함수
  const getAdjustedAtk = useCallback(() => {
    return gameState.atk + (gameState.equippedWeapon?.atkBonus || 0);
  }, [gameState.atk, gameState.equippedWeapon]);

  // 🔸 업적 계산: 현재 상태를 기준으로 간단한 규칙 기반 업적을 부여
  function computeAchievements(s: GameState): string[] {
    const a: string[] = [];
    if (s.hp >= 100) a.push("철인: 체력을 100 이상 유지했다");
    if (s.items.some((i) => i.type === "weapon" && (i.atkBonus ?? 0) >= 10))
      a.push("무장완료: 강력한 무기를 확보했다");
    if (s.items.filter((i) => i.type === "food").length >= 3)
      a.push("비축왕: 음식 아이템을 3개 이상 보유했다");
    if (s.survivalTurns >= s.maxTurns)
      a.push(`끝까지 버텨냈다: ${s.maxTurns}턴 생존 달성`);
    if (s.equippedWeapon) a.push(`무기 장착: ${s.equippedWeapon.name}`);
    if (s.equippedArmor) a.push(`방어구 장착: ${s.equippedArmor.name}`);
    if (a.length === 0) a.push("소소한 생존자: 평범하지만 꾸준히 버텼다");
    return a.slice(0, 6);
  }

  // 🔸 엔딩 생성: Gemini로 짧은 에필로그(한국어 5~7문장) 요청
  async function generateEndingNarrative(
    ai: any,
    s: GameState,
    genreText: string
  ): Promise<string> {
    if (!ai) {
      return "엔딩 생성 실패: API 키가 없어 기본 엔딩으로 마감합니다.\n당신은 묵묵히 버텨냈고, 다음 생존을 기약합니다.";
    }
    const summary = [
      `HP=${s.hp}, ATK=${s.atk + (s.equippedWeapon?.atkBonus ?? 0)}, MP=${
        s.mp
      }`,
      `턴=${s.survivalTurns}/${s.maxTurns}`,
      `무기=${s.equippedWeapon?.name ?? "없음"}, 방어구=${
        s.equippedArmor?.name ?? "없음"
      }`,
      `아이템=${
        s.items.map((i) => `${i.name}x${i.quantity}`).join(", ") || "없음"
      }`,
    ].join(" | ");

    const prompt =
      `${genreText}\n` +
      `다음 플레이어 상태 요약을 반영해 러닝 엔딩을 한국어 5~7문장으로 작성. 감정선과 선택의 여운을 남기되, 새 전투를 시작하지 말 것.\n` +
      `요약: ${summary}\n` +
      `요구사항: 목록/머리말 없이 순수 문단 서술. 과도한 영웅담 지양, 현실감 있게.`;

    const res = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.8, maxOutputTokens: 500 },
    });

    const out = (res?.text ?? "").trim();
    return (
      out ||
      "긴 생존 끝에 당신은 잠시 숨을 고른다. 오늘을 버텼다는 사실만으로도 충분했다."
    );
  }

  // 💡 아이템 사용 핸들러
  const handleUseItem = useCallback((itemToUse: Item) => {
    if (!window.confirm(`${itemToUse.name}을(를) 사용하시겠습니까?`)) {
      return;
    }
    setGameState((prev) => {
      let newHp = prev.hp;
      let newItems = [...prev.items];
      let newHudNotes = [...prev.hudNotes];
      const itemIndex = newItems.findIndex(
        (item) => item.name === itemToUse.name
      );

      if (itemIndex > -1) {
        if (itemToUse.type === "food") {
          newHp = prev.hp + 10;
          newHudNotes = [`체력 10 회복 (+10 HP)`, ...newHudNotes].slice(0, 6);
        } else if (itemToUse.type === "potion") {
          newHp = prev.hp + 30;
          newHudNotes = [`체력 30 회복 (+30 HP)`, ...newHudNotes].slice(0, 6);
        }

        // 아이템 수량 감소 또는 제거
        if (newItems[itemIndex].quantity > 1) {
          newItems[itemIndex].quantity -= 1;
        } else {
          newItems.splice(itemIndex, 1);
        }
      }

      return {
        ...prev,
        hp: newHp,
        items: newItems,
        hudNotes: newHudNotes,
      };
    });
  }, []);

  // 💡 장착 핸들러
  const handleEquipItem = useCallback((itemToEquip: Item) => {
    if (itemToEquip.type !== "weapon" && itemToEquip.type !== "armor") {
      alert("장착할 수 없는 아이템입니다.");
      return;
    }

    setGameState((prev) => {
      let newItems = [...prev.items];
      let newEquippedWeapon = prev.equippedWeapon;
      let newEquippedArmor = prev.equippedArmor;
      let newHudNotes = [...prev.hudNotes];

      // 소지품 목록에서 아이템 제거
      const itemIndex = newItems.findIndex(
        (item) => item.name === itemToEquip.name
      );
      if (itemIndex === -1) return prev;
      newItems.splice(itemIndex, 1);

      if (itemToEquip.type === "weapon") {
        if (newEquippedWeapon) {
          // 기존 무기 해제 후 인벤토리로 이동
          newItems.push(newEquippedWeapon);
          newHudNotes = [
            `무기 해제: ${newEquippedWeapon.name}`,
            ...newHudNotes,
          ].slice(0, 6);
        }
        newEquippedWeapon = itemToEquip;
        newHudNotes = [`무기 장착: ${itemToEquip.name}`, ...newHudNotes].slice(
          0,
          6
        );
      } else if (itemToEquip.type === "armor") {
        if (newEquippedArmor) {
          // 기존 방어구 해제 후 인벤토리로 이동
          newItems.push(newEquippedArmor);
          newHudNotes = [
            `방어구 해제: ${newEquippedArmor.name}`,
            ...newHudNotes,
          ].slice(0, 6);
        }
        newEquippedArmor = itemToEquip;
        newHudNotes = [
          `방어구 장착: ${itemToEquip.name}`,
          ...newHudNotes,
        ].slice(0, 6);
      }

      return {
        ...prev,
        items: newItems,
        equippedWeapon: newEquippedWeapon,
        equippedArmor: newEquippedArmor,
        hudNotes: newHudNotes,
      };
    });
  }, []);

  // 💡 해제 핸들러
  const handleUnequipItem = useCallback((itemToUnequip: Item) => {
    setGameState((prev) => {
      let newItems = [...prev.items];
      let newEquippedWeapon = prev.equippedWeapon;
      let newEquippedArmor = prev.equippedArmor;
      let newHudNotes = [...prev.hudNotes];

      if (
        itemToUnequip.type === "weapon" &&
        prev.equippedWeapon?.name === itemToUnequip.name
      ) {
        newItems.push(prev.equippedWeapon);
        newEquippedWeapon = null;
        newHudNotes = [
          `무기 해제: ${itemToUnequip.name}`,
          ...newHudNotes,
        ].slice(0, 6);
      } else if (
        itemToUnequip.type === "armor" &&
        prev.equippedArmor?.name === itemToUnequip.name
      ) {
        newItems.push(prev.equippedArmor);
        newEquippedArmor = null;
        newHudNotes = [
          `방어구 해제: ${itemToUnequip.name}`,
          ...newHudNotes,
        ].slice(0, 6);
      } else {
        return prev;
      }

      return {
        ...prev,
        items: newItems,
        equippedWeapon: newEquippedWeapon,
        equippedArmor: newEquippedArmor,
        hudNotes: newHudNotes,
      };
    });
  }, []);

  useEffect(() => {
    if (showOptions) {
      setInitialStats({
        hp: gameState.hp,
        atk: gameState.atk,
        mp: gameState.mp,
      });
    }
  }, [showOptions, gameState.hp, gameState.atk, gameState.mp]);

  useEffect(() => {
    const saved = localStorage.getItem("withImage");
    if (saved !== null) setWithImage(saved === "true");
  }, []);
  useEffect(() => {
    localStorage.setItem("withImage", String(withImage));
  }, [withImage]);

  useEffect(() => {
    if (storyRef.current) {
      storyRef.current.scrollTop = storyRef.current.scrollHeight;
    }
  }, [gameState.story, gameState.typingStory]);

  useEffect(() => {
    const slotsData: Array<{
      id: number;
      saved: boolean;
      name?: string;
      savedAt?: string;
    }> = [];
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

  // 🔸 최대 턴 도달 시 엔딩을 확정하고 입력을 막는다
  useEffect(() => {
    (async () => {
      if (!gameState.isRunComplete || gameState.ending) return;

      const turnForGenre = gameState.turnInRun; // 현재 회차 기준
      const { genreText } = buildGenreDirectivesForPrompt(
        gameState.genreMode,
        gameState.selectedGenreId,
        turnForGenre
      );

      const ach = computeAchievements(gameState);
      let endingText = await generateEndingNarrative(
        ai,
        gameState,
        genreText
      ).catch(() => "");

      setGameState((prev) => ({
        ...prev,
        achievements: ach,
        ending:
          endingText ||
          "엔딩을 불러오지 못했습니다. 그래도 당신의 생존은 의미 있었습니다.",
      }));

      // 자동 저장
      autoSaveGame();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.isRunComplete]);
  const autoSaveGame = useCallback(() => {
    const {
      story,
      hp,
      atk,
      mp,
      items,
      survivalTurns,
      sceneImageUrl,
      isGameOver,
      recommendedAction,
      equippedWeapon,
      equippedArmor,
      selectedGenreId,
      genreMode,
      turnInRun,
      // 🔸 추가 저장
      maxTurns,
      isRunComplete,
      achievements,
      ending,
    } = gameState;

    const autoSaveState = {
      story,
      hp,
      atk,
      mp,
      items,
      survivalTurns,
      sceneImageUrl,
      isGameOver,
      recommendedAction,
      equippedWeapon,
      equippedArmor,
      selectedGenreId,
      genreMode,
      turnInRun,
      maxTurns,
      isRunComplete,
      achievements,
      ending, // 🔸
    };
    try {
      localStorage.setItem("ai_game_auto_save", JSON.stringify(autoSaveState));
      console.log("자동 저장 완료!");
    } catch (e) {
      console.error("자동 저장 실패:", e);
    }
  }, [gameState]);

  useEffect(() => {
    if (!gameState.story || gameState.isGameOver) {
      setGameState((prev) => ({
        ...prev,
        typingStory: prev.story,
        isTypingFinished: true,
      }));
      return;
    }
    setGameState((prev) => ({ ...prev, isTypingFinished: false }));

    const speed = 30;
    let i = 0;
    const typingInterval = window.setInterval(() => {
      if (i < gameState.story.length) {
        const part = gameState.story.substring(0, i + 1);
        setGameState((prev) => ({
          ...prev,
          typingStory: part,
        }));
        i++;
      } else {
        window.clearInterval(typingInterval);
        setGameState((prev) => ({ ...prev, isTypingFinished: true }));
      }
    }, speed);

    return () => {
      window.clearInterval(typingInterval);
    };
  }, [gameState.story, gameState.isGameOver]);

  const ai = useMemo(
    () => (GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null),
    []
  ) as any;

  const ensureApi = (): boolean => {
    if (!ai) {
      setGameState((prev) => ({
        ...prev,
        story: "환경변수 VITE_GEMINI_API_KEY가 설정되지 않았습니다.",
      }));
      return false;
    }
    return true;
  };

  function buildImagePromptFromSubject(
    subject: Subject | null | undefined
  ): string {
    const ko = subject?.ko?.trim() || "핵심 오브젝트 1개";
    const en = subject?.en?.trim() || "a single core object, centered";
    const koLines = [
      `오직 하나의 대상만 또렷하게 그린다: ${ko}`,
      "배경은 단순하고 방해되지 않게(미니멀/스튜디오 톤).",
      "대상은 화면 중앙에 크게, 전체 형태가 한눈에 들어오도록.",
      "추가 오브젝트/군중/문자/워터마크/장면 종합 설명 금지.",
      "가장자리 선명, 고품질, 부드러운 조명, 16:9 프레임.",
    ].join("\n");

    const enHint =
      `${en}; minimal clean background; single subject only; ` +
      `no extra objects; no text or watermark; high detail; sharp edges; soft studio lighting; ` +
      `center composition; 16:9 frame`;

    return `${koLines}\n\nEnglish hint: ${enHint}`;
  }

  async function askStorySubjectAndDeltas({
    systemHint,
    userText,
  }: {
    systemHint?: string;
    userText: string;
  }): Promise<AskResult> {
    const playerState = {
      hp: gameState.hp,
      atk: getAdjustedAtk(), // 💡 장착 무기 보너스 포함된 ATK 전달
      mp: gameState.mp,
      items: gameState.items,
      equippedWeapon: gameState.equippedWeapon, // 💡 장착 아이템 정보 전달
      equippedArmor: gameState.equippedArmor,
      survivalTurns: gameState.survivalTurns,
    };

    const role =
      "역할: 당신은 AI 게임 마스터이자 게임 시스템입니다. " +
      "아래 '플레이어 현재 상태'를 반드시 고려하여, 같은 상황이라도 스탯(ATK/MP/HP)에 따라 결과가 달라지도록 스토리를 진행하세요. " +
      "예) 같은 적을 만나도 ATK가 높으면 쉽게 제압(피해 적음), MP가 높으면 마법적 해결, 스탯이 낮으면 회피/도망/피해 증가 등.\n" +
      "이야기를 생성하면서 그 결과로 플레이어의 스탯/인벤토리 변화도 함께 산출합니다. " +
      "스탯은 정수 delta로만 표기(hp/atk/mp). 예: 괴물과 싸움→ atk+1, hp-10 / 책 읽음→ mp+1 / 피해→ hp-10. " +
      "아이템 변동이 있으면 itemsAdd/itemsRemove에 넣으세요. " +
      "또한 장면에서 '가장 중심이 되는 단일 물체' 1개(subject)를 뽑습니다(사람/군중/배경전체/추상 제외). " +
      "사용자의 행동을 직접 입력하지 않고 클릭할 수 있도록 'recommendedAction'에 다음 추천 행동 1개를 한국어 문장으로 제시하세요. " +
      "가능하면 가장 합리적인 행동을 추천하고, 너무 뻔한 행동은 피하세요.\n" +
      "반드시 JSON만 출력. 포맷:\n" +
      "{\n" +
      '  "story": "한국어 스토리...",\n' +
      '  "subject": { "언어": "물체", "en": "subject" },\n' +
      '  "deltas": [ { "stat": "hp"|"atk"|"mp", "delta": -10, "reason": "적에게 맞음" }, ... ],\n' +
      '  "itemsAdd": ["아이템명"...],\n' +
      '  "itemsRemove": ["아이템명"...],\n' +
      '  "recommendedAction": "추천 행동 텍스트"\n' +
      "}";

    const content =
      (systemHint ? `${systemHint}\n\n` : "") +
      "플레이어 현재 상태:\n" +
      JSON.stringify(playerState) +
      "\n\n요청:\n" +
      userText +
      "\n\nJSON만 출력하세요. 다른 말/코드블록/설명 금지.";

    const result = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: [
        { role: "user", parts: [{ text: role }] },
        { role: "user", parts: [{ text: content }] },
      ],
      config: { temperature: 0.8, maxOutputTokens: 900, topP: 0.95, topK: 40 },
    });

    const raw: string = (result?.text ?? "").trim();
    const s = raw.indexOf("{");
    const e = raw.lastIndexOf("}");
    const jsonStr = s >= 0 && e >= 0 ? raw.slice(s, e + 1) : "{}";

    let parsed: any = {};
    try {
      parsed = JSON.parse(jsonStr);
    } catch (err) {
      console.error("JSON 파싱 실패:", err, raw);
      parsed = {};
    }

    const nextStory = (parsed.story ?? "").trim();
    const subject: Subject | null = parsed.subject ?? null;
    const deltas: Delta[] = Array.isArray(parsed.deltas) ? parsed.deltas : [];
    const itemsAdd: string[] = Array.isArray(parsed.itemsAdd)
      ? parsed.itemsAdd
      : [];
    const itemsRemove: string[] = Array.isArray(parsed.itemsRemove)
      ? parsed.itemsRemove
      : [];
    const notes: string[] = Array.isArray(parsed.hudNotes)
      ? parsed.hudNotes
      : [];
    const recommendedAction: string = (parsed.recommendedAction ?? "").trim();

    return {
      nextStory,
      subject,
      deltas,
      itemsAdd,
      itemsRemove,
      notes,
      recommendedAction,
    };
  }

  function generateHudNotes({
    deltas,
    itemsAdd,
    itemsRemove,
  }: {
    deltas: Delta[];
    itemsAdd: string[];
    itemsRemove: string[];
  }): string[] {
    const notes: string[] = [];

    if (deltas && deltas.length) {
      deltas.forEach((d) => {
        if (!d) return;
        if (typeof d.delta !== "number" || d.delta === 0) return;
        const sign = d.delta > 0 ? "+" : "";
        const reason = d.reason ? ` (${d.reason})` : "";
        notes.push(`${d.stat.toUpperCase()} ${sign}${d.delta}${reason}`);
      });
    }

    if (itemsAdd && itemsAdd.length) {
      itemsAdd.forEach((item) => notes.push(`새 아이템 획득: ${item}`));
    }

    if (itemsRemove && itemsRemove.length) {
      itemsRemove.forEach((item) => notes.push(`아이템 잃음: ${item}`));
    }

    return notes;
  }
  function applyDeltasAndItems({
    deltas,
    itemsAdd,
    itemsRemove,
  }: {
    deltas: Delta[];
    itemsAdd: string[];
    itemsRemove: string[];
  }) {
    setGameState((prev) => {
      let newHp = prev.hp;
      let newAtk = prev.atk;
      let newMp = prev.mp;
      let newItems = [...prev.items];

      const newNotes = generateHudNotes({ deltas, itemsAdd, itemsRemove });
      const newHudNotes = [...newNotes, ...prev.hudNotes].slice(0, 6);

      let newSurvivalTurns = prev.survivalTurns;
      let lastSurvivalTurn = prev.lastSurvivalTurn;
      let dHp = 0,
        dAtk = 0,
        dMp = 0;

      for (const d of deltas || []) {
        if (!d || typeof d.delta !== "number") continue;
        if (d.stat === "hp") dHp += d.delta;
        if (d.stat === "atk") dAtk += d.delta;
        if (d.stat === "mp") dMp += d.delta;
      }

      newHp = newHp + dHp;
      newAtk = newAtk + dAtk;
      newMp = newMp + dMp;

      if (itemsAdd?.length) {
        itemsAdd.forEach((itemName) => {
          const existingItem = newItems.find((item) => item.name === itemName);
          if (existingItem) existingItem.quantity += 1;
          else
            newItems.push({
              name: itemName,
              quantity: 1,
              type: categorizeItem(itemName),
            });
        });
      }
      if (itemsRemove?.length) {
        itemsRemove.forEach((itemName) => {
          const idx = newItems.findIndex((item) => item.name === itemName);
          if (idx > -1) {
            if (newItems[idx].quantity > 1) newItems[idx].quantity -= 1;
            else newItems.splice(idx, 1);
          }
        });
      }

      const isGameOver = newHp <= 0;

      if (!isGameOver) {
        newSurvivalTurns += 1;
        lastSurvivalTurn = "highlight";
      }

      // 🔸 최대 턴 도달 여부
      const reachedMax =
        !isGameOver && prev.maxTurns > 0 && newSurvivalTurns >= prev.maxTurns;

      return {
        ...prev,
        hp: Math.max(0, newHp),
        atk: newAtk,
        mp: newMp,
        items: newItems,
        survivalTurns: newSurvivalTurns,
        lastSurvivalTurn,
        hudNotes: reachedMax
          ? [
              "최대 턴에 도달했습니다. 엔딩을 기록합니다.",
              ...newHudNotes,
            ].slice(0, 6)
          : newHudNotes,
        isGameOver,
        lastDelta: { hp: dHp, atk: dAtk, mp: dMp },

        // 🔸 러닝 종료 플래그
        isRunComplete: reachedMax || prev.isRunComplete,
      };
    });

    window.setTimeout(() => {
      setGameState((prev) => ({
        ...prev,
        lastDelta: { hp: 0, atk: 0, mp: 0 },
        lastSurvivalTurn: "",
      }));
    }, 3000);
  }

  async function generateSceneImageFromSubject(subject: Subject | null) {
    setGameState((prev) => ({ ...prev, imgError: "", isImgLoading: true }));
    if (!ensureApi()) return;
    try {
      const prompt = buildImagePromptFromSubject(subject);
      const res = await ai.models.generateImages({
        model: IMAGE_MODEL,
        prompt,
        config: { numberOfImages: 1 },
      });
      const bytes: string | undefined =
        res?.generatedImages?.[0]?.image?.imageBytes;
      if (bytes) {
        setGameState((prev) => ({
          ...prev,
          sceneImageUrl: `data:image/png;base64,${bytes}`,
        }));
      } else {
        setGameState((prev) => ({
          ...prev,
          imgError:
            "이미지가 반환되지 않았습니다. 프롬프트를 더 구체적으로 작성해 보세요.",
        }));
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("only accessible to billed users"))
        setGameState((prev) => ({
          ...prev,
          imgError:
            "Imagen API는 결제 등록된 계정만 사용 가능합니다. (결제/쿼터 설정 필요)",
        }));
      else if (/permission|quota|disabled|billing/i.test(msg))
        setGameState((prev) => ({
          ...prev,
          imgError: "이미지 생성 권한/쿼터/과금 설정을 확인해주세요.",
        }));
      else
        setGameState((prev) => ({
          ...prev,
          imgError: `이미지 생성 오류: ${msg}`,
        }));
    } finally {
      setGameState((prev) => ({ ...prev, isImgLoading: false }));
    }
  }
  const generateScenario = async () => {
    if (!ensureApi()) return;

    // 한 판 시작: turnInRun = 0으로 초기화, random-run 모드는 시작 시 장르 확정
    const nextSelected =
      gameState.genreMode === "random-run" && !gameState.selectedGenreId
        ? pickRandomGenre().id
        : gameState.selectedGenreId ?? null;

    setGameState((prev) => ({
      ...prev,
      story: "",
      typingStory: "",
      userAction: "",
      isTextLoading: true,
      isGameOver: false,
      sceneImageUrl: "",
      imgError: "",
      hudNotes: [],
      survivalTurns: 0,
      hp: initialStats.hp,
      atk: initialStats.atk,
      mp: initialStats.mp,
      equippedWeapon: null,
      equippedArmor: null,
      items: [
        { name: "허름한 검", quantity: 1, type: "weapon", atkBonus: 5 },
        { name: "빵 한 조각", quantity: 1, type: "food" },
      ],
      lastSurvivalTurn: "",
      recommendedAction: "",
      isTypingFinished: false,
      turnInRun: 0,
      selectedGenreId: nextSelected, // 한 판 랜덤이면 여기서 확정

      isRunComplete: false,
      achievements: [],
      ending: "",
    }));

    const { genreText } = buildGenreDirectivesForPrompt(
      gameState.genreMode,
      nextSelected,
      0
    );

    const chatPrompt =
      `${genreText}\n` +
      "장르는 특정하지 말고(가능하면 장르적 장치를 활용) 플레이어에게 흥미로운 '생존' 상황을 한국어로 z 제시. " +
      "자원/위험/환경 제약을 분명히 제시하고, 선택지 2~3개를 만들어도 좋음. 마지막은 '행동을 입력하세요'로 끝낼 것.";

    try {
      const {
        nextStory,
        subject,
        deltas,
        itemsAdd,
        itemsRemove,
        recommendedAction,
      } = await askStorySubjectAndDeltas({
        systemHint:
          "story는 자연스러운 한국어 문단. subject는 단일 물체 1개만. " +
          "deltas는 hp/atk/mp를 정수 증감. itemsAdd/Remove도 필요시 채우기. " +
          "같은 상황이라도 스탯에 따라 결과 분기.",
        userText: chatPrompt,
      });

      const out = nextStory || "상황 생성 실패";
      setGameState((prev) => ({
        ...prev,
        story: out,
        recommendedAction: recommendedAction || "",
      }));
      applyDeltasAndItems({ deltas, itemsAdd, itemsRemove });
      autoSaveGame();

      if (!gameState.isGameOver && withImage && subject) {
        await generateSceneImageFromSubject(subject);
      }
    } catch (e) {
      console.error(e);
      setGameState((prev) => ({
        ...prev,
        story: "상황 생성 중 오류가 발생했습니다.",
      }));
    } finally {
      setGameState((prev) => ({ ...prev, isTextLoading: false }));
    }
  };

  const submitAction = async () => {
    if (
      !ensureApi() ||
      !gameState.story ||
      gameState.isGameOver ||
      gameState.isRunComplete
    )
      return; // 🔸 추가

    setGameState((prev) => ({ ...prev, isTextLoading: true }));

    // 현재 러닝의 다음 턴 번호(프롬프트 위해 참조)
    const nextTurn = gameState.turnInRun + 1;

    const { genreText, activeGenre } = buildGenreDirectivesForPrompt(
      gameState.genreMode,
      gameState.selectedGenreId,
      nextTurn
    );

    const actionPrompt =
      `${genreText}\n` +
      `이전 상황(컨텍스트):\n${gameState.story}\n\n` +
      `플레이어의 행동: ${gameState.userAction}\n\n` +
      "게임 마스터처럼 자연스럽게 다음 전개를 서술. 필요시 선택지 2~3개. '행동을 입력하세요'로 끝내기.";

    try {
      const {
        nextStory,
        subject,
        deltas,
        itemsAdd,
        itemsRemove,
        recommendedAction,
      } = await askStorySubjectAndDeltas({
        systemHint:
          "story는 한국어 문단. subject는 단일 물체 1개. " +
          "deltas는 전투/피해/학습/회복/아이템 사용 등을 반영해 hp/atk/mp 정수 증감. " +
          "스탯이 높거나 낮으면 결과가 달라지도록. itemsAdd/Remove도 필요시 채움.",
        userText: actionPrompt,
      });

      const out = nextStory || "이야기 생성 실패";
      setGameState((prev) => ({
        ...prev,
        story: out,
        userAction: "",
        recommendedAction: recommendedAction || "",
        // 순환 모드에서도 selectedGenreId는 그대로 두고, turnInRun만 증가
        turnInRun: nextTurn,
      }));
      applyDeltasAndItems({ deltas, itemsAdd, itemsRemove });
      autoSaveGame();

      if (!gameState.isGameOver && withImage && subject) {
        await generateSceneImageFromSubject(subject);
      }
    } catch (e) {
      console.error(e);
      setGameState((prev) => ({
        ...prev,
        story: "이야기 생성 중 오류가 발생했습니다.",
      }));
    } finally {
      setGameState((prev) => ({ ...prev, isTextLoading: false }));
    }
  };
  const goHome = () => {
    if (
      window.confirm(
        "정말 게임을 처음부터 다시 시작하시겠습니까? 모든 진행 상황이 초기화됩니다."
      )
    ) {
      setGameState(DEFAULT_INITIAL_STATE);
      setInitialStats({
        hp: DEFAULT_INITIAL_STATE.hp,
        atk: DEFAULT_INITIAL_STATE.atk,
        mp: DEFAULT_INITIAL_STATE.mp,
      });
      localStorage.removeItem("ai_game_auto_save"); // 자동 저장된 게임도 삭제
    }
  };

  const Spinner: React.FC<{ label: string }> = ({ label }) => (
    <div className="flex items-center gap-2 text-gray-600 text-sm">
      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
        ></circle>
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        ></path>
      </svg>
      <span>{label}</span>
    </div>
  );

  const DeltaBadge: React.FC<{ value?: number }> = ({ value }) => {
    if (!value) return null;
    const sign = value > 0 ? "+" : "";
    const color = value > 0 ? "text-green-600" : "text-red-600";
    return (
      <span className={`ml-2 text-xs font-semibold ${color}`}>
        {sign} {value}
      </span>
    );
  };

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
    } = gameState; // 🔸
    const saveState = {
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
      ending, // 🔸
      name: name || `저장 #${slotNumber}`,
      savedAt: new Date().toLocaleString(),
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

  type LoadedSave = {
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

    // 선택적(버전에 따라 없을 수 있음)
    maxTurns?: number;
    isRunComplete?: boolean;
    achievements?: string[];
    ending?: string;
    selectedGenreId?: string | null;
    genreMode?: GenreMode;
    turnInRun?: number;
    recommendedAction?: string;
    isGameOver?: boolean;
  };
  // 👉 저장 슬롯에서 불러올 때 사용할 타입

  // 👉 슬롯에서 게임 불러오기 (전체 교체용)
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

        // 본문/타이핑
        story: loaded.story ?? "",
        typingStory: "",
        isTypingFinished: false,

        // 스탯/인벤/장비
        hp: loaded.hp ?? prev.hp,
        atk: loaded.atk ?? prev.atk,
        mp: loaded.mp ?? prev.mp,
        items: Array.isArray(loaded.items) ? loaded.items : prev.items,
        equippedWeapon: loaded.equippedWeapon ?? null,
        equippedArmor: loaded.equippedArmor ?? null,

        // 진행도
        survivalTurns: loaded.survivalTurns ?? 0,
        turnInRun: loaded.turnInRun ?? 0,

        // 이미지
        sceneImageUrl: loaded.sceneImageUrl ?? "",
        isImgLoading: false,
        imgError: "",

        // 러닝/엔딩 상태
        maxTurns: loaded.maxTurns ?? prev.maxTurns ?? 5,
        isRunComplete: loaded.isRunComplete ?? false,
        achievements: loaded.achievements ?? [],
        ending: loaded.ending ?? "",

        // 기타
        isGameOver: loaded.isGameOver ?? false,
        recommendedAction: loaded.recommendedAction ?? "",
        userAction: "",
        lastDelta: { hp: 0, atk: 0, mp: 0 }, // 시각 효과 초기화
        lastSurvivalTurn: "",

        // 장르
        selectedGenreId: loaded.selectedGenreId ?? prev.selectedGenreId ?? null,
        genreMode:
          (loaded.genreMode as GenreMode) ?? prev.genreMode ?? "random-run",
      }));

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
          slot.id === slotNumber ? { ...slot, saved: false } : slot
        )
      );
      alert(`${slotNumber}번의 게임이 삭제되었습니다.`);
    } catch (e) {
      console.error("Failed to delete game from localStorage:", e);
      alert("게임 삭제에 실패했습니다.");
    }
  };

  // 옵션 모달 열릴 때 UI 동기화
  useEffect(() => {
    if (showOptions) {
      setGenreModeUI(gameState.genreMode);
      setSelectedGenreIdUI(gameState.selectedGenreId ?? null);
      setMaxTurnsUI(gameState.maxTurns); // 🔸
    }
  }, [showOptions]);

  // 🔸 모달 전용 상태
  const [maxTurnsUI, setMaxTurnsUI] = useState<number>(gameState.maxTurns);

  return (
    <div className="min-h-screen bg-base-200 p-6 flex flex-col items-center justify-center">
      {/* ===== 🔽 2. 사이드바 토글 버튼 추가 🔽 ===== */}
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

      {/* ===== 🔽 3. 사이드바 및 오버레이 UI 추가 🔽 ===== */}
      {/* 배경 오버레이 */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity ${
          isSidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsSidebarOpen(false)}
        aria-hidden="true"
      />
      {/* 사이드바 패널 */}
      <div
        className={`fixed top-0 left-0 h-full bg-base-100 shadow-xl z-50 w-64 p-4 transform transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <h2 className="text-2xl font-bold text-center mb-1 mt-4">테마 설정</h2>
        <SideBar />
      </div>

      {!gameState.story ? (
        // ===== 게임 시작 전 UI =====
        <div className="bg-white shadow-2xl rounded-2xl w-full max-w-4xl p-8 space-y-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-extrabold text-primary">
              랜덤 스토리
            </h1>
            <div className="flex items-center gap-3">
              {/* 도움말 버튼 */}
              <button
                onClick={() => setShowHelp(true)}
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
                onClick={() => setShowOptions(true)}
                className="btn btn-outline btn-primary btn-md"
              >
                설정
              </button>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {/* 기존 스탯 및 HUD 영역 */}
            <div className="bg-gray-50 border border-gray-200 text-gray-700 rounded-xl p-4">
              <h2 className="font-bold mb-3">현재 상태</h2>
              {/* 스탯 관련 JSX */}
              {/* ... 기존 스탯 JSX 코드 ... */}
              <div
                className={`flex justify-between p-1 rounded-md transition-colors duration-500 border-b border-gray-200 pb-2 mb-2 ${
                  gameState.lastDelta.hp > 0
                    ? "bg-red-100"
                    : gameState.lastDelta.hp < 0
                    ? "bg-red-100"
                    : ""
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
                  gameState.lastDelta.atk > 0
                    ? "bg-orange-100"
                    : gameState.lastDelta.atk < 0
                    ? "bg-orange-100"
                    : ""
                }`}
              >
                <span>공격력(ATK)</span>
                <span className="font-semibold flex items-center justify-end w-20">
                  {getAdjustedAtk()} {/* 💡 장착 무기 보너스 포함 */}
                  <DeltaBadge value={gameState.lastDelta.atk} />
                </span>
              </div>
              <div
                className={`flex justify-between p-1 rounded-md transition-colors duration-500 border-b border-gray-200 pb-2 mb-2 ${
                  gameState.lastDelta.mp > 0
                    ? "bg-blue-100"
                    : gameState.lastDelta.mp < 0
                    ? "bg-blue-100"
                    : ""
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
            {/* 기존 이미지 영역 */}
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
              onClick={generateScenario}
              disabled={gameState.isTextLoading || gameState.isGameOver}
              className="btn btn-outline btn-primary btn-md"
            >
              {gameState.isTextLoading ? "로딩 중..." : "새로운 상황 생성"}
            </button>
          </div>
        </div>
      ) : (
        // ===== 게임 진행 중 UI (듀얼 컨테이너로 분리) =====
        <div className="w-full max-w-7xl flex flex-col md:flex-row md:justify-center md:items-start md:gap-x-10">
          {/* 💡 왼쪽 패널: 이미지와 텍스트 */}
          <div className="bg-white shadow-2xl rounded-2xl p-8 border border-gray-200 w-full md:w-1/2 md:max-w-2xl flex-grow flex flex-col space-y-4">
            <h2 className="text-2xl font-bold text-base-content bg-base-200 px-4 py-2 rounded-lg">
              스토리
            </h2>
            {gameState.isTextLoading && <Spinner label="응답 생성 중…" />}

            {/* 💡 이미지 부분을 텍스트 위에 배치 */}
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

            <div
              ref={storyRef}
              className="bg-gray-100 border border-gray-300 rounded-xl p-4 text-lg text-gray-700 whitespace-pre-wrap shadow-inner overflow-y-auto max-h-[40vh] flex-grow"
            >
              {gameState.typingStory}
            </div>

            {!gameState.isGameOver && !gameState.isRunComplete && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitAction();
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
                  {gameState.recommendedAction &&
                    gameState.isTypingFinished && (
                      <button
                        type="button"
                        onClick={() => {
                          setGameState((prev) => ({
                            ...prev,
                            userAction: prev.recommendedAction,
                          }));
                          submitAction();
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

            {/* 입력 폼 영역 아래에 추가 */}
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
                    onClick={goHome}
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
                  onClick={goHome}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-xl transition"
                >
                  홈으로 가기
                </button>
              </div>
            )}
          </div>

          {/* 💡 오른쪽 패널: 스탯, 설정, 소지품 */}
          <div className="bg-white shadow-2xl rounded-2xl p-8 border border-gray-200 w-full md:w-2/5 md:min-w-[300px] flex-shrink-0 flex flex-col space-y-6">
            {/* 헤더: 동적 제목과 UI 전환 버튼 */}
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-base-content bg-base-200 px-4 py-2 rounded-lg">
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
                  onClick={goHome}
                  className="btn btn-outline btn-primary"
                >
                  처음으로
                </button>
                <button
                  onClick={() => setShowOptions(true)}
                  className="btn btn-outline btn-primary"
                >
                  옵션
                </button>
              </div>
            </div>

            <div className="min-h-[700px]">
              {/* isStatusVisible 값에 따라 상태창 또는 소지품을 표시 */}
              {isStatusVisible ? (
                /* ===== 상태창 UI ===== */
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <h3 className="font-bold text-gray-700 mb-3">현재 스탯</h3>
                  <div
                    className={`flex justify-between p-1 text-gray-700 rounded-md transition-colors duration-500 border-b border-gray-200 pb-2 mb-2 ${
                      gameState.lastDelta.hp > 0
                        ? "bg-red-100"
                        : gameState.lastDelta.hp < 0
                        ? "bg-red-100"
                        : ""
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
                      gameState.lastDelta.atk > 0
                        ? "bg-orange-100"
                        : gameState.lastDelta.atk < 0
                        ? "bg-orange-100"
                        : ""
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
                      gameState.lastDelta.mp > 0
                        ? "bg-blue-100"
                        : gameState.lastDelta.mp < 0
                        ? "bg-blue-100"
                        : ""
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
                              handleUnequipItem(gameState.equippedWeapon!)
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
                              handleUnequipItem(gameState.equippedArmor!)
                            }
                            className="ml-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white py-1 px-2 rounded-md transition-colors"
                          >
                            해제
                          </button>
                        </div>
                      )}
                      {!gameState.equippedWeapon &&
                        !gameState.equippedArmor && (
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
                                onClick={() => handleEquipItem(item)}
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
                                onClick={() => handleEquipItem(item)}
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
                                onClick={() => handleUseItem(item)}
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
                                onClick={() => handleUseItem(item)}
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
      )}

      {/* 도움말 모달 UI */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowHelp(false)}
            aria-hidden="true"
          />
          <div className="relative bg-white w-full max-w-lg mx-4 rounded-2xl shadow-xl border border-gray-200 p-8 transform transition-all animate-in zoom-in-95 fade-in-0">
            <div className="text-center mb-6">
              <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-indigo-600">
                게임 가이드라인
              </h2>
              <p className="text-gray-500 mt-2">
                AI와 함께 당신만의 이야기를 만들어보세요!
              </p>
            </div>

            <div className="space-y-4">
              {/* 카드 1: 새로운 상황 생성 */}
              <div className="flex items-start gap-4 p-4 bg-violet-50 border border-violet-200 rounded-lg">
                <span className="text-3xl mt-1">✨</span>
                <div>
                  <h3 className="font-bold text-violet-800 text-lg">
                    새로운 상황 생성
                  </h3>
                  <p className="text-gray-600 text-sm">
                    게임을 시작하려면 '새로운 상황 생성' 버튼을 누르세요. AI가
                    당신을 위한 독특한 생존 시나리오를 제시합니다.
                  </p>
                </div>
              </div>

              {/* 카드 2: 행동 입력 */}
              <div className="flex items-start gap-4 p-4 bg-sky-50 border border-sky-200 rounded-lg">
                <span className="text-3xl mt-1">⌨️</span>
                <div>
                  <h3 className="font-bold text-sky-800 text-lg">
                    행동 입력 및 선택
                  </h3>
                  <p className="text-gray-600 text-sm">
                    제시된 상황에 맞춰 당신의 행동을 자유롭게 입력하거나, AI가
                    제안하는 '추천 행동' 버튼을 눌러 이야기를 진행할 수
                    있습니다.
                  </p>
                </div>
              </div>

              {/* 카드 3: 스탯 관리 */}
              <div className="flex items-start gap-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <span className="text-3xl mt-1">❤️‍🩹</span>
                <div>
                  <h3 className="font-bold text-amber-800 text-lg">
                    스탯 관리
                  </h3>
                  <p className="text-gray-600 text-sm">
                    당신의 행동은 체력(HP), 공격력(ATK), 마력(MP)에 영향을
                    줍니다. HP가 0이 되면 게임이 종료되니 신중하게 관리하세요.
                  </p>
                </div>
              </div>

              {/* 카드 4: 아이템 활용 */}
              <div className="flex items-start gap-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                <span className="text-3xl mt-1">🎒</span>
                <div>
                  <h3 className="font-bold text-emerald-800 text-lg">
                    아이템 활용
                  </h3>
                  <p className="text-gray-600 text-sm">
                    모험 중 얻는 아이템을 '사용'하거나 '장착'하여 위기를
                    극복하세요. 소지품 창에서 아이템을 관리할 수 있습니다.
                  </p>
                </div>
              </div>

              {/* 카드 5: 설정 변경 */}
              <div className="flex items-start gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <span className="text-3xl mt-1">⚙️</span>
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">
                    자신만의 게임 설정
                  </h3>
                  <p className="text-gray-600 text-sm">
                    '설정' 버튼에서 초기 스탯, 게임 장르, 최대 턴 등을 조절하여
                    자신만의 스타일로 게임을 즐길 수 있습니다.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-center">
              <button
                onClick={() => setShowHelp(false)}
                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-lg transition-transform transform hover:scale-105"
              >
                확인했습니다!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 게임 설정 코드 */}
      {showOptions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowOptions(false)}
            aria-hidden="true"
          />
          <div className="relative bg-white w-full max-w-md mx-4 rounded-2xl shadow-xl border border-gray-200 p-8 max-h-5/6 overflow-y-auto">
            <h2 className="text-3xl font-extrabold text-purple-700 text-center mb-6">
              게임 설정
            </h2>
            {/* ===== 장르 설정 ===== */}
            <div className="bg-gray-50 border text-gray-700 border-gray-200 rounded-lg p-4 mb-6">
              <h3 className="font-bold text-gray-700 mb-3">장르 설정</h3>

              {/* 모드 */}
              <div className="flex gap-3 mb-3 text-sm">
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

              {/* 장르 칩 선택 (고정/순환의 기준 시작 장르) */}
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

              {/* 적용 버튼 */}
              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => {
                    setGameState((prev) => ({
                      ...prev,
                      genreMode: genreModeUI,
                      selectedGenreId: selectedGenreIdUI,
                    }));
                    // 로컬스토리지에 선호 저장(선택)
                    localStorage.setItem("ai_game_pref_genreMode", genreModeUI);
                    localStorage.setItem(
                      "ai_game_pref_selectedGenreId",
                      selectedGenreIdUI ?? ""
                    );
                    setShowOptions(false);
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
                    이미지 생성 비용이 발생할 수 있습니다.
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
                    className="w-full h-2 rounded-lg appearance-none bg-purple-200"
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
                    className="w-full h-2 rounded-lg appearance-none bg-purple-200"
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
                    className="w-full h-2 rounded-lg appearance-none bg-purple-200"
                    disabled={gameState.survivalTurns > 0}
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => {
                    setGameState((prev) => ({
                      ...prev,
                      hp: initialStats.hp,
                      atk: initialStats.atk,
                      mp: initialStats.mp,
                    }));
                    setShowOptions(false);
                  }}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition"
                >
                  스탯 적용
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
                  1~50 사이 권장. 도달 시 업적과 엔딩이 표시됩니다.
                </span>
              </div>
              <div className="mt-3">
                <button
                  onClick={() => {
                    setGameState((prev) => ({ ...prev, maxTurns: maxTurnsUI }));
                    localStorage.setItem(
                      "ai_game_pref_maxTurns",
                      String(maxTurnsUI)
                    );
                    setShowOptions(false);
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
                        {slot.saved && (
                          <span className="text-xs font-normal block opacity-70 mt-1">
                            {slot.savedAt}
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
                    setShowOptions(false);
                  }}
                  className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition"
                >
                  저장
                </button>
                <button
                  onClick={() => {
                    loadGame(currentSlot);
                    setShowOptions(false);
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
              {" "}
              {/* 💡 닫기 버튼이 항상 보이도록 수정 */}
              <button
                onClick={() => setShowOptions(false)}
                className="bottom-0 mb-0 left-0 w-full py-2 rounded-lg bg-gray-200 hover:bg-gray-400 text-gray-800 font-semibold"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 게임 설정 코드 종료 */}
    </div>
  );
}

export default App;

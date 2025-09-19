// src/App.tsx
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { GoogleGenAI } from "@google/genai";

// 🔑 ENV
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

// 📦 모델
const TEXT_MODEL = "gemini-2.5-flash-lite"; // 스토리 + 메인오브젝트 + 스탯증감 동시 추출 (스탯 기반 분기 포함)
const IMAGE_MODEL = "imagen-3.0-generate-002"; // Imagen 3 (과금 필요)

// ===== 타입 정의 =====
type StatKey = "hp" | "atk" | "mp";
type ItemType = "weapon" | "food" | "misc" | "armor" | "potion" | "key" | "book";

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
  if (normalizedName.includes("검") || normalizedName.includes("도끼") || normalizedName.includes("활") || normalizedName.includes("지팡이")) {
    return "weapon";
  }
  if (normalizedName.includes("빵") || normalizedName.includes("고기") || normalizedName.includes("약초") || normalizedName.includes("사과")) {
    return "food";
  }
  if (normalizedName.includes("갑옷") || normalizedName.includes("방패") || normalizedName.includes("투구") || normalizedName.includes("갑주")) {
    return "armor";
  }
  if (normalizedName.includes("포션") || normalizedName.includes("물약") || normalizedName.includes("회복제")) {
    return "potion";
  }
  if (normalizedName.includes("열쇠")) {
    return "key";
  }
  if (normalizedName.includes("책") || normalizedName.includes("스크롤") || normalizedName.includes("두루마리")) {
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
    { name: "빵 한 조각", quantity: 1, type: "food" }
  ],
  survivalTurns: 0,
  sceneImageUrl: "",
  imgError: "",
  lastDelta: { hp: 0, atk: 0, mp: 0 },
  lastSurvivalTurn: "",
  hudNotes: [],
  recommendedAction: "",
  isTypingFinished: false,
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
  const [withImage, setWithImage] = useState<boolean>(false);
  const [initialStats, setInitialStats] = useState({
    hp: gameState.hp,
    atk: gameState.atk,
    mp: gameState.mp,
  });

  const [currentSlot, setCurrentSlot] = useState<number>(1);
  const [slots, setSlots] = useState<Array<{ id: number; saved: boolean; name?: string; savedAt?: string }>>([]);
  const [saveName, setSaveName] = useState<string>("");
  const [newItemName, setNewItemName] = useState<string>("");
  
  // 💡 장착된 무기에 따라 ATK 계산하는 유틸 함수
  const getAdjustedAtk = useCallback(() => {
    return gameState.atk + (gameState.equippedWeapon?.atkBonus || 0);
  }, [gameState.atk, gameState.equippedWeapon]);

  // 💡 아이템 사용 핸들러
  const handleUseItem = useCallback((itemToUse: Item) => {
    if (!window.confirm(`${itemToUse.name}을(를) 사용하시겠습니까?`)) {
      return;
    }
    setGameState((prev) => {
      let newHp = prev.hp;
      let newItems = [...prev.items];
      let newHudNotes = [...prev.hudNotes];
      const itemIndex = newItems.findIndex((item) => item.name === itemToUse.name);
  
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
          const itemIndex = newItems.findIndex((item) => item.name === itemToEquip.name);
          if (itemIndex === -1) return prev;
          newItems.splice(itemIndex, 1);

          if (itemToEquip.type === "weapon") {
              if (newEquippedWeapon) {
                  // 기존 무기 해제 후 인벤토리로 이동
                  newItems.push(newEquippedWeapon);
                  newHudNotes = [`무기 해제: ${newEquippedWeapon.name}`, ...newHudNotes].slice(0, 6);
              }
              newEquippedWeapon = itemToEquip;
              newHudNotes = [`무기 장착: ${itemToEquip.name}`, ...newHudNotes].slice(0, 6);
          } else if (itemToEquip.type === "armor") {
              if (newEquippedArmor) {
                  // 기존 방어구 해제 후 인벤토리로 이동
                  newItems.push(newEquippedArmor);
                  newHudNotes = [`방어구 해제: ${newEquippedArmor.name}`, ...newHudNotes].slice(0, 6);
              }
              newEquippedArmor = itemToEquip;
              newHudNotes = [`방어구 장착: ${itemToEquip.name}`, ...newHudNotes].slice(0, 6);
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

          if (itemToUnequip.type === "weapon" && prev.equippedWeapon?.name === itemToUnequip.name) {
              newItems.push(prev.equippedWeapon);
              newEquippedWeapon = null;
              newHudNotes = [`무기 해제: ${itemToUnequip.name}`, ...newHudNotes].slice(0, 6);
          } else if (itemToUnequip.type === "armor" && prev.equippedArmor?.name === itemToUnequip.name) {
              newItems.push(prev.equippedArmor);
              newEquippedArmor = null;
              newHudNotes = [`방어구 해제: ${itemToUnequip.name}`, ...newHudNotes].slice(0, 6);
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
    const slotsData: Array<{ id: number; saved: boolean; name?: string; savedAt?: string }> = [];
    for (let i = 1; i <= 3; i++) {
      const key = `ai_game_save_${i}`;
      const savedData = localStorage.getItem(key);
      if (savedData) {
        const data = JSON.parse(savedData) as { name?: string; savedAt?: string };
        slotsData.push({ id: i, saved: true, name: data.name, savedAt: data.savedAt });
      } else {
        slotsData.push({ id: i, saved: false });
      }
    }
    setSlots(slotsData);
  }, []);

  const autoSaveGame = useCallback(() => {
    const { story, hp, atk, mp, items, survivalTurns, sceneImageUrl, isGameOver, recommendedAction, equippedWeapon, equippedArmor } = gameState;
    const autoSaveState = { story, hp, atk, mp, items, survivalTurns, sceneImageUrl, isGameOver, recommendedAction, equippedWeapon, equippedArmor };
    try {
      localStorage.setItem("ai_game_auto_save", JSON.stringify(autoSaveState));
      console.log("자동 저장 완료!");
    } catch (e) {
      console.error("자동 저장 실패:", e);
    }
  }, [gameState]);

  useEffect(() => {
    if (!gameState.story || gameState.isGameOver) {
      setGameState((prev) => ({ ...prev, typingStory: prev.story, isTypingFinished: true }));
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

  const ai = useMemo(() => (GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null), []) as any;

  const ensureApi = (): boolean => {
    if (!ai) {
      setGameState((prev) => ({ ...prev, story: "환경변수 VITE_GEMINI_API_KEY가 설정되지 않았습니다." }));
      return false;
    }
    return true;
  };

  function buildImagePromptFromSubject(subject: Subject | null | undefined): string {
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

  async function askStorySubjectAndDeltas({ systemHint, userText }: { systemHint?: string; userText: string }): Promise<AskResult> {
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
      '  "subject": { "ko": "버섯", "en": "a red mushroom" },\n' +
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
    const itemsAdd: string[] = Array.isArray(parsed.itemsAdd) ? parsed.itemsAdd : [];
    const itemsRemove: string[] = Array.isArray(parsed.itemsRemove) ? parsed.itemsRemove : [];
    const notes: string[] = Array.isArray(parsed.hudNotes) ? parsed.hudNotes : [];
    const recommendedAction: string = (parsed.recommendedAction ?? "").trim();

    return { nextStory, subject, deltas, itemsAdd, itemsRemove, notes, recommendedAction };
  }

  function generateHudNotes({ deltas, itemsAdd, itemsRemove }: { deltas: Delta[]; itemsAdd: string[]; itemsRemove: string[] }): string[] {
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

  function applyDeltasAndItems({ deltas, itemsAdd, itemsRemove }: { deltas: Delta[]; itemsAdd: string[]; itemsRemove: string[] }) {
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
          if (existingItem) {
            existingItem.quantity += 1;
          } else {
            newItems.push({ name: itemName, quantity: 1, type: categorizeItem(itemName) });
          }
        });
      }

      if (itemsRemove?.length) {
        itemsRemove.forEach((itemName) => {
          const itemIndex = newItems.findIndex((item) => item.name === itemName);
          if (itemIndex > -1) {
            if (newItems[itemIndex].quantity > 1) {
              newItems[itemIndex].quantity -= 1;
            } else {
              newItems.splice(itemIndex, 1);
            }
          }
        });
      }

      const isGameOver = newHp <= 0;

      if (!isGameOver) {
        newSurvivalTurns += 1;
        lastSurvivalTurn = "highlight";
      }

      return {
        ...prev,
        hp: Math.max(0, newHp),
        atk: newAtk,
        mp: newMp,
        items: newItems,
        survivalTurns: newSurvivalTurns,
        lastSurvivalTurn,
        hudNotes: newHudNotes,
        isGameOver,
        lastDelta: { hp: dHp, atk: dAtk, mp: dMp },
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
      const bytes: string | undefined = res?.generatedImages?.[0]?.image?.imageBytes;
      if (bytes) {
        setGameState((prev) => ({ ...prev, sceneImageUrl: `data:image/png;base64,${bytes}` }));
      } else {
        setGameState((prev) => ({
          ...prev,
          imgError: "이미지가 반환되지 않았습니다. 프롬프트를 더 구체적으로 작성해 보세요.",
        }));
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("only accessible to billed users"))
        setGameState((prev) => ({
          ...prev,
          imgError: "Imagen API는 결제 등록된 계정만 사용 가능합니다. (결제/쿼터 설정 필요)",
        }));
      else if (/permission|quota|disabled|billing/i.test(msg))
        setGameState((prev) => ({ ...prev, imgError: "이미지 생성 권한/쿼터/과금 설정을 확인해주세요." }));
      else setGameState((prev) => ({ ...prev, imgError: `이미지 생성 오류: ${msg}` }));
    } finally {
      setGameState((prev) => ({ ...prev, isImgLoading: false }));
    }
  }

  const generateScenario = async () => {
    if (!ensureApi()) return;

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
      equippedWeapon: null, // 💡 초기화 시 장착 아이템도 초기화
      equippedArmor: null,
      items: [
        { name: "허름한 검", quantity: 1, type: "weapon", atkBonus: 5 }, 
        { name: "빵 한 조각", quantity: 1, type: "food" }
      ],
      lastSurvivalTurn: "",
      recommendedAction: "",
      isTypingFinished: false,
    }));

    const chatPrompt =
      "장르는 특정하지 말고(현실/판타지/SF 등 가능) 플레이어에게 흥미로운 상황을 한국어로 5~8문장으로 제시하세요. " +
      "필요하면 선택지를 2~3개 제시하고, 마지막은 '행동을 입력하세요'로 끝내세요.";

    try {
      const { nextStory, subject, deltas, itemsAdd, itemsRemove, recommendedAction } = await askStorySubjectAndDeltas({
        systemHint:
          "story는 자연스러운 한국어 문단으로. subject는 단일 물체 1개만(가능하면 색/형태 한 단어 포함). " +
          "deltas는 상황에 알맞게 hp/atk/mp를 정수로 증감. itemsAdd/Remove와 hudNotes도 필요시 채우기.",
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
      setGameState((prev) => ({ ...prev, story: "상황 생성 중 오류가 발생했습니다." }));
    } finally {
      setGameState((prev) => ({ ...prev, isTextLoading: false }));
    }
  };

  const submitAction = async () => {
    if (!ensureApi() || !gameState.story || gameState.isGameOver) return;
    setGameState((prev) => ({ ...prev, isTextLoading: true }));

    const actionPrompt =
      `이전 상황(컨텍스트):\n${gameState.story}\n\n` +
      `플레이어의 행동: ${gameState.userAction}\n\n` +
      "게임 마스터처럼 자연스럽게 다음 전개를 서술하세요. 필요하면 선택지를 2~3개 제시하고, 마지막은 '행동을 입력하세요'로 끝내세요.";

    try {
      const { nextStory, subject, deltas, itemsAdd, itemsRemove, recommendedAction } = await askStorySubjectAndDeltas({
        systemHint:
          "story는 한국어 문단으로. subject는 단일 물체 1개만(가능하면 색/형태 한 단어 포함). " +
          "deltas는 상황에 맞춰 hp/atk/mp를 정수로 증감: 전투/피해/학습/회복/아이템 사용 등 반영. " +
          "현재 스탯이 높거나 낮은 경우 결과가 달라지도록 설계. itemsAdd/Remove와 hudNotes도 필요시 채우기.",
        userText: actionPrompt,
      });

      const out = nextStory || "이야기 생성 실패";
      setGameState((prev) => ({ ...prev, story: out, userAction: "", recommendedAction: recommendedAction || "" }));
      applyDeltasAndItems({ deltas, itemsAdd, itemsRemove });
      autoSaveGame();

      if (!gameState.isGameOver && withImage && subject) {
        await generateSceneImageFromSubject(subject);
      }
    } catch (e) {
      console.error(e);
      setGameState((prev) => ({ ...prev, story: "이야기 생성 중 오류가 발생했습니다." }));
    } finally {
      setGameState((prev) => ({ ...prev, isTextLoading: false }));
    }
  };

  const goHome = () => {
    if (window.confirm("정말 게임을 처음부터 다시 시작하시겠습니까? 모든 진행 상황이 초기화됩니다.")) {
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
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
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
    const { story, hp, atk, mp, items, equippedWeapon, equippedArmor, survivalTurns, sceneImageUrl } = gameState;
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
      name: name || `저장 #${slotNumber}`,
      savedAt: new Date().toLocaleString(),
    };
    try {
      localStorage.setItem(`ai_game_save_${slotNumber}`, JSON.stringify(saveState));
      setSlots((prevSlots) =>
        prevSlots.map((slot) =>
          slot.id === slotNumber ? { ...slot, saved: true, name: saveState.name, savedAt: saveState.savedAt } : slot
        )
      );
      alert(`게임이 ${slotNumber}번에 '${saveState.name}'(으)로 성공적으로 저장되었습니다!`);
    } catch (e) {
      console.error("Failed to save game:", e);
      alert("게임 저장에 실패했습니다.");
    }
  };

  const loadGame = (slotNumber: number) => {
    try {
      const savedState = localStorage.getItem(`ai_game_save_${slotNumber}`);
      if (savedState) {
        const loaded = JSON.parse(savedState) as {
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
        };
        setGameState((prev) => ({
          ...prev,
          story: loaded.story,
          typingStory: "",
          hp: loaded.hp,
          atk: loaded.atk,
          mp: loaded.mp,
          items: loaded.items,
          equippedWeapon: loaded.equippedWeapon,
          equippedArmor: loaded.equippedArmor,
          survivalTurns: loaded.survivalTurns,
          sceneImageUrl: loaded.sceneImageUrl,
          isGameOver: false,
          isTypingFinished: false,
        }));
        setSaveName(loaded.name || "");
        alert(`${slotNumber}번의 게임을 불러왔습니다!`);
      } else {
        alert(`${slotNumber}번에 저장된 게임이 없습니다.`);
      }
    } catch (e) {
      console.error("Failed to load game:", e);
      alert("게임 불러오기에 실패했습니다.");
    }
  };

  const deleteGame = (slotNumber: number) => {
    try {
      localStorage.removeItem(`ai_game_save_${slotNumber}`);
      setSlots((prevSlots) => prevSlots.map((slot) => (slot.id === slotNumber ? { ...slot, saved: false } : slot)));
      alert(`${slotNumber}번의 게임이 삭제되었습니다.`);
    } catch (e) {
      console.error("Failed to delete game from localStorage:", e);
      alert("게임 삭제에 실패했습니다.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 to-purple-200 p-6 flex flex-col items-center justify-center">
      {!gameState.story ? (
        // ===== 게임 시작 전 UI =====
        <div className="bg-white shadow-2xl rounded-2xl w-full max-w-4xl p-8 space-y-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-extrabold text-purple-700">AI Text Adventure Game</h1>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowOptions(true)} className="text-sm bg-gray-800 hover:bg-black text-white px-3 py-1.5 rounded-lg">
                설정
              </button>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {/* 기존 스탯 및 HUD 영역 */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <h2 className="font-bold text-gray-700 mb-3">현재 상태</h2>
              {/* 스탯 관련 JSX */}
              {/* ... 기존 스탯 JSX 코드 ... */}
              <div className={`flex justify-between p-1 rounded-md transition-colors duration-500 border-b border-gray-200 pb-2 mb-2 ${gameState.lastDelta.hp > 0 ? "bg-red-100" : gameState.lastDelta.hp < 0 ? "bg-red-100" : ""}`}>
                  <span>체력(HP)</span>
                  <span className="font-semibold flex items-center justify-end w-20">
                      {gameState.hp}
                      <DeltaBadge value={gameState.lastDelta.hp} />
                  </span>
              </div>
              <div className={`flex justify-between p-1 rounded-md transition-colors duration-500 border-b border-gray-200 pb-2 mb-2 ${gameState.lastDelta.atk > 0 ? "bg-orange-100" : gameState.lastDelta.atk < 0 ? "bg-orange-100" : ""}`}>
                  <span>공격력(ATK)</span>
                  <span className="font-semibold flex items-center justify-end w-20">
                      {getAdjustedAtk()} {/* 💡 장착 무기 보너스 포함 */}
                      <DeltaBadge value={gameState.lastDelta.atk} />
                  </span>
              </div>
              <div className={`flex justify-between p-1 rounded-md transition-colors duration-500 border-b border-gray-200 pb-2 mb-2 ${gameState.lastDelta.mp > 0 ? "bg-blue-100" : gameState.lastDelta.mp < 0 ? "bg-blue-100" : ""}`}>
                  <span>마력(MP)</span>
                  <span className="font-semibold flex items-center justify-end w-20">
                      {gameState.mp}
                      <DeltaBadge value={gameState.lastDelta.mp} />
                  </span>
              </div>
              <div className={`flex justify-between p-1 rounded-md transition-colors duration-500 border-b border-gray-200 pb-2 mb-2 ${gameState.lastSurvivalTurn ? "bg-purple-100" : ""}`}>
                  <span>생존 턴</span>
                  <span className="font-semibold">{gameState.survivalTurns}</span>
              </div>
              {!!gameState.hudNotes.length && (
                  <div className="mt-3">
                      <div className="text-sm font-semibold text-gray-700 mb-1">최근 변화</div>
                      <ul className="list-disc list-inside text-sm text-gray-700 space-y-0.5">
                          {gameState.hudNotes.map((n, i) => (<li key={i}>{n}</li>))}
                      </ul>
                  </div>
              )}
            </div>
            {/* 기존 이미지 영역 */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col">
              <div className="aspect-video w-full overflow-hidden rounded-lg bg-gray-200 flex items-center justify-center border border-gray-300 relative">
                  {gameState.sceneImageUrl ? (
                      <img src={gameState.sceneImageUrl} alt="scene" className="w-full h-full object-cover" />
                  ) : (
                      <span className="text-gray-500 text-sm">{withImage ? "아직 생성된 그림이 없습니다." : "이미지 생성을 꺼 두었습니다. (옵션에서 변경)"}</span>
                  )}
                  {gameState.isImgLoading && (
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                          <Spinner label="이미지 생성 중…" />
                      </div>
                  )}
              </div>
              {gameState.imgError && <div className="text-sm text-red-600 mt-2">{gameState.imgError}</div>}
            </div>
          </div>
          {/* 새로운 상황 생성 버튼 */}
          <div className="flex justify-center gap-4">
            <button
              onClick={generateScenario}
              disabled={gameState.isTextLoading || gameState.isGameOver}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-xl transition duration-300 disabled:opacity-50"
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
            <h2 className="text-2xl font-bold text-gray-800">스토리</h2>
            {gameState.isTextLoading && <Spinner label="응답 생성 중…" />}
            
            {/* 💡 이미지 부분을 텍스트 위에 배치 */}
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-gray-200 flex items-center justify-center border border-gray-300 relative">
              {gameState.sceneImageUrl ? (
                  <img src={gameState.sceneImageUrl} alt="scene" className="w-full h-full object-cover" />
              ) : (
                  <span className="text-gray-500 text-sm">{withImage ? "아직 생성된 그림이 없습니다." : "이미지 생성을 꺼 두었습니다. (옵션에서 변경)"}</span>
              )}
              {gameState.isImgLoading && (
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                      <Spinner label="이미지 생성 중…" />
                  </div>
              )}
            </div>
            {gameState.imgError && <div className="text-sm text-red-600 mt-2">{gameState.imgError}</div>}

            <div
              ref={storyRef}
              className="bg-gray-100 border border-gray-300 rounded-xl p-4 text-lg whitespace-pre-wrap shadow-inner overflow-y-auto max-h-[40vh] flex-grow"
            >
              {gameState.typingStory}
            </div>

            {!gameState.isGameOver && (
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
                  onChange={(e) => setGameState((prev) => ({ ...prev, userAction: e.target.value }))}
                  placeholder="당신의 행동을 입력하세요..."
                  disabled={!gameState.isTypingFinished || gameState.isTextLoading}
                  className="p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
                <div className="flex flex-col gap-2">
                    {gameState.recommendedAction && gameState.isTypingFinished && (
                      <button
                        type="button"
                        onClick={() => {
                          setGameState((prev) => ({ ...prev, userAction: prev.recommendedAction }));
                          submitAction();
                        }}
                        className="bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-5 rounded-xl transition duration-300 disabled:opacity-50"
                      >
                        {gameState.recommendedAction} (추천 행동)
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={!gameState.isTypingFinished || gameState.isTextLoading || !gameState.userAction}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-5 rounded-xl transition duration-300 disabled:opacity-50"
                    >
                      {gameState.isTextLoading ? "로딩 중..." : "다음 이야기 진행"}
                    </button>
                </div>
              </form>
            )}

            {gameState.isGameOver && (
              <div className="flex flex-col items-center gap-3">
                <div className="text-red-600 font-bold">체력이 0이 되어 게임 오버!</div>
                <button onClick={goHome} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-xl transition">
                  홈으로 가기
                </button>
              </div>
            )}
          </div>

          {/* 💡 오른쪽 패널: 스탯, 설정, 소지품 */}
          <div className="bg-white shadow-2xl rounded-2xl p-8 border border-gray-200 w-full md:w-1/3 md:min-w-[300px] flex-shrink-0 flex flex-col space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-800">상태창</h2>
              <div className="flex gap-2">
                <button onClick={goHome} className="text-sm bg-gray-800 hover:bg-black text-white px-3 py-1.5 rounded-lg">
                  처음으로
                </button>
                <button onClick={() => setShowOptions(true)} className="text-sm bg-gray-800 hover:bg-black text-white px-3 py-1.5 rounded-lg">
                  옵션
                </button>
              </div>
            </div>
            
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <h3 className="font-bold text-gray-700 mb-3">현재 스탯</h3>
              {/* 스탯 관련 JSX */}
              <div className={`flex justify-between p-1 rounded-md transition-colors duration-500 border-b border-gray-200 pb-2 mb-2 ${gameState.lastDelta.hp > 0 ? "bg-red-100" : gameState.lastDelta.hp < 0 ? "bg-red-100" : ""}`}>
                  <span>체력(HP)</span>
                  <span className="font-semibold flex items-center justify-end w-20">
                      {gameState.hp}
                      <DeltaBadge value={gameState.lastDelta.hp} />
                  </span>
              </div>
              <div className={`flex justify-between p-1 rounded-md transition-colors duration-500 border-b border-gray-200 pb-2 mb-2 ${gameState.lastDelta.atk > 0 ? "bg-orange-100" : gameState.lastDelta.atk < 0 ? "bg-orange-100" : ""}`}>
                  <span>공격력(ATK)</span>
                  <span className="font-semibold flex items-center justify-end w-20">
                      {getAdjustedAtk()} {/* 💡 장착 무기 보너스 포함 */}
                      <DeltaBadge value={gameState.lastDelta.atk} />
                  </span>
              </div>
              <div className={`flex justify-between p-1 rounded-md transition-colors duration-500 border-b border-gray-200 pb-2 mb-2 ${gameState.lastDelta.mp > 0 ? "bg-blue-100" : gameState.lastDelta.mp < 0 ? "bg-blue-100" : ""}`}>
                  <span>마력(MP)</span>
                  <span className="font-semibold flex items-center justify-end w-20">
                      {gameState.mp}
                      <DeltaBadge value={gameState.lastDelta.mp} />
                  </span>
              </div>
              <div className={`flex justify-between p-1 rounded-md transition-colors duration-500 border-b border-gray-200 pb-2 mb-2 ${gameState.lastSurvivalTurn ? "bg-purple-100" : ""}`}>
                  <span>생존 턴</span>
                  <span className="font-semibold">{gameState.survivalTurns}</span>
              </div>
              {!!gameState.hudNotes.length && (
                  <div className="mt-3">
                      <div className="text-sm font-semibold text-gray-700 mb-1">최근 변화</div>
                      <ul className="list-disc list-inside text-sm text-gray-700 space-y-0.5">
                          {gameState.hudNotes.map((n, i) => (<li key={i}>{n}</li>))}
                      </ul>
                  </div>
              )}
            </div>
            
            {/* 💡 추가된 소지품 컨테이너 */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="text-xl font-bold text-gray-700 mb-2">소지품</h3>

              {/* 💡 장착 중인 아이템 섹션 */}
              <div className="mb-4">
                <h4 className="text-lg font-bold text-gray-600 mb-1">장착 중인 아이템 ⚔️🛡️</h4>
                <div className="flex flex-wrap gap-2 items-center">
                    {gameState.equippedWeapon && (
                        <div className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-purple-200 text-purple-800 border border-purple-300">
                            <span>{gameState.equippedWeapon.name} (+{gameState.equippedWeapon.atkBonus} ATK)</span>
                            <button onClick={() => handleUnequipItem(gameState.equippedWeapon!)} className="ml-1 text-xs bg-purple-600 hover:bg-purple-700 text-white py-1 px-2 rounded-md transition-colors">해제</button>
                        </div>
                    )}
                    {gameState.equippedArmor && (
                        <div className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-indigo-200 text-indigo-800 border border-indigo-300">
                            <span>{gameState.equippedArmor.name}</span>
                            <button onClick={() => handleUnequipItem(gameState.equippedArmor!)} className="ml-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white py-1 px-2 rounded-md transition-colors">해제</button>
                        </div>
                    )}
                    {!gameState.equippedWeapon && !gameState.equippedArmor && (
                        <span className="text-gray-500">없음</span>
                    )}
                </div>
              </div>

              {/* 무기 */}
              <div className="mb-4">
                <h4 className="text-lg font-bold text-gray-600 mb-1">무기 ⚔️</h4>
                <div className="flex flex-wrap gap-2">
                  {gameState.items.filter(item => item.type === "weapon").length > 0 ? (
                    gameState.items.filter(item => item.type === "weapon").map((item, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-purple-100 text-purple-700 border border-purple-200">
                        <span>{item.name} {item.quantity > 1 ? `x${item.quantity}` : ""} {item.atkBonus ? `(+${item.atkBonus} ATK)` : ""}</span>
                        <button onClick={() => handleEquipItem(item)} className="ml-1 text-xs bg-purple-600 hover:bg-purple-700 text-white py-1 px-2 rounded-md transition-colors">장착</button>
                      </div>
                    ))
                  ) : (
                    <span className="text-gray-500">없음</span>
                  )}
                </div>
              </div>

              {/* 방어구 */}
              <div className="mb-4">
                <h4 className="text-lg font-bold text-gray-600 mb-1">방어구 🛡️</h4>
                <div className="flex flex-wrap gap-2">
                  {gameState.items.filter(item => item.type === "armor").length > 0 ? (
                    gameState.items.filter(item => item.type === "armor").map((item, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-indigo-100 text-indigo-700 border border-indigo-200">
                        <span>{item.name} {item.quantity > 1 ? `x${item.quantity}` : ""}</span>
                        <button onClick={() => handleEquipItem(item)} className="ml-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white py-1 px-2 rounded-md transition-colors">장착</button>
                      </div>
                    ))
                  ) : (
                    <span className="text-gray-500">없음</span>
                  )}
                </div>
              </div>

              {/* 음식 */}
              <div className="mb-4">
                <h4 className="text-lg font-bold text-gray-600 mb-1">음식 🍎</h4>
                <div className="flex flex-wrap gap-2 items-center">
                  {gameState.items.filter(item => item.type === "food").length > 0 ? (
                    gameState.items.filter(item => item.type === "food").map((item, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-green-100 text-green-700 border border-green-200">
                        <span>{item.name} {item.quantity > 1 ? `x${item.quantity}` : ""}</span>
                        <button onClick={() => handleUseItem(item)} className="ml-1 text-xs bg-green-600 hover:bg-green-700 text-white py-1 px-2 rounded-md transition-colors">사용</button>
                      </div>
                    ))
                  ) : (
                    <span className="text-gray-500">없음</span>
                  )}
                </div>
              </div>

              {/* 포션 */}
              <div className="mb-4">
                <h4 className="text-lg font-bold text-gray-600 mb-1">포션 🧪</h4>
                <div className="flex flex-wrap gap-2 items-center">
                  {gameState.items.filter(item => item.type === "potion").length > 0 ? (
                    gameState.items.filter(item => item.type === "potion").map((item, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-red-100 text-red-700 border border-red-200">
                        <span>{item.name} {item.quantity > 1 ? `x${item.quantity}` : ""}</span>
                        <button onClick={() => handleUseItem(item)} className="ml-1 text-xs bg-red-600 hover:bg-red-700 text-white py-1 px-2 rounded-md transition-colors">사용</button>
                      </div>
                    ))
                  ) : (
                    <span className="text-gray-500">없음</span>
                  )}
                </div>
              </div>

              {/* 열쇠 */}
              <div className="mb-4">
                <h4 className="text-lg font-bold text-gray-600 mb-1">열쇠 🔑</h4>
                <div className="flex flex-wrap gap-2">
                  {gameState.items.filter(item => item.type === "key").length > 0 ? (
                    gameState.items.filter(item => item.type === "key").map((item, i) => (
                      <span key={i} className="px-3 py-1.5 text-sm rounded-lg bg-yellow-100 text-yellow-700 border border-yellow-200">
                        {item.name} {item.quantity > 1 ? `x${item.quantity}` : ""}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-500">없음</span>
                  )}
                </div>
              </div>

              {/* 책 */}
              <div className="mb-4">
                <h4 className="text-lg font-bold text-gray-600 mb-1">책 📖</h4>
                <div className="flex flex-wrap gap-2">
                  {gameState.items.filter(item => item.type === "book").length > 0 ? (
                    gameState.items.filter(item => item.type === "book").map((item, i) => (
                      <span key={i} className="px-3 py-1.5 text-sm rounded-lg bg-cyan-100 text-cyan-700 border border-cyan-200">
                        {item.name} {item.quantity > 1 ? `x${item.quantity}` : ""}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-500">없음</span>
                  )}
                </div>
              </div>

              {/* 기타 */}
              <div>
                <h4 className="text-lg font-bold text-gray-600 mb-1">기타 📦</h4>
                <div className="flex flex-wrap gap-2">
                  {gameState.items.filter(item => item.type === "misc").length > 0 ? (
                    gameState.items.filter(item => item.type === "misc").map((item, i) => (
                      <span key={i} className="px-3 py-1.5 text-sm rounded-lg bg-gray-200 text-gray-800 border border-gray-300">
                        {item.name} {item.quantity > 1 ? `x${item.quantity}` : ""}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-500">없음</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* 기존 모달들 */}
      {showOptions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowOptions(false)} aria-hidden="true" />
          <div className="relative bg-white w-full max-w-md mx-4 rounded-2xl shadow-xl border border-gray-200 p-8 max-h-5/6 overflow-y-auto">
            <h2 className="text-3xl font-extrabold text-purple-700 text-center mb-6">게임 설정</h2>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
              <h3 className="font-bold text-gray-700 mb-3">스토리 생성 설정</h3>
              <label className="flex items-center gap-3 select-none">
                <input
                  type="checkbox"
                  className="mt-1 w-4 h-4 text-purple-600 focus:ring-purple-500"
                  checked={withImage}
                  onChange={(e) => setWithImage(e.target.checked)}
                />
                <span className="text-gray-700">
                  <span className="font-semibold block">스토리와 함께 이미지도 생성</span>
                  <span className="block text-sm text-gray-500">이미지 생성 비용이 발생할 수 있습니다.</span>
                </span>
              </label>
            </div>

            {/* {스탯 설정 슬라이더} */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
              <h3 className="font-bold text-gray-700 mb-3">초기 스탯 설정</h3>
              <div className="space-y-4">
                <div>
                  <label htmlFor="hp-slider" className="block text-sm font-semibold mb-1">체력 (HP): (1~500) {initialStats.hp}</label>
                  <input
                    id="hp-slider"
                    type="range"
                    min="1" max="500"
                    value={initialStats.hp}
                    onChange={(e) => setInitialStats({...initialStats, hp: Number(e.target.value)})}
                    className="w-full h-2 rounded-lg appearance-none bg-purple-200"
                    disabled={gameState.survivalTurns > 0}
                  />
                </div>
                <div>
                  <label htmlFor="atk-slider" className="block text-sm font-semibold mb-1">공격력 (ATK): (1~200) {initialStats.atk}</label>
                  <input
                    id="atk-slider"
                    type="range"
                    min="1" max="200"
                    value={initialStats.atk}
                    onChange={(e) => setInitialStats({...initialStats, atk: Number(e.target.value)})}
                    className="w-full h-2 rounded-lg appearance-none bg-purple-200"
                    disabled={gameState.survivalTurns > 0}
                  />
                </div>
                <div>
                  <label htmlFor="mp-slider" className="block text-sm font-semibold mb-1">마력 (MP): (1~200) {initialStats.mp}</label>
                  <input
                    id="mp-slider"
                    type="range"
                    min="1" max="200"
                    value={initialStats.mp}
                    onChange={(e) => setInitialStats({...initialStats, mp: Number(e.target.value)})}
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

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="font-bold text-gray-700 mb-3">게임 저장/불러오기</h3>

              <div className="mb-4">
                <p className="font-semibold text-sm text-gray-600 mb-2">저장 슬롯 선택:</p>
                <div className="grid grid-cols-3 gap-2">
                  {slots.map((slot) => {
                    const displayName =
                      slot.saved && slot.name ? (slot.name.length > 10 ? slot.name.substring(0, 10) + "..." : slot.name) : "비어있음 ❌";

                    return (
                      <button
                        key={slot.id}
                        onClick={() => {
                          setCurrentSlot(slot.id);
                          setSaveName(slot.name || "");
                        }}
                        className={`w-full px-2 py-3 rounded-lg font-semibold transition ${
                          currentSlot === slot.id ? "bg-purple-600 text-white shadow-md" : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                        }`}
                      >
                        {slot.id}번
                        <br />
                        <span className="text-xs font-bold block mt-1">{displayName}</span>
                        {slot.saved && <span className="text-xs font-normal block opacity-70 mt-1">{slot.savedAt}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mb-4">
                <label htmlFor="saveName" className="font-semibold text-sm text-gray-600 mb-2 block">
                  저장 이름 (선택 사항):
                </label>
                <input
                  id="saveName"
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="이름이나 설명을 입력하세요"
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-between gap-2">
                <button
                  onClick={() => {
                    const isSlotSaved = slots.find((s) => s.id === currentSlot)?.saved;
                    if (isSlotSaved && !window.confirm(`${currentSlot}번에 이미 저장된 게임이 있습니다. 덮어쓰시겠습니까?`)) return;
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
                    if (window.confirm(`${currentSlot}번의 게임을 정말 삭제하시겠습니까?`)) {
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

            <div className="mt-6 flex justify-center sticky bottom-0 mb-6">    {/* 💡 닫기 버튼이 항상 보이도록 수정 */}
              <button
                onClick={() => setShowOptions(false)}
                className="w-full py-2 rounded-lg bg-gray-200 hover:bg-gray-400 text-gray-800 font-semibold"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
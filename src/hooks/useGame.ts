// src/hooks/useGame.ts
import { useState, useMemo, useEffect, useCallback } from "react";
import { GoogleGenAI } from "@google/genai";
import {
  GameState,
  Item,
  StatKey,
  ItemType,
  GenreMode,
  Genre,
  Delta,
  Subject,
  AskResult,
  HighlightMap, 
} from "../types";
import {
  GENRES,
  DEFAULT_INITIAL_STATE,
  GEMINI_API_KEY,
  TEXT_MODEL,
  IMAGE_MODEL,
} from "../gameConfig";
import { BGM, BGM_MAP } from "../Audio/audioConfig";

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

// ===== 유틸: 초기 상태 불러오기 =====
const loadInitialState = (): GameState => {
  try {
    const autoSavedState = localStorage.getItem("ai_game_auto_save");
    if (autoSavedState) {
      const loadedState = JSON.parse(autoSavedState) as Partial<GameState>;
      alert("자동 저장된 게임을 불러왔습니다!");
      return {
        story: loadedState.story ?? "",
        typingStory: "",
        userAction: "",
        isTextLoading: false,
        isImgLoading: false,
        isGameOver: loadedState.isGameOver ?? false,
        hp: loadedState.hp ?? DEFAULT_INITIAL_STATE.hp,
        atk: loadedState.atk ?? DEFAULT_INITIAL_STATE.atk,
        mp: loadedState.mp ?? DEFAULT_INITIAL_STATE.mp,
        equippedWeapon: loadedState.equippedWeapon ?? null,
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
        recommendedAction: loadedState.recommendedAction ?? "",
        isTypingFinished: true,
        selectedGenreId: loadedState.selectedGenreId ?? null,
        genreMode: (loadedState.genreMode as GenreMode) ?? "fixed",
        turnInRun: loadedState.turnInRun ?? 0,
        maxTurns: loadedState.maxTurns ?? 5,
        isRunComplete: loadedState.isRunComplete ?? false,
        achievements: loadedState.achievements ?? [],
        ending: loadedState.ending ?? "",
        currentBgm: loadedState.currentBgm ?? null,
        highlights: loadedState.highlights ?? {},
      };
    }
  } catch (e) {
    console.error("자동 저장된 게임 불러오기 실패:", e);
  }
  return {
    ...DEFAULT_INITIAL_STATE,
    highlights: {}, 
  };
};

// ===== 장르 헬퍼 =====
const getGenreById = (id?: string | null) =>
  GENRES.find((g) => g.id === id) || null;
const pickRandomGenre = () => GENRES[Math.floor(Math.random() * GENRES.length)];

function buildGenreDirectivesForPrompt(
  mode: GenreMode,
  selectedId: string | null | undefined,
  turnInRun: number
): { activeGenre: Genre | null; genreText: string } {
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

// ===== 훅 정의 =====
export const useGame = (withImage: boolean) => {
  const [gameState, setGameState] = useState<GameState>(loadInitialState);
  const [initialStats, setInitialStats] = useState({
    hp: gameState.hp,
    atk: gameState.atk,
    mp: gameState.mp,
  });

  const ai = useMemo(
    () => (GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null),
    []
  ) as any;

  // ===== 헬퍼 함수들 (useCallback으로 감싸 안정화) =====

  const getAdjustedAtk = useCallback(() => {
    return gameState.atk + (gameState.equippedWeapon?.atkBonus || 0);
  }, [gameState.atk, gameState.equippedWeapon]);

  const computeAchievements = useCallback((s: GameState): string[] => {
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
  }, []);

  const generateEndingNarrative = useCallback(
    async (s: GameState, genreText: string): Promise<string> => {
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
    },
    [ai]
  );

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
      maxTurns,
      isRunComplete,
      achievements,
      ending,
      currentBgm,
      highlights, 
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
      ending,
      currentBgm,
      highlights, 
    };
    try {
      localStorage.setItem("ai_game_auto_save", JSON.stringify(autoSaveState));
      console.log("자동 저장 완료!");
    } catch (e) {
      console.error("자동 저장 실패:", e);
    }
  }, [gameState]);

  const ensureApi = useCallback((): boolean => {
    if (!ai) {
      setGameState((prev) => ({
        ...prev,
        story: "환경변수 VITE_GEMINI_API_KEY가 설정되지 않았습니다.",
      }));
      return false;
    }
    return true;
  }, [ai]);

  const buildImagePromptFromSubject = useCallback(
    (subject: Subject | null | undefined): string => {
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
    },
    []
  );

  const askStorySubjectAndDeltas = useCallback(
    async ({
      systemHint,
      userText,
    }: {
      systemHint?: string;
      userText: string;
    }): Promise<AskResult> => {
      const playerState = {
        hp: gameState.hp,
        atk: getAdjustedAtk(),
        mp: gameState.mp,
        items: gameState.items,
        equippedWeapon: gameState.equippedWeapon,
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
        `또한 ${BGM.join(
          ", "
        )} 중에 하나를 골라 bgm에 추가하세요` +
        "사용자의 행동을 직접 입력하지 않고 클릭할 수 있도록 'recommendedAction'에 다음 추천 행동 1개를 한국어 문장으로 제시하세요. " +
        
        "**매우 중요**: 스토리 텍스트에서 플레이어가 주목해야 할 고유명사나 핵심 단어를 카테고리별로 'highlights' 객체에 분류하여 **반드시** 포함시켜주세요. " +
        "stroy 텍스트에 **실제로 등장하는 단어**만 정확히 뽑아야 합니다. " +
        "카테고리: 'item'(아이템), 'location'(장소/지명), 'npc'(적 또는 인물), 'stat_hp'(HP 관련 **숫자 포함** 키워드), 'stat_atk'(ATK 관련 **숫자 포함** 키워드), 'stat_mp'(MP 관련 **숫자 포함** 키워드), 'misc'(그 외 상태이상/기타). " +
        "해당 카테고리에 단어가 없으면 빈 배열 `[]`을 반환하세요. " +
        "반드시 JSON만 출력. 포맷:\n" +
        "{\n" +
        '  "story": "한국어 스토리...",\n' +
        '  "subject": { "언어": "물체", "en": "subject" },\n' +
        '  "deltas": [ { "stat": "hp"|"atk"|"mp", "delta": -10, "reason": "적에게 맞음" }, ... ],\n' +
        '  "bgm": ,\n' +
        '  "deltas": [ ... ],\n' +
        '  "itemsAdd": ["아이템명"...],\n' +
        '  "itemsRemove": ["아이템명"...],\n' +
        '  "recommendedAction": "추천 행동 텍스트"\n' +
        '  "highlights": {\n' +
        '    "item": ["에너지 바"],\n' +
        '    "location": ["지하 벙커"],\n' +
        '    "npc": ["의문의 상인"],\n' +
        '    "misc": ["부상당한"]\n' +
        '  }\n' +
        "}";
        console.log(role);
        
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
        config: {
          temperature: 0.8,
          maxOutputTokens: 3000,
          topP: 0.95,
          topK: 40,
          thinkingBudget: 0,
        },
      });
      console.log(result);

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
      const bgm: string | null = (parsed.bgm ?? null) as string | null;
      const highlights: HighlightMap = parsed.highlights ?? {}; 

      return {
        nextStory,
        subject,
        deltas,
        itemsAdd,
        itemsRemove,
        notes,
        recommendedAction,
        bgm,
        highlights, 
      };
    },
    [ai, gameState, getAdjustedAtk]
  );

  const generateSceneImageFromSubject = useCallback(
    async (subject: Subject | null) => {
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
    },
    [ai, ensureApi, buildImagePromptFromSubject]
  );

  const generateHudNotes = useCallback(
    ({
      deltas,
      itemsAdd,
      itemsRemove,
    }: {
      deltas: Delta[];
      itemsAdd: string[];
      itemsRemove: string[];
    }): string[] => {
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
    },
    []
  );

  const applyDeltasAndItems = useCallback(
    ({
      deltas,
      itemsAdd,
      itemsRemove,
    }: {
      deltas: Delta[];
      itemsAdd: string[];
      itemsRemove: string[];
    }) => {
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
            const existingItem = newItems.find(
              (item) => item.name === itemName
            );
            if (existingItem) existingItem.quantity += 1;
            else
              newItems.push({
                name: itemName,
                quantity: 1,
                type: categorizeItem(itemName),
                // 💡 atkBonus 등은 여기서 알 수 없음.
                // 더 나은 구현: askStorySubjectAndDeltas가 Item 객체 반환
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
    },
    [generateHudNotes]
  ); // categorizeItem은 top-level 함수라 의존성 필요 없음

  // ===== 이펙트 훅 =====

  // 🔸 최대 턴 도달 시 엔딩
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

      autoSaveGame();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gameState.isRunComplete,
    // 의존성 배열 안정화 (useCallback 사용)
    gameState.ending,
    gameState.turnInRun,
    gameState.genreMode,
    gameState.selectedGenreId,
    gameState, // gameState.hp/atk/mp 등이 compute/generate에 필요
    computeAchievements,
    generateEndingNarrative,
    autoSaveGame,
  ]);

  // 타이핑 효과
  useEffect(() => {
    // ... (이 로직은 이미 완전했음) ...
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

  // ===== 핵심 핸들러 (useCallback) =====

  const generateScenario = useCallback(async () => {
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
      currentBgm: null,
      highlights: {}, 
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
        bgm,
        highlights, 
      } = await askStorySubjectAndDeltas({
        systemHint:
          "story는 자연스러운 한국어 문단. subject는 단일 물체 1개만. " +
          "deltas는 hp/atk/mp를 정수 증감. itemsAdd/Remove도 필요시 채우기. " +
          "같은 상황이라도 스탯에 따라 결과 분기.",
        userText: chatPrompt,
      });

      const newBgmUrl = (bgm && BGM_MAP[bgm]) || BGM_MAP["default"];

      const out = nextStory || "상황 생성 실패";
      setGameState((prev) => ({
        ...prev,
        story: out,
        recommendedAction: recommendedAction || "",
        currentBgm: newBgmUrl,
        highlights: highlights || {}, 
      }));
      applyDeltasAndItems({ deltas, itemsAdd, itemsRemove });
      autoSaveGame(); // applyDeltasAndItems 이후 gameState가 반영된 후 저장

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
  }, [
    ensureApi,
    gameState.genreMode,
    gameState.selectedGenreId,
    gameState.isGameOver, // if (!gameState.isGameOver)
    initialStats,
    askStorySubjectAndDeltas,
    applyDeltasAndItems,
    autoSaveGame,
    withImage,
    generateSceneImageFromSubject,
  ]);

  const submitAction = useCallback(async () => {
    if (
      !ensureApi() ||
      !gameState.story ||
      gameState.isGameOver ||
      gameState.isRunComplete
    )
      return;

    setGameState((prev) => ({ ...prev, isTextLoading: true }));

    const nextTurn = gameState.turnInRun + 1;

    const { genreText } = buildGenreDirectivesForPrompt(
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
        bgm,
        highlights,
      } = await askStorySubjectAndDeltas({
        systemHint:
          "story는 한국어 문단. subject는 단일 물체 1개. " +
          "deltas는 전투/피해/학습/회복/아이템 사용 등을 반영해 hp/atk/mp 정수 증감. " +
          "스탯이 높거나 낮으면 결과가 달라지도록. itemsAdd/Remove도 필요시 채움.",
        userText: actionPrompt,
      });

      const newBgmUrl = bgm && BGM_MAP[bgm];

      const out = nextStory || "이야기 생성 실패";
      setGameState((prev) => ({
        ...prev,
        story: out,
        userAction: "",
        recommendedAction: recommendedAction || "",
        turnInRun: nextTurn,
        currentBgm: newBgmUrl || prev.currentBgm,
        highlights: highlights || {}, 
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
  }, [
    ensureApi,
    gameState.story,
    gameState.isGameOver,
    gameState.isRunComplete,
    gameState.turnInRun,
    gameState.genreMode,
    gameState.selectedGenreId,
    gameState.userAction,
    gameState.isGameOver, // if (!gameState.isGameOver)
    askStorySubjectAndDeltas,
    applyDeltasAndItems,
    autoSaveGame,
    withImage,
    generateSceneImageFromSubject,
  ]);

  const goHome = useCallback(() => {
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
      localStorage.removeItem("ai_game_auto_save");
    }
  }, [setInitialStats]); // setInitialStats는 useState의 setter라 안정적임

  // 훅의 반환값
  return {
    gameState,
    setGameState,
    initialStats,
    setInitialStats,
    getAdjustedAtk,
    handlers: {
      handleUseItem,
      handleEquipItem,
      handleUnequipItem,
      generateScenario,
      submitAction,
      goHome,
    },
  };
};
// src/App.tsx
import { useMemo, useState, useEffect, useRef } from "react";
import { GoogleGenAI } from "@google/genai";

// 🔑 ENV
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

// 📦 모델
const TEXT_MODEL = "gemini-2.5-flash-lite"; // 스토리 + 메인오브젝트 + 스탯증감 동시 추출 (스탯 기반 분기 포함)
const IMAGE_MODEL = "imagen-3.0-generate-002"; // Imagen 3 (과금 필요)

// ===== 타입 정의 =====
type StatKey = "hp" | "atk" | "mp";

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
  items: string[];
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

// ===== 유틸: 초기 상태 불러오기 =====
const loadInitialState = (): GameState => {
  try {
    const autoSavedState = localStorage.getItem("ai_game_auto_save");
    if (autoSavedState) {
      const gameState = JSON.parse(autoSavedState) as Partial<GameState>;
      alert("자동 저장된 게임을 불러왔습니다!");
      return {
        story: gameState.story ?? "",
        typingStory: "",
        userAction: "",
        isTextLoading: false,
        isImgLoading: false,
        isGameOver: gameState.isGameOver ?? false,
        hp: gameState.hp ?? 100,
        atk: gameState.atk ?? 10,
        mp: gameState.mp ?? 30,
        items: gameState.items ?? ["허름한 검", "빵 한 조각"],
        survivalTurns: gameState.survivalTurns ?? 0,
        sceneImageUrl: gameState.sceneImageUrl ?? "",
        imgError: "",
        lastDelta: gameState.lastDelta ?? { hp: 0, atk: 0, mp: 0 },
        lastSurvivalTurn: "",
        hudNotes: gameState.hudNotes ?? [],
        recommendedAction: gameState.recommendedAction ?? "",
        isTypingFinished: false,
      };
    }
  } catch (e) {
    console.error("자동 저장된 게임 불러오기 실패:", e);
  }

  // 저장된 게임이 없으면 기본 초기 상태
  return {
    story: "",
    typingStory: "",
    userAction: "",
    isTextLoading: false,
    isImgLoading: false,
    isGameOver: false,
    hp: 100,
    atk: 10,
    mp: 30,
    items: ["허름한 검", "빵 한 조각"],
    survivalTurns: 0,
    sceneImageUrl: "",
    imgError: "",
    lastDelta: { hp: 0, atk: 0, mp: 0 },
    lastSurvivalTurn: "",
    hudNotes: [],
    recommendedAction: "",
    isTypingFinished: false,
  };
};

function App() {
  // 📦 게임 상태
  const [gameState, setGameState] = useState<GameState>(loadInitialState);
  const storyRef = useRef<HTMLDivElement | null>(null);

  // 🧩 옵션 팝업 & 체크박스 상태
  const [showOptions, setShowOptions] = useState<boolean>(false);
  const [withImage, setWithImage] = useState<boolean>(false);

  // 💾 저장/불러오기 관련 상태
  const [currentSlot, setCurrentSlot] = useState<number>(1);
  const [slots, setSlots] = useState<Array<{ id: number; saved: boolean; name?: string; savedAt?: string }>>([]);
  const [saveName, setSaveName] = useState<string>("");

  // ➕ 마지막 옵션 기억
  useEffect(() => {
    const saved = localStorage.getItem("withImage");
    if (saved !== null) setWithImage(saved === "true");
  }, []);
  useEffect(() => {
    localStorage.setItem("withImage", String(withImage));
  }, [withImage]);

  // 🔄 자동 스크롤
  useEffect(() => {
    if (storyRef.current) {
      storyRef.current.scrollTop = storyRef.current.scrollHeight;
    }
  }, [gameState.story, gameState.typingStory]);

  // 앱 시작 시 저장된 슬롯 확인
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

  // 🔄 자동 저장
  useEffect(() => {
    const { story, hp, atk, mp, items, survivalTurns, sceneImageUrl, isGameOver, recommendedAction } = gameState;
    const autoSaveState = { story, hp, atk, mp, items, survivalTurns, sceneImageUrl, isGameOver, recommendedAction };
    try {
      localStorage.setItem("ai_game_auto_save", JSON.stringify(autoSaveState));
      console.log("자동 저장 완료!");
    } catch (e) {
      console.error("자동 저장 실패:", e);
    }
  }, [
    gameState.story,
    gameState.hp,
    gameState.atk,
    gameState.mp,
    gameState.items,
    gameState.survivalTurns,
    gameState.sceneImageUrl,
    gameState.isGameOver,
    gameState.recommendedAction,
  ]);

  // ⌨️ 타이핑 효과
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

  // 🔌 Gemini SDK 인스턴스
  // SDK 메서드 타입이 프로젝트마다 다를 수 있어 any로 캐스팅(런타임 동작 유지 목적)
  const ai = useMemo(() => (GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null), []) as any;

  const ensureApi = (): boolean => {
    if (!ai) {
      setGameState((prev) => ({ ...prev, story: "환경변수 VITE_GEMINI_API_KEY가 설정되지 않았습니다." }));
      return false;
    }
    return true;
  };

  // ✅ 단일 피사체 전용 이미지 프롬프트
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

  // 🧠 스토리+메인오브젝트+스탯증감 한 번에
  async function askStorySubjectAndDeltas({ systemHint, userText }: { systemHint?: string; userText: string }): Promise<AskResult> {
    const playerState = {
      hp: gameState.hp,
      atk: gameState.atk,
      mp: gameState.mp,
      items: gameState.items,
      survivalTurns: gameState.survivalTurns,
    };

    // 문자열 결합 버그 수정 및 포맷 고정
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

  // 📝 HUD 노트 생성
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

  // 🧮 스탯/인벤토리 적용 + HUD + 게임오버
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

      if (itemsRemove?.length) newItems = newItems.filter((x) => !itemsRemove.includes(x));
      if (itemsAdd?.length) newItems = [...newItems, ...itemsAdd];

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

    // 증감 뱃지 3초
    window.setTimeout(() => {
      setGameState((prev) => ({
        ...prev,
        lastDelta: { hp: 0, atk: 0, mp: 0 },
        lastSurvivalTurn: "",
      }));
    }, 3000);
  }

  // 🖼 이미지 생성
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

  // 🎲 새로운 상황
  const generateScenario = async () => {
    if (!ensureApi()) return;
    setGameState((prev) => ({
      ...prev,
      story: "",
      typingStory: "",
      isTextLoading: true,
      isGameOver: false,
      sceneImageUrl: "",
      imgError: "",
      hudNotes: [],
      survivalTurns: 0,
      hp: 100,
      atk: 10,
      mp: 30,
      items: ["허름한 검", "빵 한 조각"],
      lastSurvivalTurn: "",
      recommendedAction: "",
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

      setGameState((prev) => ({
        ...prev,
        story: nextStory || "상황 생성 실패",
        recommendedAction: recommendedAction || "",
      }));
      applyDeltasAndItems({ deltas, itemsAdd, itemsRemove });

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

  // 📝 행동 제출
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
    setGameState({
      story: "",
      typingStory: "",
      userAction: "",
      isTextLoading: false,
      isImgLoading: false,
      isGameOver: false,
      hp: 100,
      atk: 10,
      mp: 30,
      items: ["허름한 검", "빵 한 조각"],
      survivalTurns: 0,
      sceneImageUrl: "",
      imgError: "",
      lastDelta: { hp: 0, atk: 0, mp: 0 },
      lastSurvivalTurn: "",
      hudNotes: [],
      recommendedAction: "",
      isTypingFinished: false,
    });
    alert("게임을 초기화했습니다!");
  };

  // ⏳ 공통 스피너
  const Spinner: React.FC<{ label: string }> = ({ label }) => (
    <div className="flex items-center gap-2 text-gray-600 text-sm">
      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
      </svg>
      <span>{label}</span>
    </div>
  );

  // 🔼 증감 뱃지
  const DeltaBadge: React.FC<{ value?: number }> = ({ value }) => {
    if (!value) return null;
    const sign = value > 0 ? "+" : "";
    const color = value > 0 ? "text-green-600" : "text-red-600";
    return (
      <span className={`ml-2 text-xs font-semibold ${color}`}>
        {sign}
        {value}
      </span>
    );
  };

  // 💾 게임 상태 저장
  const saveGame = (slotNumber: number, name?: string) => {
    const { story, hp, atk, mp, items, survivalTurns, sceneImageUrl } = gameState;
    const saveState = {
      story,
      hp,
      atk,
      mp,
      items,
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

  // 📂 불러오기
  const loadGame = (slotNumber: number) => {
    try {
      const savedState = localStorage.getItem(`ai_game_save_${slotNumber}`);
      if (savedState) {
        const loaded = JSON.parse(savedState) as {
          story: string;
          hp: number;
          atk: number;
          mp: number;
          items: string[];
          survivalTurns: number;
          sceneImageUrl: string;
          name?: string;
        };
        setGameState((prev) => ({
          ...prev,
          story: loaded.story,
          typingStory: "", // 다시 타이핑 애니메이션을 줄지 말지는 필요에 따라 조정
          hp: loaded.hp,
          atk: loaded.atk,
          mp: loaded.mp,
          items: loaded.items,
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

  // 🗑 삭제
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
      <div className="bg-white shadow-2xl rounded-2xl w-full max-w-4xl p-8 space-y-6 border border-gray-200">
        {/* 헤더 + 옵션 버튼 */}
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-extrabold text-purple-700">AI Text Adventure Game</h1>
          <div className="flex items-center gap-3">
            {gameState.isTextLoading && <Spinner label="응답 생성 중…" />}
            <button onClick={() => setShowOptions(true)} className="text-sm bg-gray-800 hover:bg-black text-white px-3 py-1.5 rounded-lg">
              옵션
            </button>
          </div>
        </div>

        {/* 🧭 HUD + 🎨 이미지 */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* HUD */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <h2 className="font-bold text-gray-700 mb-3">현재 상태</h2>
            <div className="space-y-2">
              <div
                className={`flex justify-between p-1 rounded-md transition-colors duration-500 border-b border-gray-200 pb-2 mb-2 ${
                  gameState.lastDelta.hp > 0 ? "bg-green-100" : gameState.lastDelta.hp < 0 ? "bg-red-100" : ""
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
                  gameState.lastDelta.atk > 0 ? "bg-green-100" : gameState.lastDelta.atk < 0 ? "bg-red-100" : ""
                }`}
              >
                <span>공격력(ATK)</span>
                <span className="font-semibold flex items-center justify-end w-20">
                  {gameState.atk}
                  <DeltaBadge value={gameState.lastDelta.atk} />
                </span>
              </div>
              <div
                className={`flex justify-between p-1 rounded-md transition-colors duration-500 border-b border-gray-200 pb-2 mb-2 ${
                  gameState.lastDelta.mp > 0 ? "bg-green-100" : gameState.lastDelta.mp < 0 ? "bg-red-100" : ""
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

              <div>
                <div className="mb-1">소지품</div>
                <div className="flex flex-wrap gap-2">
                  {gameState.items.map((it, i) => (
                    <span key={i} className="px-2 py-1 text-sm rounded-lg bg-purple-100 text-purple-700 border border-purple-200">
                      {it}
                    </span>
                  ))}
                </div>
              </div>

              {!!gameState.hudNotes.length && (
                <div className="mt-3">
                  <div className="text-sm font-semibold text-gray-700 mb-1">최근 변화</div>
                  <ul className="list-disc list-inside text-sm text-gray-700 space-y-0.5">
                    {gameState.hudNotes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* 이미지 카드 */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col">
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-gray-200 flex items-center justify-center border border-gray-300 relative">
              {gameState.sceneImageUrl ? (
                <img src={gameState.sceneImageUrl} alt="scene" className="w-full h-full object-cover" />
              ) : (
                <span className="text-gray-500 text-sm">
                  {withImage ? "아직 생성된 그림이 없습니다." : "이미지 생성을 꺼 두었습니다. (옵션에서 변경)"}
                </span>
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

        {/* 🎲 상황 생성 버튼 */}
        <div className="flex justify-center gap-4">
          <button
            onClick={generateScenario}
            disabled={gameState.isTextLoading || gameState.isGameOver}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-xl transition duration-300 disabled:opacity-50"
          >
            {gameState.isTextLoading ? "로딩 중..." : "새로운 상황 생성"}
          </button>
        </div>

        {/* 📝 시나리오 출력 */}
        {gameState.story && (
          <div
            ref={storyRef}
            className="bg-gray-100 border border-gray-300 rounded-xl p-4 text-lg whitespace-pre-wrap shadow-inner overflow-y-auto max-h-[400px]"
          >
            {gameState.typingStory}
          </div>
        )}

        {/* 🎯 유저 입력창 및 버튼 */}
        {gameState.story && !gameState.isGameOver && (
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

            {/* 🚀 추천 행동 버튼 */}
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
          </form>
        )}

        {/* 🏠 홈으로 가는 버튼 / 게임오버 */}
        {gameState.isGameOver && (
          <div className="flex flex-col items-center gap-3">
            <div className="text-red-600 font-bold">체력이 0이 되어 게임 오버!</div>
            <button onClick={goHome} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-xl transition">
              홈으로 가기
            </button>
          </div>
        )}
      </div>

      {showOptions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowOptions(false)} aria-hidden="true" />
          <div className="relative bg-white w-full max-w-md mx-4 rounded-2xl shadow-xl border border-gray-200 p-8">
            <h2 className="text-3xl font-extrabold text-purple-700 text-center mb-6">설정</h2>

            {/* ✅ 생성 옵션 섹션 */}
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

            {/* 💾 저장/불러오기 섹션 */}
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

              {/* 💾 저장 이름 입력 필드 */}
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

            <div className="mt-6 flex justify-center">
              <button
                onClick={() => setShowOptions(false)}
                className="w-full py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold"
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

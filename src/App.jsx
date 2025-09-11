// src/App.jsx
import { useMemo, useState, useEffect } from "react";
import { GoogleGenAI } from "@google/genai";

// 🔑 ENV
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// 📦 모델
const TEXT_MODEL = "gemini-2.5-flash-lite"; // 스토리 + 메인오브젝트 + 스탯증감 동시 추출 (스탯 기반 분기 포함)
const IMAGE_MODEL = "imagen-3.0-generate-002"; // Imagen 3 (과금 필요)

function App() {
  // 📦 게임 상태
  const [story, setStory] = useState("");
  const [userAction, setUserAction] = useState("");
  const [isTextLoading, setIsTextLoading] = useState(false);
  const [isImgLoading, setIsImgLoading] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);

  // 🔧 HUD
  const [hp, setHp] = useState(100);
  const [atk, setAtk] = useState(10);
  const [mp, setMp] = useState(30);
  const [items, setItems] = useState(["허름한 검", "빵 한 조각"]);
  const [survivalTurns, setSurvivalTurns] = useState(0);

  // 🎨 현재 상황 일러스트
  const [sceneImageUrl, setSceneImageUrl] = useState("");
  const [imgError, setImgError] = useState("");

  // 🧩 옵션 팝업 & 체크박스 상태
  const [showOptions, setShowOptions] = useState(false);
  const [withImage, setWithImage] = useState(false);

  // 🔔 최근 스탯 변화 뱃지 + 내역
  const [lastDelta, setLastDelta] = useState({ hp: 0, atk: 0, mp: 0 });
  const [hudNotes, setHudNotes] = useState([]); // ["괴물과 싸워 ATK +1", "피해를 받아 HP -10" ... 최대 n개 유지)

  // 💾 저장/불러오기 관련 상태
  const [currentSlot, setCurrentSlot] = useState(1);
  const [slots, setSlots] = useState([]);
  const [saveName, setSaveName] = useState("");

  // ➕ 마지막 옵션 기억
  useEffect(() => {
    const saved = localStorage.getItem("withImage");
    if (saved !== null) setWithImage(saved === "true");
  }, []);
  useEffect(() => {
    localStorage.setItem("withImage", String(withImage));
  }, [withImage]);

  // 앱 시작 시 저장된 슬롯을 확인하는 useEffect
  useEffect(() => {
    const slotsData = [];
    for (let i = 1; i <= 3; i++) {
        const key = `ai_game_save_${i}`;
        const savedData = localStorage.getItem(key);
        if (savedData) {
            const data = JSON.parse(savedData);
            slotsData.push({ id: i, saved: true, name: data.name, savedAt: data.savedAt });
        } else {
            slotsData.push({ id: i, saved: false });
        }
    }
    setSlots(slotsData);
  }, []);


  // 🔌 Gemini SDK
  const ai = useMemo(() => (GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null), []);

  const ensureApi = () => {
    if (!ai) {
      setStory("환경변수 VITE_GEMINI_API_KEY가 설정되지 않았습니다.");
      return false;
    }
    return true;
  };

  // ✅ 단일 피사체 전용 이미지 프롬프트
  function buildImagePromptFromSubject(subject) {
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

  // 🧠 (중요) 스토리+메인오브젝트+스탯증감 한 번에 받기 (현재 스탯 기반 분기)
  async function askStorySubjectAndDeltas({ systemHint, userText }) {
    // 현재 플레이어 상태를 모델에 전달 → 같은 상황이라도 스탯 차이에 따라 결과 분기
    const playerState = { hp, atk, mp, items, survivalTurns };

    // JSON 스키마 강제 (hudNotes 포함)
    const role =
      "역할: 당신은 AI 게임 마스터이자 게임 시스템입니다. " +
      "아래 '플레이어 현재 상태'를 반드시 고려하여, 같은 상황이라도 스탯(ATK/MP/HP)에 따라 결과가 달라지도록 스토리를 진행하세요. " +
      "예) 같은 적을 만나도 ATK가 높으면 쉽게 제압(피해 적음), MP가 높으면 마법적 해결, 스탯이 낮으면 회피/도망/피해 증가 등.\n" +
      "이야기를 생성하면서 그 결과로 플레이어의 스탯/인벤토리 변화도 함께 산출합니다. " +
      "스탯은 정수 delta로만 표기(hp/atk/mp). 예: 괴물과 싸움→ atk+1, hp-10 / 책 읽음→ mp+1 / 피해→ hp-10. " +
      "아이템 변동이 있으면 itemsAdd/itemsRemove에 넣고, HUD에서 보여줄 간단한 문구를 hudNotes 배열로 제공하세요. " +
      "또한 장면에서 '가장 중심이 되는 단일 물체' 1개(subject)를 뽑습니다(사람/군중/배경전체/추상 제외). " +
      "반드시 JSON만 출력. 포맷:\n" +
      "{\n" +
      '  "story": "한국어 스토리...",\n' +
      '  "subject": { "ko": "버섯", "en": "a red mushroom" },\n' +
      '  "deltas": [ { "stat": "hp"|"atk"|"mp", "delta": -10, "reason": "적에게 맞음" }, ... ],\n' +
      '  "itemsAdd": ["아이템명"...],\n' +
      '  "itemsRemove": ["아이템명"...],\n' +
      '  "hudNotes": ["괴물과 싸워 ATK +1","피해를 받아 HP -10"]\n' +
      "}"
      +"JSON 내용을 포맷처럼 하되 내용을 다양하게."
    
      ;

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

    const raw = (result?.text ?? "").trim();
    const s = raw.indexOf("{");
    const e = raw.lastIndexOf("}");
    const jsonStr = s >= 0 && e >= 0 ? raw.slice(s, e + 1) : "{}";
    const parsed = JSON.parse(jsonStr);

    const nextStory = (parsed.story ?? "").trim();
    const subject = parsed.subject ?? null;
    const deltas = Array.isArray(parsed.deltas) ? parsed.deltas : [];
    const itemsAdd = Array.isArray(parsed.itemsAdd) ? parsed.itemsAdd : [];
    const itemsRemove = Array.isArray(parsed.itemsRemove) ? parsed.itemsRemove : [];
    const notes = Array.isArray(parsed.hudNotes) ? parsed.hudNotes : [];

    return { nextStory, subject, deltas, itemsAdd, itemsRemove, notes };
  }

  // 🧮 스탯/인벤토리 적용 + HUD 뱃지/노트 + 게임오버 체크
  function applyDeltasAndItems({ deltas, itemsAdd, itemsRemove, notes }) {
    let dHp = 0,
      dAtk = 0,
      dMp = 0;
    for (const d of deltas || []) {
      if (!d || typeof d.delta !== "number") continue;
      if (d.stat === "hp") dHp += d.delta;
      if (d.stat === "atk") dAtk += d.delta;
      if (d.stat === "mp") dMp += d.delta;
    }

    // 스탯 적용
    let newHp = hp + dHp;
    let newAtk = atk + dAtk;
    let newMp = mp + dMp;

    if (newHp < 0) newHp = 0;
    setHp(newHp);
    setAtk(newAtk);
    setMp(newMp);

    // 증감 배지 (3초)
    setLastDelta({ hp: dHp || 0, atk: dAtk || 0, mp: dMp || 0 });
    setTimeout(() => setLastDelta({ hp: 0, atk: 0, mp: 0 }), 3000);

    // 인벤토리 적용
    if (itemsRemove?.length) setItems((arr) => arr.filter((x) => !itemsRemove.includes(x)));
    if (itemsAdd?.length) setItems((arr) => [...arr, ...itemsAdd]);

    // HUD 노트 (최근 것이 위로, 최대 6개 유지)
    if (notes?.length) {
      setHudNotes((prev) => {
        const merged = [...notes, ...prev];
        return merged.slice(0, 6);
      });
    }

    // 게임오버 체크
    if (newHp <= 0) {
      setIsGameOver(true);
      setStory((s) => (s ? s + "\n\n게임 끝" : "게임 끝"));
    } else {
      // 생존 턴 +1 (스토리 진행 성공 시)
      setSurvivalTurns((t) => t + 1);
    }
  }

  // 🖼 이미지 생성 (subject로 바로)
  async function generateSceneImageFromSubject(subject) {
    setImgError("");
    if (!ensureApi()) return;
    setIsImgLoading(true);
    try {
      const prompt = buildImagePromptFromSubject(subject);
      const res = await ai.models.generateImages({
        model: IMAGE_MODEL,
        prompt,
        config: { numberOfImages: 1 },
      });
      const bytes = res?.generatedImages?.[0]?.image?.imageBytes;
      if (bytes) setSceneImageUrl(`data:image/png;base64,${bytes}`);
      else setImgError("이미지가 반환되지 않았습니다. 프롬프트를 더 구체적으로 작성해 보세요.");
    } catch (e) {
      const msg = String(e?.message ?? e);
      if (msg.includes("only accessible to billed users"))
        setImgError("Imagen API는 결제 등록된 계정만 사용 가능합니다. (결제/쿼터 설정 필요)");
      else if (/permission|quota|disabled|billing/i.test(msg)) setImgError("이미지 생성 권한/쿼터/과금 설정을 확인해주세요.");
      else setImgError(`이미지 생성 오류: ${msg}`);
    } finally {
      setIsImgLoading(false);
    }
  }

  // 🎲 새로운 상황 생성 (한 번에 스토리+subject+deltas)
  const generateScenario = async () => {
    if (!ensureApi()) return;
    setIsTextLoading(true);
    setIsGameOver(false);
    setSceneImageUrl("");
    setImgError("");
    setHudNotes([]); // 새 게임 느낌

    const chatPrompt =
      "장르는 특정하지 말고(현실/판타지/SF 등 가능) 플레이어에게 흥미로운 상황을 한국어로 5~8문장으로 제시하세요. " +
      "필요하면 선택지를 2~3개 제시하고, 마지막은 '행동을 입력하세요'로 끝내세요.";

    try {
      const { nextStory, subject, deltas, itemsAdd, itemsRemove, notes } = await askStorySubjectAndDeltas({
        systemHint:
          "story는 자연스러운 한국어 문단으로. subject는 단일 물체 1개만(가능하면 색/형태 한 단어 포함). " +
          "deltas는 상황에 알맞게 hp/atk/mp를 정수로 증감. itemsAdd/Remove와 hudNotes도 필요시 채우기.",
        userText: chatPrompt,
      });

      setStory(nextStory || "상황 생성 실패");
      applyDeltasAndItems({ deltas, itemsAdd, itemsRemove, notes });

      if (!isGameOver && withImage && subject) {
        await generateSceneImageFromSubject(subject);
      }
    } catch (e) {
      console.error(e);
      setStory("상황 생성 중 오류가 발생했습니다.");
    } finally {
      setIsTextLoading(false);
    }
  };

  // 📝 행동 제출 (한 번에 스토리+subject+deltas)
  const submitAction = async () => {
    if (!ensureApi() || !story || isGameOver) return;
    setIsTextLoading(true);

    const actionPrompt =
      `이전 상황(컨텍스트):\n${story}\n\n` +
      `플레이어의 행동: ${userAction}\n\n` +
      "게임 마스터처럼 자연스럽게 다음 전개를 서술하세요. 필요하면 선택지를 2~3개 제시하고, 마지막은 '행동을 입력하세요'로 끝내세요.";

    try {
      const { nextStory, subject, deltas, itemsAdd, itemsRemove, notes } = await askStorySubjectAndDeltas({
        systemHint:
          "story는 한국어 문단으로. subject는 단일 물체 1개만(가능하면 색/형태 한 단어 포함). " +
          "deltas는 상황에 맞춰 hp/atk/mp를 정수로 증감: 전투/피해/학습/회복/아이템 사용 등 반영. " +
          "현재 스탯이 높거나 낮은 경우 결과가 달라지도록 설계. itemsAdd/Remove와 hudNotes도 필요시 채우기.",
        userText: actionPrompt,
      });

      const out = nextStory || "이야기 생성 실패";
      setStory(out);
      setUserAction("");

      applyDeltasAndItems({ deltas, itemsAdd, itemsRemove, notes });

      if (!isGameOver && withImage && subject) {
        await generateSceneImageFromSubject(subject);
      }
    } catch (e) {
      console.error(e);
      setStory("이야기 생성 중 오류가 발생했습니다.");
    } finally {
      setIsTextLoading(false);
    }
  };

  const goHome = () => {
    alert("홈으로 가기");
  };

  // ⏳ 공통 스피너
  const Spinner = ({ label }) => (
    <div className="flex items-center gap-2 text-gray-600 text-sm">
      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
      </svg>
      <span>{label}</span>
    </div>
  );

  // 🔼 증감 뱃지
  const DeltaBadge = ({ value }) => {
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

  // 💾 게임 상태 저장 함수
  const saveGame = (slotNumber, saveName) => { // ⬅️ 매개변수를 saveName으로 변경
    const gameState = {
        story,
        hp,
        atk,
        mp,
        items,
        survivalTurns,
        sceneImageUrl,
        name: saveName || `저장 #${slotNumber}`, // ⬅️ saveName을 할당
        savedAt: new Date().toLocaleString(),
    };
    try {
        localStorage.setItem(`ai_game_save_${slotNumber}`, JSON.stringify(gameState));
        alert(`게임이 ${slotNumber}번에 '${gameState.name}'(으)로 성공적으로 저장되었습니다!`);
    } catch (e) {
        console.error("Failed to save game:", e);
        alert("게임 저장에 실패했습니다.");
    }
  };

  // 📂 게임 상태 불러오기 함수
  const loadGame = (slotNumber) => {
      try {
          const savedState = localStorage.getItem(`ai_game_save_${slotNumber}`);
          if (savedState) {
              const gameState = JSON.parse(savedState);
              setStory(gameState.story);
              setHp(gameState.hp);
              setAtk(gameState.atk);
              setMp(gameState.mp);
              setItems(gameState.items);
              setSurvivalTurns(gameState.survivalTurns);
              setSceneImageUrl(gameState.sceneImageUrl);
              setIsGameOver(false);
              setSaveName(gameState.name || ""); // 불러온 이름으로 입력 필드 업데이트
              alert(`${slotNumber}번의 게임을 불러왔습니다!`);
          } else {
              alert(`${slotNumber}번에 저장된 게임이 없습니다.`);
          }
      } catch (e) {
          console.error("Failed to load game:", e);
          alert("게임 불러오기에 실패했습니다.");
      }
  };

  // 🗑 게임 상태 삭제 함수
  const deleteGame = (slotNumber) => {
      try {
          localStorage.removeItem(`ai_game_save_${slotNumber}`);
          // 삭제 후 슬롯 상태를 즉시 업데이트
          setSlots(prevSlots => prevSlots.map(slot => 
              slot.id === slotNumber ? { ...slot, saved: false } : slot
          ));
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
            {isTextLoading && <Spinner label="응답 생성 중…" />}
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
              <div className="flex justify-between">
                <span>체력(HP)</span>
                <span className="font-semibold flex items-center">
                  {hp}
                  <DeltaBadge value={lastDelta.hp} />
                </span>
              </div>
              <div className="flex justify-between">
                <span>공격력(ATK)</span>
                <span className="font-semibold flex items-center">
                  {atk}
                  <DeltaBadge value={lastDelta.atk} />
                </span>
              </div>
              <div className="flex justify-between">
                <span>마력(MP)</span>
                <span className="font-semibold flex items-center">
                  {mp}
                  <DeltaBadge value={lastDelta.mp} />
                </span>
              </div>

              <div className="flex justify-between">
                <span>생존 턴</span>
                <span className="font-semibold">{survivalTurns}</span>
              </div>

              <div>
                <div className="mb-1">소지품</div>
                <div className="flex flex-wrap gap-2">
                  {items.map((it, i) => (
                    <span key={i} className="px-2 py-1 text-sm rounded-lg bg-purple-100 text-purple-700 border border-purple-200">
                      {it}
                    </span>
                  ))}
                </div>
              </div>

              {!!hudNotes.length && (
                <div className="mt-3">
                  <div className="text-sm font-semibold text-gray-700 mb-1">최근 변화</div>
                  <ul className="list-disc list-inside text-sm text-gray-700 space-y-0.5">
                    {hudNotes.map((n, i) => (
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
              {sceneImageUrl ? (
                <img src={sceneImageUrl} alt="scene" className="w-full h-full object-cover" />
              ) : (
                <span className="text-gray-500 text-sm">
                  {withImage ? "아직 생성된 그림이 없습니다." : "이미지 생성을 꺼 두었습니다. (옵션에서 변경)"}
                </span>
              )}
              {isImgLoading && (
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                  <Spinner label="이미지 생성 중…" />
                </div>
              )}
            </div>
            {imgError && <div className="text-sm text-red-600 mt-2">{imgError}</div>}
          </div>
        </div>

        {/* 🎲 상황 생성 버튼 */}
        <div className="flex justify-center gap-4">
          <button
            onClick={generateScenario}
            disabled={isTextLoading || isGameOver}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-xl transition duration-300 disabled:opacity-50"
          >
            {isTextLoading ? "로딩 중..." : "새로운 상황 생성"}
          </button>
        </div>

        {/* 📝 시나리오 출력 */}
        {story && <div className="bg-gray-100 border border-gray-300 rounded-xl p-4 text-lg whitespace-pre-wrap shadow-inner">{story}</div>}

        {/* 🎯 유저 입력창 및 버튼 */}
        {story && !isGameOver && (
          <div className="flex flex-col space-y-3">
            <input
              type="text"
              value={userAction}
              onChange={(e) => setUserAction(e.target.value)}
              placeholder="당신의 행동을 입력하세요..."
              className="p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <button
              onClick={submitAction}
              disabled={isTextLoading || !userAction}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-5 rounded-xl transition duration-300 disabled:opacity-50"
            >
              {isTextLoading ? "로딩 중..." : "다음 이야기 진행"}
            </button>
          </div>
        )}

        {/* 🏠 홈으로 가는 버튼 / 게임오버 */}
        {isGameOver && (
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
                        <input type="checkbox" className="mt-1 w-4 h-4 text-purple-600 focus:ring-purple-500" checked={withImage} onChange={(e) => setWithImage(e.target.checked)} />
                        <span className="text-gray-700">
                            <span className="font-semibold block">스토리와 함께 이미지도 생성</span>
                            <span className="block text-sm text-gray-500">
                                이미지 생성 비용이 발생할 수 있습니다.
                            </span>
                        </span>
                    </label>
                </div>

                {/* 💾 저장/불러오기 섹션 */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h3 className="font-bold text-gray-700 mb-3">게임 저장/불러오기</h3>
                    
                    <div className="mb-4">
                        <p className="font-semibold text-sm text-gray-600 mb-2">저장 슬롯 선택:</p>
                        <div className="grid grid-cols-3 gap-2">
                          {slots.map(slot => {
                              // 이름을 10글자로 자르고, 초과하면 "..."을 추가합니다.
                              const displayName = slot.saved && slot.name 
                                                  ? (slot.name.length > 10 ? slot.name.substring(0, 10) + '...' : slot.name)
                                                  : '비어있음 ❌';
                              
                              return (
                                  <button
                                      key={slot.id}
                                      onClick={() => {
                                          setCurrentSlot(slot.id);
                                          setSaveName(slot.name || ""); // 슬롯 선택 시 저장 이름 필드 업데이트
                                      }}
                                      className={`w-full px-2 py-3 rounded-lg font-semibold transition ${
                                          currentSlot === slot.id
                                              ? 'bg-purple-600 text-white shadow-md'
                                              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                                      }`}
                                  >
                                      {slot.id}번<br />
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

                    {/* 💾 저장 이름 입력 필드 */}
                      <div className="mb-4">
                        <label htmlFor="saveName" className="font-semibold text-sm text-gray-600 mb-2 block">저장 이름 (선택 사항):</label>
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
                              // 슬롯이 이미 저장되어 있으면 경고창 표시
                              const isSlotSaved = slots.find(s => s.id === currentSlot)?.saved;
                              if (isSlotSaved && !window.confirm(`${currentSlot}번에 이미 저장된 게임이 있습니다. 덮어쓰시겠습니까?`)) {
                                  return; // 사용자가 '취소'를 누르면 함수 종료
                              }
                              
                              saveGame(currentSlot, saveName);
                              setShowOptions(false); // 저장 후 모달 닫기
                          }}
                          className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition"
                        >
                            저장
                        </button>
                        <button
                          onClick={() => {
                              loadGame(currentSlot);
                              setShowOptions(false); // 불러오기 후 모달 닫기
                          }}
                          disabled={!slots.find(s => s.id === currentSlot)?.saved}
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
                          disabled={!slots.find(s => s.id === currentSlot)?.saved}
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

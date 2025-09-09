// src/App.jsx
import { useMemo, useState } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";

// 💡 Gemini API Key를 입력해주세요 (보안상 유의 - 실제 배포 시 백엔드 처리 권장)
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

function App() {
  // 📦 상태 선언
  const [story, setStory] = useState(""); // 생성된 시나리오 텍스트
  const [userAction, setUserAction] = useState(""); // 유저가 입력한 행동
  const [isLoading, setIsLoading] = useState(false); // 로딩 상태
  const [isGameOver, setIsGameOver] = useState(false); // 게임 종료 여부

  // 🔧 Gemini 모델 준비 (초기 1회 생성)
  const model = useMemo(() => {
    if (!GEMINI_API_KEY) return null;
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    return genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      generationConfig: { temperature: 0.9, maxOutputTokens: 512, topP: 0.95, topK: 40 },
    });
  }, []);

  // 🎲 Gemini로 텍스트 시나리오 생성 함수
  const generateScenario = async () => {
    setIsLoading(true);
    setStory("");
    setIsGameOver(false);

    if (!model) {
      setStory("환경변수 VITE_GEMINI_API_KEY가 설정되지 않았습니다.");
      setIsLoading(false);
      return;
    }

    const chatPrompt =
      "당신은 AI 게임 마스터입니다. 플레이어에게 흥미로운 어드벤처 상황을 한국어로 5~8문장으로 제시하세요. " +
      "선택지를 2~3개 제시하고 마지막은 '행동을 입력하세요'로 끝내세요.";

    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: chatPrompt }] }],
      });
      const scenario = result?.response?.text?.() ?? "상황 생성 실패";
      setStory(scenario.trim());
    } catch (e) {
      console.error(e);
      setStory("상황 생성 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // 📝 유저 행동에 따른 이어지는 이야기 생성 함수
  const submitAction = async () => {
    if (!model) return;

    setIsLoading(true);
    const actionPrompt = `${
      "이전 상황(컨텍스트):\n" + story
    }\n\n플레이어의 행동: ${userAction}\n\n게임 마스터처럼 자연스럽게 다음 전개를 서술하고, 필요하면 선택지를 2~3개 제시하세요.`;

    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: actionPrompt }] }],
      });
      const nextStory = result?.response?.text?.() ?? "이야기 생성 실패";
      setStory(nextStory.trim());
      setUserAction("");

      // 게임 종료 여부 확인 (예: '게임 끝' 또는 '끝' 포함 시 종료 처리)
      if (nextStory.includes("게임 끝") || nextStory.includes("끝")) {
        setIsGameOver(true);
      }
    } catch (e) {
      console.error(e);
      setStory("이야기 생성 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // 홈으로 가기 버튼 클릭 시 동작
  const goHome = () => {
    // 홈 페이지로 이동하는 코드 (예시: window.location.href = '/home';)
    alert("홈으로 가기");
    // 여기에 실제 홈으로 이동하는 코드 추가
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 to-purple-200 p-6 flex flex-col items-center justify-center">
      <div className="bg-white shadow-2xl rounded-2xl w-full max-w-3xl p-8 space-y-6 border border-gray-200">
        {/* 🎮 타이틀 */}
        <h1 className="text-4xl font-extrabold text-center text-purple-700">AI Text Adventure Game</h1>

        {/* 🎲 상황 생성 버튼 */}
        <div className="flex justify-center">
          <button
            onClick={generateScenario}
            disabled={isLoading}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-xl transition duration-300 disabled:opacity-50"
          >
            {isLoading ? "로딩 중..." : "새로운 상황 생성"}
          </button>
        </div>

        {/* 📝 시나리오 출력 */}
        {story && <div className="bg-gray-100 border border-gray-300 rounded-xl p-4 text-lg whitespace-pre-wrap shadow-inner">{story}</div>}

        {/* 🎯 유저 입력창 및 버튼 */}
        {story && (
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
              disabled={isLoading || !userAction}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-5 rounded-xl transition duration-300 disabled:opacity-50"
            >
              다음 이야기 진행
            </button>
          </div>
        )}

        {/* 🏠 홈으로 가는 버튼 */}
        {isGameOver && (
          <div className="flex justify-center">
            <button
              onClick={goHome}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-xl transition duration-300"
            >
              홈으로 가기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

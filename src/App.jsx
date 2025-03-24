// src/App.jsx
import { useState } from 'react';

// 💡 OpenAI API Key를 입력해주세요 (보안상 유의 - 실제 배포 시 백엔드 처리 권장)
const VITE_OPENAI_API_KEY = ProcessingInstruction.env.TEXT_API_KEY;

function App() {
  // 📦 상태 선언
  const [story, setStory] = useState(''); // 생성된 시나리오 텍스트
  const [userAction, setUserAction] = useState(''); // 유저가 입력한 행동
  const [isLoading, setIsLoading] = useState(false); // 로딩 상태
	const [isGameOver, setIsGameOver] = useState(false); // 게임 종료 여부

  // 🎲 GPT로 텍스트 시나리오 생성 함수
  const generateScenario = async () => {
    setIsLoading(true);
    setStory('');
		setIsGameOver(false);

    const chatPrompt = `당신은 AI 게임 마스터입니다. 플레이어에게 흥미로운 어드벤처 상황을 제시해 주세요.`;

    // ✉️ GPT-3.5-turbo에게 상황 요청
    const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${VITE_OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: '당신은 게임 마스터입니다.' },
          { role: 'user', content: chatPrompt },
        ],
      }),
    });
    const chatData = await chatResponse.json();
    const scenario = chatData.choices?.[0]?.message?.content || '상황 생성 실패';
    setStory(scenario);

    setIsLoading(false);
  };

  // 📝 유저 행동에 따른 이어지는 이야기 생성 함수
  const submitAction = async () => {
    setIsLoading(true);
    const actionPrompt = `${story}\n\n플레이어의 행동: ${userAction}\n이어서 어떤 일이 벌어질지 설명해 주세요.`;

    const actionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${VITE_OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: '당신은 게임 마스터입니다.' },
          { role: 'user', content: actionPrompt },
        ],
      }),
    });
    const actionData = await actionResponse.json();
    const nextStory = actionData.choices?.[0]?.message?.content || '이야기 생성 실패';
    setStory(nextStory);
    setUserAction('');

		// 게임 종료 여부 확인 (여기서는 예시로 story가 끝나면 게임이 종료되도록 설정)
		if (nextStory.includes('게임 끝') || nextStory.includes('끝')) {
			setIsGameOver(true);
		}

    setIsLoading(false);
  };

	// 홈으로 가기 버튼 클릭 시 동작
	const goHome = () => {
		// 홈 페이지로 이동하는 코드 (예시: window.location.href = '/home';)
		alert('홈으로 가기');
		// 여기에 실제 홈으로 이동하는 코드 추가
	}

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
            {isLoading ? '로딩 중...' : '새로운 상황 생성'}
          </button>
        </div>

        {/* 📝 시나리오 출력 */}
        {story && (
          <div className="bg-gray-100 border border-gray-300 rounded-xl p-4 text-lg whitespace-pre-wrap shadow-inner">
            {story}
          </div>
        )}

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
					<div className='flex justify-center'>
						<button
							onClick={goHome}
							className='bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6
							rounded-xl transition duration-300'
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

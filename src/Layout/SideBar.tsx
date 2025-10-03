import React, { useState, useEffect } from 'react';

const SideBar = () => {
  // 사용 가능한 DaisyUI 테마 목록
  const themes = [
    "light",
    "dark",
    "cupcake",
    "bumblebee",
    "emerald",
    "corporate",
    "synthwave",
    "retro",
    "cyberpunk",
    "valentine",
    "halloween",
    "garden",
    "forest",
    "aqua",
    "lofi",
    "pastel",
    "fantasy",
    "wireframe",
    "black",
    "luxury",
    "dracula",
    "cmyk",
    "autumn",
    "business",
    "acid",
    "lemonade",
    "night",
    "coffee",
    "winter",
  ];

  // 현재 선택된 테마를 관리하는 상태, 기본값은 'light'
  const [currentTheme, setCurrentTheme] = useState('light');

  // 컴포넌트가 마운트되거나 currentTheme가 변경될 때마다 HTML 최상위 요소에 'data-theme' 속성을 설정
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
  }, [currentTheme]);

  return (
    <div className="p-4 text-center">
      <div className="dropdown">
        <div tabIndex={0} role="button" className="btn btn-outline btn-primary m-6 px-8">
          {currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1)}
          <svg width="12px" height="12px" className="h-2 w-2 fill-current opacity-60 inline-block" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048"><path d="M1799 349l242 241-1017 1017L7 590l242-241 775 775 775-775z"></path></svg>
        </div>
        <ul tabIndex={0} className="dropdown-content z-[1] p-2 shadow-2xl bg-base-300 rounded-box w-52 max-h-96 overflow-y-auto">
          {themes.map((theme) => (
            <li key={theme}>
              <button
                className="btn btn-ghost btn-sm btn-block justify-start"
                onClick={() => setCurrentTheme(theme)}
              >
                {theme.charAt(0).toUpperCase() + theme.slice(1)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default SideBar;
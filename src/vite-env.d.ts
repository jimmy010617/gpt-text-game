/// <reference types="vite/client" />

// (선택) 자동완성/타입 강화용으로 내 변수 명시
interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

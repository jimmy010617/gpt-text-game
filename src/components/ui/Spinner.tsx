// src/components/ui/Spinner.tsx
import React from "react";

export const Spinner: React.FC<{ label: string }> = ({ label }) => (
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
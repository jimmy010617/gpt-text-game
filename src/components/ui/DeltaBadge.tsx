// src/components/ui/DeltaBadge.tsx
import React from "react";

export const DeltaBadge: React.FC<{ value?: number }> = ({ value }) => {
  if (!value) return null;
  const sign = value > 0 ? "+" : "";
  const color = value > 0 ? "text-green-600" : "text-red-600";
  return (
    <span className={`ml-2 text-xs font-semibold ${color}`}>
      {sign} {value}
    </span>
  );
};
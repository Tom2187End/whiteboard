import React from "react";

export const ButtonSelect = <T extends Object>({
  options,
  value,
  onChange,
  group,
}: {
  options: { value: T; text: string }[];
  value: T | null;
  onChange: (value: T) => void;
  group: string;
}) => (
  <div className="buttonList">
    {options.map((option) => (
      <label
        key={option.text}
        className={value === option.value ? "active" : ""}
      >
        <input
          type="radio"
          name={group}
          onChange={() => onChange(option.value)}
          checked={value === option.value ? true : false}
        />
        {option.text}
      </label>
    ))}
  </div>
);

"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface UISettingsContextType {
  hideToolMessages: boolean;
  toggleToolMessages: () => void;
}

const UISettingsContext = createContext<UISettingsContextType | undefined>(undefined);

interface UISettingsProviderProps {
  children: ReactNode;
}

export const UISettingsProvider = ({ children }: UISettingsProviderProps) => {
  const [hideToolMessages, setHideToolMessages] = useState(false);

  const toggleToolMessages = () => {
    setHideToolMessages((prev) => !prev);
  };

  return (
    <UISettingsContext.Provider value={{ hideToolMessages, toggleToolMessages }}>
      {children}
    </UISettingsContext.Provider>
  );
};

export const useUISettings = () => {
  const context = useContext(UISettingsContext);
  if (context === undefined) {
    throw new Error("useUISettings must be used within a UISettingsProvider");
  }
  return context;
};

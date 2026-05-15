"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface PreOrderContextType {
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const PreOrderContext = createContext<PreOrderContextType | null>(null);

export function PreOrderProvider({ children }: { children: ReactNode }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => setIsModalOpen(false), []);

  return (
    <PreOrderContext.Provider value={{ isModalOpen, openModal, closeModal }}>
      {children}
    </PreOrderContext.Provider>
  );
}

export function usePreOrder() {
  const ctx = useContext(PreOrderContext);
  if (!ctx) throw new Error("usePreOrder must be used within PreOrderProvider");
  return ctx;
}

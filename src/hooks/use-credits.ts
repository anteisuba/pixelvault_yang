"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { API_ENDPOINTS } from "@/constants/config";

interface UseCreditsReturn {
  credits: number;
  isLoading: boolean;
}

export function useCredits(): UseCreditsReturn {
  const { isSignedIn } = useUser();
  const [credits, setCredits] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;

    setIsLoading(true);

    fetch(API_ENDPOINTS.CREDITS)
      .then((res) => res.json())
      .then((data: { credits: number }) => setCredits(data.credits ?? 0))
      .catch(() => setCredits(0))
      .finally(() => setIsLoading(false));
  }, [isSignedIn]);

  return { credits, isLoading };
}

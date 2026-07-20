"use client";

import { useEffect, useState } from "react";

export function useSmsVerificationRequired(): boolean {
  const [required, setRequired] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/sms/config", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (active && typeof data.verificationRequired === "boolean") {
          setRequired(data.verificationRequired);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return required;
}

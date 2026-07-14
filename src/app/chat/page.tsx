"use client";

import { useEffect } from "react";

export default function ChatRedirect() {

  useEffect(() => {
    window.location.replace("/messages?tab=chat");
  }, []);

  return null;
}

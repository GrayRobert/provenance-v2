"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/songs");
  }, [router]);
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Opening your songs...</p>
    </main>
  );
}

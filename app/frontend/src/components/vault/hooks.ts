"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ToolbarState } from "./bits";

/**
 * Section-page state wired to the URL: `?q=` pre-fills the filter (global
 * search links here) and `?new=1` opens the create dialog (dashboard quick access).
 */
export function useSectionPage<T>() {
  const params = useSearchParams();
  const router = useRouter();
  const [toolbar, setToolbar] = useState<ToolbarState>({
    q: params.get("q") ?? "",
    category: "",
    tag: "",
    favorites: false,
  });
  const [editing, setEditing] = useState<T | "new" | null>(params.get("new") ? "new" : null);
  const [deleting, setDeleting] = useState<T | null>(null);

  useEffect(() => {
    const q = params.get("q");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follow global-search navigation
    if (q !== null) setToolbar((t) => ({ ...t, q }));
    if (params.get("new")) setEditing("new");
  }, [params]);

  const closeEditor = () => {
    setEditing(null);
    if (params.get("new")) router.replace(window.location.pathname);
  };

  return { toolbar, setToolbar, editing, setEditing, closeEditor, deleting, setDeleting };
}

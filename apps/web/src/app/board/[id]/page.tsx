import React from "react";
import { BoardWorkspace } from "@/components/BoardWorkspace";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BoardWorkspace boardId={id} />;
}

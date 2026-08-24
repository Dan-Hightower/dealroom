import type * as React from "react";
import { RoomShell } from "@/components/room-shell";

export default function RoomLayout({
	children,
}: {
	children: React.ReactNode;
}): React.JSX.Element {
	return <RoomShell>{children}</RoomShell>;
}

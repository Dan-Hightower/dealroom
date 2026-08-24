import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type * as React from "react";
import { auth } from "@/lib/auth";

export default async function AppLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session) redirect("/sign-in");

	return <>{children}</>;
}

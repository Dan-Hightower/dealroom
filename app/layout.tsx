import type { Metadata } from "next";
import type * as React from "react";
import { TrpcProvider } from "@/trpc/client";
import "./globals.css";

export const metadata: Metadata = {
	title: "Deal Room",
	description: "Turn an X group chat into a searchable deal flow directory.",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<body>
				<TrpcProvider>{children}</TrpcProvider>
			</body>
		</html>
	);
}

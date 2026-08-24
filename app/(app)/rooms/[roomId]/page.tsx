"use client";

import { useRoom } from "@/components/room-shell";
import { Button, Empty, HandleLink, Table, Td, Th } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/utils";
import { trpc } from "@/trpc/client";

export default function OverviewPage() {
	const { roomId } = useRoom();
	const utils = trpc.useUtils();
	const overview = trpc.overview.useQuery(
		{ roomId },
		{ enabled: Boolean(roomId) },
	);
	const reextract = trpc.reextract.useMutation();

	if (!overview.data) {
		return <Empty>Hit Refresh to pull this thread in.</Empty>;
	}

	const { room, recentDeals, recentInterests } = overview.data;

	async function reread(full: boolean) {
		if (!roomId) return;
		await reextract.mutateAsync({ roomId, full });
		await utils.invalidate();
	}

	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-muted-foreground text-sm">
					<Count n={room._count.members} label="members" />
					{" · "}
					<Count n={room._count.startups} label="startups" />
					{" · "}
					<Count n={room._count.deals} label="deals" />
					{" · "}
					<Count n={room._count.sources} label="sources" />
					{" · "}
					<Count n={room._count.interests} label="interest signals" />
					{room.lastExtractedAt
						? ` · last read ${formatDateTime(room.lastExtractedAt)}`
						: null}
				</p>

				<div className="flex gap-2">
					<Button
						disabled={reextract.isPending}
						onClick={() => reread(false)}
						size="sm"
						variant="outline"
					>
						Re-read new messages
					</Button>
					<Button
						disabled={reextract.isPending}
						onClick={() => reread(true)}
						size="sm"
						variant="ghost"
					>
						Re-read everything
					</Button>
				</div>
			</div>

			{reextract.data && !reextract.data.ran ? (
				<p className="text-muted-foreground text-sm">{reextract.data.reason}</p>
			) : null}

			<section className="space-y-3">
				<h2 className="font-semibold tracking-tight">Latest deals</h2>
				{recentDeals.length ? (
					<Table>
						<thead>
							<tr>
								<Th>Startup</Th>
								<Th>Shared by</Th>
								<Th>When</Th>
								<Th>Pitch</Th>
								<Th className="text-right">Interest</Th>
							</tr>
						</thead>
						<tbody>
							{recentDeals.map((deal) => (
								<tr key={deal.id}>
									<Td className="font-medium">{deal.startup.name}</Td>
									<Td>
										<HandleLink
											handle={deal.sharedByHandle}
											name={deal.sharedByName}
										/>
									</Td>
									<Td className="whitespace-nowrap text-muted-foreground tabular-nums">
										{formatDate(deal.sharedAt)}
									</Td>
									<Td className="max-w-md text-muted-foreground">
										{deal.blurb ?? "—"}
									</Td>
									<Td className="text-right tabular-nums">
										{deal._count.interests}
									</Td>
								</tr>
							))}
						</tbody>
					</Table>
				) : (
					<Empty>No deals extracted yet.</Empty>
				)}
			</section>

			<section className="space-y-3">
				<h2 className="font-semibold tracking-tight">Latest interest</h2>
				{recentInterests.length ? (
					<Table>
						<thead>
							<tr>
								<Th>Who</Th>
								<Th>In what</Th>
								<Th>Email</Th>
								<Th>Note</Th>
								<Th>When</Th>
							</tr>
						</thead>
						<tbody>
							{recentInterests.map((interest) => (
								<tr key={interest.id}>
									<Td className="font-medium">
										<HandleLink
											handle={interest.personHandle}
											name={interest.personName}
										/>
									</Td>
									<Td>
										{interest.startup?.name ??
											interest.dealFlowSource?.name ??
											"—"}
									</Td>
									<Td className="text-muted-foreground">
										{interest.personEmail ?? "—"}
									</Td>
									<Td className="max-w-md text-muted-foreground">
										{interest.note ?? "—"}
									</Td>
									<Td className="whitespace-nowrap text-muted-foreground tabular-nums">
										{formatDate(interest.expressedAt)}
									</Td>
								</tr>
							))}
						</tbody>
					</Table>
				) : (
					<Empty>Nobody has raised their hand yet.</Empty>
				)}
			</section>
		</div>
	);
}

function Count({ n, label }: { n: number; label: string }) {
	return (
		<>
			<span className="font-medium text-foreground tabular-nums">{n}</span>{" "}
			{label}
		</>
	);
}

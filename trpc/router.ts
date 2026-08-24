import { TRPCError } from "@trpc/server";
import { canReadX, getCredentials, saveCredentials } from "@/lib/credentials";
import { prisma } from "@/lib/db";
import {
	getOverview,
	listDeals,
	listMembers,
	listRooms,
	listSources,
	listStartups,
	searchCounts,
} from "@/lib/dealflow/queries";
import {
	createRoomSchema,
	credentialsSchema,
	deleteRoomSchema,
	listSchema,
	optionalRoomSchema,
	reextractSchema,
	syncRoomSchema,
	updateRoomSchema,
} from "@/lib/dealflow/schemas";
import {
	normalizeChatUrl,
	runDealRoomExtraction,
	syncXRoom,
} from "@/lib/dealflow/service";
import { listXConversations } from "@/lib/dealflow/x-chat";
import { maskSecret } from "@/lib/secrets";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

async function ownRoomOrThrow(userId: string, roomId: string) {
	const room = await prisma.dealRoom.findFirst({
		where: { id: roomId, userId },
		select: { id: true },
	});

	if (!room) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
	}

	return room;
}

export const appRouter = createTRPCRouter({
	rooms: protectedProcedure.query(({ ctx }) => listRooms(ctx.user.id)),

	overview: protectedProcedure
		.input(optionalRoomSchema)
		.query(({ ctx, input }) => getOverview(ctx.user.id, input?.roomId)),

	members: protectedProcedure
		.input(listSchema)
		.query(({ ctx, input }) => listMembers({ userId: ctx.user.id, ...input })),

	startups: protectedProcedure
		.input(listSchema)
		.query(({ ctx, input }) => listStartups({ userId: ctx.user.id, ...input })),

	deals: protectedProcedure
		.input(listSchema)
		.query(({ ctx, input }) => listDeals({ userId: ctx.user.id, ...input })),

	sources: protectedProcedure
		.input(listSchema)
		.query(({ ctx, input }) => listSources({ userId: ctx.user.id, ...input })),

	searchCounts: protectedProcedure.input(listSchema).query(({ ctx, input }) =>
		searchCounts({
			userId: ctx.user.id,
			roomId: input.roomId,
			search: input.search ?? "",
		}),
	),

	createRoom: protectedProcedure
		.input(createRoomSchema)
		.mutation(async ({ ctx, input }) => {
			const chatUrl = input.chatUrl ? normalizeChatUrl(input.chatUrl) : null;
			// X addresses a conversation by id. A pasted URL ends in one.
			const conversationId =
				input.conversationId ||
				chatUrl?.split("/").filter(Boolean).at(-1) ||
				null;

			const existing = conversationId
				? await prisma.dealRoom.findFirst({
						where: { userId: ctx.user.id, conversationId },
						select: { id: true },
					})
				: null;

			if (existing) {
				return prisma.dealRoom.update({
					where: { id: existing.id },
					data: { name: input.name },
					select: { id: true, name: true, chatUrl: true },
				});
			}

			return prisma.dealRoom.create({
				data: {
					userId: ctx.user.id,
					name: input.name,
					platform: "x",
					chatUrl,
					conversationId,
				},
				select: { id: true, name: true, chatUrl: true },
			});
		}),

	/// The chats this account can see on X, for picking one to track.
	xConversations: protectedProcedure.query(async ({ ctx }) => {
		const credentials = await getCredentials(ctx.user.id);
		if (!canReadX(credentials)) return [];

		try {
			return await listXConversations(credentials);
		} catch (error) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: error instanceof Error ? error.message : "X request failed",
			});
		}
	}),

	syncRoom: protectedProcedure
		.input(syncRoomSchema)
		.mutation(async ({ ctx, input }) => {
			await ownRoomOrThrow(ctx.user.id, input.roomId);

			try {
				return await syncXRoom({
					userId: ctx.user.id,
					roomId: input.roomId,
					maxEvents: input.maxEvents,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error.message : "Sync failed",
				});
			}
		}),

	/// Never returns a secret, only whether one is set.
	credentials: protectedProcedure.query(async ({ ctx }) => {
		const credentials = await getCredentials(ctx.user.id);

		return {
			xUsername: credentials.xUsername,
			hasXAccess: Boolean(credentials.xAccessToken),
			hasXChatPin: Boolean(credentials.xChatPin),
			xaiApiKey: maskSecret(credentials.xaiApiKey),
		};
	}),

	saveCredentials: protectedProcedure
		.input(credentialsSchema)
		.mutation(async ({ ctx, input }) => {
			await saveCredentials(ctx.user.id, input);
			return { ok: true };
		}),

	updateRoom: protectedProcedure
		.input(updateRoomSchema)
		.mutation(async ({ ctx, input }) => {
			await ownRoomOrThrow(ctx.user.id, input.roomId);

			return prisma.dealRoom.update({
				where: { id: input.roomId },
				data: {
					name: input.name || undefined,
					description: input.description ?? undefined,
					chatUrl: input.chatUrl ? normalizeChatUrl(input.chatUrl) : undefined,
				},
				select: { id: true, name: true, chatUrl: true },
			});
		}),

	deleteRoom: protectedProcedure
		.input(deleteRoomSchema)
		.mutation(async ({ ctx, input }) => {
			await ownRoomOrThrow(ctx.user.id, input.roomId);
			await prisma.dealRoom.delete({ where: { id: input.roomId } });
			return { id: input.roomId };
		}),

	/// Re-runs Grok over stored messages. No scraping, so it is safe to repeat.
	reextract: protectedProcedure
		.input(reextractSchema)
		.mutation(({ ctx, input }) =>
			runDealRoomExtraction({
				userId: ctx.user.id,
				roomId: input.roomId,
				full: input.full,
			}),
		),
});

export type AppRouter = typeof appRouter;

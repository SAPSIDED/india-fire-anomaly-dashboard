import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { evaluateCorroboration } from "./corroboration";
import { recordIncidentEvidence } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  corroboration: router({
    run: publicProcedure
      .input(z.object({
        detectionId: z.string().min(1),
        lat: z.number().min(6).max(38),
        lng: z.number().min(68).max(98),
      }))
      .mutation(({ input }) => evaluateCorroboration(input)),
  }),

  incidentEvidence: router({
    record: adminProcedure
      .input(z.object({
        detectionId: z.string().min(1).max(96),
        lat: z.number().min(6).max(38),
        lng: z.number().min(68).max(98),
        sourceType: z.enum(["authority", "facility"]),
        sourceName: z.string().trim().min(3).max(160),
        sourceUrl: z.string().url().max(1024).refine(value => new URL(value).protocol === "https:", "An HTTPS source URL is required."),
        incidentReference: z.string().trim().min(3).max(255),
        reportedAt: z.string().refine(value => Number.isFinite(Date.parse(value)), "A valid report time is required."),
        details: z.string().trim().min(20).max(2_000),
      }))
      .mutation(async ({ input, ctx }) => {
        const reportedAt = new Date(input.reportedAt);
        const now = new Date();
        const ageMs = now.getTime() - reportedAt.getTime();
        if (reportedAt.getTime() > now.getTime() + 30 * 60_000 || ageMs > 48 * 60 * 60_000) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Authority or facility evidence must be time-aligned: no more than 48 hours old and not materially in the future.",
          });
        }

        const expiresAt = new Date(reportedAt.getTime() + 48 * 60 * 60_000);
        await recordIncidentEvidence({
          detectionId: input.detectionId,
          latitude: input.lat.toFixed(6),
          longitude: input.lng.toFixed(6),
          sourceType: input.sourceType,
          sourceName: input.sourceName,
          sourceUrl: input.sourceUrl,
          incidentReference: input.incidentReference,
          reportedAt,
          expiresAt,
          details: input.details,
          verifiedByUserId: ctx.user.id,
        });

        return { recorded: true, expiresAt } as const;
      }),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;

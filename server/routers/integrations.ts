import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../_core/trpc";
import { encrypt } from "../crypto";
import {
  listVendorIntegrations,
  getVendorIntegration,
  upsertVendorIntegration,
  deleteVendorIntegration,
} from "../db";
import { syncVendorIntegration } from "../emailSync";

export const integrationsRouter = router({
  list: adminProcedure.query(async () => {
    const rows = await listVendorIntegrations();
    return rows.map(({ encryptedPassword: _pw, ...rest }) => rest);
  }),

  save: adminProcedure
    .input(
      z.object({
        id: z.number().optional(),
        vendorName: z.string().min(1).max(64),
        connectionType: z.string().default("imap"),
        email: z.string().email(),
        password: z.string().min(1).optional(),
        config: z
          .object({
            imapHost: z.string().optional(),
            imapPort: z.number().optional(),
            shipToFilter: z.string().optional(),
            senderFilter: z.string().optional(),
          })
          .optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { password, ...rest } = input;
      const encryptedPassword = password ? encrypt(password) : undefined;
      await upsertVendorIntegration({
        ...rest,
        ...(encryptedPassword !== undefined ? { encryptedPassword } : {}),
      });
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteVendorIntegration(input.id);
      return { success: true };
    }),

  sync: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const integration = await getVendorIntegration(input.id);
      if (!integration) throw new TRPCError({ code: "NOT_FOUND", message: "Integration not found" });
      return syncVendorIntegration(integration, ctx.user.id);
    }),
});

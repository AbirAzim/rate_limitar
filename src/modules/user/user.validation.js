import { z } from 'zod';

export const userIdParamSchema = z.object({
  id: z.string().trim().min(1, 'id is required'),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(100),
  email: z.email('email must be valid'),
});

export const updateUserSchema = createUserSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'At least one field is required');

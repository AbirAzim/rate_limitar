import { Router } from 'express';
import { validate } from '../../middlewares/index.js';
import userController from './user.controller.js';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  userIdParamSchema,
} from './user.validation.js';

const router = Router();

router
  .route('/')
  .get(validate({ query: listUsersQuerySchema }), userController.list)
  .post(validate({ body: createUserSchema }), userController.create);

router
  .route('/:id')
  .get(validate({ params: userIdParamSchema }), userController.getById)
  .put(validate({ params: userIdParamSchema, body: createUserSchema }), userController.replace)
  .patch(validate({ params: userIdParamSchema, body: updateUserSchema }), userController.update)
  .delete(validate({ params: userIdParamSchema }), userController.remove);

export default router;

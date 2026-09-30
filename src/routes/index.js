import { Router } from 'express';
import userRoutes from '../modules/user/user.routes.js';

const router = Router();

// Register feature modules here
router.use('/users', userRoutes);

export default router;

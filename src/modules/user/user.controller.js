import { sendSuccess } from '../../utils/ApiResponse.js';
import userService from './user.service.js';

// Express 5 forwards rejected promises to the error handler automatically,
// so no try/catch or asyncHandler wrapper is needed here.
const userController = {
  async list(req, res) {
    const data = await userService.findAll(req.validatedQuery);
    sendSuccess(res, {
      message: 'GET request invoked: list users',
      data,
      contentType: 'application/json',
    });
  },

  async getById(req, res) {
    const data = await userService.findById(req.params.id);
    sendSuccess(res, {
      message: 'GET request invoked: get user by id',
      data,
      contentType: 'application/json',
    });
  },

  async create(req, res) {
    const data = await userService.create(req.body);
    sendSuccess(res, {
      statusCode: 201,
      message: 'POST request invoked: create user',
      data,
      contentType: 'application/json',
    });
  },

  async replace(req, res) {
    const data = await userService.replace(req.params.id, req.body);
    sendSuccess(res, {
      message: 'PUT request invoked: replace user',
      data,
      contentType: 'application/json',
    });
  },

  async update(req, res) {
    const data = await userService.update(req.params.id, req.body);
    sendSuccess(res, {
      message: 'PATCH request invoked: update user',
      data,
      contentType: 'application/json',
    });
  },

  async remove(req, res) {
    const data = await userService.remove(req.params.id);
    sendSuccess(res, {
      message: 'DELETE request invoked: remove user',
      data,
      contentType: 'application/json',
    });
  },
};

export default userController;

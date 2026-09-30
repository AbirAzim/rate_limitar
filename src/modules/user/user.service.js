import logger from '../../utils/logger.js';

/**
 * Business logic layer. No database is wired up — each method logs the
 * operation and echoes back what would have been persisted. Swap these
 * bodies for a repository/ORM call when you add a real data store.
 */
const userService = {
  async findAll({ page, limit }) {
    logger.info('GET all users invoked', { page, limit });
    return { operation: 'findAll', page, limit };
  },

  async findById(id) {
    logger.info('GET user by id invoked', { id });
    return { operation: 'findById', id };
  },

  async create(payload) {
    logger.info('POST create user invoked', { payload });
    return { operation: 'create', ...payload };
  },

  async update(id, payload) {
    logger.info('PATCH update user invoked', { id, payload });
    return { operation: 'update', id, ...payload };
  },

  async replace(id, payload) {
    logger.info('PUT replace user invoked', { id, payload });
    return { operation: 'replace', id, ...payload };
  },

  async remove(id) {
    logger.info('DELETE user invoked', { id });
    return { operation: 'remove', id };
  },
};

export default userService;

import { z } from 'zod';
import ApiError from '../utils/ApiError.js';

/**
 * Validates req.params / req.query / req.body against zod schemas.
 * Usage: validate({ params: idParamSchema, body: createUserSchema })
 */
const validate = (schemas) => (req, res, next) => {
  const errors = {};

  for (const key of ['params', 'query', 'body']) {
    if (!schemas[key]) continue;

    const result = schemas[key].safeParse(req[key] ?? {});
    if (!result.success) {
      errors[key] = z.flattenError(result.error).fieldErrors;
    } else if (key === 'query') {
      // req.query is a getter in Express 5; store parsed values separately
      req.validatedQuery = result.data;
    } else {
      req[key] = result.data;
    }
  }

  if (Object.keys(errors).length) {
    return next(ApiError.badRequest('Validation failed', errors));
  }
  next();
};

export default validate;

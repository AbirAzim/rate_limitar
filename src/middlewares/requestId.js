import { randomUUID } from 'node:crypto';

const requestId = (req, res, next) => {
  const id = req.get('x-request-id') || randomUUID();
  req.id = id;
  res.locals.requestId = id;
  res.setHeader('x-request-id', id);
  next();
};

export default requestId;

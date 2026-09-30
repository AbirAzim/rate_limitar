import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';
import createApp from '../src/app.js';

const app = createApp();
const base = '/api/v1/users';

describe('Users API', () => {
  it('GET /users lists users with default pagination', async () => {
    const res = await request(app).get(base).expect(200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data, { operation: 'findAll', page: 1, limit: 10 });
    assert.ok(res.headers['x-request-id']);
  });

  it('GET /users/:id returns the user', async () => {
    const res = await request(app).get(`${base}/42`).expect(200);
    assert.deepEqual(res.body.data, { operation: 'findById', id: '42' });
  });

  it('POST /users creates a user', async () => {
    const body = { name: 'Ada', email: 'ada@example.com' };
    const res = await request(app).post(base).send(body).expect(201);
    assert.deepEqual(res.body.data, { operation: 'create', ...body });
  });

  it('POST /users rejects invalid payload', async () => {
    const res = await request(app).post(base).send({ name: '' }).expect(400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.errors.body.email);
  });

  it('POST /users rejects malformed JSON', async () => {
    await request(app)
      .post(base)
      .set('Content-Type', 'application/json')
      .send('{"bad json"')
      .expect(400);
  });

  it('PUT /users/:id replaces a user', async () => {
    const body = { name: 'Ada', email: 'ada@example.com' };
    const res = await request(app).put(`${base}/1`).send(body).expect(200);
    assert.deepEqual(res.body.data, { operation: 'replace', id: '1', ...body });
  });

  it('PATCH /users/:id partially updates a user', async () => {
    const res = await request(app).patch(`${base}/1`).send({ name: 'Grace' }).expect(200);
    assert.deepEqual(res.body.data, { operation: 'update', id: '1', name: 'Grace' });
  });

  it('PATCH /users/:id rejects empty body', async () => {
    await request(app).patch(`${base}/1`).send({}).expect(400);
  });

  it('DELETE /users/:id removes a user', async () => {
    const res = await request(app).delete(`${base}/1`).expect(200);
    assert.deepEqual(res.body.data, { operation: 'remove', id: '1' });
  });
});

describe('Infrastructure', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health').expect(200);
    assert.equal(res.body.status, 'ok');
  });

  it('unknown route returns 404', async () => {
    const res = await request(app).get('/nope').expect(404);
    assert.equal(res.body.success, false);
  });
});

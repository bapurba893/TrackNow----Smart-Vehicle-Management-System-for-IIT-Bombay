const { start, stop, reset } = require('./setup');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { tempUser, redUser } = require('../models/tempuser_reduser');
const users = require('../models/users');
const { redListExpiredVisitors } = require('../jobs/cron');

beforeAll(start);
afterAll(stop);
beforeEach(reset);

const signup = (role, id, extra = {}) =>
  request(app).post(`/${role}/signup`).send({ rollNoOrPlate: id, password: 'secret123', ...extra });

const guardToken = async () => (await signup('security', 'GUARD1', { signupCode: 'GATE-2025' })).body.token;

const issuePass = (token, body) =>
  request(app).post('/adduser/tempadd').set('Authorization', `Bearer ${token}`).send(body);

const redeem = (passToken) => request(app).post('/adduser/templogin').set('Authorization', `Bearer ${passToken}`);

describe('Accounts and access control', () => {
  test('E01 student can sign up and log in; password is stored hashed and never returned', async () => {
    const res = await signup('user', '23m0001');
    expect(res.status).toBe(201);
    expect(res.body.user.rollNoOrPlate).toBe('23M0001');
    expect(JSON.stringify(res.body)).not.toMatch(/secret123|password/);
    const stored = await users.findOne({ rollNoOrPlate: '23M0001' });
    expect(stored.password).not.toBe('secret123');

    const login = await request(app).post('/user/login').send({ rollNoOrPlate: '23m0001', password: 'secret123' });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
  });

  test('E02 wrong password returns 401 and does not crash the server', async () => {
    await signup('driver', 'MH01AB1234');
    const bad = await request(app).post('/driver/login').send({ rollNoOrPlate: 'MH01AB1234', password: 'nope' });
    expect(bad.status).toBe(401);
    const unknown = await request(app).post('/driver/login').send({ rollNoOrPlate: 'XX', password: 'nope' });
    expect(unknown.status).toBe(401);
    // server still responds afterwards
    expect((await request(app).get('/health')).status).toBe(200);
  });

  test('E03 duplicate signup returns 409 instead of crashing', async () => {
    await signup('user', '23M0002');
    expect((await signup('user', '23M0002')).status).toBe(409);
  });

  test('E04 two different users may choose the same password', async () => {
    expect((await signup('user', 'A1')).status).toBe(201);
    expect((await signup('user', 'A2')).status).toBe(201);
  });

  test('E05 security signup requires the signup code', async () => {
    expect((await signup('security', 'G1')).status).toBe(403);
    expect((await signup('security', 'G1', { signupCode: 'wrong' })).status).toBe(403);
    expect((await signup('security', 'G1', { signupCode: 'GATE-2025' })).status).toBe(201);
  });

  test('E06 a student token cannot issue passes or read visitor data', async () => {
    const student = (await signup('user', '23M0003')).body.token;
    expect((await issuePass(student, { plate: 'MH02CD5678', type: 'cab', minutes: 30 })).status).toBe(403);
    const list = await request(app).get('/manageuser/activeuser').set('Authorization', `Bearer ${student}`);
    expect(list.status).toBe(403);
    expect((await request(app).get('/manageuser/activeuser')).status).toBe(401);
  });

  test("E07 a user can change only their own password", async () => {
    const a = (await signup('user', 'U1')).body;
    const b = (await signup('user', 'U2')).body;
    const other = await request(app)
      .put(`/changepassword/${b.user.id}`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ password: 'hacked1' });
    expect(other.status).toBe(403);
    const own = await request(app)
      .put(`/changepassword/${a.user.id}`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ password: 'newpass1' });
    expect(own.status).toBe(200);
    const login = await request(app).post('/user/login').send({ rollNoOrPlate: 'U1', password: 'newpass1' });
    expect(login.status).toBe(200);
  });

  test('E08 forged token (wrong secret) is rejected', async () => {
    const forged = jwt.sign({ id: 'x', role: 'security' }, 'not-the-secret');
    const res = await request(app).get('/manageuser/activeuser').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(403);
  });
});

describe('Visitor passes (QR flow)', () => {
  test('E09 guard issues a pass, visitor redeems it once, gets a timed session', async () => {
    const guard = await guardToken();
    const pass = await issuePass(guard, { plate: 'mh 02 cd 5678', type: 'delivery', minutes: 30 });
    expect(pass.status).toBe(200);

    const first = await redeem(pass.body.token);
    expect(first.status).toBe(200);
    expect(first.body.payload.plate).toBe('MH02CD5678');
    expect(first.body.payload.type).toBe('delivery');

    const home = await request(app).get('/tempuserhome').set('Authorization', `Bearer ${first.body.token}`);
    expect(home.status).toBe(200);
    expect(home.body.secondsLeft).toBeGreaterThan(29 * 60);
    expect(home.body.secondsLeft).toBeLessThanOrEqual(30 * 60);

    expect((await redeem(pass.body.token)).status).toBe(409); // QR reuse blocked
  });

  test('E10 invalid plate, type or duration is rejected at issue time', async () => {
    const guard = await guardToken();
    expect((await issuePass(guard, { plate: 'HELLO', type: 'cab', minutes: 10 })).status).toBe(400);
    expect((await issuePass(guard, { plate: 'MH01AB1234', type: 'tank', minutes: 10 })).status).toBe(400);
    expect((await issuePass(guard, { plate: 'MH01AB1234', type: 'cab', minutes: 0 })).status).toBe(400);
    expect((await issuePass(guard, { plate: 'MH01AB1234', type: 'cab', minutes: 99999 })).status).toBe(400);
  });

  test('E11 the QR pass token itself cannot be used as a session', async () => {
    const guard = await guardToken();
    const pass = await issuePass(guard, { plate: 'MH01AB1234', type: 'cab', minutes: 10 });
    const res = await request(app).get('/tempuserhome').set('Authorization', `Bearer ${pass.body.token}`);
    expect(res.status).toBe(403);
  });

  test('E12 a second pass for a vehicle that is still inside is refused', async () => {
    const guard = await guardToken();
    const p1 = await issuePass(guard, { plate: 'MH01AB1234', type: 'cab', minutes: 10 });
    const p2 = await issuePass(guard, { plate: 'MH01AB1234', type: 'cab', minutes: 10 });
    expect((await redeem(p1.body.token)).status).toBe(200);
    expect((await redeem(p2.body.token)).status).toBe(409);
  });
});

describe('Red list', () => {
  test('E13 overstaying vehicle is red-listed, counted, and flagged on its next visit', async () => {
    const guard = await guardToken();
    const pass = await issuePass(guard, { plate: 'MH03EF9012', type: 'cab', minutes: 5 });
    await redeem(pass.body.token);

    // Nothing happens before the pass expires
    expect(await redListExpiredVisitors(new Date())).toBe(0);
    // Six minutes later the job red-lists it
    expect(await redListExpiredVisitors(new Date(Date.now() + 6 * 60000))).toBe(1);
    expect((await tempUser.findOne({ plate: 'MH03EF9012' })).status).toBe('red');
    expect((await redUser.findOne({ plate: 'MH03EF9012' })).count).toBe(1);

    const check = await request(app)
      .get('/adduser/checkredlist?plate=MH03EF9012')
      .set('Authorization', `Bearer ${guard}`);
    expect(check.body).toEqual({ isRed: true, count: 1 });
  });

  test('E14 a red-listed vehicle can still be let in again (guard decides) and is counted again', async () => {
    const guard = await guardToken();
    const p1 = await issuePass(guard, { plate: 'MH03EF9012', type: 'cab', minutes: 5 });
    await redeem(p1.body.token);
    await redListExpiredVisitors(new Date(Date.now() + 6 * 60000));

    const p2 = await issuePass(guard, { plate: 'MH03EF9012', type: 'cab', minutes: 5 });
    expect((await redeem(p2.body.token)).status).toBe(200); // previously failed forever with 409
    await redListExpiredVisitors(new Date(Date.now() + 6 * 60000));
    expect((await redUser.findOne({ plate: 'MH03EF9012' })).count).toBe(2);
  });

  test('E15 guard can remove a visitor; removed visitor session ends', async () => {
    const guard = await guardToken();
    const pass = await issuePass(guard, { plate: 'MH04GH3456', type: 'auto', minutes: 10 });
    const visitor = (await redeem(pass.body.token)).body;
    const del = await request(app)
      .delete(`/manageuser/removeuser/${visitor.payload.userId}`)
      .set('Authorization', `Bearer ${guard}`);
    expect(del.status).toBe(200);
    const home = await request(app).get('/tempuserhome').set('Authorization', `Bearer ${visitor.token}`);
    expect(home.status).toBe(401);
  });
});

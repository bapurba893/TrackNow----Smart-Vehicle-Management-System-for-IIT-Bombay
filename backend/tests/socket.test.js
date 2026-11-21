const { start, stop, reset } = require('./setup');
const http = require('http');
const request = require('supertest');
const { Server } = require('socket.io');
const { io: connect } = require('socket.io-client');
const app = require('../app');
const initTrackingSocket = require('../socketserver/trackingSocket');
const initSecuritySocket = require('../socketserver/securitySocket');

let server;
let url;
const sockets = [];

beforeAll(async () => {
  await start();
  server = http.createServer(app);
  const io = new Server(server);
  initTrackingSocket(io);
  initSecuritySocket(io);
  await new Promise((r) => server.listen(0, r));
  url = `http://localhost:${server.address().port}`;
});
afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await new Promise((r) => server.close(r));
  await stop();
});
beforeEach(reset);

const client = (ns, token) => {
  const s = connect(`${url}${ns}`, { auth: { token }, transports: ['websocket'], forceNew: true });
  sockets.push(s);
  return s;
};
const waitFor = (socket, event, predicate = () => true, ms = 5000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    const h = (data) => {
      if (predicate(data)) {
        clearTimeout(t);
        socket.off(event, h);
        resolve(data);
      }
    };
    socket.on(event, h);
  });
const token = async (role, id, extra = {}) =>
  (await request(app).post(`/${role}/signup`).send({ rollNoOrPlate: id, password: 'secret123', ...extra })).body.token;

test('E16 sockets without a valid token are refused', async () => {
  const s = client('/tracking', 'garbage');
  const err = await new Promise((r) => s.on('connect_error', r));
  expect(err.message).toBe('unauthorized');
});

test('E17 driver location reaches students in real time, keyed by the plate in the token', async () => {
  const [driverToken, studentToken] = [await token('driver', 'MH01AB1234'), await token('user', '23M0001')];
  const driver = client('/tracking', driverToken);
  const student = client('/tracking', studentToken);
  await Promise.all([waitFor(student, 'driversUpdate'), waitFor(driver, 'driversUpdate')]);

  const got = waitFor(student, 'driversUpdate', (d) => d.MH01AB1234);
  driver.emit('driverLocation', { plate: 'FAKE', lat: 19.1334, lng: 72.9133 });
  const update = await got;
  expect(update.MH01AB1234).toMatchObject({ lat: 19.1334, lng: 72.9133 });
  expect(update.FAKE).toBeUndefined();

  // A student cannot pretend to be a bus
  const sneaky = jest.fn();
  student.on('driversUpdate', sneaky);
  student.emit('driverLocation', { lat: 19.13, lng: 72.91 });
  await new Promise((r) => setTimeout(r, 300));
  expect(sneaky).not.toHaveBeenCalled();
});

test('E18 visitor location is visible to guards only, not to students', async () => {
  const guard = await token('security', 'G1', { signupCode: 'GATE-2025' });
  const pass = await request(app)
    .post('/adduser/tempadd')
    .set('Authorization', `Bearer ${guard}`)
    .send({ plate: 'MH02CD5678', type: 'cab', minutes: 30 });
  const visitor = (await request(app).post('/adduser/templogin').set('Authorization', `Bearer ${pass.body.token}`))
    .body.token;

  const guardSock = client('/security', guard);
  await waitFor(guardSock, 'tempUsersUpdate');
  const studentSock = client('/security', await token('user', '23M0009'));
  const kicked = new Promise((r) => studentSock.on('disconnect', r));

  const visitorSock = client('/security', visitor);
  await new Promise((r) => visitorSock.on('connect', r));
  const seen = waitFor(guardSock, 'tempUsersUpdate', (list) => list.length === 1);
  visitorSock.emit('tempUserLocation', { lat: 19.131, lng: 72.915 });
  const [entry] = await seen;
  expect(entry).toMatchObject({ plate: 'MH02CD5678', type: 'cab', lat: 19.131, lng: 72.915 });
  await kicked;
});

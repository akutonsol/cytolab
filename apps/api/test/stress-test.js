import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 10 },
    { duration: '3m', target: 25 },
    { duration: '3m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '2m', target: 0 },
  ],
  summaryTrendStats: ['avg','min','med','p(90)','p(95)','p(99)','max'],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE = 'http://localhost:4000/api/v1';

export default function () {
  const health = http.get(`${BASE}/health`);
  check(health, { 'health ok': (r) => r.status === 200 });

  const headers = { Authorization: `Bearer ${__ENV.TOKEN}` };
  const patients = http.get(`${BASE}/patients?page=1&pageSize=10`, { headers });
  check(patients, { 'patients ok': (r) => r.status === 200 });
  const specimens = http.get(`${BASE}/specimens?page=1&pageSize=10`, { headers });
  check(specimens, { 'specimens ok': (r) => r.status === 200 });
  const dashboard = http.get(`${BASE}/analytics/home`, { headers });
  check(dashboard, { 'dashboard ok': (r) => r.status < 400 });

  sleep(1);
}

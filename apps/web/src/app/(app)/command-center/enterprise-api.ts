// Phase 5 · E3A — the ONLY data source for the Enterprise Command Center: the
// three certified E2 endpoints. No owner-service calls, no local queue logic.
import { api } from '@/lib/api';
import type {
  EnterpriseQueueCatalogResponse,
  EnterpriseQueueDetailResponse,
  EnterpriseSummaryResponse,
} from './types';

export const getEnterpriseSummary = () =>
  api.get<EnterpriseSummaryResponse>('/enterprise/summary').then((r) => r.data);

export const getEnterpriseQueues = () =>
  api.get<EnterpriseQueueCatalogResponse>('/enterprise/queues').then((r) => r.data);

export const getEnterpriseQueueDetail = (queue: string, page: number, pageSize: number) =>
  api
    .get<EnterpriseQueueDetailResponse>(`/enterprise/queues/${queue}`, { params: { page, pageSize } })
    .then((r) => r.data);

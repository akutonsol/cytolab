'use client';

import { Select } from 'antd';
import type { SelectProps } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface RemoteSelectProps extends Omit<SelectProps, 'options' | 'loading'> {
  /** API path to fetch options from (e.g. '/clients'). */
  endpoint: string;
  queryKey: string;
  /** Map the raw response into Select options. */
  transform: (data: any) => { label: string; value: string }[];
}

/**
 * Select whose options come from an API endpoint. Used inside create drawers
 * (role/permission/client/patient pickers). value/onChange are injected by the
 * surrounding Form.Item and forwarded through `...rest`.
 */
export function RemoteSelect({ endpoint, queryKey, transform, ...rest }: RemoteSelectProps) {
  const { data, isFetching } = useQuery({
    queryKey: [queryKey],
    queryFn: () => api.get(endpoint).then((r) => r.data),
  });
  return (
    <Select
      showSearch
      optionFilterProp="label"
      loading={isFetching}
      options={data ? transform(data) : []}
      {...rest}
    />
  );
}

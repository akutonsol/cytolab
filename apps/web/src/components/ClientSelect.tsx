'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Select } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';

interface ClientRow {
  id: string;
  firstName: string;
  lastName: string;
  officeName?: string | null;
  email?: string | null;
}

export function clientLabel(c: ClientRow): string {
  const parts = [`${c.firstName} ${c.lastName}`.trim()];
  if (c.officeName) parts.push(c.officeName);
  if (c.email) parts.push(c.email);
  return parts.join(' · ');
}

interface Props {
  value?: string;
  onChange?: (value: string | undefined) => void;
  /** Seed option so a pre-selected client (edit mode) shows its label immediately. */
  initialOption?: { value: string; label: string };
  placeholder?: string;
}

/**
 * Searchable client picker. Searches the API by name OR email (server-side
 * `/clients?q=`), debounced, so it works against the full client list rather
 * than only what's already loaded.
 */
export function ClientSelect({ value, onChange, initialOption, placeholder }: Props) {
  const [term, setTerm] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  const onSearch = (q: string) => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setTerm(q), 300);
  };
  useEffect(() => () => clearTimeout(debounce.current), []);

  const { data, isFetching } = useQuery({
    queryKey: ['clients-search', term],
    queryFn: () =>
      api
        .get<Paginated<ClientRow>>('/clients', { params: { q: term || undefined, pageSize: 20 } })
        .then((r) => r.data),
  });

  const options = useMemo(() => {
    const opts = (data?.data ?? []).map((c) => ({ value: c.id, label: clientLabel(c) }));
    if (initialOption && !opts.some((o) => o.value === initialOption.value)) {
      opts.unshift(initialOption);
    }
    return opts;
  }, [data, initialOption]);

  return (
    <Select
      showSearch
      allowClear
      filterOption={false} // server-side search
      onSearch={onSearch}
      loading={isFetching}
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder ?? 'Search clients by name or email'}
      notFoundContent={isFetching ? 'Searching…' : 'No clients found'}
    />
  );
}

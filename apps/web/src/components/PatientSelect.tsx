'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Select } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';

interface PatientRow {
  id: string;
  firstName: string;
  lastName: string;
  registrationNo?: string | null;
}

export function patientLabel(p: PatientRow): string {
  const name = `${p.firstName} ${p.lastName}`.trim();
  return p.registrationNo ? `${name} · ${p.registrationNo}` : name;
}

interface Props {
  value?: string;
  onChange?: (value: string | undefined) => void;
  initialOption?: { value: string; label: string };
  placeholder?: string;
  disabled?: boolean;
}

/** Searchable patient picker (server search by name / reg no / email). */
export function PatientSelect({ value, onChange, initialOption, placeholder, disabled }: Props) {
  const [term, setTerm] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  const onSearch = (q: string) => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setTerm(q), 300);
  };
  useEffect(() => () => clearTimeout(debounce.current), []);

  const { data, isFetching } = useQuery({
    queryKey: ['patients-search', term],
    queryFn: () =>
      api
        .get<Paginated<PatientRow>>('/patients', { params: { q: term || undefined, pageSize: 20 } })
        .then((r) => r.data),
  });

  const options = useMemo(() => {
    const opts = (data?.data ?? []).map((p) => ({ value: p.id, label: patientLabel(p) }));
    if (initialOption && !opts.some((o) => o.value === initialOption.value)) opts.unshift(initialOption);
    return opts;
  }, [data, initialOption]);

  return (
    <Select
      showSearch
      allowClear
      disabled={disabled}
      filterOption={false}
      onSearch={onSearch}
      loading={isFetching}
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder ?? 'Search patients by name or reg no'}
      notFoundContent={isFetching ? 'Searching…' : 'No patients found'}
    />
  );
}

'use client';

import { useMemo, useState } from 'react';
import { Banknote, Pencil, Plus, Search, Trash2, UserPlus, Users, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';

type EmploymentType = 'FullTime' | 'PartTime' | 'Contract';
interface Employee {
  id: string;
  employeeNo: string;
  jobTitle: string;
  employmentType: EmploymentType;
  startDate: string;
  endDate: string | null;
  salary: number;
  isActive: boolean;
  isFixedSalary: boolean;
  user: { id: string; firstName: string; lastName: string; email: string };
  department: { id: string; name: string } | null;
  departmentId?: string | null;
  bankName?: string | null; bankAccount?: string | null; bankBranch?: string | null;
  trn?: string | null; nis?: string | null; nht?: string | null;
  emergencyContactName?: string | null; emergencyContactPhone?: string | null; address?: string | null;
}
interface Dept { id: string; name: string }
interface AvailableUser { id: string; firstName: string; lastName: string; email: string }

const TINTS = [
  { bg: '#EEF2FF', fg: '#4F46E5' }, { bg: '#F0FDF4', fg: '#16A34A' },
  { bg: '#FFF1F2', fg: '#E11D48' }, { bg: '#F0F9FF', fg: '#0284C7' }, { bg: '#F5F3FF', fg: '#7C3AED' },
];
const tintFor = (s: string) => TINTS[(s || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
const initials = (s: string) => (s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const fmtJMD = (cents: number) => 'J$' + Math.round(cents / 100).toLocaleString('en-US');

const TYPE_BADGE: Record<EmploymentType, { bg: string; color: string; label: string }> = {
  FullTime: { bg: '#EEF2FF', color: '#4F46E5', label: 'Full-time' },
  PartTime: { bg: '#F0F9FF', color: '#0284C7', label: 'Part-time' },
  Contract: { bg: '#F5F3FF', color: '#7C3AED', label: 'Contract' },
};

export default function EmployeesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [confirm, setConfirm] = useState<Employee | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3200); };

  const { data } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.get<Paginated<Employee>>('/employees', { params: { pageSize: 500 } }).then((r) => r.data),
  });
  const { data: deptsData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<Paginated<Dept>>('/departments', { params: { pageSize: 200 } }).then((r) => r.data),
  });
  const departments = deptsData?.data ?? [];
  const all = data?.data ?? [];
  const refetch = () => qc.invalidateQueries({ queryKey: ['employees'] });

  const employees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((e) =>
      (!deptFilter || e.department?.id === deptFilter) &&
      (!q || `${e.user.firstName} ${e.user.lastName}`.toLowerCase().includes(q) || e.employeeNo.toLowerCase().includes(q) || e.jobTitle.toLowerCase().includes(q)));
  }, [all, search, deptFilter]);

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/employees/delete/${id}`),
    onSuccess: () => { notify('ok', 'Employee removed'); setConfirm(null); refetch(); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Delete failed'),
  });

  const activeCount = all.filter((e) => e.isActive).length;
  const monthlyPayroll = all.filter((e) => e.isActive).reduce((s, e) => s + e.salary, 0);

  return (
    <div className="min-h-full" style={{ background: '#F8FAFC' }}>
      <div className="px-6 py-8 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-charcoal-heading">Employees</h1>
            <p className="mt-1 font-body-sm text-body-sm text-secondary">Staff HR records, employment and payroll details.</p>
          </div>
          <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true); }}><UserPlus size={16} /> New Employee</button>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { icon: Users, label: 'Total Employees', value: String(all.length), color: '#4F46E5' },
            { icon: Users, label: 'Active', value: String(activeCount), color: '#16A34A' },
            { icon: Banknote, label: 'Monthly Payroll', value: fmtJMD(monthlyPayroll), color: '#0284C7' },
          ].map((k) => (
            <div key={k.label} className="glass-card flex items-center gap-3.5 rounded-2xl p-6">
              <span style={{ background: `${k.color}15`, color: k.color }} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"><k.icon size={20} /></span>
              <div>
                <div className="font-display text-[26px] font-bold leading-none text-[#0F172A]">{k.value}</div>
                <div className="mt-1 font-label-sm text-label-sm uppercase tracking-wider text-secondary">{k.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1" style={{ minWidth: 220, maxWidth: 360 }}>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, employee #, title…"
              className="h-10 w-full rounded-xl border border-outline-variant/40 bg-white pl-9 pr-3 font-body-sm text-body-sm text-on-surface outline-none focus:border-primary" />
          </div>
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
            className="h-10 rounded-xl border border-outline-variant/40 bg-white px-3 font-body-sm text-body-sm text-on-surface outline-none focus:border-primary">
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        <div className="glass-card overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/40 bg-surface-container-low/40">
                  {['Employee', 'Job Title', 'Department', 'Type', 'Salary', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-label-sm text-label-sm uppercase tracking-wider text-secondary">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Users size={44} className="text-[#E2E8F0]" />
                      <p className="font-headline-sm text-headline-sm text-charcoal-heading">No employees</p>
                      <p className="font-body-sm text-body-sm text-secondary">Add your staff HR records to get started.</p>
                    </div>
                  </td></tr>
                ) : employees.map((e) => {
                  const av = tintFor(e.user.firstName);
                  const badge = TYPE_BADGE[e.employmentType];
                  return (
                    <tr key={e.id} className="border-b border-surface-container-low transition-colors hover:bg-surface-container-low/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span style={{ background: av.bg, color: av.fg }} className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-label-sm text-label-sm font-bold">{initials(`${e.user.firstName} ${e.user.lastName}`)}</span>
                          <div className="min-w-0">
                            <div className="truncate font-body-sm text-body-sm font-semibold text-charcoal-heading">{e.user.firstName} {e.user.lastName}</div>
                            <div className="font-mono text-[12px] text-secondary">{e.employeeNo}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface">{e.jobTitle}</td>
                      <td className="px-4 py-3 font-body-sm text-body-sm text-secondary">{e.department?.name ?? '—'}</td>
                      <td className="px-4 py-3"><span style={{ background: badge.bg, color: badge.color }} className="inline-block whitespace-nowrap rounded-full px-2.5 py-1 font-label-sm text-label-sm font-medium">{badge.label}</span></td>
                      <td className="px-4 py-3 font-body-sm text-body-sm font-semibold text-charcoal-heading">{fmtJMD(e.salary)}</td>
                      <td className="px-4 py-3">
                        {e.isActive
                          ? <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-label-sm text-label-sm font-medium" style={{ background: '#F0FDF4', color: '#16A34A' }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: '#16A34A' }} />Active</span>
                          : <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-label-sm text-label-sm font-medium" style={{ background: '#F1F5F9', color: '#64748B' }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: '#94A3B8' }} />Inactive</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setEditing(e); setModalOpen(true); }} title="Edit" className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-surface-container-low hover:text-primary"><Pencil size={15} /></button>
                          <button onClick={() => setConfirm(e)} title="Remove" className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-error-container hover:text-error"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modalOpen && (
        <EmployeeModal employee={editing} departments={departments} onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); refetch(); notify('ok', editing ? 'Employee updated' : 'Employee created'); }}
          onError={(m) => notify('err', m)} />
      )}

      {confirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(4px)' }} onClick={() => setConfirm(null)}>
          <div className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">Remove {confirm.user.firstName} {confirm.user.lastName}?</h3>
            <p className="mt-2 font-body-sm text-body-sm text-secondary">This removes the HR record. Employees with pay history can’t be deleted — deactivate them instead.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn-primary" style={{ background: '#DC2626', boxShadow: '0 4px 12px rgba(220,38,38,0.2)' }} disabled={del.isPending} onClick={() => del.mutate(confirm.id)}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 text-[14px] font-semibold text-white shadow-lg" style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>{toast.msg}</div>}
    </div>
  );
}

const inputCls = 'h-11 w-full rounded-xl border border-outline-variant/40 bg-white px-3.5 font-body-sm text-body-sm text-on-surface outline-none transition-colors focus:border-primary';
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block font-label-md text-label-md text-on-surface">{label}{required && <span className="text-error"> *</span>}</label>
      {children}
    </div>
  );
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 mt-1 font-label-sm text-label-sm uppercase tracking-wider text-secondary">{children}</div>;
}

function EmployeeModal({ employee, departments, onClose, onSaved, onError }: {
  employee: Employee | null; departments: Dept[]; onClose: () => void; onSaved: () => void; onError: (m: string) => void;
}) {
  const isEdit = !!employee;
  const [f, setF] = useState({
    userId: employee?.user.id ?? '',
    employeeNo: employee?.employeeNo ?? '',
    jobTitle: employee?.jobTitle ?? '',
    employmentType: employee?.employmentType ?? 'FullTime',
    departmentId: employee?.department?.id ?? '',
    startDate: employee?.startDate ? employee.startDate.slice(0, 10) : '',
    salary: employee ? String(Math.round(employee.salary / 100)) : '',
    bankName: employee?.bankName ?? '', bankAccount: employee?.bankAccount ?? '', bankBranch: employee?.bankBranch ?? '',
    trn: employee?.trn ?? '', nis: employee?.nis ?? '', nht: employee?.nht ?? '',
    emergencyContactName: employee?.emergencyContactName ?? '', emergencyContactPhone: employee?.emergencyContactPhone ?? '',
    address: employee?.address ?? '', isActive: employee?.isActive ?? true,
    isFixedSalary: employee?.isFixedSalary ?? true,
  });
  const set = (k: keyof typeof f, v: any) => setF((p) => ({ ...p, [k]: v }));

  const { data: availableUsers } = useQuery({
    queryKey: ['available-users'],
    queryFn: () => api.get<AvailableUser[]>('/employees/available-users').then((r) => r.data),
    enabled: !isEdit,
  });

  const save = useMutation({
    mutationFn: () => {
      const salaryCents = Math.round((parseFloat(f.salary) || 0) * 100);
      const common = {
        departmentId: f.departmentId || null,
        employeeNo: f.employeeNo.trim(),
        jobTitle: f.jobTitle.trim(),
        employmentType: f.employmentType,
        startDate: new Date(f.startDate).toISOString(),
        salary: salaryCents,
        bankName: f.bankName || undefined, bankAccount: f.bankAccount || undefined, bankBranch: f.bankBranch || undefined,
        trn: f.trn || undefined, nis: f.nis || undefined, nht: f.nht || undefined,
        emergencyContactName: f.emergencyContactName || undefined, emergencyContactPhone: f.emergencyContactPhone || undefined,
        address: f.address || undefined, isActive: f.isActive, isFixedSalary: f.isFixedSalary,
      };
      return isEdit
        ? api.put(`/employees/update/${employee!.id}`, common)
        : api.post('/employees', { userId: f.userId, ...common });
    },
    onSuccess: onSaved,
    onError: (e: any) => onError(e?.response?.data?.message ?? 'Save failed'),
  });

  const canSave = (isEdit || !!f.userId) && !!f.employeeNo.trim() && !!f.jobTitle.trim() && !!f.startDate && !save.isPending;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-[640px] flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-outline-variant/30 p-6 pb-4">
          <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">{isEdit ? `Edit ${employee!.user.firstName} ${employee!.user.lastName}` : 'New Employee'}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-surface-container-low"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto px-6 py-4">
          <SectionLabel>Employment</SectionLabel>
          <div className="grid grid-cols-2 gap-4">
            {isEdit ? (
              <Field label="Staff member"><input disabled value={`${employee!.user.firstName} ${employee!.user.lastName}`} className={`${inputCls} opacity-60`} /></Field>
            ) : (
              <Field label="Staff member" required>
                <select value={f.userId} onChange={(e) => set('userId', e.target.value)} className={inputCls}>
                  <option value="">Select a user…</option>
                  {(availableUsers ?? []).map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>)}
                </select>
              </Field>
            )}
            <Field label="Employee #" required><input value={f.employeeNo} onChange={(e) => set('employeeNo', e.target.value)} placeholder="EMP-001" className={inputCls} /></Field>
            <Field label="Job title" required><input value={f.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} placeholder="Cytotechnologist" className={inputCls} /></Field>
            <Field label="Employment type">
              <select value={f.employmentType} onChange={(e) => set('employmentType', e.target.value)} className={inputCls}>
                <option value="FullTime">Full-time</option><option value="PartTime">Part-time</option><option value="Contract">Contract</option>
              </select>
            </Field>
            <Field label="Department">
              <select value={f.departmentId} onChange={(e) => set('departmentId', e.target.value)} className={inputCls}>
                <option value="">Unassigned</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Start date" required><input type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} className={inputCls} /></Field>
            <Field label="Monthly salary (JMD)"><input type="number" min="0" value={f.salary} onChange={(e) => set('salary', e.target.value)} placeholder="0" className={inputCls} /></Field>
          </div>

          <div className="mt-4"><SectionLabel>Banking</SectionLabel></div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Bank"><input value={f.bankName} onChange={(e) => set('bankName', e.target.value)} className={inputCls} /></Field>
            <Field label="Account #"><input value={f.bankAccount} onChange={(e) => set('bankAccount', e.target.value)} className={inputCls} /></Field>
            <Field label="Branch"><input value={f.bankBranch} onChange={(e) => set('bankBranch', e.target.value)} className={inputCls} /></Field>
          </div>

          <div className="mt-4"><SectionLabel>Statutory</SectionLabel></div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="TRN"><input value={f.trn} onChange={(e) => set('trn', e.target.value)} className={inputCls} /></Field>
            <Field label="NIS #"><input value={f.nis} onChange={(e) => set('nis', e.target.value)} className={inputCls} /></Field>
            <Field label="NHT #"><input value={f.nht} onChange={(e) => set('nht', e.target.value)} className={inputCls} /></Field>
          </div>

          <div className="mt-4"><SectionLabel>Emergency & Address</SectionLabel></div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Emergency contact"><input value={f.emergencyContactName} onChange={(e) => set('emergencyContactName', e.target.value)} className={inputCls} /></Field>
            <Field label="Emergency phone"><input value={f.emergencyContactPhone} onChange={(e) => set('emergencyContactPhone', e.target.value)} className={inputCls} /></Field>
            <div className="col-span-2"><Field label="Address"><input value={f.address} onChange={(e) => set('address', e.target.value)} className={inputCls} /></Field></div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2.5">
              <input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} style={{ accentColor: '#4F46E5', width: 16, height: 16 }} />
              <span className="font-body-sm text-body-sm text-on-surface">Active employee</span>
            </label>
            <label className="flex items-center gap-2.5">
              <input type="checkbox" checked={f.isFixedSalary} onChange={(e) => set('isFixedSalary', e.target.checked)} style={{ accentColor: '#4F46E5', width: 16, height: 16 }} />
              <span className="font-body-sm text-body-sm text-on-surface">Fixed salary <span className="text-secondary">(uncheck for hourly)</span></span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-outline-variant/30 p-6 pt-4">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!canSave} style={{ opacity: canSave ? 1 : 0.5 }} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Employee'}
          </button>
        </div>
      </div>
    </div>
  );
}

// frontend/src/app/components/admin/AdminDashboard.tsx
import { useEffect, useState, useMemo } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Shield, Users, LayoutDashboard, Database, Table,
  Search, Trash2, Edit2, Check, X, ChevronRight,
} from 'lucide-react';
import { motion } from 'motion/react';
import { adminAPI, authAPI } from '../../utils/api';
import { useStore } from '../../store';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../ui/utils';

type Tab = 'overview' | 'users' | 'data' | 'schema';

const ROLE_COLORS: Record<string, string> = {
  admin: '#16a34a',
  farmer: '#2563eb',
  viewer: '#d97706',
};

const fmtRs = (v: number) =>
  v >= 10000000 ? `₹${(v / 10000000).toFixed(1)}Cr`
  : v >= 100000 ? `₹${(v / 100000).toFixed(1)}L`
  : `₹${Math.round(v / 1000)}k`;

export function AdminDashboard({ onNavigate }: { onNavigate?: (v: string) => void }) {
  const currentUser = useStore((s: any) => s.user);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // Overview state
  const [overview, setOverview] = useState<any>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Users state
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ full_name: '', email: '', password: '', role: 'farmer' });
  const [addUserLoading, setAddUserLoading] = useState(false);

  // Data state
  const [data, setData] = useState<{ farms: any[]; sessions: any[] } | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataSubTab, setDataSubTab] = useState<'farms' | 'sessions'>('farms');
  const [selectedRow, setSelectedRow] = useState<any>(null);

  // Schema state
  const [schema, setSchema] = useState<any[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState('');

  useEffect(() => {
    adminAPI.overview().then(({ data }: any) => setOverview(data)).catch(() => {}).finally(() => setOverviewLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === 'users' && users.length === 0) {
      setUsersLoading(true);
      adminAPI.users().then(({ data }: any) => setUsers(data)).catch(() => {}).finally(() => setUsersLoading(false));
    }
    if (activeTab === 'data' && !data) {
      setDataLoading(true);
      adminAPI.data().then(({ data: d }: any) => { setData(d); }).catch(() => {}).finally(() => setDataLoading(false));
    }
    if (activeTab === 'schema' && schema.length === 0) {
      setSchemaLoading(true);
      adminAPI.schema().then(({ data }: any) => { setSchema(data); setSelectedTable(data[0]?.table_name || ''); }).catch(() => {}).finally(() => setSchemaLoading(false));
    }
  }, [activeTab]);

  const filteredUsers = useMemo(() =>
    users.filter(u => !userSearch || u.email.includes(userSearch) || u.full_name.toLowerCase().includes(userSearch.toLowerCase())),
    [users, userSearch]
  );

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await adminAPI.updateUser(userId, { role });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
      setEditingRole(null);
    } catch { /* ignore */ }
  };

  const handleDelete = async (userId: string) => {
    try {
      await adminAPI.deleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
      setConfirmDelete(null);
    } catch { /* ignore */ }
  };

  const handleAddUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.full_name) return;
    setAddUserLoading(true);
    try {
      const { data: reg } = await authAPI.register({ email: newUser.email, password: newUser.password, full_name: newUser.full_name });
      if (newUser.role !== 'farmer') {
        await adminAPI.updateUser(reg.id, { role: newUser.role });
      }
      const { data: updated } = await adminAPI.users();
      setUsers(updated);
      setShowAddUser(false);
      setNewUser({ full_name: '', email: '', password: '', role: 'farmer' });
    } catch { /* ignore */ } finally { setAddUserLoading(false); }
  };

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'data', label: 'Data Browser', icon: Database },
    { id: 'schema', label: 'Schema', icon: Table },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center">
          <Shield className="w-5 h-5 text-red-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Admin Panel</h1>
          <p className="text-xs text-slate-400 mt-0.5">Logged in as {currentUser?.email}</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn('flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {overviewLoading ? [1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl bg-slate-100" />)
            : [
              { label: 'Total Users', value: overview?.total_users ?? 0, color: 'text-blue-600' },
              { label: 'Total Farms', value: overview?.total_farms ?? 0, color: 'text-green-600' },
              { label: 'Total Surveys', value: `${overview?.completed_surveys ?? 0} / ${overview?.total_surveys ?? 0}`, color: 'text-purple-600' },
              { label: 'Platform Revenue', value: fmtRs(overview?.total_revenue_inr ?? 0), color: 'text-amber-600' },
            ].map(card => (
              <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">{card.label}</p>
                <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Users by role — Pie */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Users by Role</p>
              {overviewLoading ? <Skeleton className="h-40 bg-slate-100 rounded-lg" /> : (
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={Object.entries(overview?.users_by_role || {}).map(([k,v]) => ({ name: k, value: v }))}
                      cx="50%" cy="50%" outerRadius={60} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                      {Object.keys(overview?.users_by_role || {}).map((role) => (
                        <Cell key={role} fill={ROLE_COLORS[role] || '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Surveys by month — Bar */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Surveys by Month</p>
              {overviewLoading ? <Skeleton className="h-40 bg-slate-100 rounded-lg" /> : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={overview?.surveys_by_month || []} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#16a34a" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Recent sessions */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Recent Surveys</p>
            {overviewLoading ? <Skeleton className="h-32 bg-slate-100 rounded-lg" /> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Project', 'Owner', 'Type', 'Date'].map(h => (
                      <th key={h} className="text-left text-xs text-slate-400 font-medium pb-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(overview?.recent_sessions || []).map((s: any) => (
                    <tr key={s.session_id}>
                      <td className="py-2 font-medium text-slate-800">{s.project_name}</td>
                      <td className="py-2 text-slate-500 text-xs">{s.owner_email}</td>
                      <td className="py-2">
                        <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5',
                          s.survey_type === 'aquaponic' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700')}>
                          {s.survey_type}
                        </span>
                      </td>
                      <td className="py-2 text-slate-400 text-xs">
                        {s.completed_at ? new Date(s.completed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── USERS TAB ── */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={userSearch} onChange={e => setUserSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <button onClick={() => setShowAddUser(true)}
              className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg flex items-center gap-1.5">
              + Add User
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {usersLoading ? <Skeleton className="h-48 bg-slate-100 m-4 rounded-lg" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {['Name', 'Email', 'Role', 'Farms', 'Surveys', 'Joined', 'Actions'].map(h => (
                        <th key={h} className="text-left text-xs text-slate-400 font-medium px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredUsers.map(u => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{u.full_name}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{u.email}</td>
                        <td className="px-4 py-3">
                          {editingRole === u.id ? (
                            <div className="flex items-center gap-1">
                              <select defaultValue={u.role} onChange={e => setPendingRole(prev => ({ ...prev, [u.id]: e.target.value }))}
                                className="text-xs border rounded px-1 py-0.5">
                                <option value="admin">admin</option>
                                <option value="farmer">farmer</option>
                                <option value="viewer">viewer</option>
                              </select>
                              {pendingRole[u.id] && pendingRole[u.id] !== u.role && (
                                <button onClick={() => { handleRoleChange(u.id, pendingRole[u.id]); setPendingRole(prev => { const n = {...prev}; delete n[u.id]; return n; }); }}
                                  className="text-green-600 hover:text-green-700 text-xs font-semibold px-1.5 py-0.5 rounded bg-green-50">
                                  Save
                                </button>
                              )}
                              <button onClick={() => setEditingRole(null)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-slate-100 text-slate-600">{u.role}</span>
                              {u.id !== currentUser?.id && (
                                <button onClick={() => setEditingRole(u.id)} className="text-slate-400 hover:text-slate-600">
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{u.farms_count}</td>
                        <td className="px-4 py-3 text-slate-600">{u.surveys_count}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {u.id !== currentUser?.id && (
                            confirmDelete === u.id ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-red-600">Confirm?</span>
                                <button onClick={() => handleDelete(u.id)} className="text-red-600 hover:text-red-700">
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setConfirmDelete(null)} className="text-slate-400 hover:text-slate-600">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmDelete(u.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DATA BROWSER TAB ── */}
      {activeTab === 'data' && (
        <div className="space-y-4">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            {(['farms', 'sessions'] as const).map(sub => (
              <button key={sub} onClick={() => setDataSubTab(sub)}
                className={cn('px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors',
                  dataSubTab === sub ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                {sub}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {dataLoading ? <Skeleton className="h-48 bg-slate-100 m-4 rounded-lg" /> : dataSubTab === 'farms' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {['Farm Name', 'Owner', 'System Type', 'Area (m²)', 'Location', 'Created'].map(h => (
                        <th key={h} className="text-left text-xs text-slate-400 font-medium px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(data?.farms || []).map((f: any) => (
                      <tr key={f.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedRow(f)}>
                        <td className="px-4 py-3 font-medium text-slate-900">{f.name}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{f.owner_email}</td>
                        <td className="px-4 py-3 text-slate-600 capitalize">{f.system_type}</td>
                        <td className="px-4 py-3 text-slate-600">{f.area_sqm ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{f.location || '—'}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {f.created_at ? new Date(f.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {['Project', 'Owner', 'Type', 'Status', 'Date'].map(h => (
                        <th key={h} className="text-left text-xs text-slate-400 font-medium px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(data?.sessions || []).map((s: any) => (
                      <tr key={s.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedRow(s)}>
                        <td className="px-4 py-3 font-medium text-slate-900">{s.project_name}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{s.owner_email}</td>
                        <td className="px-4 py-3">
                          <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5',
                            s.survey_type === 'aquaponic' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700')}>
                            {s.survey_type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5',
                            s.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600')}>
                            {s.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {(s.completed_at || s.created_at) ? new Date(s.completed_at || s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {selectedRow && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Row Detail</p>
                <button onClick={() => setSelectedRow(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(selectedRow).map(([k, v]) => (
                  <div key={k}>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">{k}</p>
                    <p className="text-sm text-slate-800 font-medium truncate">{String(v ?? '—')}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* ── SCHEMA TAB ── */}
      {activeTab === 'schema' && (
        <div className="grid grid-cols-[200px_1fr] gap-4">
          {/* Table list */}
          <div className="rounded-xl border border-slate-200 bg-white p-2 space-y-1 h-fit">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 px-2 py-1">Tables</p>
            {schemaLoading ? [1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 bg-slate-100 rounded-lg" />) :
              schema.map(t => (
                <button key={t.table_name} onClick={() => setSelectedTable(t.table_name)}
                  className={cn('w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    selectedTable === t.table_name ? 'bg-green-50 text-green-700' : 'text-slate-600 hover:bg-slate-50')}>
                  {t.table_name}
                  <span className="ml-1 text-[10px] text-slate-400">({t.columns.length})</span>
                </button>
              ))
            }
          </div>

          {/* Columns */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {schemaLoading ? <Skeleton className="h-48 bg-slate-100 m-4 rounded-lg" /> : (() => {
              const tbl = schema.find(t => t.table_name === selectedTable);
              if (!tbl) return <div className="p-6 text-slate-400 text-sm">Select a table</div>;
              return (
                <div>
                  <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                    <span className="font-semibold text-slate-900 font-mono">{tbl.table_name}</span>
                    <span className="ml-2 text-xs text-slate-400">{tbl.columns.length} columns</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        {['Column', 'Type', 'Nullable', 'Default'].map(h => (
                          <th key={h} className="text-left text-xs text-slate-400 font-medium px-5 py-2">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {tbl.columns.map((col: any) => (
                        <tr key={col.name} className="hover:bg-slate-50">
                          <td className="px-5 py-2 font-mono text-slate-900 font-medium">{col.name}</td>
                          <td className="px-5 py-2 font-mono text-blue-600 text-xs">{col.type}</td>
                          <td className="px-5 py-2">
                            <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5',
                              col.nullable ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500')}>
                              {col.nullable ? 'nullable' : 'not null'}
                            </span>
                          </td>
                          <td className="px-5 py-2 font-mono text-slate-400 text-xs truncate max-w-[160px]">{col.default || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}
      {showAddUser && (
        <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Add New User</h2>
            {[['Full Name', 'full_name', 'text'], ['Email', 'email', 'email'], ['Password', 'password', 'password']].map(([label, key, type]) => (
              <div key={key}>
                <label className="text-xs font-medium text-slate-600 mb-1 block">{label}</label>
                <input type={type} value={(newUser as any)[key]}
                  onChange={e => setNewUser(prev => ({ ...prev, [key]: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
            ))}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Role</label>
              <select value={newUser.role} onChange={e => setNewUser(prev => ({ ...prev, role: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="farmer">farmer</option>
                <option value="admin">admin</option>
                <option value="viewer">viewer</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowAddUser(false)}
                className="flex-1 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleAddUser} disabled={addUserLoading}
                className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                {addUserLoading ? 'Adding…' : 'Add User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

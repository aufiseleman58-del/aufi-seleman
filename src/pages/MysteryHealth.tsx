import React, { useMemo, useState } from 'react';
import { Activity, Ambulance, Building2, CalendarDays, Search, Stethoscope } from 'lucide-react';

type HospitalActivity = {
  id: string;
  hospital: string;
  district: string;
  activity: string;
  status: 'Planned' | 'Ongoing' | 'Completed';
  date: string;
  volunteers: number;
};

const activities: HospitalActivity[] = [
  { id: '1', hospital: 'Kamuzu Central Hospital', district: 'Lilongwe', activity: 'Mobile diabetes screening around outpatient wing', status: 'Ongoing', date: '2026-05-21', volunteers: 18 },
  { id: '2', hospital: 'Queen Elizabeth Central Hospital', district: 'Blantyre', activity: 'Maternal health awareness walk and blood pressure checks', status: 'Planned', date: '2026-05-24', volunteers: 26 },
  { id: '3', hospital: 'Mzuzu Central Hospital', district: 'Mzuzu', activity: 'Community sanitation drive near pediatric block', status: 'Completed', date: '2026-05-19', volunteers: 14 },
  { id: '4', hospital: 'Zomba Central Hospital', district: 'Zomba', activity: 'Nutrition counseling and growth-monitoring camp', status: 'Ongoing', date: '2026-05-22', volunteers: 22 },
  { id: '5', hospital: 'Mangochi District Hospital', district: 'Mangochi', activity: 'Malaria prevention education with bed-net distribution', status: 'Planned', date: '2026-05-27', volunteers: 30 },
];

const statusColor: Record<HospitalActivity['status'], string> = {
  Planned: 'bg-blue-100 text-blue-700',
  Ongoing: 'bg-emerald-100 text-emerald-700',
  Completed: 'bg-slate-200 text-slate-700',
};

export default function MysteryHealth() {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | HospitalActivity['status']>('All');

  const filtered = useMemo(() => {
    return activities.filter((item) => {
      const matchesQuery = `${item.hospital} ${item.district} ${item.activity}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [query, statusFilter]);

  return (
    <main className="min-h-full bg-slate-50 p-4 md:p-8">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-white shadow-lg">
          <p className="text-sm uppercase tracking-widest">Public Health Tracker</p>
          <h1 className="mt-2 text-3xl font-bold">Mystery of Health — Malawi Hospital Activity Map</h1>
          <p className="mt-2 max-w-3xl text-emerald-50">Track outreach activities happening around hospitals in Malawi, monitor volunteer participation, and follow health campaigns in real time.</p>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 text-slate-600"><Building2 size={18} /> Hospitals Covered</div>
            <p className="mt-3 text-3xl font-bold text-slate-900">{new Set(activities.map((a) => a.hospital)).size}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 text-slate-600"><Ambulance size={18} /> Active Campaigns</div>
            <p className="mt-3 text-3xl font-bold text-slate-900">{activities.filter((a) => a.status === 'Ongoing').length}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 text-slate-600"><Stethoscope size={18} /> Total Volunteers</div>
            <p className="mt-3 text-3xl font-bold text-slate-900">{activities.reduce((sum, item) => sum + item.volunteers, 0)}</p>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                className="w-full rounded-xl border border-slate-200 py-2 pl-10 pr-3 text-sm"
                placeholder="Search hospital, district, or activity"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'All' | HospitalActivity['status'])}
            >
              <option>All</option>
              <option>Planned</option>
              <option>Ongoing</option>
              <option>Completed</option>
            </select>
          </div>

          <div className="mt-5 grid gap-4">
            {filtered.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-slate-900">{item.hospital}</h3>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor[item.status]}`}>{item.status}</span>
                </div>
                <p className="mt-2 text-slate-700">{item.activity}</p>
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1"><Activity size={14} /> {item.district}</span>
                  <span className="inline-flex items-center gap-1"><CalendarDays size={14} /> {item.date}</span>
                  <span>{item.volunteers} volunteers</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

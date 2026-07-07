// src/pages/DashboardPage.tsx
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { analyticsApi, articlesApi } from '../lib/api';
import { useAuthStore } from '../lib/store';
import { formatDate, formatDateShort, tshStatus, toISODate } from '../lib/utils';
import { LAB_RANGES } from '../types';
import {
  Flame, TrendingUp, Pill, Calendar, FlaskConical,
  Plus, ChevronRight, Activity, BookOpen
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts';
import { parseISO, format } from 'date-fns';
import { fr } from 'date-fns/locale';
import styles from './DashboardPage.module.css';

export function DashboardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const today = toISODate(new Date());

  const { data: overview, isLoading } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => analyticsApi.overview(90).then((r) => r.data),
  });

  // Encart conseil : rotation quotidienne parmi les encarts publiés
  const { data: tips } = useQuery({
    queryKey: ['articles', 'tips'],
    queryFn: () => articlesApi.list('TIP').then((r) => r.data),
  });
  const tip = tips?.length
    ? tips[Math.floor(Date.now() / 86_400_000) % tips.length]
    : null;

  const chartData = overview?.timeSeries.map((e) => ({
    date: format(parseISO(e.date as string), 'd MMM', { locale: fr }),
    énergie: e.energyLevel,
    humeur: e.moodScore,
  })) ?? [];

  const tsh = overview?.latestLabResult?.tsh;
  const tshInfo = tsh != null
    ? tshStatus(tsh, user?.profile?.targetTSH_min, user?.profile?.targetTSH_max)
    : null;

  if (isLoading) return <PageLoader />;

  return (
    <div className={styles.page}>
      {/* ── Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.greeting}>
            Bonjour, {user?.name?.split(' ')[0]}
          </h1>
          <p className={styles.date}>{formatDate(new Date())}</p>
        </div>
        <button className={styles.logBtn} onClick={() => navigate(`/log/${today}`)}>
          <Plus size={16} />
          Journal du jour
        </button>
      </div>

      {/* ── KPI strip */}
      <div className={styles.kpiRow}>
        <KpiCard
          icon={<Flame size={18} />}
          label="Série active"
          value={`${overview?.streak ?? 0} j`}
          color="var(--amber)"
          bg="var(--amber-soft)"
        />
        <KpiCard
          icon={<Pill size={18} />}
          label="Observance médicament"
          value={overview?.medicationAdherence != null
            ? `${Math.round(overview.medicationAdherence)}%` : '—'}
          color="var(--teal)"
          bg="var(--teal-soft)"
        />
        <KpiCard
          icon={<TrendingUp size={18} />}
          label="Énergie moy. (90j)"
          value={overview?.averages.energy != null
            ? `${overview.averages.energy.toFixed(1)} / 5` : '—'}
          color="var(--accent)"
          bg="var(--accent-soft)"
        />
        <KpiCard
          icon={<FlaskConical size={18} />}
          label="Dernier TSH"
          value={tsh != null ? `${tsh} mUI/L` : '—'}
          color={tshInfo?.color ?? 'var(--text-muted)'}
          bg={tshInfo?.bg ?? 'var(--bg-raised)'}
          badge={tshInfo?.label}
        />
      </div>

      {/* ── Chart + sidebar */}
      <div className={styles.mainGrid}>
        {/* Chart */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Énergie & Humeur — 90 jours</span>
          </div>
          <div className={styles.chartWrap}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  tickLine={false} axisLine={false} interval={13} />
                <YAxis domain={[1, 5]} tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  tickLine={false} axisLine={false} ticks={[1, 2, 3, 4, 5]} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 10, fontSize: 12, color: 'var(--text)',
                    boxShadow: 'var(--shadow)',
                  }}
                />
                <Line type="monotone" dataKey="énergie" stroke="var(--chart-1)"
                  strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="humeur" stroke="var(--chart-2)"
                  strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className={styles.legend}>
            <span><span style={{ color: 'var(--chart-1)' }}>●</span> Énergie</span>
            <span><span style={{ color: 'var(--chart-2)' }}>●</span> Humeur</span>
          </div>
        </div>

        {/* Right column */}
        <div className={styles.sideCol}>
          {/* TSH history */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Historique TSH</span>
              <button className={styles.cardLink} onClick={() => navigate('/lab-results')}>
                Voir tout <ChevronRight size={14} />
              </button>
            </div>
            {overview?.labHistory.length === 0 ? (
              <p className={styles.empty}>Aucune analyse enregistrée</p>
            ) : (
              <div className={styles.labList}>
                {overview?.labHistory.slice(0, 5).map((r, i) => {
                  const info = r.tsh != null ? tshStatus(r.tsh) : null;
                  return (
                    <div key={i} className={styles.labRow}>
                      <span className={styles.labDate}>{formatDateShort(r.date as string)}</span>
                      <div className={styles.labBar}>
                        {r.tsh != null && (
                          <TshBar value={r.tsh} min={LAB_RANGES.tsh.min} max={LAB_RANGES.tsh.max} />
                        )}
                      </div>
                      <span style={{ color: info?.color ?? 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 500 }}>
                        {r.tsh != null ? `${r.tsh}` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Next appointment */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Prochain RDV</span>
              <button className={styles.cardLink} onClick={() => navigate('/appointments')}>
                Gérer <ChevronRight size={14} />
              </button>
            </div>
            {overview?.nextAppointment ? (
              <div className={styles.apptRow}>
                <div className={styles.apptIcon}><Calendar size={18} /></div>
                <div>
                  <p className={styles.apptType}>{APPT_LABELS[overview.nextAppointment.type]}</p>
                  <p className={styles.apptDate}>
                    {formatDate(overview.nextAppointment.date, 'EEEE d MMMM')}
                    {overview.nextAppointment.doctorName && ` — ${overview.nextAppointment.doctorName}`}
                  </p>
                </div>
              </div>
            ) : (
              <p className={styles.empty}>Aucun rendez-vous prévu</p>
            )}
          </div>

          {/* Active medications */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Traitement actif</span>
              <button className={styles.cardLink} onClick={() => navigate('/medications')}>
                Gérer <ChevronRight size={14} />
              </button>
            </div>
            {overview?.activeMedications.length === 0 ? (
              <p className={styles.empty}>Aucun médicament actif</p>
            ) : (
              overview?.activeMedications.map((m, i) => (
                <div key={i} className={styles.medRow}>
                  <div className={styles.medIcon}><Pill size={14} /></div>
                  <div>
                    <p className={styles.medName}>{m.name}</p>
                    <p className={styles.medDose}>{m.dosageMcg} µg
                      {m.intakeTime && ` · ${m.intakeTime}`}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Encart conseil du jour */}
      {tip && (
        <div className={styles.tipCard} onClick={() => navigate('/learn')} role="button" tabIndex={0}>
          <div className={styles.tipIcon}><BookOpen size={16} /></div>
          <div className={styles.tipBody}>
            <p className={styles.tipTitle}>{tip.title}</p>
            {tip.content && <p className={styles.tipText}>{tip.content}</p>}
          </div>
          <ChevronRight size={16} className={styles.tipChevron} />
        </div>
      )}

      {/* ── Quick log CTA */}
      <div className={styles.ctaBanner}>
        <Activity size={20} />
        <span>Avez-vous rempli votre journal aujourd'hui ?</span>
        <button onClick={() => navigate(`/log/${today}`)}>
          Remplir maintenant
        </button>
      </div>
    </div>
  );
}

// ── Sub-components

function KpiCard({ icon, label, value, color, bg, badge }: {
  icon: React.ReactNode; label: string; value: string;
  color: string; bg: string; badge?: string;
}) {
  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiIcon} style={{ color, background: bg }}>{icon}</div>
      <div>
        <p className={styles.kpiLabel}>{label}</p>
        <p className={styles.kpiValue}>{value}
          {badge && <span className={styles.kpiBadge} style={{ color, background: bg }}>{badge}</span>}
        </p>
      </div>
    </div>
  );
}

function TshBar({ value, min, max }: { value: number; min: number; max: number }) {
  const displayMax = max * 2;
  const pct = Math.min((value / displayMax) * 100, 100);
  const normalStart = (min / displayMax) * 100;
  const normalEnd = (max / displayMax) * 100;
  const color = value < min ? 'var(--lav)' : value > max ? 'var(--danger)' : 'var(--success)';

  return (
    <div className={styles.tshBar}>
      <div className={styles.tshBarNormal} style={{ left: `${normalStart}%`, width: `${normalEnd - normalStart}%` }} />
      <div className={styles.tshBarFill} style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div className="spinner" />
    </div>
  );
}

const APPT_LABELS: Record<string, string> = {
  ENDOCRINOLOGIST: 'Endocrinologue',
  GENERAL_PRACTITIONER: 'Médecin généraliste',
  ULTRASOUND: 'Échographie',
  BLOOD_TEST: 'Prise de sang',
  SCINTIGRAPHY: 'Scintigraphie',
  BIOPSY: 'Biopsie',
  OTHER: 'Rendez-vous',
};

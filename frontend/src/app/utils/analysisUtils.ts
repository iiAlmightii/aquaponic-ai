// Shared financial analysis types and utilities.
// Analytics.tsx imports from here; Dashboard and FloatingAdvisor also use generateInsights.

export type Priority = 'high' | 'medium' | 'low';

export interface FlowRow {
  month: number;
  revenue: number;
  opex: number;
  net: number;
  cumulative: number;
}

export interface Inputs {
  fishRev: number;
  cropRev: number;
  capex: number;
  feed: number;
  labor: number;
  util: number;
  maint: number;
  other: number;
  horizon: number;
}

export interface Metrics {
  monthRev: number;
  monthOpex: number;
  monthNet: number;
  annRev: number;
  annOpex: number;
  annProfit: number;
  roi: number;
  payback: number | null;
  breakEvenMonth: number | null;
  flows: FlowRow[];
  npv: number;
  capex: number;
}

export interface Recommendation {
  priority: Priority;
  category: string;
  title: string;
  detail: string;
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fmtRs(value: number): string {
  return `INR ${Math.round(value).toLocaleString('en-IN')}`;
}

export function buildInputs(analysis: any): Inputs {
  const answers = analysis?.farm_answers || {};
  const plan = analysis?.financial_plan || {};
  const baseCashFlows = plan?.scenarios?.base?.cash_flows || [];
  const horizonFromPlan =
    Array.isArray(baseCashFlows) && baseCashFlows.length > 0 ? baseCashFlows.length : 24;

  return {
    fishRev: num(answers.monthly_fish_revenue, 55000),
    cropRev: num(answers.monthly_crop_revenue, 18000),
    capex: num(
      plan.total_capex,
      num(answers.infrastructure_cost, 300000) +
        num(answers.equipment_cost, 150000) +
        num(answers.initial_stock_cost, 50000),
    ),
    feed: num(answers.monthly_feed_cost, 12000),
    labor: num(answers.monthly_labor_cost, 20000),
    util: num(answers.monthly_utilities_cost, 7000),
    maint: num(answers.monthly_maintenance_cost, 3000),
    other: num(answers.monthly_other_cost, 2000),
    horizon: Math.max(6, Math.min(60, num(horizonFromPlan, 24))),
  };
}

export function buildLandInputs(landDashboard: any): Inputs {
  const summary = landDashboard?.summary || {};
  const costs = landDashboard?.cost_breakdown || {};

  return {
    fishRev: 0,
    cropRev: num(summary.total_revenue, 0) / 12,
    capex: Math.max(100000, num(summary.total_capex, 300000)),
    feed: num(costs.seeds, 0) / 12,
    labor: (num(costs.labor, 0) + num(costs.seasonal_labor, 0)) / 12,
    util: (num(costs.electricity, 0) + num(costs.fuel, 0) + num(costs.transport, 0)) / 12,
    maint: (num(costs.maintenance, 0) + num(costs.land_rent, 0) + num(costs.pesticide, 0)) / 12,
    other: 0,
    horizon: 12,
  };
}

export function computeMetrics(inp: Inputs, factor = 1): Metrics {
  const monthRev = (inp.fishRev + inp.cropRev) * factor;
  const monthOpex = inp.feed + inp.labor + inp.util + inp.maint + inp.other;
  const monthNet = monthRev - monthOpex;
  const annRev = monthRev * 12;
  const annOpex = monthOpex * 12;
  const annProfit = annRev - annOpex;
  const roi = inp.capex > 0 ? (annProfit / inp.capex) * 100 : 0;
  const payback = monthNet > 0 ? inp.capex / monthNet : null;

  const flows: FlowRow[] = [];
  let cumulative = -inp.capex;
  let breakEvenMonth: number | null = null;

  for (let m = 1; m <= inp.horizon; m += 1) {
    cumulative += monthNet;
    if (cumulative >= 0 && breakEvenMonth === null) breakEvenMonth = m;
    flows.push({
      month: m,
      revenue: Math.round(monthRev),
      opex: Math.round(monthOpex),
      net: Math.round(monthNet),
      cumulative: Math.round(cumulative),
    });
  }

  const monthlyRate = Math.pow(1.08, 1 / 12) - 1;
  const npv =
    -inp.capex +
    flows.reduce((acc, _, i) => acc + monthNet / Math.pow(1 + monthlyRate, i + 1), 0);

  return {
    monthRev, monthOpex, monthNet, annRev, annOpex, annProfit,
    roi, payback, breakEvenMonth, flows, npv: Math.round(npv), capex: inp.capex,
  };
}

export function generateInsights(inp: Inputs, base: Metrics): Recommendation[] {
  const recs: Recommendation[] = [];
  const totalOpex = inp.feed + inp.labor + inp.util + inp.maint + inp.other;
  const feedRatio = totalOpex > 0 ? inp.feed / totalOpex : 0;
  const totalRevenue = inp.fishRev + inp.cropRev;
  const fishShare = totalRevenue > 0 ? inp.fishRev / totalRevenue : 0;

  if (feedRatio > 0.38) {
    recs.push({
      priority: 'high',
      category: 'Cost Reduction',
      title: `Feed cost is ${Math.round(feedRatio * 100)}% of OPEX`,
      detail: `Target below 35% via improved feed conversion and bulk purchasing. Estimated saving: ${fmtRs(inp.feed * 0.1)}/month.`,
    });
  }
  if (base.payback && base.payback > 24) {
    recs.push({
      priority: 'medium',
      category: 'Revenue',
      title: `Payback is ${Math.round(base.payback)} months`,
      detail: `Introduce direct sales channels to improve margin. Potential uplift: ${fmtRs((inp.fishRev + inp.cropRev) * 0.15)}/month.`,
    });
  }
  if (fishShare > 0.8) {
    recs.push({
      priority: 'medium',
      category: 'Diversification',
      title: `${Math.round(fishShare * 100)}% of revenue comes from fish`,
      detail: 'Reduce concentration risk by adding higher-value crops to the grow bed portfolio.',
    });
  }
  if (base.roi > 25 && base.payback && base.payback < 24) {
    recs.push({
      priority: 'low',
      category: 'Growth',
      title: `ROI is healthy at ${Math.round(base.roi)}%`,
      detail: 'Consider staged expansion funded from operating surplus to preserve cash-flow safety.',
    });
  }
  if (inp.util > inp.feed * 1.2) {
    recs.push({
      priority: 'high',
      category: 'Energy',
      title: 'Utilities exceed feed cost',
      detail: 'Audit pumps and lighting; efficient pumps and LED controls can materially reduce power cost.',
    });
  }
  if (recs.length === 0) {
    recs.push({
      priority: 'low',
      category: 'Performance',
      title: 'Current assumptions are balanced',
      detail: 'Cost and revenue mix are within healthy bounds. Focus on consistency and market stability.',
    });
  }
  return recs;
}

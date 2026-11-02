export type Source = 'UCI_HISTORICAL' | 'AWS_CLOUDWATCH' | 'DYNAMODB_REGISTRY';
export type DayPoint = { date: string; rentals: number; mean_temperature_c: number | null };
export type Overview = {
  source: 'UCI_HISTORICAL'|'NOT_CONFIGURED'; period: string; observed_days: number;
  total_rentals: number; average_daily_rentals: number;
  active_model_version: string | null; series: DayPoint[];
};
export type Historical = {
  source: 'UCI_HISTORICAL'; start: string; end: string;
  total_rentals: number; rows: DayPoint[]; scanned_bytes: number;
};
export type ModelRow = {
  version: string; status: string; dataset_version: string | null;
  feature_version: string | null; release_health: string | null;
  promoted_at: string | null;
};
export type DriftReport = { decision: string; execution_status: string | null; report_date: string | null };
export type MLOps = {
  active_model_version: string | null; models: ModelRow[]; latest_drift: DriftReport | null;
  note: string;
};
export type ServiceRow = {
  name: string; status: string; desired: number; running: number;
  cpu_percent: number | null; memory_percent: number | null;
};
export type OpPoint = { time: string; requests: number | null; errors: number | null };
export type Operations = {
  source: 'AWS_CLOUDWATCH'; region: string; measured_at: string;
  services: ServiceRow[]; alb_metrics: OpPoint[];
  request_count_1h: number | null; target_5xx_1h: number | null;
  note: string;
};
export type ModelInfo = { model_id?: string; model_version: string; feature_version: string; feature_count: number; [key: string]: unknown };
export type PredictionResponse = { model_version?: string; prediction_raw?: number; prediction?: number; predicted_rentals_display?: number; latency_ms?: number; demo?: boolean; request_id?: string; [key: string]: unknown };

export type Analytics = {
 source:string; hourly:{hour:number;rentals:number}[];
 weekday_weekend:{name:string;rentals:number}[];
 heatmap:{day_of_week:number;hour:number;rentals:number}[];
 monthly:{month:number;rentals:number}[];
 rainy:{name:string;rentals:number}[];
 scanned_bytes:number;
};

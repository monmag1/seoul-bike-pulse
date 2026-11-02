import type { Historical, MLOps, ModelInfo, Operations, Overview, PredictionResponse, Analytics } from './types';
import type { ModelSchema } from './featureContract';
import {isDemo} from './mode';
import {demoOverview,demoHistorical,demoMLOps,demoOperations,demoSchema,demoPredict,demoAnalytics} from './demo';
const prefix = '/api/v1';
export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); this.name = 'ApiError'; }
}
async function read<T>(url: string, init?: RequestInit): Promise<T> {
  if (isDemo()) {
    const fixtures:Record<string,unknown> = {
      '/api/v1/ui/overview':demoOverview,
      '/api/v1/ui/analytics':demoAnalytics,
      '/api/v1/ui/workflow':{configured:false,admin_actions_enabled:false,executions:[],note:'단계 U 시연용: 실제 실행 없음'},
      '/api/v1/ui/deployments':{services:[]},
      '/api/v1/ui/mlops':demoMLOps,
      '/api/v1/ui/operations':demoOperations,
      '/api/v1/model':{model_id:'bike-demand',model_version:'mv001',feature_version:'fv001',feature_count:19},
      '/api/v1/health':{status:'ok',model_loaded:true,model_version:'mv001'},
      '/api/v1/model/schema':demoSchema,
    };
    const value = url.startsWith('/api/v1/ui/historical?')?demoHistorical:url==='/api/v1/predict'?demoPredict(JSON.parse(String(init?.body||'{}')).features):fixtures[url];
    if (value===undefined) throw new Error('시연 데이터가 없는 API입니다: '+url);
    return value as T;
  }
  const resp = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  if (!resp.ok) {
    const detail = resp.status === 401 || resp.status === 403
      ? '인증 또는 접근 권한을 확인하세요.'
      : resp.status === 502 || resp.status === 503 || resp.status === 504
      ? '백엔드 또는 AWS 데이터 조회에 실패했습니다.'
      : `API HTTP ${resp.status}`;
    throw new ApiError(resp.status, detail);
  }
  const ct = resp.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new ApiError(resp.status, 'JSON 대신 HTML이 반환되었습니다. Cognito 로그인 또는 Vite Proxy 설정을 확인하세요.');
  return await resp.json() as T;
}
export const api = {
  overview: (signal?: AbortSignal) => read<Overview>(`${prefix}/ui/overview`, { signal }),
  analytics: (signal?: AbortSignal) => read<Analytics>(`${prefix}/ui/analytics`, { signal }),
  workflow: (signal?: AbortSignal) => read<{configured:boolean;admin_actions_enabled:boolean;executions:{name:string;status:string;started_at:string}[];note:string}>(`${prefix}/ui/workflow`,{signal}),
  deployments: (signal?: AbortSignal) => read<{services:{name:string;events:{message:string;created_at:string}[];deployments:{status:string;task_definition:string;running:number;desired:number}[]}[]}>(`${prefix}/ui/deployments`,{signal}),
  startWorkflow: (action:'retrain'|'deploy') => read<{execution_arn:string;status:string}>(`${prefix}/ui/admin/start-workflow?action=${action}`,{method:'POST',headers:{'X-Requested-With':'BikePulseDashboard','Content-Type':'application/json'},body:'{}'}),
  historical: (start: string, end: string, signal?: AbortSignal) => read<Historical>(`${prefix}/ui/historical?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { signal }),
  mlops: (signal?: AbortSignal) => read<MLOps>(`${prefix}/ui/mlops`, { signal }),
  operations: (signal?: AbortSignal) => read<Operations>(`${prefix}/ui/operations`, { signal }),
  model: (signal?: AbortSignal) => read<ModelInfo>(`${prefix}/model`, { signal }),
  health: (signal?: AbortSignal) => read<{status:string;model_loaded:boolean;model_version:string}>(`${prefix}/health`, { signal }),
  schema: (signal?: AbortSignal) => read<ModelSchema>(`${prefix}/model/schema`, { signal }),
  predict: (features: Record<string, string | number | boolean>, signal?: AbortSignal) => read<PredictionResponse>(`${prefix}/predict`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({features}), signal }),
};

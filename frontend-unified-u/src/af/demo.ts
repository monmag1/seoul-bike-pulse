import type {Historical, Overview, MLOps, Operations, PredictionResponse} from './types';
// 교육용 가상 데이터. AWS 운영데이터/실제 따릉이 수요와 무관합니다.
const DAY=86400000;
const start=Date.UTC(2018,10,1);
const days=Array.from({length:30},(_,i)=>({date:new Date(start+i*DAY).toISOString().slice(0,10),rentals:Math.round(11000 + 2600*Math.sin(i*.64)+i*90),mean_temperature_c:Math.round((13-i*.35+Math.sin(i*.3)*3)*10)/10}));
export const demoOverview:Overview={source:'UCI_HISTORICAL',period:'2018-11-17 ~ 2018-11-30 · 시연 데이터',observed_days:14,total_rentals:days.slice(-14).reduce((n,x)=>n+x.rentals,0),average_daily_rentals:Math.round(days.slice(-14).reduce((n,x)=>n+x.rentals,0)/14),active_model_version:'mv001 · 시연',series:days.slice(-14)};
export const demoHistorical:Historical={source:'UCI_HISTORICAL',start:'2018-11-01',end:'2018-11-30',rows:days,total_rentals:days.reduce((n,x)=>n+x.rentals,0),scanned_bytes:0};
export const demoMLOps:MLOps={active_model_version:'mv001 · 시연',models:[{version:'mv001',status:'STAGING · 시연',dataset_version:'dv001',feature_version:'fv001',release_health:null,promoted_at:null},{version:'mv002',status:'예시 버전 · 미배포',dataset_version:null,feature_version:null,release_health:null,promoted_at:null}],latest_drift:null,note:'시연 모드: 실제 레지스트리, 드리프트 보고서, 성능 지표를 조회하지 않습니다.'};
export const demoOperations:Operations={source:'AWS_CLOUDWATCH',region:'ap-northeast-2',measured_at:'시연 데이터',services:[{name:'bikepulse-dev-api-service · 시연',status:'ACTIVE',desired:1,running:1,cpu_percent:27,memory_percent:36},{name:'bikepulse-dev-frontend-service · 시연',status:'ACTIVE',desired:1,running:1,cpu_percent:11,memory_percent:23}],alb_metrics:Array.from({length:12},(_,i)=>({time:`2018-11-30T${String(i+8).padStart(2,'0')}:00:00Z`,requests:Math.round(70+30*Math.cos(i)),errors:i===7?2:0})),request_count_1h:943,target_5xx_1h:2,note:'모든 리소스 수치와 그래프는 시연용 가상 값입니다.'};
const names=['hour','day_of_week','is_weekend','month','day_of_year','hour_sin','hour_cos','dow_sin','dow_cos','season','is_holiday','temperature_c','humidity_pct','wind_speed_mps','visibility_10m','dew_point_temperature_c','solar_radiation_mj_m2','rainfall_mm','snowfall_cm'];
const props:Record<string,any>={};
for(const n of names) props[n]={type:['season'].includes(n)?'string':['is_weekend','is_holiday'].includes(n)?'boolean':['hour','day_of_week','month','day_of_year'].includes(n)?'integer':'number'};
props.season.enum=['winter','spring','summer','autumn'];
export const demoSchema={schema_version:'fv001',input_mode:'feature-complete-19',type:'object',required:names,properties:props,additionalProperties:false};
export function demoPredict(features:Record<string,unknown>):PredictionResponse {
const temp=Number(features.temperature_c||0),hour=Number(features.hour||0),rain=Number(features.rainfall_mm||0);
const number=Math.round(Math.max(0,700+370*Math.sin((hour-5)/24*2*Math.PI)+temp*12-rain*24));
return {model_version:'DEMO-NOT-MODEL',prediction_raw:number,predicted_rentals_display:number,latency_ms:0,request_id:'demo-local',demo:true};
}
export const demoHourly = Array.from({length:24},(_,h)=>({hour:h,expected:Math.round(300+460*Math.max(0,Math.sin((h-5)*Math.PI/16))+140*Math.max(0,Math.sin((h-16)*Math.PI/7)))}));

export const demoAnalytics = {
  source:'SYNTHETIC_DEMO',
  hourly:demoHourly.map(x=>({hour:x.hour,rentals:x.expected})),
  weekday_weekend:[{name:'평일',rentals:1130},{name:'주말',rentals:830}],
  heatmap:Array.from({length:7*24},(_,i)=>({day_of_week:Math.floor(i/24),hour:i%24,rentals:Math.round(120+100*Math.cos((i%24-14)/11)+65*Math.sin(Math.floor(i/24)))})),
  monthly:Array.from({length:12},(_,i)=>({month:i+1,rentals:Math.round(850+400*Math.sin((i+1)*Math.PI/6))})),
  rainy:[{name:'무강수',rentals:1150},{name:'강수',rentals:625}],
  scanned_bytes:0
};

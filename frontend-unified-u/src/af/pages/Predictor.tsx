import { useEffect, useState, type FormEvent } from 'react';
import Scenario24 from './Scenario24';
import { CloudRain, CloudSun, Droplets, Wind, ThermometerSun, CalendarDays, Sparkles, ArrowRight, Sun, Cloud, CloudDrizzle } from 'lucide-react';
import { Chip } from '../components/Shared';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import type { PredictionResponse } from '../types';
import {isDemo} from '../mode';
import { PageHead, Panel, Status, Tile } from '../components/Shared';
import { defaultInputs, makeFeatures, validateRawFeatures, validateSchema } from '../featureContract';
import type { ModelSchema, UIInputs, FeatureValue } from '../featureContract';

const numeric: { key: keyof UIInputs; label: string; min: number; max: number; step: number }[] = [
  {key:'hour',label:'시간 (0~23)',min:0,max:23,step:1},
  {key:'temperature_c',label:'기온 (°C)',min:-40,max:50,step:0.1},
  {key:'humidity_pct',label:'습도 (%)',min:0,max:100,step:1},
  {key:'wind_speed_mps',label:'풍속 (m/s)',min:0,max:60,step:0.1},
  {key:'visibility_10m',label:'가시거리 (10m 단위)',min:0,max:2000,step:1},
  {key:'dew_point_temperature_c',label:'이슬점 온도 (°C)',min:-50,max:50,step:0.1},
  {key:'solar_radiation_mj_m2',label:'일사량 (MJ/m²)',min:0,max:10,step:0.1},
  {key:'rainfall_mm',label:'강수량 (mm)',min:0,max:300,step:0.1},
  {key:'snowfall_cm',label:'적설량 (cm)',min:0,max:100,step:0.1},
];
type SessionPoint = {label: string; predicted: number};

export default function Predictor() {
  const [form, setForm] = useState<UIInputs>(defaultInputs);
  const [schema, setSchema] = useState<ModelSchema|null>(null);
  const [modelVersion, setModelVersion] = useState<string|null>(null);
  const [initializing, setInitializing] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [result, setResult] = useState<PredictionResponse|null>(null);
  const [example, setExample] = useState<Record<string,FeatureValue>|null>(null);
  const [history, setHistory] = useState<SessionPoint[]>([]);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [health, model, nextSchema] = await Promise.all([api.health(), api.model(), api.schema()]);
        validateSchema(nextSchema);
        if (health.status !== 'ok' || health.model_loaded !== true || health.model_version !== model.model_version) {
          throw new Error('모델 Health·버전 또는 활성 상태가 일치하지 않습니다.');
        }
        if (model.feature_count !== nextSchema.required.length || model.feature_version !== nextSchema.schema_version) {
          throw new Error('모델 Feature 개수 또는 버전 계약이 일치하지 않습니다.');
        }
        if (alive) {setSchema(nextSchema);setModelVersion(model.model_version);}
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : '모델 스키마 조회 실패');
      } finally {if (alive) setInitializing(false);}
    }
    void load();
    return () => {alive=false;};
  }, []);

  function update<K extends keyof UIInputs>(field:K, value:UIInputs[K]) {
    setForm(old=>({...old,[field]:value}));
    setExample(null); setResult(null); setError(null);
  }

  async function loadExample() {
    if (!schema) return;
    setError(null);setPending(true);
    try {
      if (isDemo()) throw new Error('시연 모드에서는 실제 모델 검증 예제를 사용하지 않습니다. 실제 AWS 모드로 전환하세요.');
      const resp = await fetch('/demo-example.json',{cache:'no-store'});
      if (!resp.ok) throw new Error('검증 예제 파일이 없습니다. S3 smoke_input.json을 frontend/public/demo-example.json으로 복사하세요.');
      const doc: unknown = await resp.json();
      if (!doc || typeof doc!=='object' || !('features' in doc) || typeof doc.features!=='object' || doc.features===null) {
        throw new Error('검증 예제 JSON에 features 객체가 없습니다.');
      }
      setExample(validateRawFeatures(doc.features as Record<string,unknown>,schema));
      setResult(null);
    } catch(e) {setError(e instanceof Error?e.message:String(e));}
    finally {setPending(false);}
  }

  async function submit(e:FormEvent) {
    e.preventDefault();if (!schema) return;
    setPending(true);setResult(null);setError(null);
    try {
      const features = example ?? makeFeatures(form,schema);
      const next = await api.predict(features);
      const value = typeof next.predicted_rentals_display==='number' ? next.predicted_rentals_display : typeof next.prediction_raw==='number' ? next.prediction_raw : next.prediction;
      if (typeof value!=='number' || !Number.isFinite(value)) throw new Error('예측 응답에 유효한 숫자 결과가 없습니다. OpenAPI 계약을 확인하세요.');
      setResult(next);
      setHistory(old=>[...old.slice(-9),{label:String(old.length+1),predicted:value}]);
    } catch(e) {setError(e instanceof Error?e.message:String(e));}
    finally {setPending(false);}
  }

  const predicted = result?.predicted_rentals_display ?? result?.prediction_raw ?? result?.prediction;
  return <>
    <PageHead kicker="SCREEN B / INTERACTIVE WEATHER ENGINE" title="Bike Demand Predictor" description="날짜·시간·날씨 조건을 조합하여 서울 따릉이의 24시간 수요 시나리오를 탐색합니다."/>
    <div className="af-weather-hero"><div className="af-weather-hero-left"><span className="af-hero-eyebrow"><Sparkles size={13}/> INTERACTIVE FORECAST STUDIO</span><div className="af-weather-mast"><CloudSun size={47} strokeWidth={1.25}/><strong>{form.temperature_c}°</strong><div><b>Custom Conditions</b><span>{form.date} · {String(form.hour).padStart(2,'0')}:00</span></div></div><div className="af-weather-chips"><span><Droplets size={14}/> 습도 {form.humidity_pct}%</span><span><Wind size={14}/> 풍속 {form.wind_speed_mps} m/s</span><span><CloudRain size={14}/> 강수 {form.rainfall_mm} mm</span></div><small>과거 자료에 기반한 What-if 시뮬레이션 · 실시간 기상 예보가 아닙니다</small></div><div className="af-weather-orbits"><div className="af-orbit orb1"/><div className="af-orbit orb2"/><div className="af-weather-center"><Sun size={45}/><span>SEOUL</span></div></div></div>
    <div className="af-forecast-strip">{[{hour:6,icon:<Cloud size={21}/>,caption:"EARLY MORNING"},{hour:9,icon:<CloudSun size={21}/>,caption:"MORNING"},{hour:12,icon:<Sun size={21}/>,caption:"MIDDAY"},{hour:15,icon:<CloudSun size={21}/>,caption:"AFTERNOON"},{hour:18,icon:<CloudDrizzle size={21}/>,caption:"EVENING"},{hour:21,icon:<Cloud size={21}/>,caption:"NIGHT"}].map(t=><button key={t.hour} type="button" className={`af-hour-card ${Number(form.hour)===t.hour?'is-selected':''}`} onClick={()=>update('hour',String(t.hour))}><small>{String(t.hour).padStart(2,'0')}:00</small>{t.icon}<b>{t.caption}</b><span>Choose hour <ArrowRight size={11}/></span></button>)}</div>
    <Status loading={initializing} error={error}/>
    <div className="af-two-col">
      <Panel title="Scenario Configuration · 19 Features" subtitle={`서버 모델: ${modelVersion??'확인 중'} · 스키마 확인 후 예측 가능`}>
        <form className="af-form-grid" onSubmit={e=>{void submit(e);}}>
          <label>날짜<input type="date" value={form.date} onChange={e=>update('date',e.target.value)} required/></label>
          <label className="af-check"><input type="checkbox" checked={form.is_holiday} onChange={e=>update('is_holiday',e.target.checked)}/>공휴일 여부(직접 지정)</label>
          {numeric.map(f=><label key={f.key}>{f.label}<input type="number" value={String(form[f.key])} min={f.min} max={f.max} step={f.step} required onChange={e=>update(f.key,e.target.value)}/></label>)}
          <button type="submit" disabled={!schema||initializing||pending}>{pending?'요청 중…':example?'Validation 예제로 예측':'수요 예측 실행'}</button>
        </form>
        <button type="button" disabled={!schema||pending} onClick={()=>{void loadExample();}}>검증 예제 불러오기</button>
        <button type="button" onClick={()=>{setExample(null);setResult(null);setError(null);setForm(defaultInputs);}}>예제 해제 및 입력 초기화</button>
        {example&&<div className="af-notice">Validation 예제의 원본 19개 Feature를 그대로 전송합니다. 아래 입력 폼의 값과는 별개입니다.</div>}
      </Panel>
      <div className="af-predict-right">
        <Panel title="Predicted Rental Demand" subtitle="실제 AWS 모드에서 FastAPI 응답을 표시합니다. 시연 모드의 수치는 모델 추론이 아닙니다.">
          {result&&<>{result.demo&&<div className="af-notice af-demo-note">시연 계산 결과입니다. 실제 mv001 모델이 아닙니다.</div>}<Tile label="예상 대여 건수/시간" value={typeof predicted==='number'?Math.round(predicted).toLocaleString('ko-KR'):'—'}/>
            <div className="af-kv"><span>모델 버전</span><b>{result.model_version??'응답 없음'}</b><span>요청 ID</span><b>{result.request_id??'응답 없음'}</b><span>추론 시간</span><b>{result.demo?'시연':result.latency_ms==null?'미수집':`${result.latency_ms} ms`}</b></div></>}
          {!result&&!error&&<div className="af-notice">스키마를 확인하고 조건을 입력해 예측을 실행하세요.</div>}
        </Panel>
        <Panel title="Prediction Activity" subtitle="실제 모드에서는 모델 API 응답, 시연 모드에서는 시연 계산값만 표시합니다.">
          <div className="af-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={history}><XAxis dataKey="label"/><YAxis/><Tooltip/><Area dataKey="predicted" stroke="#2563eb" fill="#dbeafe"/></AreaChart></ResponsiveContainer></div>
        </Panel>
      </div>
    </div>
    <Scenario24 form={form} schema={schema}/>
    <Panel title="서로 다른 날씨 조건 비교" subtitle="조건을 바꿔 예측을 두 번 실행하면 현재 브라우저 세션의 예측 결과를 비교할 수 있습니다."><div className="af-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={history}><XAxis dataKey="label"/><YAxis/><Tooltip/><Area name="조건별 예측" dataKey="predicted" stroke="#06b6d4" fill="#0e749022"/></AreaChart></ResponsiveContainer></div></Panel>
  </>;
}

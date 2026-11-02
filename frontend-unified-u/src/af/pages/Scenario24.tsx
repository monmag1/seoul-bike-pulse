import { useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import {api} from '../api';
import {makeFeatures, type UIInputs, type ModelSchema} from '../featureContract';
import {isDemo,getMode} from '../mode';
import {Panel} from '../components/Shared';
export default function Scenario24({form,schema}:{form:UIInputs;schema:ModelSchema|null}){
 const [points,setPoints]=useState<{hour:number;predicted:number}[]>([]);
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [progress,setProgress]=useState(0);
 async function run(){if(!schema)return;setBusy(true);setError('');setPoints([]);setProgress(0);
  try {const data:typeof points=[];
    // 동시 호출은 4개로 제한하여 ECS/FastAPI 부담을 낮춥니다.
    for(let start=0;start<24;start+=4){
      const batch=await Promise.all(Array.from({length:4},async(_,i)=>{const hour=start+i;
        const features=makeFeatures({...form,hour:String(hour)},schema);
        const r=await api.predict(features);
        const v=r.predicted_rentals_display??r.prediction_raw;
        if(typeof v!=='number')throw new Error(`${hour}시 API 응답에 예측 결과가 없습니다`);
        return {hour,predicted:v};
      }));data.push(...batch);setProgress(data.length);setPoints([...data]);
    }
    sessionStorage.setItem('bikepulse:forecast:u:'+getMode(),JSON.stringify(data));
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false)}
 }
 return <Panel title="24시간 수요 시나리오" subtitle="선택한 날짜/기상 조건에서 0~23시를 각각 추론합니다. 실제 모드에서는 API를 24번 호출합니다.">
  <button type="button" disabled={!schema||busy} onClick={()=>void run()}>{busy?`실행 중 ${progress}/24`:'24시간 시나리오 실행'}</button>
  {isDemo()&&<div className="af-notice af-demo-note">시연 모드 결과는 가상 계산값이며 mv001 추론이 아닙니다.</div>}
  {error&&<div className="af-notice af-error">{error}</div>}
  {points.length>0&&<div className="af-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={points}><CartesianGrid strokeDasharray="3 4" stroke="#284059"/><XAxis dataKey="hour" stroke="#9cb3cb"/><YAxis stroke="#9cb3cb"/><Tooltip/><Line dataKey="predicted" name="예상 대여량" stroke="#2dd4bf" strokeWidth={3}/></LineChart></ResponsiveContainer></div>}
 </Panel>;
}

export type FeatureValue = number | boolean | string;
export type FeatureRule = { type?: 'integer'|'number'|'boolean'|'string'; enum?: FeatureValue[]; minimum?: number; maximum?: number };
export type ModelSchema = { schema_version: string; input_mode: string; required: string[]; properties: Record<string, FeatureRule>; additionalProperties?: boolean };

export const EXPECTED_FIELDS = [
  'hour','day_of_week','is_weekend','month','day_of_year',
  'hour_sin','hour_cos','dow_sin','dow_cos','season','is_holiday',
  'temperature_c','humidity_pct','wind_speed_mps','visibility_10m',
  'dew_point_temperature_c','solar_radiation_mj_m2','rainfall_mm','snowfall_cm',
] as const;

export type UIInputs = { date: string; hour: string; is_holiday: boolean; temperature_c: string; humidity_pct: string;
  wind_speed_mps: string; visibility_10m: string; dew_point_temperature_c: string;
  solar_radiation_mj_m2: string; rainfall_mm: string; snowfall_cm: string; };

export const defaultInputs: UIInputs = {date:'2018-10-15',hour:'8',is_holiday:false,temperature_c:'15',humidity_pct:'60',
  wind_speed_mps:'2',visibility_10m:'1800',dew_point_temperature_c:'7',solar_radiation_mj_m2:'0.5',rainfall_mm:'0',snowfall_cm:'0'};

function encode(name: string, raw: string|number|boolean, schema: ModelSchema): FeatureValue {
  const rule = schema.properties[name];
  if (!rule) throw new Error(`서버 Feature 스키마에 ${name} 항목이 없습니다.`);
  if (rule.type === 'boolean') {
    if (raw === true || raw === false) return raw;
    if (raw === 'true' || raw === 'false') return raw === 'true';
    throw new Error(`${name}: Boolean 값을 지정해야 합니다.`);
  }
  if (rule.type === 'string') {
    const value = String(raw);
    if (rule.enum && !rule.enum.includes(value)) throw new Error(`${name}: 허용되지 않는 값 ${value}`);
    return value;
  }
  if (rule.type === 'integer' || rule.type === 'number') {
    if (typeof raw === 'string' && raw.trim() === '') throw new Error(`${name}: 값이 비어 있습니다.`);
    const v = typeof raw === 'boolean' ? Number(raw) : Number(raw);
    if (!Number.isFinite(v) || (rule.type === 'integer' && !Number.isInteger(v))) throw new Error(`${name}: 숫자 형식 오류`);
    if (rule.minimum !== undefined && v < rule.minimum) throw new Error(`${name}: 최솟값 ${rule.minimum}`);
    if (rule.maximum !== undefined && v > rule.maximum) throw new Error(`${name}: 최댓값 ${rule.maximum}`);
    if (rule.enum && !rule.enum.includes(v)) throw new Error(`${name}: 허용되지 않는 값 ${v}`);
    return v;
  }
  throw new Error(`${name}: 지원되지 않는 Feature 타입 ${String(rule.type)}`);
}

export function validateSchema(schema: ModelSchema): void {
  if (!schema || schema.input_mode !== 'feature-complete-19' || !Array.isArray(schema.required) ||
      schema.required.length !== 19 || !schema.properties || schema.additionalProperties !== false) {
    throw new Error('서버 Feature 계약이 기대한 19개 입력 형식과 다릅니다.');
  }
  const expected = new Set<string>(EXPECTED_FIELDS);
  if (new Set(schema.required).size !== 19 || schema.required.some(x=>!expected.has(x) || !schema.properties[x])) {
    throw new Error('서버에 등록된 Feature 이름·개수가 fv001 계약과 다릅니다.');
  }
}

export function validateRawFeatures(raw: Record<string, unknown>, schema: ModelSchema): Record<string, FeatureValue> {
  validateSchema(schema);
  const names = Object.keys(raw);
  if (names.length !== 19 || names.some(name=>!schema.required.includes(name))) throw new Error('검증 예제 Feature 이름·개수가 일치하지 않습니다.');
  const out: Record<string, FeatureValue> = {};
  for (const name of schema.required) {
    const v = raw[name];
    if (v===undefined || v===null || !['string','boolean','number'].includes(typeof v)) throw new Error(`${name}: 값 누락/형식 오류`);
    out[name] = encode(name, v as FeatureValue, schema);
  }
  return out;
}

export function makeFeatures(form: UIInputs, schema: ModelSchema): Record<string, FeatureValue> {
  validateSchema(schema);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) throw new Error('날짜는 YYYY-MM-DD 형식이어야 합니다.');
  const [year, month, day] = form.date.split('-').map(Number);
  const utc = Date.UTC(year, month-1, day);
  const parsed = new Date(utc);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth()+1 !== month || parsed.getUTCDate() !== day) throw new Error('유효하지 않은 날짜입니다.');
  if (form.hour.trim() === '' || !Number.isInteger(Number(form.hour)) || Number(form.hour)<0 || Number(form.hour)>23) throw new Error('시간은 0~23 정수입니다.');
  const hour = Number(form.hour);
  const dow = (parsed.getUTCDay()+6)%7;
  const dayOfYear = Math.round((utc-Date.UTC(year,0,1))/86400000)+1;
  const season = month<=2||month===12?'winter':month<=5?'spring':month<=8?'summer':'autumn';
  const rule = schema.properties.season;
  const aliases = season==='autumn' ? ['autumn','fall'] : [season];
  const allowed = rule?.enum?.find(x=>typeof x==='string' && aliases.includes(x.toLowerCase()));
  const seasonValue = allowed ?? (rule?.type === 'string' ? season : undefined);
  if (seasonValue === undefined) throw new Error('계절 Feature의 서버 enum/타입에 맞는 값을 확인하세요.');
  const cycle = 2*Math.PI;
  const base: Record<string, FeatureValue> = {
    hour,day_of_week:dow,is_weekend:dow>=5,month,day_of_year:dayOfYear,
    hour_sin:Math.sin(cycle*hour/24),hour_cos:Math.cos(cycle*hour/24),
    dow_sin:Math.sin(cycle*dow/7),dow_cos:Math.cos(cycle*dow/7),
    season:seasonValue,is_holiday:form.is_holiday,
    temperature_c:form.temperature_c,humidity_pct:form.humidity_pct,wind_speed_mps:form.wind_speed_mps,
    visibility_10m:form.visibility_10m,dew_point_temperature_c:form.dew_point_temperature_c,
    solar_radiation_mj_m2:form.solar_radiation_mj_m2,rainfall_mm:form.rainfall_mm,snowfall_cm:form.snowfall_cm,
  };
  const result: Record<string,FeatureValue> = {};
  for (const name of schema.required) result[name] = encode(name, base[name], schema);
  return result;
}
